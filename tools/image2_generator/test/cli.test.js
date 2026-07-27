import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

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
