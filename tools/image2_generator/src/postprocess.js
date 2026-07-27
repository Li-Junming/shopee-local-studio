import fs from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export async function writeImage(bytes, outputPath) {
  await fs.mkdir(dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, bytes);
}

export async function fitPngToSquare(filePath, size) {
  const script = `
from PIL import Image, ImageOps
from pathlib import Path
path = Path(r'''${filePath.replaceAll("\\", "\\\\")}''')
size = ${Number(size)}
im = Image.open(path).convert('RGB')
im = ImageOps.fit(im, (size, size), Image.Resampling.LANCZOS)
im.save(path, format='PNG', optimize=True)
`;
  await execFile("python", ["-c", script], { windowsHide: true, maxBuffer: 1024 * 1024 });
}

function dirname(filePath) {
  return filePath.replace(/[\\/][^\\/]*$/, "") || ".";
}
