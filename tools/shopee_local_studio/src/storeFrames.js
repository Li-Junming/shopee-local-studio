import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const savedConfigPath = fileURLToPath(new URL("../data/store-frame-config.json", import.meta.url));

export async function configuredStoreFrameRoot({ env = process.env, configPath = savedConfigPath } = {}) {
  if (env.SHOPEE_STORE_FRAME_ROOT) return env.SHOPEE_STORE_FRAME_ROOT;
  let saved;
  try {
    saved = JSON.parse(await fs.readFile(configPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return defaultStoreFrameRoot(env);
    throw new Error(`Cannot read store frame directory configuration: ${error.message}`);
  }
  if (typeof saved.root !== "string" || !path.isAbsolute(saved.root)) {
    throw new Error("Store frame directory configuration requires an absolute root path.");
  }
  return saved.root;
}

export function defaultStoreFrameRoot(env = process.env) {
  return env.SHOPEE_STORE_FRAME_ROOT || path.join(
    env.USERPROFILE || "C:\\Users\\12295",
    "Desktop",
    "\u867e\u76ae\u7535\u5546",
    "\u8d8a\u5357\u6c34\u5370\u50a8\u5b58"
  );
}

export async function resolveStoreFrameAssets({ root, storeIds = [], env = process.env, configPath } = {}) {
  const normalizedRoot = path.resolve(root ?? await configuredStoreFrameRoot({ env, configPath }));
  const ids = storeIds.map(String).filter(Boolean);
  const files = await listImageFiles(normalizedRoot).catch(() => []);
  const frames = {};
  const missing = [];

  for (const storeId of ids) {
    const candidates = files
      .filter((file) => isStoreFrameFile(file.fileName, storeId))
      .sort(compareFrameCandidates);
    if (candidates.length) {
      const frame = candidates[0];
      frames[storeId] = {
        storeId,
        path: frame.path,
        fileName: frame.fileName
      };
    } else {
      missing.push(storeId);
    }
  }

  return { root: normalizedRoot, frames, missing };
}

async function listImageFiles(root) {
  const out = [];
  await walk(root);
  return out;

  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!/\.(png|jpe?g|webp)$/i.test(entry.name)) continue;
      out.push({ path: entryPath, fileName: entry.name });
    }
  }
}

function isStoreFrameFile(fileName, storeId) {
  const name = String(fileName || "");
  const compactName = name.replace(/\s+/gu, "");
  const compactStoreId = String(storeId || "").replace(/\s+/gu, "");
  return compactName.includes(`${compactStoreId}\u5e97`)
    && /(\u6c34\u5370|\u8fb9\u6846|\u908a\u6846|\u6846)/u.test(compactName)
    && !/\u5934\u50cf|\u982d\u50cf/u.test(compactName);
}

function compareFrameCandidates(a, b) {
  return candidateScore(b.fileName) - candidateScore(a.fileName)
    || a.fileName.localeCompare(b.fileName);
}

function candidateScore(fileName) {
  const name = String(fileName || "").toLowerCase();
  let score = 0;
  if (name.includes("\u6c34\u5370")) score += 10;
  if (name.endsWith(".png")) score += 5;
  if (!name.includes("\u5934\u50cf")) score += 1;
  return score;
}
