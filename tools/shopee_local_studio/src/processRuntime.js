import path from "node:path";

// Windows treats env keys case-insensitively, while Node accepts duplicate keys.
// Keep one PATH and explicitly pass the server's known-working Node executable.
export function childProcessEnv(env = process.env, nodeExecutable = process.execPath, platform = process.platform) {
  const result = { ...env, SHOPEE_NODE_EXE: nodeExecutable };
  const pathKey = platform === "win32" ? "Path" : "PATH";
  const keys = Object.keys(result).filter((key) => platform === "win32" ? key.toLowerCase() === "path" : key === "PATH");
  const values = [...new Set(keys.map((key) => result[key]).filter(Boolean))];
  for (const key of keys) delete result[key];
  const paths = platform === "win32" ? path.win32 : path.posix;
  result[pathKey] = [paths.dirname(nodeExecutable), ...values].join(paths.delimiter);
  return result;
}
