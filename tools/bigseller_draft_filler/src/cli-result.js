import path from "node:path";
import { fileURLToPath } from "node:url";

export const COMPLETION_PREFIX = "[bigseller-complete] ";

export function isCliEntrypoint(moduleUrl, argvPath, platform = process.platform) {
  if (!argvPath) return false;
  const paths = platform === "win32" ? path.win32 : path.posix;
  const normalize = (value) => {
    const resolved = paths.resolve(value);
    return platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(fileURLToPath(moduleUrl)) === normalize(argvPath);
}

// Emit proof only after the complete operation (including browser cleanup) succeeds.
// No account, URL, product text or credentials are included in this receipt.
export async function runCliWithCompletion(run, write = console.log) {
  const mode = await run();
  if (["source", "copy", "discover", "save"].includes(mode)) {
    write(`${COMPLETION_PREFIX}${JSON.stringify({ version: 1, mode, ok: true })}`);
  }
}

export function hasCompletionReceipt(output, mode) {
  return String(output || "").split(/\r?\n/).some((line) => {
    if (!line.startsWith(COMPLETION_PREFIX)) return false;
    try {
      const receipt = JSON.parse(line.slice(COMPLETION_PREFIX.length));
      return receipt.version === 1 && receipt.mode === mode && receipt.ok === true;
    } catch {
      return false;
    }
  });
}
