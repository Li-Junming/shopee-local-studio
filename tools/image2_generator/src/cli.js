#!/usr/bin/env node
import fs from "node:fs/promises";
import { runAdaptivePool } from "./adaptive-pool.js";
import { normalizeConfig } from "./config.js";
import { callImageApi, isRetryableImageError } from "./image2-client.js";
import { shouldSkipJobOutput } from "./jobs.js";
import { fitPngToSquare, writeImage } from "./postprocess.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.config) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const raw = JSON.parse(await fs.readFile(args.config, "utf8"));
  if (args.baseUrl) raw.baseUrl = args.baseUrl;
  if (args.concurrency) raw.concurrency = Number(args.concurrency);
  const config = normalizeConfig(raw, args.config);
  config.overwrite = Boolean(args.overwrite);

  if (args.dryRun) {
    printPlan(config);
    return;
  }

  const apiKey = args.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY. Set it in environment or pass --api-key.");
  }

  await runAdaptivePool(config.jobs, {
    maxConcurrency: config.concurrency,
    fallbackConcurrency: Math.min(2, config.concurrency),
    isRetryable: isRetryableImageError,
    onDowngrade: ({ from, to, error }) => {
      console.warn(`[image2] concurrency reduced ${from} -> ${to}: ${error.message}`);
    },
    onRequeue: ({ item }) => {
      console.warn(`[image2] requeue ${item.name} at reduced concurrency`);
    }
  }, async (job) => {
    if (await shouldSkipJobOutput(job.outputPath, undefined, { overwrite: args.overwrite })) {
      console.log(`[skip] ${job.outputPath}`);
      return;
    }
    if (args.overwrite) {
      console.log(`[overwrite] ${job.outputPath}`);
    }
    console.log(`[image2] ${job.name} -> ${job.outputPath}`);
    const bytes = await callImageApi({ config, job, apiKey });
    await writeImage(bytes, job.outputPath);
    await fitPngToSquare(job.outputPath, config.outputSize);
    console.log(`[done] ${job.outputPath}`);
  });
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--overwrite") out.overwrite = true;
    else if (arg === "--config") out.config = argv[++i];
    else if (arg === "--api-key") out.apiKey = argv[++i];
    else if (arg === "--base-url") out.baseUrl = argv[++i];
    else if (arg === "--concurrency") out.concurrency = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function printPlan(config) {
  console.log(JSON.stringify({
    model: config.model,
    baseUrl: config.baseUrl,
    size: config.size,
    outputSize: config.outputSize,
    concurrency: config.concurrency,
    overwrite: Boolean(config.overwrite),
    jobs: config.jobs.map((job) => ({
      name: job.name,
      endpoint: job.endpoint,
      images: job.images.length,
      outputPath: job.outputPath
    }))
  }, null, 2));
}

function printHelp() {
  console.log(`Usage:
  node src/cli.js --config jobs.image2.json [--dry-run]

Environment:
  OPENAI_API_KEY       Required unless --api-key is passed
  OPENAI_BASE_URL      Optional OpenAI-compatible base URL, defaults to https://api.openai.com/v1

Options:
  --config <file>      JSON config file
  --dry-run            Validate config and print job plan without API calls
  --base-url <url>     Override API base URL
  --api-key <key>      Override API key
  --concurrency <n>    Override concurrent API calls
  --overwrite          Regenerate outputs even when PNG files already exist
`);
}

main().catch((error) => {
  console.error(`[error] ${error.stack || error.message}`);
  process.exit(1);
});
