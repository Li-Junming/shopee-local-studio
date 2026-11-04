import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const pendingJsonWrites = new Map();
const transientRenameErrors = new Set(["EPERM", "EACCES", "EBUSY"]);

const runningStatuses = new Set([
  "pipeline_queued", "pipeline_waiting_image_api", "fetching_source_images",
  "pipeline_copying_source_to_bigseller_drafts", "copying_source_to_bigseller_drafts",
  "pipeline_generating_images", "generating_images", "regenerating_images",
  "pipeline_discovering_bigseller_drafts", "discovering_bigseller_drafts",
  "pipeline_saving_bigseller_drafts", "saving_bigseller_drafts"
]);

export function isExecutingTaskStatus(status) {
  return runningStatuses.has(String(status || ""));
}

function needsRecovery(task) {
  return isExecutingTaskStatus(task.status) || (["source_config_ready", "image2_config_ready", "bigseller_config_ready", "bigseller_copy_config_ready"].includes(task.status)
    && task.pipelineTiming?.startedAt && !task.pipelineTiming.finishedAt);
}

// A restarted server cannot attest to the outcome of an older process. In
// particular, neither a finish timestamp nor an orphan PID proves success.
export function interruptedTask(task, { now = new Date().toISOString(), lastActivityAt, workersKnown = false, workerPids = [] } = {}) {
  if (!needsRecovery(task)) return null;
  const next = structuredClone(task);
  const timing = next.pipelineTiming;
  const start = Date.parse(timing?.startedAt || task.updatedAt || task.createdAt);
  const detected = Date.parse(now);
  const candidates = [task.updatedAt, lastActivityAt, task.runtimeHeartbeatAt]
    .map(Date.parse).filter(value => Number.isFinite(value) && value <= detected && (!Number.isFinite(start) || value >= start));
  const stoppedAt = new Date(candidates.length ? Math.max(...candidates) : Number.isFinite(start) ? Math.min(start, detected) : detected).toISOString();
  next.status = "interrupted";
  next.updatedAt = now;
  next.interruption = {
    code: "TASK_EXECUTION_INTERRUPTED", previousStatus: task.status,
    detectedAt: now, lastConfirmedActivityAt: stoppedAt,
    exactStopTimeKnown: false, workersKnown,
    workerPids: workerPids.filter(Number.isInteger),
    message: "网站执行进程已中断或重新启动，旧流程不再由当前服务管理。已有图片和队列已保留，未自动重试；实际中断时间未知，计时截至最后确认活动。"
  };
  if (timing) {
    timing.finishedAt = stoppedAt;
    timing.interrupted = true;
    const active = timing.activeStage;
    if (active && timing.stages?.[active]) {
      timing.stages[active].finishedAt = stoppedAt;
      timing.stages[active].outcome = "interrupted";
    }
  }
  return next;
}

export function interruptedBatchQueue(queue, now = new Date().toISOString()) {
  if (!["running", "pausing"].includes(queue.status)) return null;
  const next = structuredClone(queue);
  next.status = "paused";
  next.updatedAt = now;
  next.lastMessage = "网站已重新启动，批量队列已暂停。请核对当前商品后手动继续，不会自动重放生图或草稿操作。";
  for (const item of next.items || []) {
    if (item.status !== "running") continue;
    item.status = "failed";
    item.error = "执行进程已中断，完成结果未确认；请先检查对应任务和已有草稿。";
    item.finishedAt = item.finishedAt || item.startedAt || queue.updatedAt || now;
    item.interrupted = true;
  }
  return next;
}

export async function writeJsonAtomic(file, value) {
  const key = path.resolve(file);
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  return accessJsonInOrder(key, () => replaceJsonAtomic(key, contents));
}

export async function readJsonAtomic(file) {
  const key = path.resolve(file);
  return accessJsonInOrder(key, async () => JSON.parse(await fs.readFile(key, "utf8")));
}

async function accessJsonInOrder(key, action) {
  const previous = pendingJsonWrites.get(key) || Promise.resolve();
  const operation = previous.catch(() => {}).then(action);
  pendingJsonWrites.set(key, operation);
  try {
    return await operation;
  } finally {
    if (pendingJsonWrites.get(key) === operation) pendingJsonWrites.delete(key);
  }
}

async function replaceJsonAtomic(file, contents) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  try {
    await fs.writeFile(temporary, contents, "utf8");
    // Windows readers, indexers and antivirus can briefly deny replacement.
    // Keep the old JSON intact while retrying; never unlink or truncate it.
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(temporary, file);
        break;
      } catch (error) {
        if (!transientRenameErrors.has(error.code) || attempt >= 7) throw error;
        await delay(Math.min(20 * 2 ** attempt, 250));
      }
    }
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

export async function inspectTaskWorkers(dataRoot, { platform = process.platform } = {}) {
  // Fail closed on an unavailable inventory. Never interpret a probe failure
  // as permission to resubmit a possibly running image or draft operation.
  if (platform !== "win32") return { known: false, workers: [] };
  const normalized = `${path.resolve(dataRoot).replaceAll("\\", "/")}/`.replaceAll("'", "''");
  const script = `$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $root='${normalized}';
$items=@(Get-CimInstance Win32_Process -Filter "Name='node.exe' AND (CommandLine LIKE '%image2_generator%' OR CommandLine LIKE '%bigseller_draft_filler%')" | ForEach-Object {
  $s=$_.CommandLine.Replace([char]92,[char]47);
  if($s -match 'image2_generator/src/cli[.]js|bigseller_draft_filler/src/fill-drafts[.]js') {
    $i=$s.IndexOf($root,[StringComparison]::OrdinalIgnoreCase);
    if($i -ge 0) { $id=$s.Substring($i+$root.Length).Split('/')[0];
      if($id -match '^[A-Za-z0-9_-]+$') { [pscustomobject]@{taskId=$id;pid=$_.ProcessId} }
    }
  }
}); ConvertTo-Json -InputObject $items -Compress`;
  const executable = path.join(process.env.SystemRoot || "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
  return new Promise(resolve => execFile(executable, ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
    { windowsHide: true, timeout: 8000, maxBuffer: 128000 }, (error, stdout) => {
      if (error) return resolve({ known: false, workers: [] });
      try {
        const workers = JSON.parse(stdout);
        if (!Array.isArray(workers) || workers.some(worker => !/^[A-Za-z0-9_-]+$/.test(worker.taskId) || !Number.isInteger(worker.pid))) throw new Error("Invalid inventory");
        resolve({ known: true, workers });
      } catch { resolve({ known: false, workers: [] }); }
    }));
}

export async function recoverTaskFiles(dataRoot, { inventory, now = new Date().toISOString() } = {}) {
  const entries = await fs.readdir(dataRoot, { withFileTypes: true }).catch(() => []);
  const recovered = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(dataRoot, entry.name, "task.json");
    let task;
    try { task = JSON.parse(await fs.readFile(file, "utf8")); }
    catch (error) { if (error.code === "ENOENT") continue; throw new Error(`Cannot recover task metadata: ${entry.name}`); }
    if (!needsRecovery(task)) continue;
    inventory ||= await inspectTaskWorkers(dataRoot);
    const logFile = path.join(dataRoot, entry.name, "logs.txt");
    const logStat = await fs.stat(logFile).catch(() => null);
    const next = interruptedTask(task, { now, lastActivityAt: logStat?.mtime.toISOString(),
      workersKnown: inventory.known, workerPids: inventory.workers.filter(worker => worker.taskId === task.id).map(worker => worker.pid) });
    await writeJsonAtomic(file, next);
    await fs.appendFile(logFile, `[task recovery] TASK_EXECUTION_INTERRUPTED detected=${now}; previous=${task.status}; workerCheck=${inventory.known ? "known" : "unknown"}; orphanCount=${next.interruption.workerPids.length}. No automatic retry; outputs and queue retained.\n`, "utf8");
    recovered.push(task.id);
  }
  return recovered;
}
