import fs from "node:fs/promises";
import { hasCompletionReceipt } from "../../bigseller_draft_filler/src/cli-result.js";

const modes = new Set(["source", "copy", "discover", "save"]);

export function buildBigSellerCliArgs({ cliPath, configPath, mode, outPath, outDir }) {
  if (!modes.has(mode)) throw new Error(`Unsupported BigSeller mode: ${mode}`);
  const args = [cliPath, "--config", configPath, `--${mode}`];
  if (mode === "source") {
    if (!outDir) throw new Error("BigSeller source output directory is required.");
    args.push("--out-dir", outDir);
  }
  if (mode === "discover") {
    if (!outPath) throw new Error("BigSeller discover output path is required.");
    args.push("--out", outPath);
  }
  return args;
}

export async function verifyBigSellerCompletion(task, label, output, { readSourceManifest } = {}) {
  const mode = label.replace(/^bigseller_/, "");
  if (!label.startsWith("bigseller_") || !modes.has(mode)) return {};
  if (!hasCompletionReceipt(output, mode)) {
    throw new Error(`${label}: BigSeller 子程序未返回完成凭据，不能将退出码 0 当作执行成功。请检查启动日志。`);
  }
  if (mode === "source") {
    const manifest = await readSourceManifest(task);
    if (!manifest?.sourceImages?.length) {
      throw new Error("bigseller_source: 未取得有效的来源图片清单，已停止；不会继续生成文案或图片。");
    }
  }
  if (mode === "discover") {
    const config = JSON.parse(await fs.readFile(task.paths.bigsellerJobsConfig, "utf8"));
    if (!Array.isArray(config.jobs) || config.jobs.length !== task.targetStores.length || config.jobs.some((job) => !job.editUrl)) {
      throw new Error("bigseller_discover: 目标草稿链接不完整，不能进入保存步骤。");
    }
  }
  if (mode === 'save') {
    const config = JSON.parse(await fs.readFile(task.paths.bigsellerJobsConfig, 'utf8'));
    const progress = JSON.parse(await fs.readFile(`${task.paths.bigsellerJobsConfig}.save-progress.json`, 'utf8'));
    const entries = Array.isArray(progress.completedJobs) ? progress.completedJobs : [];
    const required = config.requiredSaveVerificationVersion || 1;
    if (!config.jobs?.length || config.jobs.length !== task.targetStores.length || config.jobs.some(job => !entries.some(entry =>
      entry.key === job.editUrl && Number(entry.verificationVersion) >= required && entry.assetSignature && entry.verifiedImageCount === 4
    ))) throw new Error('bigseller_save: 尚未完成所有目标店铺的文案与四图复核，不能标记全流程完成。');
  }
  return { verified: true };
}
