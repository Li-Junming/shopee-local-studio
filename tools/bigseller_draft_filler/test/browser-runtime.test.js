import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveChromeLaunchOptions } from "../src/browser-runtime.js";

const systemChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const localChrome = "C:\\Users\\test\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe";
const env = { LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local", ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)" };
const options = (available, extra = {}) => ({ env, platform: "win32", isFile: async (file) => available.includes(file), ...extra });

test("missing per-user Chrome falls back to the installed system Chrome", async () => {
  assert.deepEqual(await resolveChromeLaunchOptions({}, options([systemChrome])), { executablePath: systemChrome });
});

test("user and x86 Chrome installations are supported without changing browser brands", async () => {
  assert.deepEqual(await resolveChromeLaunchOptions({}, options([localChrome, systemChrome])), { executablePath: localChrome });
  const x86 = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe";
  assert.deepEqual(await resolveChromeLaunchOptions({}, options([x86])), { executablePath: x86 });
});

test("Windows environment variable casing and custom installation drives are respected", async () => {
  const custom = "D:\\Programs\\Google\\Chrome\\Application\\chrome.exe";
  assert.deepEqual(await resolveChromeLaunchOptions({}, options([custom], { env: { PROGRAMFILES: "D:\\Programs" } })), { executablePath: custom });
});

test("explicit executable wins, but a broken override must fail rather than silently switch", async () => {
  const explicit = "D:\\Chrome\\chrome.exe";
  assert.deepEqual(await resolveChromeLaunchOptions({ executablePath: explicit }, options([explicit, systemChrome])), { executablePath: explicit });
  assert.deepEqual(await resolveChromeLaunchOptions({}, options([explicit], { env: { BIGSELLER_CHROME_PATH: explicit } })), { executablePath: explicit });
  await assert.rejects(resolveChromeLaunchOptions({ executablePath: "C:\\missing\\chrome.exe" }, options([systemChrome])), /Configured Chrome executable/);
  await assert.rejects(resolveChromeLaunchOptions({ executablePath: "chrome.exe" }, options(["chrome.exe"])), /Configured Chrome executable/);
});

test("no Chrome fails clearly without installing anything or falling back to Edge", async () => {
  await assert.rejects(resolveChromeLaunchOptions({}, options([])), /Google Chrome executable was not found/);
  assert.deepEqual(await resolveChromeLaunchOptions({}, { platform: "linux", env: {} }), { channel: "chrome" });
});

test("browser profile, headless mode and existing launch settings remain untouched", async () => {
  const browser = { userDataDir: "D:\\existing-profile", headless: false };
  const before = structuredClone(browser);
  assert.deepEqual(await resolveChromeLaunchOptions(browser, options([systemChrome])), { executablePath: systemChrome });
  assert.deepEqual(browser, before);
  const cli = await readFile(new URL("../src/fill-drafts.js", import.meta.url), "utf8");
  assert.match(cli, /await resolveChromeLaunchOptions\(config.browser\)/);
  assert.match(cli, /launchPersistentContext\(userDataDir, \{\s*\.\.\.browserOptions,\s*headless: Boolean\(config.browser.headless\),\s*viewport: null,\s*args: \["--start-maximized"\]/);
});
