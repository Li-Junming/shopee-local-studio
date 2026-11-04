import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import http from "node:http";

const execFileAsync = promisify(execFile);

test("CLI accepts overwrite in dry-run plan", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "image2-cli-"));
  const configPath = path.join(dir, "jobs.json");
  await writeFile(configPath, JSON.stringify({
    outputDir: "out",
    jobs: [
      {
        name: "main",
        prompt: "demo",
        out: "main.png"
      }
    ]
  }), "utf8");

  const { stdout } = await execFileAsync(process.execPath, [
    path.resolve("src/cli.js"),
    "--config", configPath,
    "--dry-run",
    "--overwrite"
  ], { cwd: path.resolve("."), windowsHide: true });

  const plan = JSON.parse(stdout);
  assert.equal(plan.overwrite, true);
});

for (const status of [401, 503]) {
  test(`CLI stops after the first authentication failure (${status}) without requesting later images`, async () => {
    let requests = 0;
    const server = http.createServer((req, res) => {
      requests++;
      req.resume();
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "auth_unavailable", message: "no auth available" } }));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const dir = await mkdtemp(path.join(os.tmpdir(), "image2-auth-test-"));
      const configPath = path.join(dir, "jobs.json");
      const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
      await writeFile(configPath, JSON.stringify({
        baseUrl, outputDir: "out", concurrency: 1,
        jobs: [1, 2, 3].map((id) => ({ name: `image-${id}`, prompt: "test", out: `${id}.png` }))
      }), "utf8");
      await assert.rejects(execFileAsync(process.execPath, [
        path.resolve("src/cli.js"), "--config", configPath, "--base-url", baseUrl
      ], {
        env: { ...process.env, OPENAI_API_KEY: "test-key", OPENAI_BASE_URL: baseUrl },
        windowsHide: true, timeout: 10000
      }), (error) => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /生图接口认证失效/);
        assert.doesNotMatch(error.stderr, /retry 1|requeue|appears unstable/);
        assert.doesNotMatch(error.stdout, /image-2|image-3/);
        return true;
      });
      assert.equal(requests, 1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
}

test("CLI resumes the saved queue across processes without re-requesting existing images", async () => {
  const requested = [];
  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      requested.push(JSON.parse(data).prompt);
      res.writeHead(504, { "Content-Type": "application/json", "x-request-id": "mock-relay-504" });
      res.end(JSON.stringify({ error: { code: "upstream_connect_timeout", message: "fixture header timeout" } }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const dir = await mkdtemp(path.join(os.tmpdir(), "image2-resume-test-"));
    const configPath = path.join(dir, "jobs.json");
    const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
    const outputDir = path.join(dir, "out");
    await mkdir(outputDir);
    const preserved = Buffer.from("existing image bytes must not be touched");
    await writeFile(path.join(outputDir, "existing.png"), preserved);
    await writeFile(configPath, JSON.stringify({
      baseUrl, outputDir, queueSessionId: "one-user-start", maxJobAttempts: 2,
      concurrency: 1, maxRetryableFailures: 2, requestMaxAttempts: 1,
      jobs: ["existing", "a", "b", "c", "d"].map((name) => ({ name, prompt: name, out: `${name}.png` }))
    }));
    const invoke = async () => {
      try {
        await execFileAsync(process.execPath, [path.resolve("src/cli.js"), "--config", configPath], {
          env: { ...process.env, OPENAI_API_KEY: "fixture-key", OPENAI_BASE_URL: baseUrl },
          windowsHide: true, timeout: 10000
        });
        assert.fail("The mock upstream always fails");
      } catch (error) {
        assert.equal(error.code, 1, `${error.stderr || ""}\n${error.stdout || ""}`);
        return error;
      }
    };
    await invoke();
    assert.deepEqual(requested, ["a", "b"]);
    await invoke();
    assert.deepEqual(requested, ["a", "b", "c", "d"]);
    await invoke();
    const lastAttempt = await invoke();
    assert.deepEqual(requested, ["a", "b", "c", "d", "a", "b", "c", "d"]);
    assert.match(lastAttempt.stderr, /IMAGE_QUEUE_EXHAUSTED/);
    const exhausted = await invoke();
    assert.match(exhausted.stderr, /IMAGE_QUEUE_EXHAUSTED/);
    assert.equal(requested.length, 8);
    assert.deepEqual(await readFile(path.join(outputDir, "existing.png")), preserved);
    const checkpoint = JSON.parse(await readFile(`${configPath}.queue-state.json`, "utf8"));
    assert.ok(Object.values(checkpoint.jobs).every((record) => record.attempts === 2));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
