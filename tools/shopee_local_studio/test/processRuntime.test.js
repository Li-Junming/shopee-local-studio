import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { childProcessEnv } from "../src/processRuntime.js";

test("Windows child environment resolves Node without PATH and preserves route settings", () => {
  const input = { PATH: "C:\\tools", Path: "C:\\Windows", OPENAI_BASE_URL: "http://localhost:51257/v1", OPENAI_API_KEY: "fixture-only" };
  const env = childProcessEnv(input, "C:\\Program Files\\nodejs\\node.exe", "win32");
  assert.deepEqual(Object.keys(env).filter((key) => key.toLowerCase() === "path"), ["Path"]);
  assert.equal(env.Path, "C:\\Program Files\\nodejs;C:\\tools;C:\\Windows");
  assert.equal(env.SHOPEE_NODE_EXE, "C:\\Program Files\\nodejs\\node.exe");
  assert.equal(env.OPENAI_BASE_URL, input.OPENAI_BASE_URL);
  assert.equal(env.OPENAI_API_KEY, input.OPENAI_API_KEY);
  assert.equal(input.PATH, "C:\\tools");
  assert.equal(childProcessEnv({}, "C:\\Node\\node.exe", "win32").Path, "C:\\Node");
});

test("POSIX child paths retain colon delimiters", () => {
  assert.equal(childProcessEnv({ PATH: "/usr/bin" }, "/opt/node/bin/node", "linux").PATH, "/opt/node/bin:/usr/bin");
});

test("BigSeller website Node entry starts with empty PATH without browser or API work", async () => {
  const exec = promisify(execFile);
  const script = fileURLToPath(new URL("../../bigseller_draft_filler/src/fill-drafts.js", import.meta.url));
  const env = { ...process.env, Path: "", PATH: "", SHOPEE_NODE_EXE: process.execPath };
  const result = await exec(process.execPath, [script, "--help"], { env, windowsHide: true, timeout: 15000 });
  assert.match(result.stdout, /--config/);
  assert.doesNotMatch(result.stderr, /CommandNotFoundException/);
});

test("Node resolver rejects a broken explicit path without silently choosing another runtime", { skip: process.platform !== "win32" }, async () => {
  const exec = promisify(execFile);
  const ps = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const helper = fileURLToPath(new URL("../../node-runtime.ps1", import.meta.url)).replaceAll("'", "''");
  await assert.rejects(exec(ps, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `. '${helper}'; Resolve-StudioNode -NodePath 'C:\\missing-studio-runtime\\node.exe'`], { windowsHide: true }), /Configured Node executable/);
});
