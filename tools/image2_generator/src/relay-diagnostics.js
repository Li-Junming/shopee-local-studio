import os from "node:os";
import path from "node:path";

export function isCockpitEndpoint(url) {
  try {
    const endpoint = new URL(url);
    return endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname)
      && endpoint.port === "51257" && /^\/v1\/images\/(edits|generations)$/.test(endpoint.pathname);
  } catch { return false; }
}

// A cancelled outer request is not the root error. Match by the actual request
// start time, duration, model and kind; never guess if another request overlaps.
// No API key, account, session, payload or browser data is selected.
export function readRelayEvidence(db, { startedAtMs, model, endpoint, timeoutMs = 180000 }) {
  const kind = endpoint === "edits" ? "image_edit" : "image_generation";
  const rows = db.prepare(`
    SELECT request_id, timestamp, latency_ms, http_status, error_category, first_response_ms
    FROM request_logs
    WHERE timestamp BETWEEN ? AND ? AND ABS(timestamp - latency_ms - ?) <= 2000
      AND requested_model = ? AND request_kind = ?
    ORDER BY timestamp DESC LIMIT 3
  `).all(startedAtMs - 2000, startedAtMs + timeoutMs + 5000, startedAtMs, model, kind);
  if (rows.length !== 1) return null;
  const row = rows[0];
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(row.request_id)) return null;
  const attempts = db.prepare(`
    SELECT json_extract(j.value, '$.sequence') AS sequence,
      json_extract(j.value, '$.status') AS status,
      json_extract(j.value, '$.latencyMs') AS latencyMs,
      json_extract(j.value, '$.errorCategory') AS category
    FROM request_diagnostics d, json_each(d.attempts_json) j
    WHERE d.request_id = ? ORDER BY sequence
  `).all(row.request_id).map((attempt) => ({
    sequence: Number(attempt.sequence), status: Number(attempt.status), latencyMs: Number(attempt.latencyMs),
    category: /^[a-z_]{1,80}$/.test(attempt.category || "") ? attempt.category : ""
  }));
  const confirmedHeaderTimeout = row.first_response_ms == null && attempts.filter((attempt) =>
    attempt.status === 504 && attempt.category === "upstream_connect_timeout"
  ).length >= 2 && !attempts.some((attempt) => attempt.status >= 200 && attempt.status < 400);
  return { requestId: row.request_id, status: row.http_status, attempts, confirmedHeaderTimeout };
}

export async function inspectCockpitTimeout({ url, startedAtMs, model, endpoint, timeoutMs }, {
  databasePath = path.join(os.homedir(), ".cockpit_tools", "codex_local_access_logs.sqlite"),
  platform = process.platform, maxPolls = 5, pause = () => new Promise((resolve) => setTimeout(resolve, 150))
} = {}) {
  if (platform !== "win32" || !isCockpitEndpoint(url)) return null;
  let db;
  try {
    const { DatabaseSync } = await import("node:sqlite");
    db = new DatabaseSync(databasePath, { readOnly: true });
    db.exec("PRAGMA query_only=ON; PRAGMA busy_timeout=100;");
    for (let poll = 0; poll < maxPolls; poll += 1) {
      const evidence = readRelayEvidence(db, { startedAtMs, model, endpoint, timeoutMs });
      if (evidence?.attempts.length) return evidence;
      if (poll + 1 < maxPolls) await pause();
    }
  } catch {
    // Logging is optional: an old schema, busy database or unavailable sqlite
    // must never replace the original error or trigger another image request.
  } finally {
    db?.close();
  }
  return null;
}
