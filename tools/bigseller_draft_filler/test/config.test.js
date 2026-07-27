import assert from "node:assert/strict";
import test from "node:test";

import { defaultUserDataDir, normalizeBrowserConfig, parseArgs } from "../src/config.js";

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
