import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {
  buildBigSellerCopyConfig,
  buildBigSellerSkuConfig,
  buildBigSellerSourceConfig,
  buildImage2CliArgs,
  buildImageArchiveManifest,
  buildImage2Config,
  buildImageResultSummary,
  buildTaskProgress,
  describeImage2Runtime,
  effectiveBigSellerItemIds,
  effectiveBigSellerSkuGroup,
  expandProductCodeSkuGroup,
  extractSourceDraftSkuGroup,
  imageResultMatchesQuery,
  listProductCodeMappings,
  makeListingDraft,
  normalizeImageReview,
  parseTaskText,
  parseSkuGroup,
  pipelineStartBlockers,
  pipelineStageCompleted,
  recordPipelineTiming,
  removeProductCodeMapping,
  requireBuyerProductIdentity,
  resolveTargetStoreIds,
  shouldShowTask,
  shouldAutoConfirmSource,
  sourceReviewState,
  assertSourceReviewReady,
  sourceSkuMatchRisk,
  buildPreflightReport,
  effectiveImageApiEnv,
  normalizeImageApiConfig,
  publicImageApiConfig,
  sourceImagesMissingMessage,
  storesFor,
  taskImageMatchesQuery,
  taskMatchesQuery,
  upsertProductCodeMapping,
  validateVietnameseListing
} from "../src/core.js";

const VIETNAMESE_DIACRITIC_RE = /[\u00C0-\u1EF9]/;

function folded(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D");
}

function detailSection(detail, start, end) {
  const foldedDetail = folded(detail);
  return foldedDetail.split(start)[1].split(end)[0].trim();
}

function titleDisplayLength(value) {
  return Array.from(String(value || "")).length;
}

function plainTitle(value) {
  return folded(String(value || "").normalize("NFKD"));
}

test("parseSkuGroup normalizes whitespace and duplicate SKU values", () => {
  assert.deepEqual(parseSkuGroup("YSLD80501  YSLD80502\nYSLD80501"), [
    "YSLD80501",
    "YSLD80502"
  ]);
});

test("parseTaskText extracts product task fields from pasted Chinese format", () => {
  const parsed = parseTaskText(`
SKU: YSLD80501  YSLD80502
Images: C:/tmp/a.png
C:/tmp/b.png
Draft Copied: yes
Notes: product image should include brand name and no authenticity mark
  `);

  assert.equal(parsed.productName, "");
  assert.deepEqual(parsed.skuGroup, ["YSLD80501", "YSLD80502"]);
  assert.deepEqual(parsed.targetStores, []);
  assert.equal(parsed.sourceImages, "C:/tmp/a.png\nC:/tmp/b.png");
  assert.equal(parsed.draftCopied, true);
  assert.equal(parsed.notes, "product image should include brand name and no authenticity mark");
});

test("parseTaskText accepts product name aliases and ignores pasted stores", () => {
  const parsed = parseTaskText(`
Product Name: Estee Lauder Soft Clean Infusion
SKU: YSLD80501,YSLD80502
Target Stores: 7,9
Images:
"C:/images/main.png"
"C:/images/real.png"
  `);

  assert.equal(parsed.productName, "Estee Lauder Soft Clean Infusion");
  assert.deepEqual(parsed.skuGroup, ["YSLD80501", "YSLD80502"]);
  assert.deepEqual(parsed.targetStores, []);
  assert.equal(parsed.sourceImages, "C:/images/main.png\nC:/images/real.png");
});

test("parseTaskText accepts SKU-only task text", () => {
  const parsed = parseTaskText("YSLD80501 YSLD80502");

  assert.equal(parsed.productName, "");
  assert.deepEqual(parsed.skuGroup, ["YSLD80501", "YSLD80502"]);
  assert.deepEqual(parsed.targetStores, []);
  assert.equal(parsed.sourceImages, "");
});

test("parseTaskText accepts numeric Item ID-only task text", () => {
  const parsed = parseTaskText("57414971469");

  assert.equal(parsed.productName, "");
  assert.deepEqual(parsed.skuGroup, ["57414971469"]);
  assert.deepEqual(parsed.targetStores, []);
});




test("parseTaskText accepts product code aliases as identifier input", () => {
  const parsed = parseTaskText(`
\u5546\u54C1\u7F16\u7801: pc-001 pc-002
  `);

  assert.equal(parsed.productName, "");
  assert.deepEqual(parsed.skuGroup, ["PC-001", "PC-002"]);
  assert.deepEqual(parsed.targetStores, []);

  assert.deepEqual(parseTaskText("Product Code: ab123 cd456").skuGroup, ["AB123", "CD456"]);
  assert.deepEqual(parseTaskText("Item ID: item-001 item-002").skuGroup, ["ITEM-001", "ITEM-002"]);
});

test("expandProductCodeSkuGroup expands mapped product codes and preserves raw SKUs", () => {
  const result = expandProductCodeSkuGroup("pc-001 raw-sku pc-002", {
    "PC-001": ["sku-a", "sku-b"],
    "PC-002": "sku-c sku-a"
  });

  assert.deepEqual(result.skuGroup, ["SKU-A", "SKU-B", "RAW-SKU", "SKU-C"]);
  assert.deepEqual(result.productCodes, ["PC-001", "PC-002"]);
  assert.deepEqual(result.mappings, [
    { productCode: "PC-001", skus: ["SKU-A", "SKU-B"] },
    { productCode: "PC-002", skus: ["SKU-C", "SKU-A"] }
  ]);
  assert.equal(result.expanded, true);
});

test("product code map helpers list, save, and delete normalized mappings", () => {
  const first = upsertProductCodeMapping({}, "pc-001", "sku-a sku-b sku-a");
  const second = upsertProductCodeMapping(first.map, "pc-002", ["sku-c"]);

  assert.deepEqual(first.mapping, { productCode: "PC-001", skus: ["SKU-A", "SKU-B"] });
  assert.deepEqual(listProductCodeMappings(second.map), [
    { productCode: "PC-001", skus: ["SKU-A", "SKU-B"] },
    { productCode: "PC-002", skus: ["SKU-C"] }
  ]);

  assert.deepEqual(removeProductCodeMapping(second.map, "pc-001").map, {
    "PC-002": ["SKU-C"]
  });
  assert.throws(() => upsertProductCodeMapping({}, "", "SKU-A"), /Product code is required/);
  assert.throws(() => upsertProductCodeMapping({}, "PC-003", ""), /At least one SKU is required/);
});

test("storesFor resolves supported target stores and rejects unknown stores", () => {
  assert.deepEqual(storesFor(["7", "9"]).map((store) => store.folder), [
    "store_7_skinora",
    "store_9_elora_skin"
  ]);
  assert.throws(() => storesFor(["10"]), /Unsupported store/);
});

test("resolveTargetStoreIds defaults empty input to stores 4 through 9", () => {
  assert.deepEqual(resolveTargetStoreIds([]), ["4", "5", "6", "7", "8", "9"]);
  assert.deepEqual(resolveTargetStoreIds(""), ["4", "5", "6", "7", "8", "9"]);
  assert.deepEqual(resolveTargetStoreIds(["5", "9"]), ["5", "9"]);
});

test("buildImage2Config creates four PNG jobs per selected store", () => {
  const config = buildImage2Config({
    taskDir: "C:/tmp/task",
    productName: "Estee Lauder Soft Clean Infusion",
    skuGroup: ["YSLD80501", "YSLD80502"],
    targetStores: ["7", "8"],
    sourceImages: ["C:/images/main.png", "C:/images/real.png"],
    notes: "pink bottle"
  });

  assert.equal(config.outputSize, 800);
  assert.equal(config.concurrency, 1);
  assert.equal(config.jobs.length, 8);
  assert.equal(config.jobs[0].out, "store_7_skinora/01_product.png");
  assert.equal(config.jobs[1].out, "store_7_skinora/02_effect.png");
  assert.equal(config.jobs[2].out, "store_7_skinora/03_real.png");
  assert.equal(config.jobs[3].out, "store_7_skinora/04_real.png");
  assert.equal(config.jobs[4].out, "store_8_skinora_beauty/01_product.png");
  assert.ok(config.jobs.every((job) => job.images.length === 2));
  assert.ok(config.jobs[0].prompt.includes("No authenticity badge"));
});

test("buildImage2Config keeps free-form notes out of image prompts", () => {
  const config = buildImage2Config({
    taskDir: "C:/tmp/task",
    productName: "Estee Lauder Soft Clean Infusion",
    skuGroup: ["YSLD80501"],
    targetStores: ["7"],
    sourceImages: ["C:/images/main.png"],
    notes: "manual note should stay out of image prompt"
  });

  assert.equal(config.jobs[0].prompt.includes("manual note"), false);
  assert.equal(config.jobs[0].prompt.includes("image prompt"), false);
});

test("describeImage2Runtime reports missing key and local proxy settings", async () => {
  const { describeImage2Runtime } = await import("../src/core.js");

  assert.deepEqual(describeImage2Runtime({ OPENAI_BASE_URL: "http://localhost:54273/v1" }), {
    apiKeySet: false,
    baseUrl: "http://localhost:54273/v1",
    localProxy: { host: "localhost", port: 54273 }
  });

  assert.equal(describeImage2Runtime({ OPENAI_API_KEY: "x" }).apiKeySet, true);
});

test("image API config is normalized, redacted, and preferred over process env", async () => {
  const config = normalizeImageApiConfig({
    baseUrl: " http://localhost:54273/v1/ ",
    apiKey: " sk-local-secret-123456 "
  });

  assert.deepEqual(config, {
    baseUrl: "http://localhost:54273/v1",
    apiKey: "sk-local-secret-123456"
  });
  assert.deepEqual(publicImageApiConfig(config), {
    baseUrl: "http://localhost:54273/v1",
    apiKeySet: true,
    maskedApiKey: "sk-****3456"
  });
  assert.deepEqual(effectiveImageApiEnv({
    OPENAI_API_KEY: "env-key",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    OTHER_ENV: "kept"
  }, config), {
    OPENAI_API_KEY: "sk-local-secret-123456",
    OPENAI_BASE_URL: "http://localhost:54273/v1",
    OTHER_ENV: "kept"
  });
  assert.deepEqual(describeImage2Runtime({
    OPENAI_API_KEY: "env-key",
    OPENAI_BASE_URL: "https://api.openai.com/v1"
  }, config), {
    apiKeySet: true,
    baseUrl: "http://localhost:54273/v1",
    localProxy: { host: "localhost", port: 54273 },
    configSource: "local"
  });
  assert.throws(() => normalizeImageApiConfig({ baseUrl: "not a url", apiKey: "sk-x" }), /Invalid API URL/);
});

test("buildImage2Config appends each target store frame only to that store jobs", () => {
  const config = buildImage2Config({
    taskDir: "C:/tmp/task",
    productName: "Estee Lauder Soft Clean Infusion",
    skuGroup: ["YSLD80501"],
    targetStores: ["7", "9"],
    sourceImages: ["C:/images/main.png"],
    storeFrames: {
      7: "C:/frames/store-7-watermark.png",
      9: "C:/frames/store-9-watermark.png"
    }
  });

  const store7Jobs = config.jobs.filter((job) => job.out.startsWith("store_7_skinora/"));
  const store9Jobs = config.jobs.filter((job) => job.out.startsWith("store_9_elora_skin/"));

  assert.ok(store7Jobs.filter((job) => /0[12]_/.test(job.out)).every((job) => job.images.includes("C:/frames/store-7-watermark.png")));
  assert.ok(store7Jobs.filter((job) => /0[34]_/.test(job.out)).every((job) => !job.images.includes("C:/frames/store-7-watermark.png")));
  assert.ok(store7Jobs.every((job) => !job.images.includes("C:/frames/store-9-watermark.png")));
  assert.ok(store9Jobs.filter((job) => /0[12]_/.test(job.out)).every((job) => job.images.includes("C:/frames/store-9-watermark.png")));
  assert.ok(store9Jobs.filter((job) => /0[34]_/.test(job.out)).every((job) => !job.images.includes("C:/frames/store-9-watermark.png")));
  assert.ok(store9Jobs.every((job) => !job.images.includes("C:/frames/store-7-watermark.png")));
  assert.ok(config.jobs[0].prompt.includes("Target store watermark/frame reference"));
});

test("buildImage2Config caps source image references to keep edit requests small", () => {
  const sourceImages = Array.from({ length: 8 }, (_, index) => `C:/images/source-${index + 1}.png`);
  const config = buildImage2Config({
    taskDir: "C:/tmp/task",
    productName: "Bobbi Brown Weightless Skin Foundation",
    skuGroup: ["BB86201"],
    targetStores: ["6"],
    sourceImages,
    storeFrames: {
      6: "C:/frames/store-6-watermark.png"
    }
  });

  const productJob = config.jobs.find((job) => job.out === "store_6_skinora_luxe/01_product.png");
  const realJob = config.jobs.find((job) => job.out === "store_6_skinora_luxe/03_real.png");

  assert.deepEqual(productJob.images, [
    "C:/images/source-1.png",
    "C:/images/source-2.png",
    "C:/frames/store-6-watermark.png"
  ]);
  assert.deepEqual(realJob.images, [
    "C:/images/source-1.png",
    "C:/images/source-2.png"
  ]);
});

test("buildImage2Config keeps real photos free of store frames", () => {
  const config = buildImage2Config({
    taskDir: "C:/tmp/task",
    productName: "Charlotte Tilbury Makeup Brush",
    skuGroup: ["GJ860101"],
    targetStores: ["4"],
    sourceImages: ["C:/images/source-product.png"],
    storeFrames: {
      4: "C:/frames/store-4-watermark.png"
    }
  });

  const productJob = config.jobs.find((job) => job.out === "store_4_skinora_care/01_product.png");
  const effectJob = config.jobs.find((job) => job.out === "store_4_skinora_care/02_effect.png");
  const realJobs = config.jobs.filter((job) => job.out.startsWith("store_4_skinora_care/0") && job.out.includes("_real.png"));

  assert.ok(productJob.images.includes("C:/frames/store-4-watermark.png"));
  assert.ok(effectJob.images.includes("C:/frames/store-4-watermark.png"));
  assert.equal(realJobs.length, 2);
  assert.ok(realJobs.every((job) => !job.images.includes("C:/frames/store-4-watermark.png")));
  assert.ok(realJobs.every((job) => !job.prompt.includes("Target store watermark/frame reference")));
  assert.ok(realJobs.every((job) => !job.prompt.includes("TOP BEAUTY PICKS")));
  assert.ok(realJobs.every((job) => job.prompt.includes("No store border, no ecommerce frame")));
  assert.ok(realJobs.every((job) => job.prompt.includes("Do not reproduce source-store logos even when they appear printed on source packaging")));
  assert.ok(realJobs.every((job) => job.prompt.includes("Must look like the same exact SKU/item, not merely the same product category")));
  assert.ok(realJobs.every((job) => job.prompt.includes("It is acceptable to show only part of the set when naturally cropped")));
  assert.ok(realJobs.every((job) => job.prompt.includes("Do not make the package-front feature list or icon grid the main subject")));
  assert.ok(realJobs.every((job) => job.prompt.includes("package can be angled, partially cropped, side-facing, blurred, or secondary")));
});

test("buildImage2Config applies distinct visual direction for stores 4, 5, and 6", () => {
  const config = buildImage2Config({
    taskDir: "C:/tmp/task",
    productName: "Lancome Genifique Serum",
    skuGroup: ["LC860101"],
    targetStores: ["4", "5", "6"],
    sourceImages: ["C:/images/main.png"]
  });

  const store4Prompt = config.jobs.find((job) => job.out.startsWith("store_4_skinora_care/01_product"))?.prompt || "";
  const store5Prompt = config.jobs.find((job) => job.out.startsWith("store_5_skinora_fresh/01_product"))?.prompt || "";
  const store6Prompt = config.jobs.find((job) => job.out.startsWith("store_6_skinora_luxe/01_product"))?.prompt || "";

  assert.match(store4Prompt, /Store differentiation profile: gentle daily-care/);
  assert.match(store5Prompt, /Store differentiation profile: fresh bright/);
  assert.match(store6Prompt, /Store differentiation profile: premium luxe/);
  assert.notEqual(store4Prompt, store5Prompt);
  assert.notEqual(store5Prompt, store6Prompt);
});

test("buildImage2Config tells each store not to reuse sibling store layouts", () => {
  const config = buildImage2Config({
    taskDir: "C:/tmp/task",
    productName: "Lancome Genifique Serum",
    skuGroup: ["LC860101"],
    targetStores: ["4", "5"],
    sourceImages: ["C:/images/main.png"]
  });

  const store4Prompt = config.jobs.find((job) => job.out.startsWith("store_4_skinora_care/01_product"))?.prompt || "";
  const store5Prompt = config.jobs.find((job) => job.out.startsWith("store_5_skinora_fresh/01_product"))?.prompt || "";

  assert.match(store4Prompt, /Do not reuse the layout, palette, hero crop, or benefit hierarchy of Store 5 Skinora Fresh/);
  assert.match(store5Prompt, /Do not reuse the layout, palette, hero crop, or benefit hierarchy of Store 4 Skinora Care/);
});

test("buildImage2Config includes stable style anchors for stores 4 through 9", () => {
  const config = buildImage2Config({
    taskDir: "C:/tmp/task",
    productName: "Lancome Genifique Serum",
    skuGroup: ["LC860101"],
    targetStores: ["4", "5", "6", "7", "8", "9"],
    sourceImages: ["C:/images/main.png"]
  });

  const promptFor = (folder) => config.jobs.find((job) => job.out.startsWith(`${folder}/01_product`))?.prompt || "";
  const store4Prompt = promptFor("store_4_skinora_care");
  const store5Prompt = promptFor("store_5_skinora_fresh");
  const store6Prompt = promptFor("store_6_skinora_luxe");
  const store7Prompt = promptFor("store_7_skinora");
  const store8Prompt = promptFor("store_8_skinora_beauty");
  const store9Prompt = promptFor("store_9_elora_skin");

  assert.match(store4Prompt, /white-gray podium/);
  assert.match(store5Prompt, /Scent & Glow/);
  assert.match(store6Prompt, /Laura Skin Care/);
  assert.match(store7Prompt, /pink-gold beauty counter/);
  assert.match(store8Prompt, /Skinora Beauty dark navy brand tab/);
  assert.match(store9Prompt, /red conversion hero/);
  assert.ok(config.jobs.filter((job) => /0[12]_/.test(job.out)).every((job) => job.prompt.includes("Light self-check")));
  assert.ok(config.jobs.filter((job) => /0[34]_/.test(job.out)).every((job) => job.prompt.includes("No store border, no ecommerce frame")));
});

test("buildImage2Config uses target frame anchors for stores 4, 5, and 6", () => {
  const config = buildImage2Config({
    taskDir: "C:/tmp/task",
    productName: "Charlotte Tilbury Makeup Brush",
    skuGroup: ["GJ860101"],
    targetStores: ["4", "5", "6"],
    sourceImages: ["C:/source/one-store-doudou-frame.jpg"],
    storeFrames: {
      4: "C:/frames/store-4-watermark.png",
      5: "C:/frames/store-5-watermark.png",
      6: "C:/frames/store-6-watermark.png"
    }
  });

  const promptFor = (folder) => config.jobs.find((job) => job.out.startsWith(`${folder}/01_product`))?.prompt || "";
  const store4Prompt = promptFor("store_4_skinora_care");
  const store5Prompt = promptFor("store_5_skinora_fresh");
  const store6Prompt = promptFor("store_6_skinora_luxe");

  assert.match(store4Prompt, /TOP BEAUTY PICKS/);
  assert.match(store4Prompt, /Best Seller/);
  assert.match(store4Prompt, /white-gray podium/);
  assert.match(store4Prompt, /bottom authenticity promise/);

  assert.match(store5Prompt, /Scent & Glow/);
  assert.match(store5Prompt, /soft pink-white/);
  assert.match(store5Prompt, /target frame/);

  assert.match(store6Prompt, /Laura Skin Care/);
  assert.match(store6Prompt, /gold frame/);
  assert.match(store6Prompt, /yellow bottom commitment bar/);
});

test("buildImage2Config prevents store 4 and 5 poster style drift", () => {
  const config = buildImage2Config({
    taskDir: "C:/tmp/task",
    productName: "SkinCeuticals C E Ferulic Serum",
    skuGroup: ["XL86301"],
    targetStores: ["4", "5"],
    sourceImages: ["C:/source/serum-box-and-bottle.jpg"],
    storeFrames: {
      4: "C:/frames/store-4-watermark.png",
      5: "C:/frames/store-5-watermark.png"
    }
  });

  const promptFor = (out) => config.jobs.find((job) => job.out === out)?.prompt || "";
  const store4EffectPrompt = promptFor("store_4_skinora_care/02_effect.png");
  const store5ProductPrompt = promptFor("store_5_skinora_fresh/01_product.png");

  assert.doesNotMatch(store4EffectPrompt, /warm ivory|soft gold/i);
  assert.match(store4EffectPrompt, /same visual family as Store 4 01_product/);
  assert.match(store4EffectPrompt, /blue-accent benefit icons/);
  assert.match(store4EffectPrompt, /No beige, cream-gold, champagne, or warm-gold benefit cards/);

  assert.match(store5ProductPrompt, /same exact source product set/);
  assert.match(store5ProductPrompt, /show the bottle plus retail box when both are present/);
  assert.match(store5ProductPrompt, /Do not replace the retail box with a second bottle/);
  assert.match(store5ProductPrompt, /Scent & Glow/);
  assert.match(store5ProductPrompt, /same Scent & Glow store template family/);
  assert.match(store5ProductPrompt, /do not force an aqua bottom band/);
  assert.match(store5ProductPrompt, /ecommerce design polish/);
});

test("buildImage2Config keeps store 8 natural inside Skinora Beauty ecommerce style", () => {
  const config = buildImage2Config({
    taskDir: "C:/tmp/task",
    productName: "SkinCeuticals C E Ferulic Serum",
    skuGroup: ["XL86301"],
    targetStores: ["8"],
    sourceImages: ["C:/source/serum-box-and-bottle.jpg"],
    storeFrames: {
      8: "C:/frames/store-8-watermark.png"
    }
  });

  const productPrompt = config.jobs.find((job) => job.out === "store_8_skinora_beauty/01_product.png")?.prompt || "";
  const effectPrompt = config.jobs.find((job) => job.out === "store_8_skinora_beauty/02_effect.png")?.prompt || "";

  for (const prompt of [productPrompt, effectPrompt]) {
    assert.match(prompt, /Skinora Beauty dark navy brand tab/);
    assert.match(prompt, /light Skinora Beauty frame/);
    assert.match(prompt, /same visual family as Store 8 Skinora Beauty/);
    assert.match(prompt, /show the bottle plus retail box when both are present/);
    assert.match(prompt, /Do not replace the retail box with a second bottle or change the box color/);
    assert.match(prompt, /natural integrated ecommerce hero/);
    assert.match(prompt, /2-3 short ecommerce selling points/);
    assert.match(prompt, /soft contact shadow/);
    assert.match(prompt, /reduce pasted-together separation/);
    assert.match(prompt, /avoid rigid centered catalog layout/);
    assert.match(prompt, /rounded promo sticker/);
    assert.match(prompt, /not a specification sheet/);
    assert.match(prompt, /No dense parameter table, manual-style spec page, or tiny text-heavy grid/);
    assert.match(prompt, /No lab water droplets, test tubes, molecule graphics, hydro splash, or clinical laboratory scene/);
  }
  assert.match(productPrompt, /slightly angled or offset product arrangement/);
  assert.match(effectPrompt, /benefit modules blended into the background/);
});

test("buildImage2Config separates 1-store source identity from target-store frame style", () => {
  const config = buildImage2Config({
    taskDir: "C:/tmp/task",
    productName: "Charlotte Tilbury Makeup Brush",
    skuGroup: ["GJ860101"],
    targetStores: ["4", "5", "6"],
    sourceImages: ["C:/source/one-store-doudou-frame.jpg"],
    storeFrames: {
      4: "C:/frames/store-4-watermark.png",
      5: "C:/frames/store-5-watermark.png",
      6: "C:/frames/store-6-watermark.png"
    }
  });

  for (const job of config.jobs) {
    assert.match(job.prompt, /Source images are product evidence only/);
    assert.match(job.prompt, /Do not copy source-store logos, source-store frames, source-store corner badges, Doudou, or source-store layout/);
    assert.match(job.prompt, /Do not use source-store mascot or sticker graphics as decoration/);
    if (/0[12]_/.test(job.out)) {
      assert.match(job.prompt, /Target store watermark\/frame reference controls the store identity/);
    } else {
      assert.doesNotMatch(job.prompt, /Target store watermark\/frame reference controls the store identity/);
      assert.match(job.prompt, /No store border, no ecommerce frame/);
    }
  }
});

test("buildImage2Config gives each image slot a distinct composition role", () => {
  const config = buildImage2Config({
    taskDir: "C:/tmp/task",
    productName: "Lancome Genifique Serum",
    skuGroup: ["LC860101"],
    targetStores: ["4"],
    sourceImages: ["C:/images/main.png"]
  });

  const productPrompt = config.jobs.find((job) => job.out.endsWith("/01_product.png"))?.prompt || "";
  const effectPrompt = config.jobs.find((job) => job.out.endsWith("/02_effect.png"))?.prompt || "";
  const realOnePrompt = config.jobs.find((job) => job.out.endsWith("/03_real.png"))?.prompt || "";
  const realTwoPrompt = config.jobs.find((job) => job.out.endsWith("/04_real.png"))?.prompt || "";

  assert.match(productPrompt, /Slot role: main product trust poster/);
  assert.match(effectPrompt, /Slot role: benefit and usage-feel poster/);
  assert.match(realOnePrompt, /Slot role: natural buyer proof photo/);
  assert.match(realTwoPrompt, /Slot role: alternate buyer proof photo/);
});

test("buildImage2Config assigns a unique store-slot composition to all 24 images", () => {
  const config = buildImage2Config({
    taskDir: "C:/tmp/task",
    productName: "Estee Lauder Micro Essence",
    skuGroup: ["YSLD80301"],
    targetStores: ["4", "5", "6", "7", "8", "9"],
    sourceImages: ["C:/images/main.png"]
  });

  const compositionLocks = config.jobs.map((job) => {
    const match = job.prompt.match(/Store-slot composition lock: ([^.]+)\./);
    assert.ok(match, `${job.out} should have a store-slot composition lock`);
    return match[1];
  });

  assert.equal(compositionLocks.length, 24);
  assert.equal(new Set(compositionLocks).size, 24);

  const promptFor = (out) => config.jobs.find((job) => job.out === out)?.prompt || "";
  assert.match(promptFor("store_4_skinora_care/01_product.png"), /lower-center hero/);
  assert.match(promptFor("store_5_skinora_fresh/01_product.png"), /right-third hero/);
  assert.match(promptFor("store_6_skinora_luxe/01_product.png"), /strictly symmetrical center hero/);
  assert.match(promptFor("store_7_skinora/01_product.png"), /left-third hero/);
  assert.match(promptFor("store_8_skinora_beauty/01_product.png"), /right-third hero/);
  assert.match(promptFor("store_9_elora_skin/01_product.png"), /oversized diagonal hero/);
  assert.match(promptFor("store_4_skinora_care/03_real.png"), /daylight windowsill/);
  assert.match(promptFor("store_9_elora_skin/04_real.png"), /low camera angle on an everyday work desk/);
});

test("buildImage2Config adds review-guided regeneration instructions", () => {
  const config = buildImage2Config({
    taskDir: "C:/tmp/task",
    productName: "Lancome Genifique Serum",
    skuGroup: ["LC860101"],
    targetStores: ["4", "5"],
    sourceImages: ["C:/images/main.png"],
    imageReview: {
      status: "needs_regeneration",
      flags: ["layout_similar", "color_similar"],
      notes: "store 4 and 5 looked too close"
    }
  });

  const store4Prompt = config.jobs.find((job) => job.out.startsWith("store_4_skinora_care/01_product"))?.prompt || "";

  assert.match(store4Prompt, /Review-guided regeneration/);
  assert.match(store4Prompt, /Change the composition/);
  assert.match(store4Prompt, /Change the palette/);
  assert.match(store4Prompt, /store 4 and 5 looked too close/);
});

test("buildBigSellerSkuConfig writes discover jobs using asset root", () => {
  const assetRoot = path.resolve("outputs/local_studio/abc");
  const config = buildBigSellerSkuConfig({
    productName: "Lancome Genifique",
    skuGroup: ["LC860101", "LC860102"],
    assetRoot
  });

  assert.deepEqual(config.discoverJobs[0].skus, ["LC860101", "LC860102"]);
  assert.equal(config.discoverJobs[0].assetRoot, assetRoot);
});

test("source row SKU values are used for BigSeller draft lookup after Item ID source lookup", () => {
  const sourceRowText = "Item ID: 57414971469 婵劕銇?鎼?-- YSLD80301 SKU ID: 361285888566 VND 2,250,000 YSLD80302 SKU ID: 361285888567 YSLD80303";
  const task = {
    skuGroup: ["57414971469"],
    sourceConfirmedAt: "2026-07-29T01:00:00.000Z",
    sourceDraftSkuGroup: extractSourceDraftSkuGroup({ sourceRowText })
  };

  assert.deepEqual(task.sourceDraftSkuGroup, ["YSLD80301", "YSLD80302", "YSLD80303"]);
  assert.deepEqual(effectiveBigSellerSkuGroup(task), ["YSLD80301", "YSLD80302", "YSLD80303"]);

  const config = buildBigSellerSkuConfig({
    productName: "Estee Lauder",
    skuGroup: effectiveBigSellerSkuGroup(task),
    assetRoot: "C:/task/images",
    targetStores: ["4"]
  });
  assert.deepEqual(config.discoverJobs[0].skus, ["YSLD80301", "YSLD80302", "YSLD80303"]);
});

test("source draft SKU values are ignored until the current source is confirmed", () => {
  const unconfirmed = {
    skuGroup: ["57414971469"],
    sourceDraftSkuGroup: ["OLD001", "OLD002"],
    sourceReviewRequired: true,
    sourceImages: ["C:/task/source-images/01_source.jpg"],
    sourceRowText: "婵劕銇?鎼?57414971469 OLD001"
  };

  assert.deepEqual(effectiveBigSellerSkuGroup(unconfirmed), ["57414971469"]);
  assert.deepEqual(effectiveBigSellerSkuGroup({ ...unconfirmed, sourceConfirmedAt: "2026-07-29T01:00:00.000Z" }), ["OLD001", "OLD002"]);
});

test("confirmed source row Item ID is used for BigSeller copy fallback without SKU ID", () => {
  const task = {
    skuGroup: ["XL86101"],
    sourceConfirmedAt: "2026-08-05T13:04:17.743Z",
    sourceRowText: "婵劕銇?鎼?Item ID: 42533266096 -- XL86101 SKU ID: 386318542639 VND 2,180,000"
  };

  assert.deepEqual(effectiveBigSellerItemIds(task), ["42533266096"]);
});

test("buildBigSellerCopyConfig writes copy jobs from 1-store to target stores", () => {
  const config = buildBigSellerCopyConfig({
    productName: "Lancome Genifique",
    skuGroup: ["LC860101", "LC860102"],
    itemIds: ["53765401701"],
    targetStores: ["4", "5", "6", "7", "8", "9"]
  });

  assert.deepEqual(config.storeMap.map((store) => store.folder), [
    "store_4_skinora_care",
    "store_5_skinora_fresh",
    "store_6_skinora_luxe",
    "store_7_skinora",
    "store_8_skinora_beauty",
    "store_9_elora_skin"
  ]);
  assert.deepEqual(config.copyJobs[0].skus, ["LC860101", "LC860102"]);
  assert.deepEqual(config.copyJobs[0].itemIds, ["53765401701"]);
  assert.equal(config.copyJobs[0].sourceStoreMatch, "\u0031\u5e97");
});

test("buildBigSellerSourceConfig writes source jobs using SKU group and source image directory", () => {
  const sourceDir = path.resolve("outputs/source-images");
  const config = buildBigSellerSourceConfig({
    productName: "Lancome Genifique",
    skuGroup: ["LC860101", "LC860102"],
    sourceImageDir: sourceDir
  });

  assert.deepEqual(config.sourceJobs[0].skus, ["LC860101", "LC860102"]);
  assert.equal(config.sourceJobs[0].outDir, sourceDir);
  assert.equal(config.sourceJobs[0].sourceStoreMatch, "1店");
});

test("sourceImagesMissingMessage explains missing BigSeller source SKU match", () => {
  const message = sourceImagesMissingMessage({
    skuGroup: ["YSLD80501", "YSLD80502"]
  });

  assert.match(message, /YSLD80501, YSLD80502/);
  assert.match(message, /1-store active listing/i);
  assert.match(message, /paste\/upload source images/i);
});

test("validateVietnameseListing enforces title length, diacritics, and buyer-facing details", () => {
  const validListing = makeListingDraft({
    productName: "Estee Lauder Soft Clean Infusion Hydrating Lotion",
    notes: "pink bottle, hydrating and soothing lotion, dry skin",
    storeId: "8"
  });
  assert.equal(validateVietnameseListing(validListing).valid, true);

  assert.deepEqual(validateVietnameseListing({
    title: "Qua ngan",
    detail: "SKU YSLD80501"
  }).errors, [
    "Title must be 90-99 characters.",
    "Title and detail must not contain SKU or full SKU codes.",
    "Title and detail must use Vietnamese with diacritics.",
    "Detail is too short for buyer-facing product effects."
  ]);
});

test("makeListingDraft returns diacritic Vietnamese buyer-facing title and detail", () => {
  const listing = makeListingDraft({
    productName: "YSL Loveshine Candy Glow Son duong co mau",
    notes: "duong moi bong nhe",
    storeId: "9"
  });

  assert.ok(titleDisplayLength(listing.title) >= 90);
  assert.ok(titleDisplayLength(listing.title) <= 99);
  assert.equal(VIETNAMESE_DIACRITIC_RE.test(listing.title + listing.detail), true);
  assert.equal(validateVietnameseListing(listing).valid, true);
});

test("makeListingDraft pads short product names to Shopee title length", () => {
  const listing = makeListingDraft({
    productName: "Demo Product Check",
    notes: "demo only",
    storeId: "7"
  });

  assert.ok(titleDisplayLength(listing.title) >= 90);
  assert.ok(titleDisplayLength(listing.title) <= 99);
});

test("makeListingDraft never adds Shopee into buyer-facing copy", () => {
  const listing = makeListingDraft({
    productName: "Estee Lauder Soft Clean Infusion",
    notes: "duong am, lam diu da, chai hong, phu hop da kho",
    storeId: "8"
  });

  assert.equal(listing.title.includes("Shopee"), false);
  assert.equal(listing.detail.includes("Shopee"), false);
});

test("makeListingDraft styles only listing titles with double-struck brand and bold product name", () => {
  const listing = makeListingDraft({
    productName: "L'OCCITANE Shea Butter Hand Cream Kem Duong Tay Bo Hat Mo 20%",
    notes: "kem duong tay, bo hat mo, duong am sau, lam mem da kho min",
    storeId: "9"
  });

  assert.match(listing.title, /[\u{1D400}-\u{1D7FF}]/u);
  assert.ok(titleDisplayLength(listing.title) >= 90, listing.title);
  assert.ok(titleDisplayLength(listing.title) <= 99, listing.title);
  assert.equal(listing.detail.startsWith("L'OCCITANE Shea Butter Hand Cream"), true);
  assert.equal(/[\u{1D400}-\u{1D7FF}]/u.test(listing.detail), false);
  assert.equal(validateVietnameseListing(listing).valid, true);
});

test("makeListingDraft keeps styled title within platform textarea counter", () => {
  const listing = makeListingDraft({
    productName: "DailyCare Beauty Essential",
    notes: "cam giac mem min, dung deu hang ngay, phu hop quy trinh ca nhan",
    storeId: "7"
  });

  assert.ok(titleDisplayLength(listing.title) >= 90, listing.title);
  assert.ok(titleDisplayLength(listing.title) <= 99, listing.title);
  assert.equal(/\b(?:phu|cho|tai)$/i.test(folded(listing.title)), false, listing.title);
  assert.equal(validateVietnameseListing(listing).valid, true);
});

test("makeListingDraft counts styled Unicode title by visible characters", () => {
  const listing = makeListingDraft({
    productName: "SEPHORA Outrageous Plump Hydrating Lip Gloss Son Bong Moi Cang Mong Duong Am Min Moi Khong Bet Dinh",
    notes: "son bong moi, duong am, cang mong, khong bet dinh",
    storeId: "4"
  });

  assert.ok(listing.title.length > titleDisplayLength(listing.title), listing.title);
  assert.ok(titleDisplayLength(listing.title) >= 90, listing.title);
  assert.ok(titleDisplayLength(listing.title) <= 99, listing.title);
  assert.equal(validateVietnameseListing(listing).valid, true);
});

test("makeListingDraft creates differentiated buyer copy for each store", () => {
  const base = {
    productName: "YSL Loveshine Candy Glow Tinted Lip Balm",
    notes: "son duong co mau, bong nhe, duong am moi"
  };
  const store7 = makeListingDraft({ ...base, storeId: "7" });
  const store8 = makeListingDraft({ ...base, storeId: "8" });
  const store9 = makeListingDraft({ ...base, storeId: "9" });

  assert.notEqual(store7.title, store8.title);
  assert.notEqual(store8.title, store9.title);
  assert.notEqual(store7.detail, store8.detail);
  assert.notEqual(store8.detail, store9.detail);
  assert.match(store7.detail, /moi/i);
  assert.match(store7.detail, /bong/i);
  assert.equal(validateVietnameseListing(store7).valid, true);
  assert.equal(validateVietnameseListing(store8).valid, true);
  assert.equal(validateVietnameseListing(store9).valid, true);
});

test("makeListingDraft makes ecommerce titles start with English identity and vary by benefit", () => {
  const base = {
    productName: "ESTEE LAUDER Nutritious 2-in-1 Foam Cleanser 125ml Sua Rua Mat 2in1 Lam Sach & Thanh Loc Da",
    notes: "sua rua mat lam sach sau, thanh loc da, duong am, phu hop da dau"
  };
  const listings = ["7", "8", "9"].map((storeId) => makeListingDraft({ ...base, storeId }));
  const titles = listings.map((listing) => listing.title);
  const identity = "ESTEE LAUDER Nutritious 2-in-1 Foam";

  for (const { title, detail } of listings) {
    assert.ok(plainTitle(title).startsWith(identity), title);
    assert.ok(titleDisplayLength(title) >= 90, title);
    assert.ok(titleDisplayLength(title) <= 99, title);
    assert.match(title, /, /, title);
    assert.equal(/\bShopee\b/i.test(title), false, title);
    assert.equal(/\bchinh hang\b/i.test(title), false, title);
    assert.equal(validateVietnameseListing({ title, detail }).valid, true);
  }
  assert.equal(new Set(titles).size, 3, titles.join("\n"));
  assert.match(folded(titles[0]), /Lam sach sau|Loai bo bui ban|mem min/i);
  assert.match(folded(titles[1]), /lo chan long|sach nhe|be mat/i);
  assert.match(folded(titles[2]), /Thanh loc|duong am|hang ngay/i);
});

test("makeListingDraft creates compliant differentiated cleanser details", () => {
  const base = {
    productName: "ESTEE LAUDER Nutritious 2-in-1 Foam Cleanser 125ml Sua Rua Mat 2in1 Lam Sach & Thanh Loc Da",
    notes: "sua rua mat lam sach sau, thanh loc da, duong am, phu hop da dau, khong chinh hang"
  };
  const store7 = makeListingDraft({ ...base, storeId: "7" });
  const store8 = makeListingDraft({ ...base, storeId: "8" });
  const store9 = makeListingDraft({ ...base, storeId: "9" });

  const titles = [store7.title, store8.title, store9.title];
  assert.equal(new Set(titles).size, 3, titles.join("\n"));
  assert.match(folded(store7.title), /Lam sach sau|Loai bo bui ban|mem min/i);
  assert.match(folded(store8.title), /dau thua|thoang mat|lo chan long|vung T/i);
  assert.match(folded(store9.title), /Thanh loc|duong am|hang ngay|diu nhe/i);

  for (const listing of [store7, store8, store9]) {
    assert.match(listing.detail, /^ESTEE LAUDER Nutritious 2-in-1 Foam Cleanser 125ml/m);
    assert.match(listing.detail, /Công dụng chính/);
    assert.match(listing.detail, /Đối tượng phù hợp/);
    assert.match(listing.detail, /Cảm giác khi dùng/);
    assert.match(listing.detail, /Cách dùng/);
    assert.match(listing.detail, /Cách bảo quản/);
    assert.equal(/\b(?:FAQ|Q:|A:|Mat na rua|mat na rua|Thong tin tham khao|chinh hang|SKU|Shopee)\b/i.test(folded(listing.detail)), false);
    assert.equal(/\b(?:Bo cuc|hinh anh|quyet dinh mua|phien ban|khach thich)\b/i.test(folded(listing.detail)), false);
    assert.equal(validateVietnameseListing(listing).valid, true);
  }

  assert.match(folded(store8.detail), /dau thua|vung T|thoang mat/i);
  assert.match(folded(store9.detail), /duong am|khong bi cang kho|hang ngay/i);
  assert.notEqual(store7.detail, store8.detail);
  assert.notEqual(store8.detail, store9.detail);
});

test("makeListingDraft uses one buyer-copy standard with differentiated lower modules", () => {
  const base = {
    productName: "ESTEE LAUDER Nutritious 2-in-1 Foam Cleanser 125ml",
    notes: "sua rua mat 2 trong 1, lam sach sau, dau thua, thanh loc lo chan long"
  };
  const listings = ["7", "8", "9"].map((storeId) => makeListingDraft({ ...base, storeId }));

  for (const listing of listings) {
    assert.ok(titleDisplayLength(listing.title) >= 90 && titleDisplayLength(listing.title) <= 99, listing.title);
    assert.ok(plainTitle(listing.title).startsWith("ESTEE LAUDER Nutritious 2-in-1 Foam"), listing.title);
    assert.equal(VIETNAMESE_DIACRITIC_RE.test(listing.title + listing.detail), true);
    assert.equal(/\b(?:Shopee|SKU|chinh hang|ban hang chinh hang|cam ket|100%)\b/i.test(folded(listing.title + listing.detail)), false);
    assert.equal(validateVietnameseListing(listing).valid, true);
  }

  for (const [start, end] of [
    ["Cong dung chinh", "Doi tuong phu hop"],
    ["Doi tuong phu hop", "Cam giac khi dung"],
    ["Cam giac khi dung", "Cach dung"],
    ["Cach dung", "Cach bao quan"]
  ]) {
    const modules = listings.map((listing) => detailSection(listing.detail, start, end));
    assert.equal(new Set(modules).size, 3, `${start} should differ per store`);
  }
});

test("makeListingDraft changes the visible benefit section per store", () => {
  const base = {
    productName: "Estee Lauder Soft Clean Infusion Hydrating Lotion",
    notes: "pink bottle, hydrating and soothing lotion, dry skin"
  };
  const store7 = makeListingDraft({ ...base, storeId: "7" });
  const store8 = makeListingDraft({ ...base, storeId: "8" });
  const store9 = makeListingDraft({ ...base, storeId: "9" });

  const visibleBenefits = (detail) => detail.split("\n").slice(3, 7).join("\n");
  assert.notEqual(visibleBenefits(store7.detail), visibleBenefits(store8.detail));
  assert.notEqual(visibleBenefits(store8.detail), visibleBenefits(store9.detail));
  assert.notEqual(visibleBenefits(store7.detail), visibleBenefits(store9.detail));
});

test("makeListingDraft differentiates lower detail modules per store", () => {
  const base = {
    productName: "ESTEE LAUDER Nutritious 2-in-1 Foam Cleanser 125ml",
    notes: "sua rua mat 2 trong 1, lam sach sau, dau thua, thanh loc lo chan long"
  };
  const store7 = makeListingDraft({ ...base, storeId: "7" });
  const store8 = makeListingDraft({ ...base, storeId: "8" });
  const store9 = makeListingDraft({ ...base, storeId: "9" });

  for (const section of [
    ["Doi tuong phu hop", "Cam giac khi dung"],
    ["Cam giac khi dung", "Cach dung"],
    ["Cach dung", "Cach bao quan"]
  ]) {
    const texts = [store7, store8, store9].map((listing) => detailSection(listing.detail, section[0], section[1]));
    assert.equal(new Set(texts).size, 3, `${section[0]} should differ per store`);
  }
});

test("makeListingDraft differentiates cleanser storage and keeps all sections compliant", () => {
  const base = {
    productName: "ESTEE LAUDER Nutritious 2-in-1 Foam Cleanser 125ml",
    notes: "sua rua mat 2 trong 1, lam sach sau, dau thua, thanh loc lo chan long"
  };
  const listings = ["7", "8", "9"].map((storeId) => makeListingDraft({ ...base, storeId }));
  const storage = listings.map((listing) => folded(listing.detail).split("Cach bao quan")[1].trim());

  assert.equal(new Set(storage).size, 3, "Cach bao quan should differ per store");
  assert.match(storage[0], /kho thoang|nguon nhiet/i);
  assert.match(storage[1], /nhiet do phong|mieng nap/i);
  assert.match(storage[2], /dung chieu|thoang mat/i);

  for (const listing of listings) {
    const copy = `${listing.title}\n${listing.detail}`;
    assert.equal(/\b(?:FAQ|Q:|A:|Shopee|SKU|chinh hang|ban hang chinh hang|cam ket|100%)\b/i.test(folded(copy)), false);
    assert.equal(/\b(?:Bo cuc|hinh anh|quyet dinh mua|phien ban|khach thich)\b/i.test(folded(copy)), false);
    assert.equal(validateVietnameseListing(listing).valid, true);
  }
});

test("makeListingDraft keeps non-cleanser details buyer-facing instead of internal layout copy", () => {
  const listing = makeListingDraft({
    productName: "Estee Lauder Soft Clean Infusion Hydrating Lotion",
    notes: "pink bottle, hydrating and soothing lotion, dry skin",
    storeId: "8"
  });

  assert.equal(/\b(?:Bo cuc|hinh anh|quyet dinh mua|khach thich|phien ban)\b/i.test(folded(listing.detail)), false);
  assert.match(listing.detail, /Cảm giác khi dùng/);
  assert.match(folded(listing.detail), /da|be mat/i);
  assert.equal(validateVietnameseListing(listing).valid, true);
});

test("makeListingDraft treats skin foundation as makeup, not skincare or cleanser", () => {
  const listing = makeListingDraft({
    productName: "BOBBI BROWN Weightless Skin Foundation SPF15 PA++ Kem Nen Mong Nhe Che Phu Min Da",
    notes: "liquid foundation, makeup base, natural coverage. Lam sach da truoc khi dung kem nen.",
    storeId: "8"
  });
  const copy = folded(`${listing.title}\n${listing.detail}`);

  assert.match(copy, /foundation|makeup|trang diem|lop nen|che phu/i);
  assert.equal(/\b(?:lam sach|rua mat|thanh loc|duong am|routine sang|routine toi)\b/i.test(copy), false);
  assert.equal(validateVietnameseListing(listing).valid, true);
});

test("makeListingDraft treats Hydrating B5 Gel as differentiated skincare, not cleanser", () => {
  const base = {
    productName: "SKINCEUTICALS Hydrating B5 Gel 30ml Serum Cap Am B5 HA Duong Da Cang Min Phuc Hoi Da",
    notes: "serum cap am voi Hyaluronic Acid va Vitamin B5. Lam sach da truoc khi dung serum."
  };
  const listings = ["4", "5", "6", "7", "8", "9"].map((storeId) => makeListingDraft({ ...base, storeId }));
  const copies = listings.map((listing) => folded(`${listing.title}\n${listing.detail}`));

  for (const listing of listings) {
    assert.match(folded(listing.detail), /cap am|duong am|phuc hoi|serum|hyaluronic|b5|do am/i);
    assert.equal(/\b(?:sua rua mat|tao bot|rua sach|dau thua|bui ban|lo chan long|lam sach sau|thanh loc)\b/i.test(folded(listing.detail)), false);
    assert.equal(/\b(?:Bo sung do am|tao cam giac|quy trinh|khach uu tien|de thoa|duoc cham soc|san pham|su dung)\b/i.test(listing.detail), false);
    assert.equal(validateVietnameseListing(listing).valid, true);
  }

  assert.equal(new Set(listings.map((listing) => listing.title)).size, 6);
  assert.equal(new Set(listings.map((listing) => detailSection(listing.detail, "Cong dung chinh", "Doi tuong phu hop"))).size, 6);
  assert.equal(new Set(listings.map((listing) => detailSection(listing.detail, "Cach dung", "Cach bao quan"))).size, 6);
  assert.equal(new Set(copies).size, 6);
});

test("makeListingDraft keeps English brand and product name as identity", () => {
  const listing = makeListingDraft({
    productName: "[Chinh hang] Estee Lauder Soft Clean Infusion Nuoc hoa hong duong am 400ml",
    skuGroup: ["YSLD80501"],
    notes: "duong am, lam diu da, chai hong, phu hop da kho",
    storeId: "8"
  });

  assert.match(plainTitle(listing.title), /Estee Lauder Soft Clean Infusion/i);
  assert.match(listing.detail, /^Estee Lauder Soft Clean Infusion/m);
  assert.equal(listing.title.includes("YSLD80501"), false);
  assert.equal(listing.detail.includes("YSLD80501"), false);
  assert.equal(validateVietnameseListing(listing).valid, true);
});

test("requireBuyerProductIdentity rejects SKU-only names before final buyer copy", () => {
  assert.throws(() => requireBuyerProductIdentity({
    productName: "YSLD80501 YSLD80502",
    skuGroup: ["YSLD80501", "YSLD80502"]
  }), /English brand and product name/);

  assert.doesNotThrow(() => requireBuyerProductIdentity({
    productName: "[Chinh hang] Estee Lauder Soft Clean Infusion Nuoc hoa hong duong am 400ml",
    skuGroup: ["YSLD80501", "YSLD80502"]
  }));
});

test("makeListingDraft can require English identity for final upload", () => {
  assert.throws(() => makeListingDraft({
    productName: "YSLD80501 YSLD80502",
    skuGroup: ["YSLD80501", "YSLD80502"],
    notes: "nuoc hoa hong duong am cho da kho, chai hong 400ml",
    storeId: "9",
    requireIdentity: true
  }), /English brand and product name/);

  const listing = makeListingDraft({
    productName: "Estee Lauder Soft Clean Infusion",
    skuGroup: ["YSLD80501", "YSLD80502"],
    notes: "nuoc hoa hong duong am cho da kho, chai hong 400ml",
    storeId: "9",
    requireIdentity: true
  });

  assert.equal(listing.title.includes("YSLD80501"), false);
  assert.equal(listing.detail.includes("YSLD80501"), false);
  assert.match(plainTitle(listing.title), /Estee Lauder Soft Clean Infusion/i);
  assert.match(folded(listing.detail), /duong am|cham soc/i);
  assert.equal(validateVietnameseListing(listing).valid, true);
});

test("makeListingDraft can fall back to an English buyer product name when source listing is missing", () => {
  const listing = makeListingDraft({
    productName: "YSLD80501 YSLD80502",
    skuGroup: ["YSLD80501", "YSLD80502"],
    notes: "pink bottle, hydrating and soothing lotion, dry skin",
    storeId: "9",
    requireIdentity: true,
    allowFallbackIdentity: true
  });

  assert.match(plainTitle(listing.title), /HydraSoft Soothing Lotion/i);
  assert.match(listing.detail, /^HydraSoft Soothing Lotion/m);
  assert.equal(/\b(?:Premium|Product|Estee|Lauder|YSL|Lancome|Kerastase)\b/i.test(listing.title), false);
  assert.equal(listing.title.includes("YSLD80501"), false);
  assert.equal(listing.detail.includes("YSLD80501"), false);
  assert.equal(validateVietnameseListing(listing).valid, true);
});

test("makeListingDraft produces five required buyer detail modules without SKU or platform text", () => {
  const listing = makeListingDraft({
    productName: "YSLD80501 YSLD80502",
    skuGroup: ["YSLD80501", "YSLD80502"],
    notes: "pink bottle, hydrating and soothing lotion, dry skin",
    storeId: "8",
    requireIdentity: true,
    allowFallbackIdentity: true
  });

  assert.match(listing.detail, /^HydraSoft Soothing Lotion/m);
  assert.match(listing.detail, /Công dụng/i);
  assert.match(listing.detail, /phù hợp/i);
  assert.match(listing.detail, /Cảm giác/i);
  assert.match(listing.detail, /Cách dùng/i);
  assert.match(listing.detail, /Bảo quản/i);
  assert.equal(/\b(?:SKU|Shopee|YSLD80501|YSLD80502)\b/i.test(listing.title + listing.detail), false);
  assert.equal(VIETNAMESE_DIACRITIC_RE.test(listing.title + listing.detail), true);
});

test("validateVietnameseListing rejects platform words, SKU codes, Chinese, missing diacritics, and vague titles", () => {
  const listing = {
    title: "Premium Beauty Product cho Shopee san pham chinh hang cao cap duong am tot nhat hang ngay",
    detail: "San pham nay co SKU YSLD80501 va noi dung 娑擃厽鏋?khong co dau tieng Viet."
  };

  assert.deepEqual(validateVietnameseListing(listing).errors, [
    "Title must be 90-99 characters.",
    "Title and detail must not contain Shopee.",
    "Title and detail must not contain authenticity claims.",
    "Title and detail must not contain SKU or full SKU codes.",
    "Title and detail must not contain Chinese or mojibake.",
    "Title and detail must use Vietnamese with diacritics.",
    "Title must not use vague generic beauty filler.",
    "Detail is too short for buyer-facing product effects."
  ]);
});

test("buildImage2Config can generate from text when no source images are available", () => {
  const config = buildImage2Config({
    taskDir: "C:/tmp/task",
    productName: "YSLD80501 YSLD80502",
    skuGroup: ["YSLD80501", "YSLD80502"],
    targetStores: ["7", "8"],
    sourceImages: [],
    notes: "pink bottle, hydrating and soothing lotion, dry skin",
    allowFallbackIdentity: true
  });

  assert.equal(config.jobs.length, 8);
  assert.ok(config.jobs.every((job) => job.endpoint === "generations"));
  assert.ok(config.jobs.every((job) => job.images.length === 0));
  assert.ok(config.jobs[0].prompt.includes("HydraSoft Soothing Lotion"));
});

test("buildImageResultSummary counts images by store and keeps first previews", () => {
  const summary = buildImageResultSummary({
    id: "task-001",
    productName: "Lancome Genifique Serum",
    skuGroup: ["SKU-A", "SKU-B"],
    productCodes: ["PC001"],
    targetStores: ["7", "9"],
    status: "image2_done",
    archived: false,
    createdAt: "2026-07-27T10:00:00.000Z",
    updatedAt: "2026-07-27T11:00:00.000Z"
  }, [
    { store: "7", storeLabel: "Store 7", file: "store_7/01.png", url: "/image/1" },
    { store: "7", storeLabel: "Store 7", file: "store_7/02.png", url: "/image/2" },
    { store: "9", storeLabel: "Store 9", file: "store_9/01.png", url: "/image/3" },
    { store: "9", storeLabel: "Store 9", file: "store_9/02.png", url: "/image/4" },
    { store: "9", storeLabel: "Store 9", file: "store_9/03.png", url: "/image/5" }
  ]);

  assert.equal(summary.id, "task-001");
  assert.equal(summary.identifierText, "PC001 -> SKU-A SKU-B");
  assert.equal(summary.imageCount, 5);
  assert.deepEqual(summary.storeImageCounts, [
    { store: "7", storeLabel: "Store 7", count: 2 },
    { store: "9", storeLabel: "Store 9", count: 3 }
  ]);
  assert.deepEqual(summary.previewImages.map((image) => image.file), [
    "store_7/01.png",
    "store_7/02.png",
    "store_9/01.png",
    "store_9/02.png"
  ]);
  assert.deepEqual(summary.storePreviewGroups.map((group) => ({
    store: group.store,
    storeLabel: group.storeLabel,
    count: group.count,
    files: group.previewImages.map((image) => image.file)
  })), [
    { store: "7", storeLabel: "Store 7", count: 2, files: ["store_7/01.png", "store_7/02.png"] },
    { store: "9", storeLabel: "Store 9", count: 3, files: ["store_9/01.png", "store_9/02.png", "store_9/03.png"] }
  ]);
  assert.equal(summary.downloadUrl, "/api/tasks/task-001/download");
});

test("normalizeImageReview keeps supported status and flags only", () => {
  assert.deepEqual(normalizeImageReview({
    status: "needs_regeneration",
    flags: ["layout_similar", "bad_flag", "color_similar", "layout_similar"],
    notes: "  too close to store 5  ",
    updatedAt: "2026-07-28T01:00:00.000Z"
  }), {
    status: "needs_regeneration",
    flags: ["layout_similar", "color_similar"],
    notes: "too close to store 5",
    updatedAt: "2026-07-28T01:00:00.000Z"
  });

  assert.equal(normalizeImageReview({ status: "unknown" }).status, "pending");
});

test("buildImageResultSummary includes normalized image review state", () => {
  const summary = buildImageResultSummary({
    id: "task-002",
    productName: "Lancome Genifique Serum",
    skuGroup: ["SKU-A"],
    targetStores: ["7"],
    imageReview: {
      status: "delivered",
      flags: ["layout_similar", "bad_flag"],
      notes: "sent to reviewer"
    }
  }, [
    { store: "7", storeLabel: "Store 7", file: "store_7/01.png", url: "/image/1" }
  ]);

  assert.deepEqual(summary.imageReview, {
    status: "delivered",
    flags: ["layout_similar"],
    notes: "sent to reviewer",
    updatedAt: ""
  });
});

test("buildImageArchiveManifest preserves store paths under timestamped archive", () => {
  const manifest = buildImageArchiveManifest({
    paths: {
      taskDir: "C:/tasks/task-001",
      imagesDir: "C:/tasks/task-001/images"
    }
  }, [
    { file: "store_4_skinora_care/01_product.png" },
    { file: "store_5_skinora_fresh/02_effect.png" }
  ], "20260728-101500");

  assert.equal(manifest.archiveId, "20260728-101500");
  assert.equal(manifest.count, 2);
  assert.equal(path.basename(manifest.archiveDir), "20260728-101500");
  assert.equal(path.basename(path.dirname(manifest.archiveDir)), "images-archive");
  assert.deepEqual(manifest.entries.map((entry) => entry.file), [
    "store_4_skinora_care/01_product.png",
    "store_5_skinora_fresh/02_effect.png"
  ]);
  assert.ok(manifest.entries[0].from.endsWith(path.join("images", "store_4_skinora_care", "01_product.png")));
  assert.ok(manifest.entries[0].to.endsWith(path.join("images-archive", "20260728-101500", "store_4_skinora_care", "01_product.png")));
  assert.throws(() => buildImageArchiveManifest({
    paths: {
      taskDir: "C:/tasks/task-001",
      imagesDir: "C:/tasks/task-001/images"
    }
  }, [
    { file: "../outside.png" }
  ], "20260728-101500"), /Unsafe image path/);
});

test("buildImage2CliArgs adds overwrite only when requested", () => {
  assert.deepEqual(buildImage2CliArgs({
    cliPath: "C:/tools/image2/src/cli.js",
    configPath: "C:/tmp/image2.jobs.json"
  }), [
    "C:/tools/image2/src/cli.js",
    "--config",
    "C:/tmp/image2.jobs.json"
  ]);

  assert.deepEqual(buildImage2CliArgs({
    cliPath: "C:/tools/image2/src/cli.js",
    configPath: "C:/tmp/image2.jobs.json",
    overwrite: true
  }), [
    "C:/tools/image2/src/cli.js",
    "--config",
    "C:/tmp/image2.jobs.json",
    "--overwrite"
  ]);
});

test("source review blocks fetched 1-store source images until confirmed", () => {
  const task = {
    sourceReviewRequired: true,
    sourceImages: ["C:/task/source-images/01_source.jpg"],
    sourceTitle: "Lancome Genifique Serum"
  };

  assert.deepEqual(sourceReviewState(task), {
    required: true,
    ready: false,
    status: "pending",
    imageCount: 1,
    title: "Lancome Genifique Serum",
    editUrl: "",
    matchRisk: {
      level: "high",
      matchedSkus: [],
      evidence: "missing_sku_evidence",
      message: "No requested SKU was found in source evidence. Confirm manually before using this source."
    }
  });
  assert.throws(() => assertSourceReviewReady(task), /Confirm the 1-store source product/);
});

test("source review allows confirmed source images and manual source images", () => {
  const confirmed = {
    sourceReviewRequired: true,
    sourceConfirmedAt: "2026-07-27T12:00:00.000Z",
    sourceImages: ["C:/task/source-images/01_source.jpg"],
    sourceTitle: "Lancome Genifique Serum"
  };
  const manual = {
    sourceImages: ["C:/manual/main.jpg"]
  };

  assert.equal(sourceReviewState(confirmed).ready, true);
  assert.equal(sourceReviewState(confirmed).status, "confirmed");
  assert.doesNotThrow(() => assertSourceReviewReady(confirmed));
  assert.deepEqual(sourceReviewState(manual), {
    required: false,
    ready: true,
    status: "not_required",
    imageCount: 1,
    title: "",
    editUrl: "",
    matchRisk: {
      level: "none",
      matchedSkus: [],
      evidence: "not_required",
      message: "Source SKU risk check is not required for this task."
    }
  });
  assert.doesNotThrow(() => assertSourceReviewReady(manual));
});

test("source SKU match risk is strong when visible source evidence contains a requested SKU", () => {
  const task = {
    skuGroup: ["YSLD80501", "YSLD80502"],
    sourceReviewRequired: true,
    sourceImages: ["C:/task/source-images/01_source.jpg"],
    sourceTitle: "Lancome Genifique Serum",
    sourceRowText: "1 store active item YSLD80502 Lancome Genifique"
  };

  assert.deepEqual(sourceSkuMatchRisk(task), {
    level: "strong",
    matchedSkus: ["YSLD80502"],
    evidence: "visible_source_text",
    message: "Requested SKU appears in 1-store source evidence."
  });
  assert.equal(sourceReviewState(task).matchRisk.level, "strong");
});

test("source can be auto-confirmed only for strong source evidence with extracted draft SKU", () => {
  const strong = {
    skuGroup: ["57414971469"],
    sourceDraftSkuGroup: ["YSLD80301", "YSLD80302"],
    sourceReviewRequired: true,
    sourceImages: ["C:/task/source-images/01_source.jpg"],
    sourceTitle: "Estee Lauder Micro Essence",
    sourceRowText: "Store 1 Item ID: 57414971469 SKU YSLD80301 YSLD80302"
  };
  const weak = {
    ...strong,
    sourceRowText: "Different source row",
    sourceMatchedSkuGroup: ["YSLD80301"]
  };
  const noDraftSku = {
    ...strong,
    sourceDraftSkuGroup: []
  };

  assert.equal(shouldAutoConfirmSource(strong), true);
  assert.equal(shouldAutoConfirmSource(weak), false);
  assert.equal(shouldAutoConfirmSource(noDraftSku), false);
  assert.equal(shouldAutoConfirmSource({ ...strong, sourceRejectedAt: "2026-07-29T01:00:00.000Z" }), false);
  assert.equal(shouldAutoConfirmSource({
    ...strong,
    sourceRowText: "4鎼?Item ID: 57414971469 SKU YSLD80301 YSLD80302"
  }), false);
});

test("source SKU match risk is normal when manifest skus match but visible text has no SKU", () => {
  const task = {
    skuGroup: ["YSLD80501"],
    sourceReviewRequired: true,
    sourceImages: ["C:/task/source-images/01_source.jpg"],
    sourceTitle: "Lancome Genifique Serum",
    sourceMatchedSkuGroup: ["YSLD80501"]
  };

  assert.deepEqual(sourceSkuMatchRisk(task), {
    level: "normal",
    matchedSkus: ["YSLD80501"],
    evidence: "manifest_sku_group",
    message: "BigSeller returned the requested SKU group, but visible source text does not show the SKU."
  });
});

test("source SKU match risk is high when no requested SKU evidence is present", () => {
  const task = {
    skuGroup: ["YSLD80501"],
    sourceReviewRequired: true,
    sourceImages: ["C:/task/source-images/01_source.jpg"],
    sourceTitle: "Different Product",
    sourceMatchedSkuGroup: ["OTHER001"]
  };

  assert.deepEqual(sourceSkuMatchRisk(task), {
    level: "high",
    matchedSkus: [],
    evidence: "missing_sku_evidence",
    message: "No requested SKU was found in source evidence. Confirm manually before using this source."
  });
});

test("preflight reports ready when source, listings, frames, and runtime are ready", () => {
  const listing = makeListingDraft({
    productName: "Lancome Genifique Serum",
    skuGroup: ["LC860101"],
    storeId: "7",
    requireIdentity: true
  });
  const report = buildPreflightReport({
    skuGroup: ["LC860101"],
    targetStores: ["7"],
    sourceReviewRequired: true,
    sourceConfirmedAt: "2026-07-27T12:00:00.000Z",
    sourceImages: ["C:/task/source-images/01_source.jpg"],
    sourceRowText: "LC860101 Lancome Genifique Serum",
    listings: { 7: listing }
  }, {
    runtime: { apiKeySet: true },
    storeFrameMissing: [],
    generatedImageCount: 0
  });

  assert.equal(report.status, "ready");
  assert.equal(report.blockers.length, 0);
  assert.equal(report.warnings.length, 0);
});

test("preflight reuses a complete image set when image runtime is offline", () => {
  const listing = makeListingDraft({
    productName: "Lancome Genifique Serum",
    skuGroup: ["LC860101"],
    storeId: "7",
    requireIdentity: true
  });
  const task = {
    skuGroup: ["LC860101"],
    targetStores: ["7"],
    sourceReviewRequired: true,
    sourceConfirmedAt: "2026-07-27T12:00:00.000Z",
    sourceImages: ["C:/task/source-images/01_source.jpg"],
    sourceRowText: "LC860101 Lancome Genifique Serum",
    listings: { 7: listing }
  };
  const report = buildPreflightReport(task, {
    runtime: {
      apiKeySet: true,
      baseUrl: "http://localhost:54273/v1",
      localProxyReachable: false
    },
    storeFrameMissing: [],
    generatedImageCount: 4
  });

  assert.equal(report.status, "ready");
  assert.equal(report.blockers.length, 0);
  assert.equal(report.warnings.length, 0);
  assert.deepEqual(pipelineStartBlockers(report, task), []);
  assert.ok(report.checks.some((item) => item.id === "image_runtime_skipped" && item.level === "ok"));
});

test("preflight still requires image runtime when the image set is incomplete", () => {
  const listing = makeListingDraft({
    productName: "Lancome Genifique Serum",
    skuGroup: ["LC860101"],
    storeId: "7",
    requireIdentity: true
  });
  const report = buildPreflightReport({
    skuGroup: ["LC860101"],
    targetStores: ["7"],
    sourceReviewRequired: true,
    sourceConfirmedAt: "2026-07-27T12:00:00.000Z",
    sourceImages: ["C:/task/source-images/01_source.jpg"],
    sourceRowText: "LC860101 Lancome Genifique Serum",
    listings: { 7: listing }
  }, {
    runtime: {
      apiKeySet: true,
      baseUrl: "http://localhost:54273/v1",
      localProxyReachable: false
    },
    storeFrameMissing: [],
    generatedImageCount: 3
  });

  assert.equal(report.status, "blocked");
  assert.ok(report.blockers.some((item) => item.id === "image_runtime"));
});

test("preflight requires confirmation before source is approved", () => {
  const listing = makeListingDraft({
    productName: "Lancome Genifique Serum",
    skuGroup: ["LC860101"],
    storeId: "7",
    requireIdentity: true
  });
  const report = buildPreflightReport({
    skuGroup: ["LC860101"],
    targetStores: ["7"],
    sourceReviewRequired: true,
    sourceImages: ["C:/task/source-images/01_source.jpg"],
    listings: { 7: listing }
  }, {
    runtime: { apiKeySet: true },
    storeFrameMissing: [],
    generatedImageCount: 0
  });

  assert.equal(report.status, "needs_confirmation");
  assert.equal(report.blockers[0].id, "source_review");
});

test("preflight does not duplicate confirmed source SKU risk", () => {
  const listing = makeListingDraft({
    productName: "Lancome Genifique Serum",
    skuGroup: ["LC860101"],
    storeId: "7",
    requireIdentity: true
  });
  const task = {
    skuGroup: ["LC860101"],
    targetStores: ["7"],
    sourceReviewRequired: true,
    sourceConfirmedAt: "2026-07-27T12:00:00.000Z",
    sourceImages: ["C:/task/source-images/01_source.jpg"],
    sourceMatchedSkuGroup: ["OTHER001"],
    listings: { 7: listing }
  };
  const report = buildPreflightReport(task, {
    runtime: { apiKeySet: true },
    storeFrameMissing: [],
    generatedImageCount: 0
  });

  assert.equal(sourceReviewState(task).matchRisk.level, "high");
  assert.equal(report.status, "ready");
  assert.equal(report.warnings.some((item) => item.id === "source_sku_high_risk"), false);
});

test("preflight reports high risk for missing frames and existing images", () => {
  const listing = makeListingDraft({
    productName: "Lancome Genifique Serum",
    skuGroup: ["LC860101"],
    storeId: "7",
    requireIdentity: true
  });
  const report = buildPreflightReport({
    skuGroup: ["LC860101"],
    targetStores: ["7", "9"],
    sourceReviewRequired: true,
    sourceConfirmedAt: "2026-07-27T12:00:00.000Z",
    sourceImages: ["C:/task/source-images/01_source.jpg"],
    sourceMatchedSkuGroup: ["OTHER001"],
    listings: { 7: listing, 9: listing }
  }, {
    runtime: { apiKeySet: true },
    storeFrameMissing: ["9"],
    generatedImageCount: 4
  });

  assert.equal(report.status, "high_risk");
  assert.deepEqual(report.warnings.map((item) => item.id), ["store_frames_missing", "existing_images"]);
});

test("preflight blocks invalid listings and missing image runtime", () => {
  const report = buildPreflightReport({
    skuGroup: ["LC860101"],
    targetStores: ["7"],
    sourceImages: ["C:/manual/main.jpg"],
    listings: {
      7: { title: "Shopee SKU LC860101", detail: "bad" }
    }
  }, {
    runtime: { apiKeySet: false },
    storeFrameMissing: [],
    generatedImageCount: 0
  });

  assert.equal(report.status, "blocked");
  assert.deepEqual(report.blockers.map((item) => item.id), ["image_runtime", "listing_invalid"]);
});

test("pipelineStartBlockers allows run-all to begin source lookup", () => {
  const listing = makeListingDraft({
    productName: "Lancome Genifique Serum",
    skuGroup: ["LC860101"],
    storeId: "7",
    requireIdentity: true
  });
  const report = buildPreflightReport({
    skuGroup: ["LC860101"],
    targetStores: ["7"],
    listings: { 7: listing }
  }, {
    runtime: { apiKeySet: true },
    storeFrameMissing: [],
    generatedImageCount: 0
  });

  assert.equal(report.status, "needs_confirmation");
  assert.deepEqual(report.blockers.map((item) => item.id), ["source_lookup_needed"]);
  assert.deepEqual(pipelineStartBlockers(report), []);
});

test("pipelineStartBlockers allows auto-confirmable source confirmation blocker", () => {
  const report = {
    blockers: [
      { id: "source_review", message: "confirm source" }
    ]
  };
  const task = {
    skuGroup: ["57414971469"],
    sourceDraftSkuGroup: ["YSLD80301"],
    sourceReviewRequired: true,
    sourceImages: ["C:/task/source-images/01_source.jpg"],
    sourceRowText: "Store 1 Item ID: 57414971469 SKU YSLD80301"
  };

  assert.deepEqual(pipelineStartBlockers(report, task), []);
});

test("pipelineStartBlockers keeps runtime and manual source confirmation blockers", () => {
  const report = {
    blockers: [
      { id: "source_lookup_needed", message: "lookup first" },
      { id: "image_runtime", message: "missing key" },
      { id: "source_review", message: "confirm source" }
    ]
  };

  assert.deepEqual(pipelineStartBlockers(report).map((item) => item.id), ["image_runtime", "source_review"]);
});

test("buildTaskProgress explains waiting source confirmation", () => {
  const progress = buildTaskProgress({
    status: "source_review_required",
    sourceReviewRequired: true,
    sourceImages: ["C:/task/source-images/01.jpg"]
  });

  assert.equal(progress.stage, "source_review");
  assert.equal(progress.level, "action");
  assert.match(progress.nextAction, /\u786e\u8ba4/);
});

test("buildTaskProgress maps active pipeline stages", () => {
  assert.equal(buildTaskProgress({ status: "pipeline_generating_images" }).stage, "image_generation");
  assert.equal(buildTaskProgress({ status: "pipeline_copying_source_to_bigseller_drafts" }).stage, "bigseller_copy");
  assert.equal(buildTaskProgress({ status: "copying_source_to_bigseller_drafts" }).stage, "bigseller_copy");
  assert.equal(buildTaskProgress({ status: "pipeline_discovering_bigseller_drafts" }).stage, "bigseller_discover");
  assert.equal(buildTaskProgress({ status: "pipeline_saving_bigseller_drafts" }).stage, "bigseller_save");
});

test("buildTaskProgress maps completed manual steps to the next visible step", () => {
  const copyDone = buildTaskProgress({ status: "bigseller_copy_done" });
  const imageDone = buildTaskProgress({ status: "image2_done" });
  const discoverDone = buildTaskProgress({ status: "bigseller_discover_done" });
  const saveDone = buildTaskProgress({ status: "bigseller_save_done" });

  assert.equal(copyDone.stage, "bigseller_discover");
  assert.equal(copyDone.level, "ready");
  assert.match(copyDone.message, /\u590d\u5236/);
  assert.equal(imageDone.stage, "bigseller_discover");
  assert.equal(discoverDone.stage, "bigseller_save");
  assert.equal(saveDone.stage, "done");
});

test("buildTaskProgress maps done and failure states", () => {
  const done = buildTaskProgress({ status: "pipeline_done" });
  const failed = buildTaskProgress({
    status: "pipeline_failed"
  }, {
    preflight: {
      blockers: [{ message: "Missing OPENAI_API_KEY." }]
    }
  });

  assert.equal(done.stage, "done");
  assert.equal(done.level, "done");
  assert.equal(failed.stage, "failed");
  assert.equal(failed.level, "error");
  assert.match(failed.message, /Missing OPENAI_API_KEY/);
});

test("pipelineStageCompleted supports one-click resume without rerunning generated images", () => {
  const task = {
    status: "bigseller_copy_done",
    targetStores: ["4", "5", "6", "7", "8", "9"],
    pipelineTiming: {
      stages: {
        bigseller_copy: { startedAt: "2026-07-29T01:00:00.000Z", finishedAt: "2026-07-29T01:01:00.000Z" },
        bigseller_discover: { startedAt: "2026-07-29T01:02:00.000Z", finishedAt: "2026-07-29T01:03:00.000Z" }
      }
    }
  };

  assert.equal(pipelineStageCompleted(task, "bigseller_copy"), true);
  assert.equal(pipelineStageCompleted(task, "image_generation", { imageCount: 24 }), true);
  assert.equal(pipelineStageCompleted(task, "image_generation", { imageCount: 1 }), false);
  assert.equal(pipelineStageCompleted(task, "bigseller_discover", { hasDiscoveredConfig: false }), false);
  assert.equal(pipelineStageCompleted(task, "bigseller_discover", { hasDiscoveredConfig: true }), true);
});

test("pipelineStageCompleted does not infer BigSeller copy from generated images alone", () => {
  const task = {
    status: "image2_done",
    targetStores: ["4", "5", "6", "7", "8", "9"]
  };

  assert.equal(pipelineStageCompleted(task, "bigseller_copy"), false);
  assert.equal(pipelineStageCompleted(task, "image_generation", { imageCount: 24 }), true);
});

test("pipelineStageCompleted skips copy when discovered draft links already exist", () => {
  const task = {
    status: "pipeline_failed",
    targetStores: ["4", "5", "6", "7", "8", "9"]
  };

  assert.equal(pipelineStageCompleted(task, "bigseller_copy", { hasDiscoveredConfig: true }), true);
  assert.equal(pipelineStageCompleted(task, "bigseller_copy", { hasDiscoveredConfig: false }), false);
});

test("recordPipelineTiming tracks stage start, finish, and total duration", () => {
  let timing = recordPipelineTiming(null, "pipeline_copying_source_to_bigseller_drafts", "2026-07-29T01:00:00.000Z");
  timing = recordPipelineTiming(timing, "pipeline_generating_images", "2026-07-29T01:03:00.000Z");
  timing = recordPipelineTiming(timing, "pipeline_done", "2026-07-29T01:10:00.000Z");

  assert.equal(timing.startedAt, "2026-07-29T01:00:00.000Z");
  assert.equal(timing.activeStage, "done");
  assert.equal(timing.finishedAt, "2026-07-29T01:10:00.000Z");
  assert.equal(timing.stages.bigseller_copy.finishedAt, "2026-07-29T01:03:00.000Z");
  assert.equal(timing.stages.done.startedAt, "2026-07-29T01:10:00.000Z");
});

test("task management search matches product, SKU, status, and target store", () => {
  const task = {
    productName: "Estee Lauder Soft Clean Infusion",
    skuGroup: ["YSLD80501", "YSLD80502"],
    productCodes: ["PC805"],
    status: "pipeline_done",
    targetStores: ["7", "9"],
    imageReview: {
      status: "approved",
      flags: ["layout_similar"]
    }
  };

  assert.equal(taskMatchesQuery(task, "soft clean"), true);
  assert.equal(taskMatchesQuery(task, "ysld80502"), true);
  assert.equal(taskMatchesQuery(task, "pc805"), true);
  assert.equal(taskMatchesQuery(task, "pipeline_done"), true);
  assert.equal(taskMatchesQuery(task, "store:9"), true);
  assert.equal(taskMatchesQuery(task, "approved"), true);
  assert.equal(taskMatchesQuery(task, "layout_similar"), true);
  assert.equal(taskMatchesQuery(task, "kerastase"), false);
  assert.equal(taskMatchesQuery(task, ""), true);
});

test("image result search matches review state, stores, and file names", () => {
  const result = buildImageResultSummary({
    id: "task-001",
    productName: "Estee Lauder Soft Clean Infusion",
    skuGroup: ["YSLD80501"],
    productCodes: ["PC805"],
    targetStores: ["4", "5"],
    status: "pipeline_done",
    imageReview: {
      status: "needs_regeneration",
      flags: ["layout_similar"]
    }
  }, [
    {
      file: "store_4_skinora_care/01_product.png",
      store: "4",
      storeLabel: "4鎼?Skinora Care"
    },
    {
      file: "store_5_skinora_fresh/02_effect.png",
      store: "5",
      storeLabel: "5鎼?Skinora Fresh"
    }
  ]);

  assert.equal(imageResultMatchesQuery(result, "pc805 store:4 needs_regeneration 01_product"), true);
  assert.equal(imageResultMatchesQuery(result, "ysld80501 layout_similar"), true);
  assert.equal(imageResultMatchesQuery(result, "store:9"), false);
  assert.equal(imageResultMatchesQuery(result, ""), true);
});

test("task image search matches store labels and file names", () => {
  const image = {
    file: "store_4_skinora_care/01_product.png",
    store: "4",
    storeLabel: "4鎼?Skinora Care"
  };

  assert.equal(taskImageMatchesQuery(image, "store:4 01_product"), true);
  assert.equal(taskImageMatchesQuery(image, "skinora"), true);
  assert.equal(taskImageMatchesQuery(image, "store:6"), false);
  assert.equal(taskImageMatchesQuery(image, ""), true);
});

test("task management archive filter hides archived tasks by default", () => {
  const activeTask = { productName: "Active", archived: false };
  const archivedTask = { productName: "Archived", archived: true };

  assert.equal(shouldShowTask(activeTask), true);
  assert.equal(shouldShowTask(archivedTask), false);
  assert.equal(shouldShowTask(archivedTask, { includeArchived: true }), true);
  assert.equal(shouldShowTask(activeTask, { query: "missing" }), false);
});
