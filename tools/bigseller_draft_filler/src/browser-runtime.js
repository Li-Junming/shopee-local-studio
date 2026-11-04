import { stat } from "node:fs/promises";
import path from "node:path";

async function isExecutableFile(file) {
  try {
    const info = await stat(file);
    return info.isFile() && info.size > 0;
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code)) return false;
    throw error;
  }
}

// Resolve the installed Chrome binary only. Never change or inspect its profile,
// switch browser brands, download a browser, or alter login/session settings.
export async function resolveChromeLaunchOptions(browser = {}, {
  env = process.env, platform = process.platform, isFile = isExecutableFile
} = {}) {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const configured = browser.executablePath?.trim() || env.BIGSELLER_CHROME_PATH?.trim();
  if (configured) {
    if (!paths.isAbsolute(configured) || !await isFile(configured)) {
      throw new Error(`Configured Chrome executable does not exist: ${configured}. Correct browser.executablePath or BIGSELLER_CHROME_PATH.`);
    }
    return { executablePath: configured };
  }
  if (platform !== "win32") return { channel: "chrome" };

  const envValue = (name) => env[Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase())]?.trim();
  const systemDrive = envValue("SystemDrive") || "C:";
  const roots = [
    envValue("LOCALAPPDATA"),
    envValue("ProgramW6432"),
    envValue("ProgramFiles"),
    envValue("ProgramFiles(x86)"),
    paths.join(systemDrive + "\\", "Program Files"),
    paths.join(systemDrive + "\\", "Program Files (x86)")
  ].filter(Boolean);
  const seen = new Set();
  for (const root of roots) {
    const file = paths.join(root, "Google", "Chrome", "Application", "chrome.exe");
    if (seen.has(file.toLowerCase())) continue;
    seen.add(file.toLowerCase());
    if (await isFile(file)) return { executablePath: file };
  }
  throw new Error("Google Chrome executable was not found. Install Chrome, or set browser.executablePath / BIGSELLER_CHROME_PATH to its existing chrome.exe. Browser profile and login data were not changed.");
}
