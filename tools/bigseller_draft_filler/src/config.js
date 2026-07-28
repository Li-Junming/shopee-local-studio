import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const LEGACY_RELATIVE_PROFILE = ".chrome-profile";

export function defaultUserDataDir(env = process.env) {
  const configured = env.BIGSELLER_USER_DATA_DIR?.trim();
  if (configured) return configured;

  const localAppData = env.LOCALAPPDATA?.trim() || path.join(os.homedir(), "AppData", "Local");
  return path.join(localAppData, "ShopeeLocalStudio", "bigseller-chrome-profile");
}

export function normalizeBrowserConfig(browser = {}, env = process.env) {
  const rawUserDataDir = browser.userDataDir?.trim();
  const userDataDir = !rawUserDataDir || rawUserDataDir === LEGACY_RELATIVE_PROFILE
    ? defaultUserDataDir(env)
    : rawUserDataDir;

  return {
    userDataDir,
    headless: false,
    ...browser,
    userDataDir
  };
}

export function parseArgs(argv) {
  const args = {
    configPath: "jobs.json",
    outPath: "jobs.discovered.json",
    outDir: "source-images",
    mode: "dry-run",
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--config") {
      const next = argv[i + 1];
      if (!next) throw new Error("--config requires a file path.");
      args.configPath = next;
      i += 1;
    } else if (arg === "--out") {
      const next = argv[i + 1];
      if (!next) throw new Error("--out requires a file path.");
      args.outPath = next;
      i += 1;
    } else if (arg === "--out-dir") {
      const next = argv[i + 1];
      if (!next) throw new Error("--out-dir requires a directory path.");
      args.outDir = next;
      i += 1;
    } else if (arg === "--fill") {
      args.mode = "fill";
    } else if (arg === "--save") {
      args.mode = "save";
    } else if (arg === "--login") {
      args.mode = "login";
    } else if (arg === "--discover") {
      args.mode = "discover";
    } else if (arg === "--source") {
      args.mode = "source";
    } else if (arg === "--copy") {
      args.mode = "copy";
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

export async function loadConfig(configPath) {
  const absolutePath = path.resolve(configPath);
  const raw = await readFile(absolutePath, "utf8");
  const config = JSON.parse(raw);

  const hasJobs = Array.isArray(config.jobs) && config.jobs.length > 0;
  const hasDiscoverJobs = Array.isArray(config.discoverJobs) && config.discoverJobs.length > 0;
  const hasSourceJobs = Array.isArray(config.sourceJobs) && config.sourceJobs.length > 0;
  const hasCopyJobs = Array.isArray(config.copyJobs) && config.copyJobs.length > 0;
  if (!hasJobs && !hasDiscoverJobs && !hasSourceJobs && !hasCopyJobs) {
    throw new Error("Config must contain a non-empty jobs, discoverJobs, sourceJobs, or copyJobs array.");
  }

  if (!Array.isArray(config.storeMap) || config.storeMap.length === 0) {
    throw new Error("Config must contain a non-empty storeMap array.");
  }

  return {
    ...config,
    configPath: absolutePath,
    baseDir: path.dirname(absolutePath),
    browser: normalizeBrowserConfig(config.browser)
  };
}

export function printHelp() {
  return `BigSeller Draft Filler

Usage:
  node src/fill-drafts.js --config jobs.json           Check jobs only, no edits
  node src/fill-drafts.js --config jobs.json --fill    Fill title/detail/images, do not save
  node src/fill-drafts.js --config jobs.json --save    Fill and click only the white 保存 button
  node src/fill-drafts.js --config jobs.json --login   Open Chrome for BigSeller login
  node src/fill-drafts.js --config sku-jobs.json --discover --out jobs.json
  node src/fill-drafts.js --config copy-jobs.json --copy

Options:
  --config <path>   Path to jobs config. Default: jobs.json
  --out <path>      Output path for --discover. Default: jobs.discovered.json
  --fill            Edit the page but stop before saving.
  --save            Edit the page and click the white 保存 button. Never clicks 保存&发布.
  --login           Open the same Chrome profile and wait until BigSeller is logged in.
  --discover        Find draft edit URLs from SKU groups and store names.
  --copy            Copy matched 1-store online products to missing target-store Shopee drafts.
  --help            Show this help.
`;
}
