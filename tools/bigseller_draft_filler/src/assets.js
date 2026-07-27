import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function requireFile(filePath, label) {
  try {
    await access(filePath);
  } catch {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

export async function loadStoreAssets(assetRoot, storeFolder) {
  const storeDir = path.resolve(assetRoot, storeFolder);
  const titlePath = path.join(storeDir, "title.txt");
  const detailPath = path.join(storeDir, "detail.txt");

  await requireFile(titlePath, "title.txt");
  await requireFile(detailPath, "detail.txt");

  const entries = await readdir(storeDir, { withFileTypes: true });
  const images = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
    .map((entry) => path.join(storeDir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), "en"));

  if (images.length === 0) {
    throw new Error(`No PNG images found in ${storeDir}`);
  }

  const title = (await readFile(titlePath, "utf8")).trim();
  const detail = (await readFile(detailPath, "utf8")).trim();

  if (!title) {
    throw new Error(`title.txt is empty: ${titlePath}`);
  }

  if (!detail) {
    throw new Error(`detail.txt is empty: ${detailPath}`);
  }

  return {
    storeDir,
    titlePath,
    detailPath,
    title,
    detail,
    images
  };
}
