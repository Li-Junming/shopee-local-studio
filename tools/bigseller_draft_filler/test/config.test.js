import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { defaultUserDataDir, loadConfig, normalizeBrowserConfig, parseArgs } from "../src/config.js";

test("defaults to dry run and requires an explicit save flag", () => {
  const args = parseArgs([]);

  assert.equal(args.configPath, "jobs.json");
  assert.equal(args.outPath, "jobs.discovered.json");
  assert.equal(args.mode, "dry-run");
});

test("save mode is explicit", () => {
  const args = parseArgs(["--config", "sample.json", "--save"]);

  assert.equal(args.configPath, "sample.json");
  assert.equal(args.mode, "save");
});

test("fill mode edits without saving", () => {
  const args = parseArgs(["--fill"]);

  assert.equal(args.mode, "fill");
});

test("login mode opens the reusable Chrome profile", () => {
  const args = parseArgs(["--login"]);

  assert.equal(args.mode, "login");
});

test("discover mode accepts an output path", () => {
  const args = parseArgs(["--config", "sku-jobs.json", "--discover", "--out", "jobs.next.json"]);

  assert.equal(args.configPath, "sku-jobs.json");
  assert.equal(args.outPath, "jobs.next.json");
  assert.equal(args.mode, "discover");
});

test("source mode accepts an output directory", () => {
  const args = parseArgs(["--config", "source-jobs.json", "--source", "--out-dir", "source-images"]);

  assert.equal(args.configPath, "source-jobs.json");
  assert.equal(args.outDir, "source-images");
  assert.equal(args.mode, "source");
});

test("copy mode is explicit", () => {
  const args = parseArgs(["--config", "copy-jobs.json", "--copy"]);

  assert.equal(args.configPath, "copy-jobs.json");
  assert.equal(args.mode, "copy");
});

test("loadConfig accepts copy jobs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "bigseller-copy-config-"));
  const configPath = path.join(root, "copy-jobs.json");
  await writeFile(configPath, JSON.stringify({
    storeMap: [
      { match: "\u59d0\u592b 4\u5e97\uff08\u80e1\uff09", folder: "store_4_skinora_care" }
    ],
    copyJobs: [
      { name: "Serum", skus: ["SKU001"], sourceStoreMatch: "\u59d0\u592b1\u5e97\uff08\u80e1\uff09" }
    ]
  }), "utf8");

  const config = await loadConfig(configPath);

  assert.equal(config.copyJobs.length, 1);
  assert.equal(config.storeMap[0].folder, "store_4_skinora_care");
});

test("default browser profile is global instead of task-local", () => {
  const env = { LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" };

  assert.equal(
    defaultUserDataDir(env),
    "C:\\Users\\test\\AppData\\Local\\ShopeeLocalStudio\\bigseller-chrome-profile"
  );
});

test("legacy task-local profile is remapped to the global browser profile", () => {
  const env = { LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" };

  assert.equal(
    normalizeBrowserConfig({ userDataDir: ".chrome-profile" }, env).userDataDir,
    "C:\\Users\\test\\AppData\\Local\\ShopeeLocalStudio\\bigseller-chrome-profile"
  );
});

test("explicit browser profile path is respected", () => {
  const env = { LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" };

  assert.equal(
    normalizeBrowserConfig({ userDataDir: "D:\\profiles\\bigseller" }, env).userDataDir,
    "D:\\profiles\\bigseller"
  );
});
