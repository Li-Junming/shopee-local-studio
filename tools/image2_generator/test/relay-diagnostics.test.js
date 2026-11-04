import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { inspectCockpitTimeout, isCockpitEndpoint, readRelayEvidence } from "../src/relay-diagnostics.js";

function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE request_logs(request_id TEXT, timestamp INTEGER, latency_ms INTEGER, http_status INTEGER,
    error_category TEXT, first_response_ms INTEGER, requested_model TEXT, request_kind TEXT);
    CREATE TABLE request_diagnostics(request_id TEXT, attempts_json TEXT);`);
  return db;
}
const start = 1793623317448;
const timeout = { sequence: 1, status: 504, latencyMs: 59983, errorCategory: "upstream_connect_timeout", accountId: "private-account", upstreamSessionId: "private-session" };
function insert(db, { id = "fixture-request", startedAt = start, model = "gpt-image-2.5", kind = "image_edit", first = null,
  attempts = [timeout, { ...timeout, sequence: 2 }, { sequence: 3, status: 499, latencyMs: 59900, errorCategory: "client_cancelled" }] } = {}) {
  db.prepare("INSERT INTO request_logs VALUES(?,?,?,?,?,?,?,?)").run(id, startedAt + 180000, 180000, 499, "client_cancelled", first, model, kind);
  db.prepare("INSERT INTO request_diagnostics VALUES(?,?)").run(id, JSON.stringify(attempts));
}
const query = { startedAtMs: start, model: "gpt-image-2.5", endpoint: "edits" };

test("only the known loopback Cockpit image routes are eligible for local diagnostics", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) assert.equal(isCockpitEndpoint(`http://${host}:51257/v1/images/edits`), true);
  for (const url of ["http://example.com:51257/v1/images/edits", "http://127.0.0.1:8888/v1/images/edits", "http://localhost:51257/v1/responses", "invalid"]) assert.equal(isCockpitEndpoint(url), false);
});

test("outer 499 is correlated with the two earlier internal 504s without private fields", (t) => {
  const db = fixture(t); insert(db);
  const result = readRelayEvidence(db, query);
  assert.equal(result.requestId, "fixture-request");
  assert.equal(result.confirmedHeaderTimeout, true);
  assert.deepEqual(result.attempts.map((a) => a.status), [504, 504, 499]);
  assert.doesNotMatch(JSON.stringify(result), /private-account|private-session|accountId|Session/);
});

test("ambiguous, wrong-model, wrong-kind and wrong-time records cannot blame the relay", (t) => {
  const db = fixture(t);
  insert(db, { model: "other" }); insert(db, { kind: "image_generation" }); insert(db, { startedAt: start - 5000 });
  assert.equal(readRelayEvidence(db, query), null);
  insert(db, { id: "matching-1" }); insert(db, { id: "matching-2" });
  assert.equal(readRelayEvidence(db, query), null);
});

test("received headers, a successful attempt or a single internal timeout are not confirmed route failure", (t) => {
  const db = fixture(t);
  for (const settings of [{ first: 70000 }, { attempts: [timeout] }, { attempts: [timeout, { ...timeout, sequence: 2 }, { sequence: 3, status: 200 }] }]) {
    db.exec("DELETE FROM request_logs; DELETE FROM request_diagnostics;");
    insert(db, settings);
    assert.equal(readRelayEvidence(db, query).confirmedHeaderTimeout, false);
  }
});

test("optional inspection is read-only and safely handles missing databases or old schemas", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "studio-relay-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const databasePath = path.join(dir, "missing.sqlite");
  const request = { ...query, url: "http://localhost:51257/v1/images/edits" };
  assert.equal(await inspectCockpitTimeout(request, { databasePath, platform: "win32", maxPolls: 1 }), null);
  await assert.rejects(fs.stat(databasePath), { code: "ENOENT" });
  const db = new DatabaseSync(databasePath); db.exec("CREATE TABLE unrelated(value TEXT);"); db.close();
  assert.equal(await inspectCockpitTimeout(request, { databasePath, platform: "win32", maxPolls: 1 }), null);
  assert.equal(await inspectCockpitTimeout(request, { platform: "linux" }), null);
});
