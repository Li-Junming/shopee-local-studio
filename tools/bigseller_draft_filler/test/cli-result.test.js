import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { COMPLETION_PREFIX, hasCompletionReceipt, isCliEntrypoint, runCliWithCompletion } from "../src/cli-result.js";

test("completion receipt is emitted only after the operation resolves", async () => {
  const events = [];
  await runCliWithCompletion(async () => { events.push("work completed"); return "source"; }, (line) => events.push(line));
  assert.equal(events[0], "work completed");
  assert.ok(hasCompletionReceipt(events[1], "source"));
  for (const mode of ["copy", "discover", "save"]) {
    const lines = [];
    await runCliWithCompletion(async () => mode, (line) => lines.push(line));
    assert.ok(hasCompletionReceipt(lines.join("\n"), mode));
  }
});

test("failures, help, login and no-op exits cannot provide business completion evidence", async () => {
  const lines = [];
  await assert.rejects(runCliWithCompletion(async () => { throw new Error("fixture failure"); }, (line) => lines.push(line)), /fixture failure/);
  for (const mode of [undefined, "help", "login", "dry-run", "fill"]) {
    await runCliWithCompletion(async () => mode, (line) => lines.push(line));
  }
  assert.deepEqual(lines, []);
  for (const output of ["", "exit 0", `${COMPLETION_PREFIX}bad json`, `${COMPLETION_PREFIX}{"version":1,"mode":"copy","ok":false}`]) {
    assert.equal(hasCompletionReceipt(output, "copy"), false);
  }
  assert.equal(hasCompletionReceipt(`${COMPLETION_PREFIX}{"version":1,"mode":"save","ok":true}`, "copy"), false);
});

test("CLI detection handles missing argv and case-insensitive Windows paths", () => {
  const current = pathToFileURL(import.meta.filename).href;
  assert.equal(isCliEntrypoint(current, undefined), false);
  assert.equal(isCliEntrypoint(current, import.meta.filename), true);
  if (process.platform === "win32") {
    assert.equal(isCliEntrypoint(current, import.meta.filename.toUpperCase()), true);
    assert.equal(isCliEntrypoint(current, import.meta.filename + ".other"), false);
  }
});
