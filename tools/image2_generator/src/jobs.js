import fs from "node:fs/promises";

export async function shouldSkipJobOutput(outputPath, fsImpl = fs) {
  try {
    const stat = await fsImpl.stat(outputPath);
    return stat.isFile() && stat.size > 0;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
