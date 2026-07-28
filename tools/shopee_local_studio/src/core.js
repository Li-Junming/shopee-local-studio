import path from "node:path";

export const STORE_DEFINITIONS = [
  {
    id: "4",
    label: "Store 4 Skinora Care",
    folder: "store_4_skinora_care",
    style: "warm ivory and soft gold Skinora ecommerce poster, gentle hydration and daily-care layout"
  },
  {
    id: "5",
    label: "Store 5 Skinora Fresh",
    folder: "store_5_skinora_fresh",
    style: "fresh clean Skinora ecommerce poster, airy bright layout with clear usage-feel benefits"
  },
  {
    id: "6",
    label: "Store 6 Skinora Luxe",
    folder: "store_6_skinora_luxe",
    style: "premium gold and calm neutral Skinora ecommerce poster, refined repair-care beauty layout"
  },
  {
    id: "7",
    label: "Store 7 Skinora",
    folder: "store_7_skinora",
    style: "soft pink and gold Skinora ecommerce poster, elegant beauty layout"
  },
  {
    id: "8",
    label: "Store 8 Skinora Beauty",
    folder: "store_8_skinora_beauty",
    style: "clean white and deep blue Skinora Beauty ecommerce poster, premium clinical layout"
  },
  {
    id: "9",
    label: "Store 9 Elora Skin",
    folder: "store_9_elora_skin",
    style: "white and red Elora Skin ecommerce poster, bold conversion-focused layout"
  }
];

const BIGSELLER_STORE_MATCH_BY_ID = {
  4: "\u59d0\u592b 4\u5e97\uff08\u80e1\uff09",
  5: "\u59d0\u592b 5\u5e97\uff08\u80e1\uff09",
  6: "\u59d0\u592b 6\u5e97\uff08\u80e1\uff09",
  7: "\u59d0\u592b 7\u5e97\uff08\u80e1\uff09",
  8: "\u59d0\u592b8\u5e97\uff08\u80e1\uff09",
  9: "\u59d0\u592b9\u5e97\uff08\u80e1\uff09"
};

const STORE_DIFFERENTIATION_BY_ID = {
  4: {
    name: "gentle daily-care",
    palette: "warm ivory, soft gold, muted peach, low contrast",
    composition: "calm centered product, rounded care modules, soft bathroom or vanity cues",
    hook: "daily gentle care, hydration comfort, routine trust",
    avoid: "clinical blue layouts, red conversion blocks, dramatic luxury shadows"
  },
  5: {
    name: "fresh bright",
    palette: "clean white, fresh mint, light aqua, bright daylight",
    composition: "airy diagonal product flow, fresh splash or leaf cues, open whitespace",
    hook: "freshness, quick visible feeling, clean lightweight use",
    avoid: "heavy gold luxury, dense red callouts, soft pink beauty layouts"
  },
  6: {
    name: "premium luxe",
    palette: "champagne gold, calm taupe, pearl white, controlled shadow",
    composition: "premium hero close-up, layered depth, refined editorial spacing",
    hook: "high-end care, refined repair feeling, giftable premium impression",
    avoid: "casual buyer clutter, playful pastel freshness, aggressive promo layout"
  },
  7: {
    name: "pink beauty",
    palette: "soft pink, rose gold, creamy white, elegant glow",
    composition: "beauty-counter poster, feminine arcs, polished product highlight",
    hook: "elegant beauty routine, soft glow, approachable skincare",
    avoid: "clinical blue, strong red blocks, flat marketplace grid"
  },
  8: {
    name: "clean clinical",
    palette: "white, deep blue, silver gray, crisp contrast",
    composition: "organized clinical blocks, clear benefit icons, precise spacing",
    hook: "professional care, clean efficacy, easy-to-scan benefits",
    avoid: "pink-gold elegance, warm ivory daily-care softness, red conversion styling"
  },
  9: {
    name: "bold conversion",
    palette: "white, brand red, soft gray, high clarity",
    composition: "strong hero crop, bold benefit hierarchy, energetic ecommerce balance",
    hook: "fast buying confidence, visible key benefits, strong shelf impact",
    avoid: "low-contrast minimalism, clinical blue systems, luxury editorial restraint"
  }
};

export function buildBigSellerStoreMap(targetStores = STORE_DEFINITIONS.map((store) => store.id)) {
  return storesFor(targetStores).map((store) => ({
    match: BIGSELLER_STORE_MATCH_BY_ID[store.id] || `${store.id}\u5e97`,
    folder: store.folder
  }));
}

export function parseSkuGroup(input) {
  const values = Array.isArray(input)
    ? input
    : String(input || "").split(/[\s,;\uFF0C\uFF1B\u3001]+/u);
  const seen = new Set();
  const skus = [];
  for (const raw of values) {
    const sku = String(raw || "").trim().toUpperCase();
    if (sku && !seen.has(sku)) {
      seen.add(sku);
      skus.push(sku);
    }
  }
  return skus;
}

export function expandProductCodeSkuGroup(input, productCodeMap = {}) {
  const identifiers = parseSkuGroup(input);
  const normalizedMap = normalizeProductCodeMap(productCodeMap);
  const skuGroup = [];
  const productCodes = [];
  const mappings = [];
  const seen = new Set();

  for (const identifier of identifiers) {
    const mappedSkus = normalizedMap[identifier];
    if (mappedSkus?.length) {
      productCodes.push(identifier);
      mappings.push({ productCode: identifier, skus: mappedSkus });
      for (const sku of mappedSkus) addSku(sku);
    } else {
      addSku(identifier);
    }
  }

  return {
    skuGroup,
    productCodes,
    mappings,
    expanded: mappings.length > 0
  };

  function addSku(sku) {
    if (!seen.has(sku)) {
      seen.add(sku);
      skuGroup.push(sku);
    }
  }
}

export function listProductCodeMappings(productCodeMap = {}) {
  const normalized = normalizeProductCodeMap(productCodeMap);
  return Object.entries(normalized)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([productCode, skus]) => ({ productCode, skus }));
}

export function upsertProductCodeMapping(productCodeMap = {}, productCode, skuGroup) {
  const code = parseSkuGroup([productCode])[0];
  if (!code) throw new Error("Product code is required.");
  const skus = parseSkuGroup(skuGroup);
  if (!skus.length) throw new Error("At least one SKU is required.");
  const map = Object.fromEntries(listProductCodeMappings(productCodeMap).map((item) => [item.productCode, item.skus]));
  map[code] = skus;
  return { map, mapping: { productCode: code, skus } };
}

export function removeProductCodeMapping(productCodeMap = {}, productCode) {
  const code = parseSkuGroup([productCode])[0];
  if (!code) throw new Error("Product code is required.");
  const map = Object.fromEntries(listProductCodeMappings(productCodeMap).map((item) => [item.productCode, item.skus]));
  delete map[code];
  return { map, productCode: code };
}

function normalizeProductCodeMap(productCodeMap = {}) {
  const entries = Array.isArray(productCodeMap)
    ? productCodeMap.map((item) => [item?.code ?? item?.productCode, item?.skus ?? item?.skuGroup])
    : Object.entries(productCodeMap || {});
  const normalized = {};
  for (const [rawCode, rawSkus] of entries) {
    const code = parseSkuGroup([rawCode])[0];
    const skus = parseSkuGroup(typeof rawSkus === "object" && !Array.isArray(rawSkus)
      ? rawSkus?.skus ?? rawSkus?.skuGroup
      : rawSkus);
    if (code && skus.length) normalized[code] = skus;
  }
  return normalized;
}

export function storesFor(ids) {
  const normalized = Array.isArray(ids)
    ? ids.map(String)
    : String(ids || "").split(/[\s,;\uFF0C\uFF1B\u3001]+/u);
  const stores = [];
  for (const id of normalized) {
    if (!id) continue;
    const store = STORE_DEFINITIONS.find((item) => item.id === String(id));
    if (!store) throw new Error(`Unsupported store: ${id}`);
    stores.push(store);
  }
  return stores;
}

export function parseTaskText(input) {
  const fields = {
    productName: "",
    skuGroup: [],
    targetStores: [],
    sourceImages: "",
    notes: "",
    draftCopied: false
  };
  let activeField = "";
  const imageLines = [];
  const noteLines = [];

  for (const rawLine of String(input || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const colonCandidates = [line.indexOf(":"), line.indexOf("\uFF1A")].filter((index) => index >= 0);
    const colonIndex = colonCandidates.length ? Math.min(...colonCandidates) : -1;
    if (colonIndex > 0) {
      const key = fieldKey(line.slice(0, colonIndex));
      if (key) {
        activeField = key;
        applyField(key, line.slice(colonIndex + 1).trim());
        continue;
      }
    }
    if (activeField === "sourceImages") imageLines.push(cleanPathLine(line));
    if (activeField === "notes") noteLines.push(line);
  }

  if (imageLines.length) fields.sourceImages = imageLines.filter(Boolean).join("\n");
  if (noteLines.length) fields.notes = [fields.notes, ...noteLines].filter(Boolean).join("\n");
  if (fields.skuGroup.length === 0) fields.skuGroup = extractSkuTokens(input);
  return fields;

  function applyField(key, value) {
    if (key === "productName") fields.productName = value;
    if (key === "skuGroup") fields.skuGroup = parseSkuGroup(value);
    if (key === "targetStores") fields.targetStores = [];
    if (key === "sourceImages" && value) imageLines.push(cleanPathLine(value));
    if (key === "notes") fields.notes = value;
    if (key === "draftCopied") fields.draftCopied = /\u5df2\u590d\u5236|\u662f|yes|true|copied/i.test(value);
  }
}

export function normalizeSourceImages(imagePaths) {
  return String(imagePaths || "")
    .split(/\r?\n/)
    .map((line) => cleanPathLine(line))
    .filter(Boolean);
}

export function buildImage2Config(task) {
  const stores = storesFor(task.targetStores);
  const sourceImages = task.sourceImages || [];
  const storeFrames = task.storeFrames || {};
  const hasSourceImages = sourceImages.length > 0;
  if (!hasSourceImages && !task.allowFallbackIdentity) {
    throw new Error("At least one source image path is required.");
  }
  const safeTask = hasSourceImages ? task : {
    ...task,
    productName: buyerProductName(task.productName, task.skuGroup, {
      allowFallbackIdentity: true,
      notes: task.notes
    })
  };

  const jobs = [];
  for (const store of stores) {
    const siblingStores = stores.filter((item) => item.id !== store.id);
    jobs.push(makeJob(store, "01_product.png", productPosterPrompt(safeTask, store, siblingStores)));
    jobs.push(makeJob(store, "02_effect.png", effectPosterPrompt(safeTask, store, siblingStores)));
    jobs.push(makeJob(store, "03_real.png", realPhotoPrompt(safeTask, store, siblingStores, 1)));
    jobs.push(makeJob(store, "04_real.png", realPhotoPrompt(safeTask, store, siblingStores, 2)));
  }

  return {
    model: task.model || "gpt-image-2",
    size: task.size || "1024x1024",
    outputSize: 800,
    outputFormat: "png",
    quality: task.quality || "low",
    concurrency: Number(task.concurrency || 1),
    outputDir: path.join(task.taskDir, "images"),
    jobs
  };

  function makeJob(store, fileName, prompt) {
    const framePath = storeFramePath(storeFrames, store.id);
    const images = framePath ? [...sourceImages, framePath] : sourceImages;
    return {
      name: `${store.folder}_${fileName.replace(".png", "")}`,
      out: `${store.folder}/${fileName}`,
      endpoint: images.length > 0 ? "edits" : "generations",
      prompt: framePath ? addStoreFramePrompt(prompt) : prompt,
      images
    };
  }
}

export function buildImageResultSummary(task, images = []) {
  const counts = new Map();
  for (const image of images) {
    const key = String(image.store || "");
    const current = counts.get(key) || {
      store: key,
      storeLabel: image.storeLabel || key,
      count: 0
    };
    current.count += 1;
    counts.set(key, current);
  }
  const skuText = (Array.isArray(task?.skuGroup) ? task.skuGroup : []).join(" ");
  const productCodeText = (Array.isArray(task?.productCodes) ? task.productCodes : []).join(" ");
  return {
    id: task?.id || "",
    productName: task?.productName || "",
    identifierText: productCodeText ? `${productCodeText} -> ${skuText}` : skuText,
    skuGroup: Array.isArray(task?.skuGroup) ? task.skuGroup : [],
    productCodes: Array.isArray(task?.productCodes) ? task.productCodes : [],
    targetStores: Array.isArray(task?.targetStores) ? task.targetStores : [],
    status: task?.status || "",
    archived: Boolean(task?.archived),
    createdAt: task?.createdAt || "",
    updatedAt: task?.updatedAt || "",
    imageCount: images.length,
    storeImageCounts: [...counts.values()].sort((left, right) => left.store.localeCompare(right.store)),
    previewImages: images.slice(0, 4),
    imageReview: normalizeImageReview(task?.imageReview || {}),
    downloadUrl: task?.id ? `/api/tasks/${task.id}/download` : ""
  };
}

const IMAGE_REVIEW_STATUSES = new Set(["pending", "approved", "needs_regeneration", "delivered"]);
const IMAGE_REVIEW_FLAGS = new Set(["layout_similar", "color_similar", "quality_issue", "wrong_product"]);

export function normalizeImageReview(input = {}) {
  const status = IMAGE_REVIEW_STATUSES.has(input?.status) ? input.status : "pending";
  const seen = new Set();
  const flags = [];
  for (const rawFlag of Array.isArray(input?.flags) ? input.flags : []) {
    const flag = String(rawFlag || "").trim();
    if (IMAGE_REVIEW_FLAGS.has(flag) && !seen.has(flag)) {
      seen.add(flag);
      flags.push(flag);
    }
  }
  return {
    status,
    flags,
    notes: String(input?.notes || "").trim(),
    updatedAt: input?.updatedAt || ""
  };
}

function storeFramePath(storeFrames, storeId) {
  const value = storeFrames?.[storeId];
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.path || "";
}

function addStoreFramePrompt(prompt) {
  return [
    prompt,
    "Use the target store watermark/frame reference as this store's visual identity, border treatment, and layout cue while keeping the product packaging accurate."
  ].join(" ");
}

export function buildImage2CliArgs({ cliPath, configPath, overwrite = false }) {
  const args = [cliPath, "--config", configPath];
  if (overwrite) args.push("--overwrite");
  return args;
}

export function taskMatchesQuery(task, query = "") {
  const rawQuery = String(query || "").trim().toLowerCase();
  if (!rawQuery) return true;
  const terms = rawQuery.split(/\s+/).filter(Boolean);
  const searchable = [
    task?.id,
    task?.productName,
    task?.status,
    ...(Array.isArray(task?.skuGroup) ? task.skuGroup : []),
    ...(Array.isArray(task?.productCodes) ? task.productCodes : []),
    ...(Array.isArray(task?.productCodeMappings) ? task.productCodeMappings.flatMap((item) => [item.productCode, ...(item.skus || [])]) : []),
    ...(Array.isArray(task?.targetStores) ? task.targetStores.map((storeId) => `store:${storeId}`) : [])
  ].filter(Boolean).join(" ").toLowerCase();
  return terms.every((term) => searchable.includes(term));
}

export function shouldShowTask(task, options = {}) {
  if (!options.includeArchived && task?.archived) return false;
  return taskMatchesQuery(task, options.query);
}

export function sourceReviewState(task) {
  const imageCount = Array.isArray(task?.sourceImages) ? task.sourceImages.length : 0;
  const required = Boolean(task?.sourceReviewRequired);
  const confirmed = Boolean(task?.sourceConfirmedAt);
  const rejected = Boolean(task?.sourceRejectedAt);
  const status = required
    ? (confirmed ? "confirmed" : (rejected ? "rejected" : "pending"))
    : "not_required";
  return {
    required,
    ready: !required || confirmed,
    status,
    imageCount,
    title: task?.sourceTitle || "",
    editUrl: task?.sourceEditUrl || "",
    matchRisk: sourceSkuMatchRisk(task)
  };
}

export function assertSourceReviewReady(task) {
  const state = sourceReviewState(task);
  if (!state.ready) {
    throw new Error("Confirm the 1-store source product before generating images.");
  }
}

export function buildPreflightReport(task, context = {}) {
  const checks = [];
  const blockers = [];
  const warnings = [];
  const runtime = context.runtime || {};
  const sourceState = sourceReviewState(task);

  if (sourceState.required && !sourceState.ready) {
    add("source_review", "blocker", "1-store source needs confirmation", "Confirm the 1-store source product before generating images.");
  } else if (!sourceState.required && !sourceState.imageCount && !task?.sourceFallback) {
    add("source_lookup_needed", "blocker", "1-store source not checked", "Run 1-store source lookup or upload source images before generating.");
  } else {
    add("source_review", "ok", "Source is ready", "Source image requirement is satisfied.");
  }

  if (!runtime.apiKeySet || runtime.invalidBaseUrl || runtime.localProxyReachable === false) {
    const message = runtime.invalidBaseUrl
      ? `Invalid OPENAI_BASE_URL: ${runtime.baseUrl}`
      : (runtime.localProxyReachable === false
        ? `Cannot connect to image proxy at ${runtime.baseUrl}`
        : "Missing OPENAI_API_KEY.");
    add("image_runtime", "blocker", "Image runtime is not ready", message);
  } else {
    add("image_runtime", "ok", "Image runtime is ready", "Image generation environment is available.");
  }

  const listingErrors = listingValidationErrors(task);
  if (listingErrors.length) {
    add("listing_invalid", "blocker", "Vietnamese listing copy is invalid", listingErrors.join(" "));
  } else {
    add("listing_valid", "ok", "Vietnamese listing copy is valid", "All target store title/detail text passed validation.");
  }

  if (sourceState.matchRisk.level === "high") {
    add("source_sku_high_risk", "warning", "Source SKU match is high risk", sourceState.matchRisk.message);
  } else if (sourceState.matchRisk.level === "normal") {
    add("source_sku_normal_risk", "info", "Source SKU match is normal", sourceState.matchRisk.message);
  }

  const missingFrames = context.storeFrameMissing || task?.storeFrameMissing || [];
  if (missingFrames.length) {
    add("store_frames_missing", "warning", "Some store frames are missing", `Missing frame references for store ${missingFrames.join(", ")}.`);
  } else {
    add("store_frames_ready", "ok", "Store frames are ready", "All target stores have matched frame references.");
  }

  const generatedImageCount = Number(context.generatedImageCount || 0);
  if (generatedImageCount > 0) {
    add("existing_images", "warning", "Generated images already exist", `${generatedImageCount} generated image(s) already exist. Use regenerate if you want to overwrite.`);
  }

  let status = "ready";
  if (blockers.some((item) => item.id === "image_runtime" || item.id === "listing_invalid")) status = "blocked";
  else if (blockers.length) status = "needs_confirmation";
  else if (warnings.length) status = "high_risk";

  return { status, blockers, warnings, checks };

  function add(id, level, label, message) {
    const item = { id, level, label, message };
    checks.push(item);
    if (level === "blocker") blockers.push(item);
    if (level === "warning") warnings.push(item);
  }
}

function listingValidationErrors(task) {
  const errors = [];
  for (const storeId of Array.isArray(task?.targetStores) ? task.targetStores : []) {
    const listing = task?.listings?.[storeId];
    if (!listing) {
      errors.push(`Store ${storeId}: missing listing text.`);
      continue;
    }
    const result = validateVietnameseListing(listing);
    if (!result.valid) errors.push(`Store ${storeId}: ${result.errors.join(" ")}`);
  }
  return errors;
}

export function sourceSkuMatchRisk(task) {
  if (!task?.sourceReviewRequired) {
    return {
      level: "none",
      matchedSkus: [],
      evidence: "not_required",
      message: "Source SKU risk check is not required for this task."
    };
  }
  const requestedSkus = parseSkuGroup(task?.skuGroup);
  const visibleText = [
    task?.sourceRowText,
    task?.sourceTitle,
    task?.sourceDetail
  ].filter(Boolean).join(" ");
  const visibleMatches = skusInText(requestedSkus, visibleText);
  if (visibleMatches.length) {
    return {
      level: "strong",
      matchedSkus: visibleMatches,
      evidence: "visible_source_text",
      message: "Requested SKU appears in 1-store source evidence."
    };
  }

  const manifestMatches = intersectSkus(requestedSkus, parseSkuGroup(task?.sourceMatchedSkuGroup || []));
  if (manifestMatches.length) {
    return {
      level: "normal",
      matchedSkus: manifestMatches,
      evidence: "manifest_sku_group",
      message: "BigSeller returned the requested SKU group, but visible source text does not show the SKU."
    };
  }

  return {
    level: "high",
    matchedSkus: [],
    evidence: "missing_sku_evidence",
    message: "No requested SKU was found in source evidence. Confirm manually before using this source."
  };
}

function skusInText(skus, text) {
  const normalizedText = String(text || "").toUpperCase();
  return skus.filter((sku) => normalizedText.includes(sku));
}

function intersectSkus(left, right) {
  const wanted = new Set(left);
  return right.filter((sku) => wanted.has(sku));
}

export function buildBigSellerSkuConfig({ productName, skuGroup, assetRoot, targetStores }) {
  return {
    storeMap: buildBigSellerStoreMap(targetStores),
    discoverJobs: [
      {
        name: productName,
        skus: parseSkuGroup(skuGroup),
        assetRoot: path.resolve(assetRoot)
      }
    ]
  };
}

export function buildBigSellerSourceConfig({ productName, skuGroup, sourceImageDir, sourceStoreMatch = "1\u5e97", targetStores }) {
  return {
    storeMap: buildBigSellerStoreMap(targetStores),
    sourceJobs: [
      {
        name: productName,
        skus: parseSkuGroup(skuGroup),
        outDir: path.resolve(sourceImageDir),
        sourceStoreMatch
      }
    ]
  };
}

export function sourceImagesMissingMessage(task) {
  const skuText = parseSkuGroup(task?.skuGroup).join(", ") || "(empty)";
  return `Could not load source images for SKU group [${skuText}]. BigSeller did not create source-images.json. Make sure the 1-store active listing contains one of these SKUs, or paste/upload source images and retry.`;
}

export function describeImage2Runtime(env = process.env) {
  const baseUrl = env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const runtime = {
    apiKeySet: Boolean(env.OPENAI_API_KEY),
    baseUrl,
    localProxy: null
  };

  try {
    const parsed = new URL(baseUrl);
    if (["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
      runtime.localProxy = {
        host: parsed.hostname,
        port: Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80))
      };
    }
  } catch {
    runtime.invalidBaseUrl = true;
  }

  return runtime;
}

const FALLBACK_PRODUCT_NAME = "DailyCare Beauty Essential";
const VIETNAMESE_DIACRITIC_RE = /[\u00C0-\u1EF9]/;
const CHINESE_RE = /[\u3400-\u9FFF]/;
const MOJIBAKE_RE = /\?{2,}|\uFFFD/;
const BUYER_COPY_STANDARD = Object.freeze({
  titleMin: 80,
  titleMax: 100,
  detailSections: [
    vietnameseText("C\\u00f4ng d\\u1ee5ng ch\\u00ednh"),
    vietnameseText("\\u0110\\u1ed1i t\\u01b0\\u1ee3ng ph\\u00f9 h\\u1ee3p"),
    vietnameseText("C\\u1ea3m gi\\u00e1c khi d\\u00f9ng"),
    vietnameseText("C\\u00e1ch d\\u00f9ng"),
    vietnameseText("C\\u00e1ch b\\u1ea3o qu\\u1ea3n")
  ]
});

export function makeListingDraft({ productName, notes = "", storeId = "7", skuGroup = [], requireIdentity = false, allowFallbackIdentity = false }) {
  const cleanName = requireIdentity
    ? requireBuyerProductIdentity({ productName, skuGroup, notes, allowFallbackIdentity })
    : buyerProductName(productName, skuGroup, { notes, allowFallbackIdentity });
  const profile = productProfile(cleanName, notes);
  const copyPlan = buildListingCopyPlan({ cleanName, profile, storeId });
  return {
    title: renderListingTitle(copyPlan),
    detail: renderListingDetail(copyPlan)
  };
}

function buildDetailForStore({ cleanName, profile, benefitLines, storeId }) {
  return renderListingDetail(buildListingCopyPlan({ cleanName, profile, storeId, benefitLines }));
}

function buildListingCopyPlan({ cleanName, profile, storeId, benefitLines }) {
  const normalizedStoreId = String(storeId || "7");
  const rules = buildBuyerCopyRules({ profile, storeId: normalizedStoreId, benefitLines });
  return {
    cleanName,
    profile,
    storeId: normalizedStoreId,
    titleIdentity: compactTitleIdentity(cleanName),
    titlePhraseSets: rules.titlePhraseSets,
    sections: rules.sections
  };
}

function buildBuyerCopyRules({ profile, storeId, benefitLines }) {
  // This is the single assembly point for buyer-facing listing copy.
  // Keep title/detail structure changes here so the pipeline does not grow scattered rules.
  const [benefitsHeading, audienceHeading, sensationHeading, usageHeading, storageHeading] = BUYER_COPY_STANDARD.detailSections;
  const sectionLines = {
    [benefitsHeading]: benefitLines || benefitsForStore(profile, storeId),
    [audienceHeading]: audienceForStore(profile, storeId),
    [sensationHeading]: sensationForStore(profile, storeId),
    [usageHeading]: usageForStore(profile, storeId),
    [storageHeading]: storageForStore(storeId)
  };
  return {
    titlePhraseSets: titlePhraseSetsForStore(storeId, profile),
    sections: BUYER_COPY_STANDARD.detailSections.map((heading) => ({
      heading,
      lines: sectionLines[heading]
    }))
  };
}

function renderListingDetail(plan) {
  return accentVietnameseCopy([
    plan.cleanName,
    "",
    ...plan.sections.flatMap((section) => [
      section.heading,
      ...section.lines,
      ""
    ])
  ].filter(Boolean).join("\n").trim());
}

function audienceForStore(profile, storeId) {
  if (profile.type === "cleanser") {
    const cleanserAudience = {
      4: [
        "- Phu hop da can lam sach diu nhe moi ngay, uu tien cam giac mem mai sau khi rua.",
        "- Phu hop nguoi muon buoc rua mat don gian, de ket hop voi routine duong am."
      ],
      5: [
        "- Phu hop da de bi dinh bui ban, dau thua hoac can cam giac sach thoang nhanh.",
        "- Phu hop nguoi hay ra ngoai, can san pham lam sach gon nhe sau mot ngay dai."
      ],
      6: [
        "- Phu hop nguoi thich sua rua mat co cam giac cao cap, sach nhung van em da.",
        "- Phu hop da can duoc cham soc ky hon trong routine toi gian va thanh lich."
      ],
      7: [
        "- Phu hop da can lam sach sau bui ban, kem chong nang hoac moi truong nong am.",
        "- Phu hop nguoi muon buoc rua mat gon nhe, giup da sach va san sang duong tiep."
      ],
      8: [
        "- Phu hop da dau, da hon hop va nguoi de bi bong dau vung T.",
        "- Phu hop nguoi can lam sach bui ban, dau thua sau khi di nang hoac trang diem nhe."
      ],
      9: [
        "- Phu hop nguoi can sua rua mat diu nhe de dung moi ngay.",
        "- Phu hop da can lam sach nhung van muon giu cam giac mem am sau khi rua."
      ]
    };
    return cleanserAudience[storeId] || cleanserAudience[7];
  }

  const audience = {
    4: [
      "- Phu hop nguoi can san pham cham soc nhe nha, de dung deu trong routine moi ngay.",
      "- Phu hop khach uu tien cam giac mem, am va khong muon thao tac qua phuc tap."
    ],
    5: [
      "- Phu hop nguoi can cam giac sach gon, de lam moi dien mao nhanh trong ngay.",
      "- Phu hop khach thich san pham de mang theo, de dung va de sap xep trong routine."
    ],
    6: [
      "- Phu hop nguoi uu tien trai nghiem cao cap, hinh anh dep va cam giac cham soc ky.",
      "- Phu hop khach can san pham lam dep co tinh ung dung nhung van tao an tuong sang."
    ],
    7: [
      "- Phu hop nguoi can san pham de dung, de them vao routine lam dep moi ngay.",
      "- Phu hop khach uu tien cam giac gon nhe, khong can thao tac cau ky."
    ],
    8: [
      "- Phu hop nguoi muon tap trung vao cong dung ro rang va cam giac su dung sach gon.",
      "- Phu hop khach can san pham de mang theo, de dung khi di lam hoac ra ngoai."
    ],
    9: [
      "- Phu hop nguoi thich cham soc nhe nha, de duy tri deu dan hang ngay.",
      "- Phu hop khach can san pham tien loi, de ket hop voi cac buoc lam dep khac."
    ]
  };
  return audience[storeId] || profile.audience;
}

function sensationForStore(profile, storeId) {
  if (profile.type === "cleanser") {
    if (storeId === "4") {
      return [
        "- Lop bot mem min, tiep xuc tren da nhe nha va de massage deu.",
        "- Sau khi rua, da co cam giac sach em, am nhe va khong bi kho cang."
      ];
    }
    if (storeId === "5") {
      return [
        "- Tao bot nhanh, de cuon bui ban va dau thua tren be mat da.",
        "- Sau khi rua, da co cam giac thong thoang, bot dinh nho va tuoi mat hon."
      ];
    }
    if (storeId === "6") {
      return [
        "- Ket cau bot min, thao tac em tren da va mang lai cam giac cham soc chi chu.",
        "- Sau khi rua, be mat da sach, mem va san sang cho cac buoc duong tiep theo."
      ];
    }
    if (storeId === "8") {
      return [
        "- Tao bot min, de massage tren toan mat va tap trung vung de tiet dau.",
        "- Sau khi rua, da co cam giac sach thoang, bot dinh nho va van de chiu."
      ];
    }
    if (storeId === "9") {
      return [
        "- Ket cau tao bot em ai, tiep xuc tren da khong gay cam giac co xat manh.",
        "- Sau khi rua, da van giu do mem tu nhien, khong bi cang kho kho chiu."
      ];
    }
    return [
      "- Tao bot min em ai, massage tren da nhe nha va de rua sach.",
      "- Sau khi rua, da co cam giac sach, mem min va thong thoang hon."
    ];
  }
  return storeDetailFor(storeId);
}

function usageForStore(profile, storeId) {
  if (profile.type === "cleanser") {
    const cleanserUsage = {
      4: [
        "- Lam uot mat, lay luong san pham vua du va tao bot min voi nuoc.",
        "- Massage nhe theo chieu vong tron, khong cha xat manh len vung da mong.",
        "- Rua sach bang nuoc, lau kho nhe va tiep tuc buoc duong am neu can.",
        "- Co the dung deu sang va toi tuy nhu cau lam sach hang ngay."
      ],
      5: [
        "- Lam uot mat bang nuoc am, tao bot ky truoc khi dua len da.",
        "- Massage ky hon o vung mui, tran va cam noi de co dau thua.",
        "- Rua sach hoan toan, dam kho nhe bang khan mem.",
        "- Dung sau khi ra ngoai hoac khi da co cam giac bong dau, bi dinh bui."
      ],
      6: [
        "- Tao bot min trong long ban tay, sau do thoa deu len mat da uot.",
        "- Massage cham va nhe, tap trung vao cam giac lam sach em ai.",
        "- Rua sach bang nuoc mat, tranh de bot con lai tren da.",
        "- Ket hop voi toner hoac tinh chat phu hop de hoan thien routine cham soc."
      ],
      7: [
        "- Lam uot mat, tao bot voi mot luong san pham vua du.",
        "- Massage nhe theo vong tron, chu y hai ben mui va cam.",
        "- Rua sach bang nuoc, sau do dung toner hoac buoc duong phu hop.",
        "- Dung sang va toi tuy tinh trang da trong ngay."
      ],
      8: [
        "- Lam uot mat bang nuoc am de bui ban va dau thua de duoc lam sach.",
        "- Tao bot ky trong long ban tay, massage ky hon o vung T.",
        "- Rua sach hoan toan, lau kho nhe nha bang khan mem.",
        "- Nen dung sau khi ra ngoai hoac khi da co cam giac bong dau."
      ],
      9: [
        "- Lay luong vua du, tao bot min roi thoa deu len mat da uot.",
        "- Massage nhe nha trong thoi gian ngan, tranh cha xat qua manh.",
        "- Rua sach voi nuoc mat, tiep tuc buoc cap am neu can.",
        "- Co the dung deu moi ngay de giu da sach va de chiu."
      ]
    };
    return cleanserUsage[storeId] || cleanserUsage[7];
  }

  const usage = {
    4: [
      "- Su dung voi luong vua du tren vung can cham soc.",
      "- Thao tac nhe tay, uu tien cam giac de chiu va on dinh khi dung deu.",
      "- Ket hop vao routine sang hoac toi theo nhu cau ca nhan."
    ],
    5: [
      "- Dung khi can lam moi nhanh hoac hoan thien buoc lam dep trong ngay.",
      "- Dieu chinh luong dung theo tinh trang da, moi hoac toc de tranh qua day.",
      "- Bao quan gon gon de tien su dung lai khi can."
    ],
    6: [
      "- Bat dau voi luong nho, thao tac cham de cam nhan ket cau san pham.",
      "- Dung deu trong routine ca nhan de duy tri trai nghiem cham soc on dinh.",
      "- Ket hop voi cac san pham cung loai neu muon hieu ung hoan thien hon."
    ],
    7: [
      "- Su dung tren vung can cham soc theo nhu cau ca nhan.",
      "- Bat dau voi luong vua du, tang them neu can de tranh lang phi.",
      "- Ket hop cung cac buoc lam dep quen thuoc de co trai nghiem on dinh."
    ],
    8: [
      "- Dung sau khi da duoc lam sach hoac khi can lam moi dien mao.",
      "- Thoa hoac su dung tung lop mong de de kiem soat cam giac tren da.",
      "- Mang theo khi ra ngoai neu can dieu chinh nhanh trong ngay."
    ],
    9: [
      "- Dung deu theo routine ca nhan, uu tien thao tac nhe tay.",
      "- Dieu chinh luong dung theo tinh trang da, moi hoac toc tung ngay.",
      "- Sau khi dung, co the tiep tuc cac buoc cham soc phu hop khac."
    ]
  };
  return usage[storeId] || profile.usage;
}

export function requireBuyerProductIdentity({ productName, skuGroup = [], notes = "", allowFallbackIdentity = false }) {
  const cleanName = buyerProductName(productName, skuGroup, { notes, allowFallbackIdentity });
  if (!cleanName || cleanName === FALLBACK_PRODUCT_NAME || isSkuLikeName(cleanName)) {
    const skuText = parseSkuGroup(skuGroup).join(", ") || "(empty)";
    throw new Error(`English brand and product name are required before generating buyer copy for SKU group [${skuText}]. Fetch the 1-store source listing first, or enter the English brand + product name manually.`);
  }
  return cleanName;
}

function validateVietnameseListingLegacy({ title, detail }) {
  const errors = [];
  const titleText = String(title || "").trim();
  const detailText = String(detail || "").trim();
  if (titleText.length < 80 || titleText.length > 100) {
    errors.push("Title must be 80-100 characters.");
  }
  if (/\?{2,}|\uFFFD/.test(titleText + detailText)) {
    errors.push("Title and detail must use unaccented ASCII Vietnamese.");
  }
  if (/\bSKU\b/i.test(detailText)) {
    errors.push("Detail must not contain SKU.");
  }
  if (detailText.length < 80) {
    errors.push("Detail is too short for buyer-facing product effects.");
  }
  return { valid: errors.length === 0, errors };
}

export function validateVietnameseListing({ title, detail }) {
  const errors = [];
  const titleText = String(title || "").trim();
  const detailText = String(detail || "").trim();
  const combinedText = `${titleText}\n${detailText}`;
  const foldedTitle = asciiOnly(titleText);
  const foldedText = asciiOnly(combinedText);

  if (titleText.length < BUYER_COPY_STANDARD.titleMin || titleText.length > BUYER_COPY_STANDARD.titleMax) {
    errors.push("Title must be 80-100 characters.");
  }
  if (/\bShopee\b/i.test(combinedText)) {
    errors.push("Title and detail must not contain Shopee.");
  }
  if (/\b(?:chinh hang|hang chinh hang|ban hang chinh hang|cam ket|authentic|official|100%)\b/i.test(foldedText)) {
    errors.push("Title and detail must not contain authenticity claims.");
  }
  if (/\bSKU\b/i.test(combinedText) || /\b[A-Z]{1,12}\d[A-Z0-9-]{2,20}\b/i.test(combinedText)) {
    errors.push("Title and detail must not contain SKU or full SKU codes.");
  }
  if (CHINESE_RE.test(combinedText) || MOJIBAKE_RE.test(combinedText)) {
    errors.push("Title and detail must not contain Chinese or mojibake.");
  }
  if (!VIETNAMESE_DIACRITIC_RE.test(combinedText)) {
    errors.push("Title and detail must use Vietnamese with diacritics.");
  }
  if (/\b(?:premium beauty product|premium skin care product|premium makeup product|premium hair care product|premium fragrance product|san pham cao cap|san pham lam dep cao cap)\b/i.test(foldedTitle)) {
    errors.push("Title must not use vague generic beauty filler.");
  }
  if (detailText.length < 260) {
    errors.push("Detail is too short for buyer-facing product effects.");
  }
  return { valid: errors.length === 0, errors };
}

function fieldKey(label) {
  const raw = String(label || "");
  if (/sku/i.test(raw)) return "skuGroup";
  if (/[\u56FE\u5716]|image/i.test(raw)) return "sourceImages";
  if (/(?:\u76EE[\u6807\u6A19].*\u5E97|\u5E97[\u94FA\u92EA]|stores?|targetstores?)/i.test(raw)) return "targetStores";
  if (/(?:\u8349\u7A3F|draft)/i.test(raw)) return "draftCopied";
  if (/(?:\u5907\u6CE8|\u5099\u8A3B|\u8981\u6C42|notes?)/i.test(raw)) return "notes";
  const normalize = (value) => String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s:_\-\uFF1A]+/gu, "");
  const text = normalize(label);
  const aliases = {
    productName: ["\u5546\u54C1\u540D\u79F0", "\u4EA7\u54C1\u540D\u79F0", "\u5546\u54C1\u540D", "\u4EA7\u54C1\u540D", "\u540D\u79F0", "product", "productname", "name"],
    skuGroup: [
      "sku",
      "sku\u7EC4",
      "sku\u7D44",
      "skugroup",
      "\u5546\u54C1\u7F16\u7801",
      "\u5546\u54C1\u7DE8\u78BC",
      "\u5546\u54C1\u7F16\u53F7",
      "\u5546\u54C1\u7DE8\u865F",
      "\u4EA7\u54C1\u7F16\u7801",
      "\u7522\u54C1\u7DE8\u78BC",
      "\u4EA7\u54C1\u7F16\u53F7",
      "\u7522\u54C1\u7DE8\u865F",
      "productcode",
      "productid",
      "itemcode",
      "itemid"
    ],
    targetStores: ["\u76EE\u6807\u5E97\u94FA", "\u76EE\u6A19\u5E97\u92EA", "\u5E97\u94FA", "\u5E97\u92EA", "\u76EE\u6807\u5E97", "\u76EE\u6A19\u5E97", "\u5E97", "stores", "targetstores"],
    sourceImages: ["\u56FE\u7247", "\u5716\u7247", "\u5546\u54C1\u56FE", "\u5546\u54C1\u5716", "\u5546\u54C1\u56FE\u7247", "\u5546\u54C1\u5716\u7247", "\u56FE\u7247\u8DEF\u5F84", "\u5716\u7247\u8DEF\u5F91", "\u56FE\u7247\u6765\u6E90", "\u5716\u7247\u4F86\u6E90", "sourceimages", "images"],
    notes: ["\u5907\u6CE8", "\u5099\u8A3B", "\u8981\u6C42", "\u4EA7\u54C1\u8981\u70B9", "\u5546\u54C1\u8981\u70B9", "notes"],
    draftCopied: ["\u8349\u7A3F\u7BB1", "\u8349\u7A3F", "draft"]
  };
  for (const [key, values] of Object.entries(aliases)) {
    if (values.some((value) => normalize(value) === text)) return key;
  }
  return "";
}

function parseStoreIds(value) {
  const seen = new Set();
  const stores = [];
  for (const match of String(value || "").matchAll(/\d+/g)) {
    const id = match[0];
    if (!seen.has(id)) {
      seen.add(id);
      stores.push(id);
    }
  }
  return stores;
}

function extractSkuTokens(value) {
  const seen = new Set();
  const skus = [];
  const pattern = /(?:^|[^A-Z0-9])([A-Z]{1,12}\d[A-Z0-9-]{1,20})(?=$|[^A-Z0-9])/gi;
  for (const match of String(value || "").matchAll(pattern)) {
    const sku = match[1].toUpperCase();
    if (!seen.has(sku)) {
      seen.add(sku);
      skus.push(sku);
    }
  }
  return skus;
}

function cleanPathLine(line) {
  return String(line || "").trim().replace(/^"|"$/g, "");
}

function asciiOnly(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function cleanSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function vietnameseText(value) {
  return String(value).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function accentVietnameseCopy(value) {
  let text = String(value || "");
  const replacements = [
    // Buyer copy accent cleanup: keep generated buyer copy accented.
    [/\bva\b/gi, vietnameseText("v\u00e0")],
    [/\btren\b/gi, vietnameseText("tr\u00ean")],
    [/\bgiup\b/gi, vietnameseText("gi\u00fap")],
    [/\bgiam\b/gi, vietnameseText("gi\u1ea3m")],
    [/\bkhong\b/gi, vietnameseText("kh\u00f4ng")],
    [/\bnguoi\b/gi, vietnameseText("ng\u01b0\u1eddi")],
    [/\bhoac\b/gi, vietnameseText("ho\u1eb7c")],
    [/\bcan\b/gi, vietnameseText("c\u1ea7n")],
    [/\bma\b/gi, vietnameseText("m\u00e0")],
    [/\bbi\b/gi, vietnameseText("b\u1ecb")],
    [/\bdo\b/gi, vietnameseText("do")],
    [/\bco\b/gi, vietnameseText("c\u00f3")],
    [/\bvan\b/gi, vietnameseText("v\u1eabn")],
    [/\bDung moi ngay\b/gi, vietnameseText("d\u00f9ng m\u1ed7i ng\u00e0y")],
    [/\bDung cho routine don gian\b/gi, vietnameseText("d\u00f9ng cho quy tr\u00ecnh \u0111\u01a1n gi\u1ea3n")],
    [/\broutine\b/gi, vietnameseText("quy tr\u00ecnh")],
    [/\bmassage\b/gi, vietnameseText("m\u00e1t xa")],
    [/\btrang diem nhe\b/gi, vietnameseText("trang \u0111i\u1ec3m nh\u1eb9")],
    [/\bdau thua\b/gi, vietnameseText("d\u1ea7u th\u1eeba")],
    [/\bbui ban\b/gi, vietnameseText("b\u1ee5i b\u1ea9n")],
    [/\btap chat\b/gi, vietnameseText("t\u1ea1p ch\u1ea5t")],
    [/\bbe mat\b/gi, vietnameseText("b\u1ec1 m\u1eb7t")],
    [/\bsach thoang hon\b/gi, vietnameseText("s\u1ea1ch tho\u00e1ng h\u01a1n")],
    [/\bthanh loc\b/gi, vietnameseText("thanh l\u1ecdc")],
    [/\blo chan long\b/gi, vietnameseText("l\u1ed7 ch\u00e2n l\u00f4ng")],
    [/\bho tro\b/gi, vietnameseText("h\u1ed7 tr\u1ee3")],
    [/\bgiam cam giac\b/gi, vietnameseText("gi\u1ea3m c\u1ea3m gi\u00e1c")],
    [/\bcam giac\b/gi, vietnameseText("c\u1ea3m gi\u00e1c")],
    [/\btac nghe\b/gi, vietnameseText("t\u1eafc ngh\u1ebdn")],
    [/\bthoang mat\b/gi, vietnameseText("tho\u00e1ng m\u00e1t")],
    [/\bkhu vuc\b/gi, vietnameseText("khu v\u1ef1c")],
    [/\bvung T\b/gi, vietnameseText("v\u00f9ng T")],
    [/\bde bong dau\b/gi, vietnameseText("d\u1ec5 b\u00f3ng d\u1ea7u")],
    [/\bbong dau\b/gi, vietnameseText("b\u00f3ng d\u1ea7u")],
    [/\bdiu nhe\b/gi, vietnameseText("d\u1ecbu nh\u1eb9")],
    [/\bcan bang\b/gi, vietnameseText("c\u00e2n b\u1eb1ng")],
    [/\btu nhien\b/gi, vietnameseText("t\u1ef1 nhi\u00ean")],
    [/\bmem min\b/gi, vietnameseText("m\u1ec1m m\u1ecbn")],
    [/\bkho cang\b/gi, vietnameseText("kh\u00f4 c\u0103ng")],
    [/\brua mat\b/gi, vietnameseText("r\u1eeda m\u1eb7t")],
    [/\bsau khi rua\b/gi, vietnameseText("sau khi r\u1eeda")],
    [/\bhang ngay\b/gi, vietnameseText("h\u1eb1ng ng\u00e0y")],
    [/\bthao tac cau ky\b/gi, vietnameseText("thao t\u00e1c c\u1ea7u k\u1ef3")],
    [/\bcau ky\b/gi, vietnameseText("c\u1ea7u k\u1ef3")],
    [/\bnhe nhang\b/gi, vietnameseText("nh\u1eb9 nh\u00e0ng")],
    [/\bco ban\b/gi, vietnameseText("c\u01a1 b\u1ea3n")],
    [/\blam diu\b/gi, vietnameseText("l\u00e0m d\u1ecbu")],
    [/\bcham soc da\b/gi, vietnameseText("ch\u0103m s\u00f3c da")],
    [/\bdon gian\b/gi, vietnameseText("\u0111\u01a1n gi\u1ea3n")],
    [/\btai nha\b/gi, vietnameseText("t\u1ea1i nh\u00e0")],
    [/\bda dau\b/gi, vietnameseText("da d\u1ea7u")],
    [/\bhon hop\b/gi, vietnameseText("h\u1ed7n h\u1ee3p")],
    [/\btiep xuc\b/gi, vietnameseText("ti\u1ebfp x\u00fac")],
    [/\bnang nong\b/gi, vietnameseText("n\u1eafng n\u00f3ng")],
    [/\bra ngoai\b/gi, vietnameseText("ra ngo\u00e0i")],
    [/\bkem chong nang\b/gi, vietnameseText("kem ch\u1ed1ng n\u1eafng")],
    [/\bmoi truong nong am\b/gi, vietnameseText("m\u00f4i tr\u01b0\u1eddng n\u00f3ng \u1ea9m")],
    [/\bmoi truong\b/gi, vietnameseText("m\u00f4i tr\u01b0\u1eddng")],
    [/\bmuon\b/gi, vietnameseText("mu\u1ed1n")],
    [/\bbuoc rua mat\b/gi, vietnameseText("b\u01b0\u1edbc r\u1eeda m\u1eb7t")],
    [/\bbuoc\b/gi, vietnameseText("b\u01b0\u1edbc")],
    [/\bgon nhe\b/gi, vietnameseText("g\u1ecdn nh\u1eb9")],
    [/\bsan sang\b/gi, vietnameseText("s\u1eb5n s\u00e0ng")],
    [/\bduong tiep\b/gi, vietnameseText("d\u01b0\u1ee1ng ti\u1ebfp")],
    [/\btao bot\b/gi, vietnameseText("t\u1ea1o b\u1ecdt")],
    [/\btoan mat\b/gi, vietnameseText("to\u00e0n m\u1eb7t")],
    [/\btiet dau\b/gi, vietnameseText("ti\u1ebft d\u1ea7u")],
    [/\bdinh nho\b/gi, vietnameseText("d\u00ednh nh\u1edbt")],
    [/\bde chiu\b/gi, vietnameseText("d\u1ec5 ch\u1ecbu")],
    [/\bket cau\b/gi, vietnameseText("k\u1ebft c\u1ea5u")],
    [/\bco xat\b/gi, vietnameseText("c\u1ecd x\u00e1t")],
    [/\blay mot luong\b/gi, vietnameseText("l\u1ea5y m\u1ed9t l\u01b0\u1ee3ng")],
    [/\bsua rua mat\b/gi, vietnameseText("s\u1eefa r\u1eeda m\u1eb7t")],
    [/\bvua du\b/gi, vietnameseText("v\u1eeba \u0111\u1ee7")],
    [/\blong ban tay\b/gi, vietnameseText("l\u00f2ng b\u00e0n tay")],
    [/\bvoi nuoc\b/gi, vietnameseText("v\u1edbi n\u01b0\u1edbc")],
    [/\btrong khoang\b/gi, vietnameseText("trong kho\u1ea3ng")],
    [/\bhoan toan\b/gi, vietnameseText("ho\u00e0n to\u00e0n")],
    [/\bbang nuoc sach\b/gi, vietnameseText("b\u1eb1ng n\u01b0\u1edbc s\u1ea1ch")],
    [/\bsau do\b/gi, vietnameseText("sau \u0111\u00f3")],
    [/\btiep tuc\b/gi, vietnameseText("ti\u1ebfp t\u1ee5c")],
    [/\bcac buoc\b/gi, vietnameseText("c\u00e1c b\u01b0\u1edbc")],
    [/\bduong da\b/gi, vietnameseText("d\u01b0\u1ee1ng da")],
    [/\bbuoi sang\b/gi, vietnameseText("bu\u1ed5i s\u00e1ng")],
    [/\bbuoi toi\b/gi, vietnameseText("bu\u1ed5i t\u1ed1i")],
    [/\btuy nhu cau\b/gi, vietnameseText("t\u00f9y nhu c\u1ea7u")],
    [/\bcua da\b/gi, vietnameseText("c\u1ee7a da")],
    [/\bnhiet do\b/gi, vietnameseText("nhi\u1ec7t \u0111\u1ed9")],
    [/\bdong kin nap\b/gi, vietnameseText("\u0111\u00f3ng k\u00edn n\u1eafp")],
    [/\bsan pham\b/gi, vietnameseText("s\u1ea3n ph\u1ea9m")],
    [/\bon dinh\b/gi, vietnameseText("\u1ed5n \u0111\u1ecbnh")],
    [/\bDung moi ngay\b/gi, vietnameseText("d\\u00f9ng m\\u1ed7i ng\\u00e0y")],
    [/\bDung cho routine don gian\b/gi, vietnameseText("d\\u00f9ng cho routine \\u0111\\u01a1n gi\\u1ea3n")],
    [/\bGiup Da Luon Mem Min\b/gi, vietnameseText("gi\\u00fap da lu\\u00f4n m\\u1ec1m m\\u1ecbn")],
    [/\bGiup Da Mem Min\b/gi, vietnameseText("gi\\u00fap da m\\u1ec1m m\\u1ecbn")],
    [/\bGiu Cho Da Cam Giac Thoang Mat\b/gi, vietnameseText("gi\\u1eef cho da c\\u1ea3m gi\\u00e1c tho\\u00e1ng m\\u00e1t")],
    [/\bGiu Da Thoang Mat\b/gi, vietnameseText("gi\\u1eef da tho\\u00e1ng m\\u00e1t")],
    [/\bCan Bang Da\b/gi, vietnameseText("c\\u00e2n b\\u1eb1ng da")],
    [/\bDuong Am Nhe Nhang\b/gi, vietnameseText("d\\u01b0\\u1ee1ng \\u1ea9m nh\\u1eb9 nh\\u00e0ng")],
    [/\bNhe Nhang\b/gi, vietnameseText("nh\\u1eb9 nh\\u00e0ng")],
    [/\bPhu Hop Su Dung Hang Ngay\b/gi, vietnameseText("ph\\u00f9 h\\u1ee3p s\\u1eed d\\u1ee5ng h\\u1eb1ng ng\\u00e0y")],
    [/\bPhu Hop Routine Don Gian\b/gi, vietnameseText("ph\\u00f9 h\\u1ee3p routine \\u0111\\u01a1n gi\\u1ea3n")],
    [/\bThanh Loc Lo Chan Long\b/gi, vietnameseText("thanh l\\u1ecdc l\\u1ed7 ch\\u00e2n l\\u00f4ng")],
    [/\bKiem Soat Bong Dau\b/gi, vietnameseText("ki\\u1ec3m so\\u00e1t b\\u00f3ng d\\u1ea7u")],
    [/\bCam Giac Sach Nhe\b/gi, vietnameseText("c\\u1ea3m gi\\u00e1c s\\u1ea1ch nh\\u1eb9")],    [/\bCong dung chinh\b/gi, vietnameseText("C\\u00f4ng d\\u1ee5ng ch\\u00ednh")],
    [/\bDoi tuong phu hop\b/gi, vietnameseText("\\u0110\\u1ed1i t\\u01b0\\u1ee3ng ph\\u00f9 h\\u1ee3p")],
    [/\bCam giac khi dung\b/gi, vietnameseText("C\\u1ea3m gi\\u00e1c khi d\\u00f9ng")],
    [/\bCach dung\b/gi, vietnameseText("C\\u00e1ch d\\u00f9ng")],
    [/\bCach bao quan\b/gi, vietnameseText("C\\u00e1ch b\\u1ea3o qu\\u1ea3n")],
    [/\bLam sach dau thua\b/gi, vietnameseText("L\\u00e0m s\\u1ea1ch d\\u1ea7u th\\u1eeba")],
    [/\bLam sach sau\b/gi, vietnameseText("L\\u00e0m s\\u1ea1ch s\\u00e2u")],
    [/\bLam sach nhe nha\b/gi, vietnameseText("L\\u00e0m s\\u1ea1ch nh\\u1eb9 nh\\u00e0ng")],
    [/\bLam sach be mat\b/gi, vietnameseText("L\\u00e0m s\\u1ea1ch b\\u1ec1 m\\u1eb7t")],
    [/\bLoai bo\b/gi, vietnameseText("Lo\\u1ea1i b\\u1ecf")],
    [/\bBui ban\b/gi, vietnameseText("b\\u1ee5i b\\u1ea9n")],
    [/\bDau thua\b/gi, vietnameseText("d\\u1ea7u th\\u1eeba")],
    [/\bCan trang diem\b/gi, vietnameseText("c\\u1eb7n trang \\u0111i\\u1ec3m")],
    [/\bTap chat\b/gi, vietnameseText("t\\u1ea1p ch\\u1ea5t")],
    [/\bBe mat da\b/gi, vietnameseText("b\\u1ec1 m\\u1eb7t da")],
    [/\bThanh loc lo chan long\b/gi, vietnameseText("Thanh l\\u1ecdc l\\u1ed7 ch\\u00e2n l\\u00f4ng")],
    [/\bThanh loc da\b/gi, vietnameseText("Thanh l\\u1ecdc da")],
    [/\bThanh loc\b/gi, vietnameseText("thanh l\\u1ecdc")],
    [/\bLo chan long\b/gi, vietnameseText("l\\u1ed7 ch\\u00e2n l\\u00f4ng")],
    [/\bHo tro\b/gi, vietnameseText("h\\u1ed7 tr\\u1ee3")],
    [/\bCan bang\b/gi, vietnameseText("c\\u00e2n b\\u1eb1ng")],
    [/\bCap am\b/gi, vietnameseText("c\\u1ea5p \\u1ea9m")],
    [/\bDuong am\b/gi, vietnameseText("d\\u01b0\\u1ee1ng \\u1ea9m")],
    [/\bNhe nha\b/gi, vietnameseText("nh\\u1eb9 nh\\u00e0ng")],
    [/\bMem min\b/gi, vietnameseText("m\\u1ec1m m\\u1ecbn")],
    [/\bKho cang\b/gi, vietnameseText("kh\\u00f4 c\\u0103ng")],
    [/\bDiu nhe\b/gi, vietnameseText("d\\u1ecbu nh\\u1eb9")],
    [/\bHang ngay\b/gi, vietnameseText("h\\u1eb1ng ng\\u00e0y")],
    [/\bMoi ngay\b/gi, vietnameseText("m\\u1ed7i ng\\u00e0y")],
    [/\bPhu hop\b/gi, vietnameseText("ph\\u00f9 h\\u1ee3p")],
    [/\bSu dung\b/gi, vietnameseText("s\\u1eed d\\u1ee5ng")],
    [/\bDa dau\b/gi, vietnameseText("da d\\u1ea7u")],
    [/\bDa hon hop\b/gi, vietnameseText("da h\\u1ed7n h\\u1ee3p")],
    [/\bMoi loai da\b/gi, vietnameseText("m\\u1ecdi lo\\u1ea1i da")],
    [/\bVung T\b/gi, vietnameseText("v\\u00f9ng T")],
    [/\bThong thoang\b/gi, vietnameseText("th\\u00f4ng tho\\u00e1ng")],
    [/\bThoang mat\b/gi, vietnameseText("tho\\u00e1ng m\\u00e1t")],
    [/\bDinh nho\b/gi, vietnameseText("d\\u00ednh nh\\u1edbt")],
    [/\bDe chiu\b/gi, vietnameseText("d\\u1ec5 ch\\u1ecbu")],
    [/\bKet cau\b/gi, vietnameseText("k\\u1ebft c\\u1ea5u")],
    [/\bTao bot\b/gi, vietnameseText("t\\u1ea1o b\\u1ecdt")],
    [/\bEm ai\b/gi, vietnameseText("\\u00eam \\u00e1i")],
    [/\bLam uot\b/gi, vietnameseText("l\\u00e0m \\u01b0\\u1edbt")],
    [/\bVua du\b/gi, vietnameseText("v\\u1eeba \\u0111\\u1ee7")],
    [/\bLong ban tay\b/gi, vietnameseText("l\\u00f2ng b\\u00e0n tay")],
    [/\bNuoc sach\b/gi, vietnameseText("n\\u01b0\\u1edbc s\\u1ea1ch")],
    [/\bBuoi sang\b/gi, vietnameseText("bu\\u1ed5i s\\u00e1ng")],
    [/\bBuoi toi\b/gi, vietnameseText("bu\\u1ed5i t\\u1ed1i")],
    [/\bNhu cau\b/gi, vietnameseText("nhu c\\u1ea7u")],
    [/\bBao quan\b/gi, vietnameseText("b\\u1ea3o qu\\u1ea3n")],
    [/\bNoi kho thoang\b/gi, vietnameseText("n\\u01a1i kh\\u00f4 tho\\u00e1ng")],
    [/\bTranh anh nang truc tiep\b/gi, vietnameseText("tr\\u00e1nh \\u00e1nh n\\u1eafng tr\\u1ef1c ti\\u1ebfp")],
    [/\bNhiet do cao\b/gi, vietnameseText("nhi\\u1ec7t \\u0111\\u1ed9 cao")],
    [/\bDong kin nap\b/gi, vietnameseText("\\u0111\\u00f3ng k\\u00edn n\\u1eafp")],
    [/\bSan pham\b/gi, vietnameseText("s\\u1ea3n ph\\u1ea9m")],
    [/\bCong thuc\b/gi, vietnameseText("c\\u00f4ng th\\u1ee9c")],
    [/\bKhong\b/gi, vietnameseText("kh\\u00f4ng")],
    [/\bRoutine don gian\b/gi, vietnameseText("routine \\u0111\\u01a1n gi\\u1ea3n")],
    [/\bCho routine ca nhan\b/gi, vietnameseText("cho routine c\\u00e1 nh\\u00e2n")],
    [/\bDe su dung\b/gi, vietnameseText("d\\u1ec5 s\\u1eed d\\u1ee5ng")]
  ];
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }
  const finalReplacements = [
    [/\blam sach\b/gi, vietnameseText("l\\u00e0m s\\u1ea1ch")],
    [/\bGiu\b/gi, vietnameseText("gi\\u1eef")],
    [/\bgiu\b/gi, vietnameseText("gi\\u1eef")],
    [/\bcach\b/gi, vietnameseText("c\\u00e1ch")],
    [/\bc\u1ea7n trang \u0111i\u1ec3m\b/gi, vietnameseText("c\\u1eb7n trang \\u0111i\\u1ec3m")],
    [/\bc\u1ea7n bang\b/gi, vietnameseText("c\\u00e2n b\\u1eb1ng")],
    [/\bcang kho\b/gi, vietnameseText("c\\u0103ng kh\\u00f4")],
    [/\bsach\b/gi, vietnameseText("s\\u1ea1ch")],
    [/\bnhung\b/gi, vietnameseText("nh\\u01b0ng")],
    [/\bdau tien\b/gi, vietnameseText("\\u0111\\u1ea7u ti\\u00ean")],
    [/\bde dung\b/gi, vietnameseText("d\\u1ec5 d\\u00f9ng")],
    [/\bde\b/gi, vietnameseText("\\u0111\\u1ec3")],
    [/\bdi nang\b/gi, vietnameseText("\\u0111i n\\u1eafng")],
    [/\bmem am\b/gi, vietnameseText("m\\u1ec1m \\u1ea9m")],
    [/\bco ban\b/gi, vietnameseText("c\\u01a1 b\\u1ea3n")],
    [/\bmat cam gi\u00e1c\b/gi, vietnameseText("m\\u1ea5t c\\u1ea3m gi\\u00e1c")],
    [/\blam da\b/gi, vietnameseText("l\\u00e0m da")],
    [/\bmin\b/gi, vietnameseText("m\\u1ecbn")],
    [/\brua\b/gi, vietnameseText("r\\u1eeda")],
    [/\bhon\b/gi, vietnameseText("h\\u01a1n")],
    [/\bthoang\b/gi, vietnameseText("tho\\u00e1ng")],
    [/\bbot d\u00ednh\b/gi, vietnameseText("b\\u1edbt d\\u00ednh")],
    [/\btap trung vung\b/gi, vietnameseText("t\\u1eadp trung v\\u00f9ng")],
    [/\bvung\b/gi, vietnameseText("v\\u00f9ng")],
    [/\bng\u01b0\u1eddi \u0111\u1ec3 b\u1ecb\b/gi, vietnameseText("ng\\u01b0\\u1eddi d\\u1ec5 b\\u1ecb")],
    [/\b\u0111\u1ec3 m\u00e1t xa\b/gi, vietnameseText("d\\u1ec5 m\\u00e1t xa")],
    [/\b\u0111\u1ec3 r\u1eeda s\u1ea1ch\b/gi, vietnameseText("d\\u1ec5 r\\u1eeda s\\u1ea1ch")],
    [/\bmat c\u1ea3m gi\u00e1c\b/gi, vietnameseText("m\\u1ea5t c\\u1ea3m gi\\u00e1c")],
    [/\bc\u00f3 ban\b/gi, vietnameseText("c\\u01a1 b\\u1ea3n")],
    [/\blam b\u01b0\u1edbc\b/gi, vietnameseText("l\\u00e0m b\\u01b0\\u1edbc")],
    [/\bsua r\u1eeda\b/gi, vietnameseText("s\\u1eefa r\\u1eeda")],
    [/\bgay\b/gi, vietnameseText("g\\u00e2y")],
    [/\bc\u00f3 xat manh\b/gi, vietnameseText("c\\u1ecd x\\u00e1t m\\u1ea1nh")],
    [/\bxat manh\b/gi, vietnameseText("x\\u00e1t m\\u1ea1nh")],
    [/\bkho chiu\b/gi, vietnameseText("kh\\u00f3 ch\\u1ecbu")],
    [/\bdo mem\b/gi, vietnameseText("\\u0111\\u1ed9 m\\u1ec1m")]
  ];
  for (const [pattern, replacement] of finalReplacements) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

function buyerProductName(productName, skuGroup = [], options = {}) {
  let clean = asciiOnly(productName);
  for (const sku of parseSkuGroup(skuGroup)) {
    clean = clean.replace(new RegExp(`\\b${escapeRegExp(sku)}\\b`, "gi"), " ");
  }
  clean = clean
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*(?:chinh hang|authentic|official|cam ket|100%)[^)]*\)/ig, " ")
    .replace(/\b(?:chinh hang|hang chinh hang|ban hang chinh hang|cam ket|authentic|official|100%)\b/ig, " ")
    .replace(/\s+/g, " ")
    .trim();
  clean = englishProductIdentity(clean);
  if (!clean || isSkuLikeName(clean)) {
    return options.allowFallbackIdentity ? fallbackBuyerProductName(options.notes || productName) : FALLBACK_PRODUCT_NAME;
  }
  return clean;
}

function fallbackBuyerProductName(seed = "") {
  const text = asciiOnly(seed).toLowerCase();
  if (/\b(son|lip|balm|glow|rouge|moi)\b/.test(text)) return "DailyFit Tinted Lip Balm";
  if (/\b(toc|hair|scalp|shampoo|dau goi)\b/.test(text)) return "SilkRoot Repair Hair Care";
  if (/\b(clean|lotion|toner|soft clean|hydrating|soothing|duong am|lam diu)\b/.test(text)) return "HydraSoft Soothing Lotion";
  if (/\b(essence|serum|skin|da|cap am)\b/.test(text)) return "HydraSoft Moisturizing Serum";
  if (/\b(cream|creme|eye)\b/.test(text)) return "HydraSoft Moisturizing Cream";
  if (/\b(blush|makeup|powder|foundation|phan|ma hong)\b/.test(text)) return "DailyFit Soft Makeup Compact";
  if (/\b(perfume|fragrance|scent|parfum|nuoc hoa)\b/.test(text)) return "FreshAura Floral Fragrance";
  return FALLBACK_PRODUCT_NAME;
}

function isSkuLikeName(value) {
  const text = asciiOnly(value);
  if (!text) return true;
  const tokens = text.split(/\s+/);
  return tokens.every((token) => /^[A-Z]{1,8}\d[A-Z0-9-]*$/i.test(token) || /^\d+$/.test(token));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function englishProductIdentity(value) {
  const clean = asciiOnly(value);
  const tailCue = /\b(?:sua rua|rua mat|lam sach|thanh loc|nuoc|dau|kem|duong|cap am|cham soc|phu hop|cho da|cho toc|mau len|moi|toc|da kho|da dau|hang ngay|cao cap)\b/i;
  const match = clean.match(tailCue);
  if (!match || match.index < 12) return clean;
  return clean.slice(0, match.index).trim() || clean;
}

function compactTitleIdentity(value) {
  const identity = englishProductIdentity(value).replace(/\s+/g, " ").trim();
  if (identity.length <= 58) return identity;
  return trimWords(identity, 58);
}

function trimWords(value, limit) {
  const words = cleanSpaces(accentVietnameseCopy(value)).split(/\s+/).filter(Boolean);
  let text = "";
  for (const word of words) {
    const candidate = `${text} ${word}`.trim();
    if (candidate.length > limit) break;
    text = candidate;
  }
  return text || cleanSpaces(accentVietnameseCopy(value)).slice(0, limit).trim();
}

function appendWordsWithinLimit(base, words, limit = 100) {
  let text = cleanSpaces(accentVietnameseCopy(base));
  for (const word of words) {
    const candidate = `${text} ${word}`.trim();
    if (candidate.length > limit) break;
    text = candidate;
  }
  return text;
}

function buildEcommerceTitle(productName, profile, storeId) {
  return renderListingTitle(buildListingCopyPlan({ cleanName: productName, profile, storeId }));
}

function renderListingTitle(plan) {
  const identity = plan.titleIdentity;
  const phraseSets = plan.titlePhraseSets;
  const candidates = [];

  for (const phrases of phraseSets) {
    candidates.push(`${identity} ${phrases.join(", ")}`);
    for (let count = phrases.length - 1; count >= 1; count--) {
      candidates.push(`${identity} ${phrases.slice(0, count).join(", ")}`);
    }
  }

  const normalized = candidates
    .map((candidate) => cleanSpaces(accentVietnameseCopy(candidate).replace(/\s*,\s*/g, ", ")))
    .filter(Boolean);
  const direct = normalized.find((candidate) => candidate.length >= BUYER_COPY_STANDARD.titleMin && candidate.length <= BUYER_COPY_STANDARD.titleMax);
  if (direct) return direct;

  const underLimit = normalized
    .filter((candidate) => candidate.length <= BUYER_COPY_STANDARD.titleMax)
    .sort((a, b) => b.length - a.length)[0];
  if (underLimit) return fitTitle(underLimit);

  return fitTitle(`${identity} ${phraseSets[0][0]}`);
}

function fitTitle(title) {
  let text = cleanSpaces(accentVietnameseCopy(title));
  if (text.length > BUYER_COPY_STANDARD.titleMax) return trimWords(text, BUYER_COPY_STANDARD.titleMax).replace(/[,;:.]+$/g, "").trim();
  const fillerWords = vietnameseText("ph\\u00f9 h\\u1ee3p d\\u00f9ng h\\u1eb1ng ng\\u00e0y cho routine c\\u00e1 nh\\u00e2n d\\u1ec5 s\\u1eed d\\u1ee5ng").split(" ");
  let index = 0;
  while (text.length < BUYER_COPY_STANDARD.titleMin && index < BUYER_COPY_STANDARD.titleMin) {
    const candidate = `${text} ${fillerWords[index % fillerWords.length]}`.trim();
    if (candidate.length > BUYER_COPY_STANDARD.titleMax) {
      break;
    }
    text = candidate;
    index++;
  }
  return cleanSpaces(accentVietnameseCopy(text));
}

function titlePhraseSetsForStore(storeId, profile) {
  if (profile.type === "cleanser") {
    const cleanserPhrases = {
      4: [
        [vietnameseText("L\\u00e0m s\\u1ea1ch \\u00eam d\\u1ecbu"), vietnameseText("gi\\u1eef da m\\u1ec1m m\\u1ecbn"), vietnameseText("d\\u00f9ng \\u0111\\u1ec1u m\\u1ed7i ng\\u00e0y")],
        [vietnameseText("D\\u1ecbu nh\\u1eb9 cho da"), vietnameseText("h\\u1ed7 tr\\u1ee3 \\u0111\\u1ed9 \\u1ea9m"), vietnameseText("kh\\u00f4ng kh\\u00f4 c\\u0103ng")]
      ],
      5: [
        [vietnameseText("L\\u00e0m s\\u1ea1ch d\\u1ea7u th\\u1eeba"), vietnameseText("lo\\u1ea1i b\\u1ecf b\\u1ee5i b\\u1ea9n"), vietnameseText("da tho\\u00e1ng m\\u00e1t")],
        [vietnameseText("T\\u1ea1o b\\u1ecdt m\\u1ecbn"), vietnameseText("s\\u1ea1ch nh\\u1eb9 b\\u1ec1 m\\u1eb7t"), vietnameseText("gi\\u1ea3m c\\u1ea3m gi\\u00e1c b\\u1ebft d\\u00ednh")]
      ],
      6: [
        [vietnameseText("Thanh l\\u1ecdc da"), vietnameseText("k\\u1ebft c\\u1ea5u \\u00eam m\\u1ecbn"), vietnameseText("ch\\u0103m s\\u00f3c da h\\u1eb1ng ng\\u00e0y")],
        [vietnameseText("L\\u00e0m s\\u1ea1ch s\\u00e2u"), vietnameseText("da m\\u1ec1m tho\\u00e1ng"), vietnameseText("ph\\u00f9 h\\u1ee3p routine cao c\\u1ea5p")]
      ],
      7: [
        [vietnameseText("L\\u00e0m s\\u1ea1ch s\\u00e2u"), vietnameseText("lo\\u1ea1i b\\u1ecf b\\u1ee5i b\\u1ea9n"), vietnameseText("gi\\u00fap da m\\u1ec1m m\\u1ecbn")],
        [vietnameseText("Thanh l\\u1ecdc da"), vietnameseText("d\\u1ecbu nh\\u1eb9 m\\u1ed7i ng\\u00e0y"), vietnameseText("kh\\u00f4ng kh\\u00f4 c\\u0103ng")]
      ],
      8: [
        [vietnameseText("L\\u00e0m s\\u1ea1ch d\\u1ea7u th\\u1eeba"), vietnameseText("gi\\u1eef da tho\\u00e1ng m\\u00e1t"), vietnameseText("c\\u00e2n b\\u1eb1ng da")],
        [vietnameseText("Thanh l\\u1ecdc l\\u1ed7 ch\\u00e2n l\\u00f4ng"), vietnameseText("s\\u1ea1ch nh\\u1eb9 b\\u1ec1 m\\u1eb7t"), vietnameseText("d\\u00f9ng s\\u00e1ng t\\u1ed1i")]
      ],
      9: [
        [vietnameseText("Thanh l\\u1ecdc da"), vietnameseText("d\\u01b0\\u1ee1ng \\u1ea9m nh\\u1eb9 nh\\u00e0ng"), vietnameseText("d\\u00f9ng h\\u1eb1ng ng\\u00e0y")],
        [vietnameseText("L\\u00e0m s\\u1ea1ch b\\u1ec1 m\\u1eb7t"), vietnameseText("kh\\u00f4ng kh\\u00f4 c\\u0103ng"), vietnameseText("ph\\u00f9 h\\u1ee3p routine \\u0111\\u01a1n gi\\u1ea3n")]
      ]
    };
    return cleanserPhrases[storeId] || cleanserPhrases[7];
  }
  const phrases = {
    4: {
      lip: [
        [vietnameseText("D\\u01b0\\u1ee1ng m\\u00f4i \\u00eam m\\u1ecbn"), vietnameseText("m\\u00e0u nh\\u1eb9 t\\u1ef1 nhi\\u00ean"), vietnameseText("d\\u00f9ng \\u0111\\u1ec1u m\\u1ed7i ng\\u00e0y")],
        [vietnameseText("M\\u00f4i m\\u1ec1m tho\\u1ea3i m\\u00e1i"), vietnameseText("b\\u00f3ng nh\\u1eb9 thanh l\\u1ecbch"), vietnameseText("ph\\u00f9 h\\u1ee3p trang \\u0111i\\u1ec3m nhanh")]
      ],
      hair: [
        [vietnameseText("Ch\\u0103m s\\u00f3c t\\u00f3c m\\u1ec1m m\\u01b0\\u1ee3t"), vietnameseText("gi\\u1ea3m c\\u1ea3m gi\\u00e1c kh\\u00f4 x\\u01a1"), vietnameseText("d\\u00f9ng h\\u1eb1ng ng\\u00e0y")],
        [vietnameseText("T\\u00f3c nh\\u1eb9 tho\\u00e1ng"), vietnameseText("d\\u1ec5 ch\\u1ea3i h\\u01a1n"), vietnameseText("routine t\\u1ea1i nh\\u00e0")]
      ],
      skincare: [
        [vietnameseText("D\\u01b0\\u1ee1ng \\u1ea9m d\\u1ecbu nh\\u1eb9"), vietnameseText("gi\\u00fap da m\\u1ec1m m\\u1ecbn"), vietnameseText("ph\\u00f9 h\\u1ee3p d\\u00f9ng h\\u1eb1ng ng\\u00e0y")],
        [vietnameseText("L\\u00e0m d\\u1ecbu b\\u1ec1 m\\u1eb7t da"), vietnameseText("c\\u1ea3m gi\\u00e1c \\u00eam \\u00e1i"), vietnameseText("routine \\u0111\\u01a1n gi\\u1ea3n")]
      ],
      makeup: [
        [vietnameseText("M\\u00e0u t\\u1ef1 nhi\\u00ean"), vietnameseText("k\\u1ebft c\\u1ea5u m\\u1ecbn"), vietnameseText("trang \\u0111i\\u1ec3m h\\u1eb1ng ng\\u00e0y")],
        [vietnameseText("D\\u1ec5 t\\u00e1n tr\\u00ean da"), vietnameseText("hi\\u1ec7u \\u1ee9ng thanh l\\u1ecbch"), vietnameseText("d\\u00f9ng nhanh m\\u1ed7i ng\\u00e0y")]
      ],
      fragrance: [
        [vietnameseText("H\\u01b0\\u01a1ng th\\u01a1m thanh l\\u1ecbch"), vietnameseText("d\\u1ec5 d\\u00f9ng h\\u1eb1ng ng\\u00e0y"), vietnameseText("ph\\u00f9 h\\u1ee3p l\\u00e0m qu\\u00e0")],
        [vietnameseText("M\\u00f9i h\\u01b0\\u01a1ng nh\\u1eb9 nh\\u00e0ng"), vietnameseText("t\\u1ea1o c\\u1ea3m gi\\u00e1c t\\u1ef1 tin"), vietnameseText("phong c\\u00e1ch hi\\u1ec7n \\u0111\\u1ea1i")]
      ],
      beauty: [
        [vietnameseText("C\\u1ea3m gi\\u00e1c m\\u1ec1m m\\u1ecbn"), vietnameseText("d\\u00f9ng \\u0111\\u1ec1u h\\u1eb1ng ng\\u00e0y"), vietnameseText("ph\\u00f9 h\\u1ee3p routine c\\u00e1 nh\\u00e2n")],
        [vietnameseText("Thi\\u1ebft k\\u1ebf g\\u1ecdn \\u0111\\u1eb9p"), vietnameseText("thao t\\u00e1c d\\u1ec5 d\\u00f9ng"), vietnameseText("c\\u1ea3m gi\\u00e1c tho\\u1ea3i m\\u00e1i")]
      ]
    },
    5: {
      lip: [
        [vietnameseText("M\\u00e0u m\\u00f4i t\\u01b0\\u01a1i s\\u00e1ng"), vietnameseText("d\\u01b0\\u1ee1ng \\u1ea9m nh\\u1eb9"), vietnameseText("kh\\u00f4ng g\\u00e2y n\\u1eb7ng m\\u00f4i")],
        [vietnameseText("Son b\\u00f3ng d\\u1ec5 d\\u00f9ng"), vietnameseText("m\\u00f4i m\\u1ec1m h\\u01a1n"), vietnameseText("ti\\u1ec7n mang theo")]
      ],
      hair: [
        [vietnameseText("T\\u00f3c s\\u1ea1ch tho\\u00e1ng"), vietnameseText("gi\\u1ea3m c\\u1ea3m gi\\u00e1c b\\u1ebft d\\u1ea7u"), vietnameseText("d\\u1ec5 v\\u00e0o n\\u1ebfp")],
        [vietnameseText("L\\u00e0m m\\u1edbi m\\u00e1i t\\u00f3c"), vietnameseText("c\\u1ea3m gi\\u00e1c nh\\u1eb9 h\\u01a1n"), vietnameseText("ch\\u0103m s\\u00f3c t\\u1ea1i nh\\u00e0")]
      ],
      skincare: [
        [vietnameseText("L\\u00e0m s\\u1ea1ch v\\u00e0 l\\u00e0m m\\u1edbi da"), vietnameseText("c\\u1ea3m gi\\u00e1c tho\\u00e1ng m\\u00e1t"), vietnameseText("ph\\u00f9 h\\u1ee3p ng\\u00e0y n\\u00f3ng \\u1ea9m")],
        [vietnameseText("Ki\\u1ec3m so\\u00e1t c\\u1ea3m gi\\u00e1c d\\u1ea7u"), vietnameseText("da g\\u1ecdn s\\u1ea1ch h\\u01a1n"), vietnameseText("routine nhanh")]
      ],
      makeup: [
        [vietnameseText("M\\u00e0u l\\u00ean r\\u00f5 n\\u00e9t"), vietnameseText("d\\u1ec5 t\\u00e1n \\u0111\\u1ec1u"), vietnameseText("ph\\u00f9 h\\u1ee3p nhi\\u1ec1u phong c\\u00e1ch")],
        [vietnameseText("L\\u1edbp trang \\u0111i\\u1ec3m g\\u1ecdn \\u0111\\u1eb9p"), vietnameseText("ti\\u1ec7n d\\u1eb7m l\\u1ea1i"), vietnameseText("d\\u00f9ng trong ng\\u00e0y")]
      ],
      fragrance: [
        [vietnameseText("M\\u00f9i h\\u01b0\\u01a1ng t\\u01b0\\u01a1i s\\u00e1ng"), vietnameseText("d\\u1ec5 d\\u00f9ng nhi\\u1ec1u d\\u1ecbp"), vietnameseText("t\\u0103ng c\\u1ea3m gi\\u00e1c t\\u1ef1 tin")],
        [vietnameseText("H\\u01b0\\u01a1ng th\\u01a1m g\\u1ecdn sang"), vietnameseText("phong c\\u00e1ch hi\\u1ec7n \\u0111\\u1ea1i"), vietnameseText("th\\u00edch h\\u1ee3p l\\u00e0m qu\\u00e0")]
      ],
      beauty: [
        [vietnameseText("C\\u00f4ng n\\u0103ng r\\u00f5 r\\u00e0ng"), vietnameseText("c\\u1ea3m gi\\u00e1c s\\u1ea1ch g\\u1ecdn"), vietnameseText("d\\u1ec5 d\\u00f9ng m\\u1ed7i ng\\u00e0y")],
        [vietnameseText("L\\u00e0m \\u0111\\u1eb9p nhanh g\\u1ecdn"), vietnameseText("hi\\u1ec7u \\u1ee9ng t\\u1ef1 nhi\\u00ean"), vietnameseText("ti\\u1ec7n cho routine")]
      ]
    },
    6: {
      lip: [
        [vietnameseText("Son d\\u01b0\\u1ee1ng cao c\\u1ea5p"), vietnameseText("m\\u00e0u b\\u00f3ng tinh t\\u1ebf"), vietnameseText("m\\u00f4i m\\u1ec1m tho\\u1ea3i m\\u00e1i")],
        [vietnameseText("K\\u1ebft c\\u1ea5u m\\u1ecbn nh\\u1eb9"), vietnameseText("b\\u00f3ng kh\\u1ecfe t\\u1ef1 nhi\\u00ean"), vietnameseText("ph\\u00f9 h\\u1ee3p phong c\\u00e1ch sang")]
      ],
      hair: [
        [vietnameseText("Ch\\u0103m s\\u00f3c t\\u00f3c chuy\\u00ean s\\u00e2u"), vietnameseText("m\\u1ec1m m\\u01b0\\u1ee3t h\\u01a1n"), vietnameseText("routine cao c\\u1ea5p")],
        [vietnameseText("H\\u1ed7 tr\\u1ee3 t\\u00f3c kh\\u00f4 y\\u1ebfu"), vietnameseText("gi\\u1ea3m r\\u1ed1i x\\u01a1"), vietnameseText("c\\u1ea3m gi\\u00e1c b\\u00f3ng m\\u01b0\\u1ee3t")]
      ],
      skincare: [
        [vietnameseText("Ch\\u0103m s\\u00f3c da cao c\\u1ea5p"), vietnameseText("d\\u01b0\\u1ee1ng \\u1ea9m v\\u00e0 l\\u00e0m d\\u1ecbu"), vietnameseText("k\\u1ebft c\\u1ea5u m\\u1ecbn m\\u01b0\\u1ee3t")],
        [vietnameseText("H\\u1ed7 tr\\u1ee3 b\\u1ec1 m\\u1eb7t da"), vietnameseText("c\\u1ea3m gi\\u00e1c \\u0111\\u1ea7y \\u0111\\u1eb7n h\\u01a1n"), vietnameseText("routine ban \\u0111\\u00eam")]
      ],
      makeup: [
        [vietnameseText("M\\u00e0u s\\u1eafc sang tr\\u1ecdng"), vietnameseText("k\\u1ebft c\\u1ea5u m\\u1ecbn m\\u00e0ng"), vietnameseText("ho\\u00e0n thi\\u1ec7n l\\u1edbp makeup")],
        [vietnameseText("Thi\\u1ebft k\\u1ebf cao c\\u1ea5p"), vietnameseText("hi\\u1ec7u \\u1ee9ng thanh l\\u1ecbch"), vietnameseText("d\\u00f9ng cho nhi\\u1ec1u d\\u1ecbp")]
      ],
      fragrance: [
        [vietnameseText("H\\u01b0\\u01a1ng th\\u01a1m sang tr\\u1ecdng"), vietnameseText("d\\u1ea5u \\u1ea5n thanh l\\u1ecbch"), vietnameseText("ph\\u00f9 h\\u1ee3p qu\\u00e0 t\\u1eb7ng")],
        [vietnameseText("M\\u00f9i h\\u01b0\\u01a1ng tinh t\\u1ebf"), vietnameseText("phong c\\u00e1ch cu\\u1ed1n h\\u00fat"), vietnameseText("d\\u00f9ng nhi\\u1ec1u ho\\u00e0n c\\u1ea3nh")]
      ],
      beauty: [
        [vietnameseText("Tr\\u1ea3i nghi\\u1ec7m cao c\\u1ea5p"), vietnameseText("k\\u1ebft c\\u1ea5u d\\u1ec5 d\\u00f9ng"), vietnameseText("ch\\u0103m s\\u00f3c tinh t\\u1ebf")],
        [vietnameseText("H\\u00ecnh \\u1ea3nh sang \\u0111\\u1eb9p"), vietnameseText("c\\u1ea3m gi\\u00e1c tho\\u1ea3i m\\u00e1i"), vietnameseText("ph\\u00f9 h\\u1ee3p routine c\\u00e1 nh\\u00e2n")]
      ]
    },
    7: {
      lip: [
        ["Duong Moi Mem Min", "Mau Len Trong Treo", "Bong Nhe Hang Ngay"],
        ["Cap Am Moi", "Chat Son Mong Nhe", "De Dung Moi Ngay"]
      ],
      hair: [
        ["Cham Soc Toc Mem Muot", "Giam Kho Xao", "Phu Hop Dung Hang Ngay"],
        ["Lam Sach Nhe", "Toc De Vao Nep", "Cam Giac Bong Muot"]
      ],
      skincare: [
        [vietnameseText("L\\u00e0m s\\u1ea1ch s\\u00e2u"), vietnameseText("lo\\u1ea1i b\\u1ecf b\\u1ee5i b\\u1ea9n"), vietnameseText("gi\\u00fap da m\\u1ec1m m\\u1ecbn")],
        ["Cap Am Nhe", "Lam Diu Be Mat Da", "Phu Hop Dung Hang Ngay"]
      ],
      makeup: [
        ["Mau Min Tu Nhien", "De Tan Tren Da", "Lop Makeup Thanh Lich"],
        ["Len Mau Nhe", "Tao Diem Nhan Tuoi Tan", "Dung Hang Ngay"]
      ],
      fragrance: [
        ["Huong Hoa Thanh Lich", "Mui Thom De Dung", "Phu Hop Lam Qua Tang"],
        ["Mui Huong Hien Dai", "Giu Cam Giac Tu Tin", "Dung Hang Ngay"]
      ],
      beauty: [
        ["Mem Min Tu Nhien", "De Dung Hang Ngay", "Phu Hop Routine Ca Nhan"],
        ["Thiet Ke Gon Dep", "Cam Giac De Chiu", "Tien Mang Theo"]
      ]
    },
    8: {
      lip: [
        ["Duong Am Cho Moi", "Bong Khoe Tu Nhien", "Chat Son Tron Muot"],
        ["Mau Moi Nhe Nhang", "Mem Moi Ca Ngay", "Phu Hop Makeup Nhanh"]
      ],
      hair: [
        ["Toc Sach Thoang", "Giam Be Dau", "Ho Tro Cham Soc Tai Nha"],
        ["Toc Nhe Hon", "De Chai Va Tao Nep", "Dung Cho Routine Don Gian"]
      ],
      skincare: [
        [vietnameseText("L\\u00e0m s\\u1ea1ch d\\u1ea7u th\\u1eeba"), vietnameseText("gi\\u1eef da tho\\u00e1ng m\\u00e1t"), vietnameseText("c\\u00e2n b\\u1eb1ng da")],
        ["Thanh Loc Be Mat Da", "Ket Cau Sach Nhe", "Dung Sang Toi"]
      ],
      makeup: [
        ["Mau Ro Net", "Ket Cau Min Muot", "Hop Nhieu Phong Cach"],
        ["De Tan De Dieu Chinh", "Lop Nen Gon Dep", "Tien Dam Lai"]
      ],
      fragrance: [
        ["Huong Thom Co Diem Nhan", "Tang Cam Giac Tu Tin", "Dung Nhieu Dip"],
        ["Mui Huong Gon Sang", "Hop Phong Cach Hien Dai", "Lam Qua Tang"]
      ],
      beauty: [
        ["Ket Cau De Dung", "Finish Gon Dep", "Phu Hop Lam Dep Moi Ngay"],
        ["Cong Nang Ro Rang", "Cam Giac Sach Se", "De Bao Quan"]
      ]
    },
    9: {
      lip: [
        ["Duong Am Moi", "Mau Nhe Sang Mat", "Thoai Mai Khi Dung"],
        ["Bong Moi Tu Nhien", "Khong Gay Nang Moi", "Tien Mang Theo"]
      ],
      hair: [
        ["Toc Mem Hon", "Sach Thoang De Chai", "Phu Hop Dung Hang Ngay"],
        ["Ho Tro Toc Kho Yeu", "Giam Roi Xao", "Cam Giac Bong Muot"]
      ],
      skincare: [
        [vietnameseText("Thanh l\\u1ecdc da"), vietnameseText("d\\u01b0\\u1ee1ng \\u1ea9m nh\\u1eb9 nh\\u00e0ng"), vietnameseText("d\\u00f9ng h\\u1eb1ng ng\\u00e0y")],
        ["Lam Sach Be Mat", "Giup Da Mem Min", "Dung Cho Routine Don Gian"]
      ],
      makeup: [
        ["Len Mau Tu Nhien", "Sang Da Nhe Nhang", "De Dieu Chinh Do Dam"],
        ["Tao Ve Tuoi Tan", "Ket Cau Min", "Phu Hop Trang Diem Hang Ngay"]
      ],
      fragrance: [
        ["Mui Huong Cuon Hut", "Thanh Lich De Dung", "Phu Hop Nhieu Hoan Canh"],
        ["Huong Thom Tinh Te", "Tao Dau An Rieng", "Thich Hop Lam Qua Tang"]
      ],
      beauty: [
        ["Duong Am Tu Nhien", "Cam Giac Mem Min", "Phu Hop Dung Hang Ngay"],
        ["Loi Ich Ro Rang", "De Them Vao Routine", "Dung Tai Nha Tien Loi"]
      ]
    }
  };
  return phrases[storeId]?.[profile.type] || phrases[storeId]?.beauty || phrases[7].beauty;
}

function productProfile(productName, notes = "") {
  const text = asciiOnly(`${productName} ${notes}`).toLowerCase();
  const clearLipProduct = /\b(?:lip|balm|rouge|loveshine|candy glow|tinted lip|son\s+(?:duong|moi|bong))\b/.test(text);
  const clearSkinCareProduct = /\b(?:foam cleanser|cleanser|face cleanser|soft clean|toner|lotion|serum|cream|creme|eye|hydrating|soothing|duong am|cap am|sua rua|rua mat|lam sach|thanh loc|nutritious|genifique|night repair|micro essence|estee|lancome|dalba|d alba|truffle)\b/.test(text);
  if (/\b(?:foam cleanser|face cleanser|cleanser|sua rua|rua mat|lam sach|thanh loc|nutritious 2-in-1 foam)\b/.test(text)) {
    return {
      type: "cleanser",
      benefits: [
        "- Lam sach sau bui ban, dau thua va tap chat tren be mat da.",
        "- Thanh loc lo chan long, ho tro can bang dau tren da.",
        "- Cap am nhe nha, giam cam giac kho cang sau khi rua mat.",
        "- Cong thuc diu nhe, phu hop su dung trong routine hang ngay."
      ],
      audience: [
        "- Phu hop da dau, da hon hop va da can lam sach moi ngay.",
        "- Phu hop nguoi thuong tiep xuc bui ban, nang nong hoac can lam sach sau khi ra ngoai."
      ],
      usage: [
        "- Lam uot mat, lay mot luong sua rua mat vua du ra long ban tay.",
        "- Tao bot voi nuoc, massage nhe nhang tren mat trong khoang 30 giay.",
        "- Rua sach hoan toan bang nuoc sach, sau do tiep tuc cac buoc duong da.",
        "- Co the dung buoi sang va buoi toi tuy nhu cau lam sach cua da."
      ]
    };
  }
  if (clearLipProduct) {
    return {
      type: "lip",
      benefits: [
        "- Duong am cho moi, giup moi mem hon va han che cam giac kho cang.",
        "- Tao hieu ung bong nhe, mau trong treo de dung hang ngay.",
        "- Chat son mong nhe, de dam lai, phu hop makeup tu nhien.",
        "- Thiet ke nho gon, tien mang theo khi di lam, di choi hoac du lich."
      ],
      audience: [
        "- Phu hop nguoi thich son duong co mau, moi bong nhe nhung khong qua dam.",
        "- Phu hop dung hang ngay, makeup nhanh va can lai moi nhieu lan."
      ],
      usage: [
        "- Thoa truc tiep len moi, co the lap them lop de tang do bong va mau.",
        "- Co the dung mot minh hoac phoi cung makeup nhe hang ngay."
      ]
    };
  }

  if (/\b(hair|toc|scalp|shampoo|serum fortifiant|kerastase)\b/.test(text)) {
    return {
      type: "hair",
      benefits: [
        "- Ho tro lam sach va cham soc toc theo nhu cau tung dong san pham.",
        "- Giup toc co cam giac nhe hon, mem hon va de vao nep sau khi su dung.",
        "- Ho tro cai thien cam giac kho yeu, roi xao hoac thieu suc song.",
        "- Phu hop dua vao routine cham soc toc hang ngay hoac hang tuan."
      ],
      audience: [
        "- Phu hop nguoi can cham soc toc tai nha voi san pham tien dung.",
        "- Phu hop toc de kho, de xao hoac can cam giac sach thoang hon."
      ],
      usage: [
        "- Su dung tren toc hoac da dau theo dung cong nang cua san pham.",
        "- Massage nhe neu can, sau do xa hoac de lai theo huong dan tung loai."
      ]
    };
  }

  if (/\b(skin|serum|cream|creme|lotion|toner|cleanser|clean|eye|hydrating|duong am|cap am|da|truffle|genifique|night repair|micro essence|soft clean|estee|lancome|dalba|d alba)\b/.test(text)) {
    return {
      type: "skincare",
      benefits: [
        "- Ho tro cap am, lam mem be mat da va giup da co cam giac de chiu hon.",
        "- Giup cham soc da hang ngay, ho tro duy tri ve ngoai rang ro va min mang.",
        "- Ket cau de tan, phu hop dung trong routine sang hoac toi tuy nhu cau.",
        "- Ho tro lam diu cam giac kho cang, giup lop duong tiep theo de bam hon."
      ],
      audience: [
        "- Phu hop nguoi can san pham cham soc da tien loi, de dung hang ngay.",
        "- Phu hop da can cap am, lam diu, hoac muon routine gon nhe hon."
      ],
      usage: [
        "- Su dung sau buoc lam sach, lay luong vua du va thoa deu len da.",
        "- Dung deu dan, ket hop kem duong hoac chong nang vao ban ngay neu can."
      ]
    };
  }

  if (/\b(blush|cheek|powder|compact|phan|ma hong|makeup)\b/.test(text)) {
    return {
      type: "makeup",
      benefits: [
        "- Mau len tu nhien, giup guong mat tuoi tan va co diem nhan hon.",
        "- Ket cau min, de tan tren da va de dieu chinh do dam nhat.",
        "- Phu hop makeup hang ngay, di lam, di choi hoac chup hinh.",
        "- Thiet ke sang, nho gon, tien mang theo trong tui trang diem."
      ],
      audience: [
        "- Phu hop nguoi thich lop makeup tu nhien, thanh lich, de dung.",
        "- Phu hop ca nguoi moi tap trang diem vi de tan va de kiem soat mau."
      ],
      usage: [
        "- Lay mot luong vua du bang co, tan nhe len go ma.",
        "- Co the lap nhieu lop mong de tang hieu ung mau theo nhu cau."
      ]
    };
  }

  if (/\b(perfume|parfum|fragrance|scent|libre|nuoc hoa)\b/.test(text)) {
    return {
      type: "fragrance",
      benefits: [
        "- Huong thom tao cam giac sang trong, phu hop dung hang ngay hoac di tiec.",
        "- Gop phan tang diem nhan ca nhan va giu cam giac tu tin.",
        "- Thiet ke chai dep, phu hop trung bay hoac lam qua tang.",
        "- Mui huong de phoi voi nhieu phong cach trang phuc va hoan canh."
      ],
      audience: [
        "- Phu hop nguoi thich mui huong thanh lich, hien dai va de dung.",
        "- Phu hop mua dung ca nhan hoac lam qua tang cao cap."
      ],
      usage: [
        "- Xit len co tay, sau tai hoac vung mach dap voi khoang cach vua phai.",
        "- Tranh xit truc tiep len mat, bao quan noi mat va tranh anh nang."
      ]
    };
  }

  return {
    type: "beauty",
    benefits: [
      "- Ho tro cham soc va cai thien be mat theo dac tinh cua san pham.",
      "- Ket cau de su dung, phu hop nhu cau lam dep hang ngay.",
      "- Giup lop finish trong dep hon, tao cam giac mem min va thoai mai.",
      "- Thiet ke phu hop lam qua tang hoac bo sung vao routine ca nhan."
    ],
    audience: [
      "- Phu hop khach can san pham lam dep tien loi, de mang theo.",
      "- Phu hop nguoi thich hieu ung tu nhien, gon gang, khong cau ky."
    ],
    usage: [
      "- Su dung tren vung can cham soc theo nhu cau.",
      "- Bao quan noi kho thoang, tranh anh nang truc tiep."
    ]
  };
}

function storageLines() {
  return [
    "- Bao quan noi kho thoang, tranh anh nang truc tiep va nhiet do cao.",
    "- Dong kin nap sau khi dung de giu ket cau san pham on dinh."
  ];
}

function storageForStore(storeId) {
  const storage = {
    7: [
      "- De noi kho thoang, tranh anh nang truc tiep va nguon nhiet cao.",
      "- Dong kin nap sau moi lan dung de giu san pham sach va on dinh."
    ],
    8: [
      "- Bao quan o nhiet do phong, khong de gan cua so co nang manh.",
      "- Lau sach mieng nap neu bi dinh san pham de han che bui bam."
    ],
    9: [
      "- Dat san pham dung chieu, noi thoang mat va tranh khu vuc qua am.",
      "- Luon dong nap sau khi dung de giu ket cau san pham on dinh."
    ]
  };
  return storage[storeId] || storageLines();
}

function benefitsForStore(profile, storeId) {
  if (profile.type === "cleanser") {
    const cleanserBenefits = {
      7: [
        "- Lam sach sau bui ban, dau thua va tap chat tren be mat da.",
        "- Thanh loc lo chan long, ho tro giup da sach thoang hon.",
        "- Cap am nhe nha, giup da mem min va giam cam giac kho cang sau khi rua mat.",
        "- Cong thuc diu nhe, phu hop lam sach hang ngay ma khong can thao tac cau ky."
      ],
      8: [
        "- Loai bo dau thua, bui ban va can trang diem nhe tren be mat da.",
        "- Thanh loc lo chan long, ho tro giam cam giac bi tac nghe do dau thua.",
        "- Giu da thoang mat sau khi rua, phu hop khu vuc vung T de bong dau.",
        "- Cong thuc 2 trong 1 diu nhe, khong lam da mat cam giac can bang tu nhien."
      ],
      9: [
        "- Lam sach nhe nha bui ban hang ngay, thanh loc da theo cach diu nhe.",
        "- Duong am co ban, giu cho da mem min va khong bi cang kho sau khi rua.",
        "- Ho tro lam diu be mat da, phu hop lam buoc lam sach dau tien moi ngay.",
        "- Cong thuc de dung, phu hop routine cham soc da don gian tai nha."
      ]
    };
    return cleanserBenefits[storeId] || cleanserBenefits[7];
  }
  const type = profile.type;
  const storeBenefits = {
    7: {
      lip: [
        "- Duong moi mem min, giup moi co cam giac am va de chiu hon.",
        "- Mau len trong treo, bong nhe, phu hop phong cach trang diem tu nhien.",
        "- Chat son mong, de dam lai trong ngay ma khong gay nang moi.",
        "- Thiet ke dep, tien mang theo khi di lam, di choi hoac du lich."
      ],
      skincare: [
        "- Cap am nhe nha, giup be mat da mem min va giam cam giac kho cang.",
        "- Ho tro lam diu da, tao cam giac tuoi moi sau moi lan su dung.",
        "- Ket cau de tan, phu hop dua vao routine cham soc da hang ngay.",
        "- Giup da trong rang ro hon, thich hop phong cach lam dep tu nhien."
      ],
      hair: [
        "- Ho tro cham soc toc mem hon, giam cam giac kho xao khi su dung deu.",
        "- Giup toc co cam giac nhe va de vao nep hon sau buoc cham soc.",
        "- Phu hop routine cham toc tai nha, de dung cho ngay ban ron.",
        "- Huong toi mai toc bong khoe tu nhien, mem mai khi cham vao."
      ],
      makeup: [
        "- Mau tan mem tren da, giup guong mat tuoi tan va tu nhien hon.",
        "- Do mau de dieu chinh, phu hop makeup hang ngay lan di choi.",
        "- Ket cau min, tao hieu ung sang nhe ma khong qua day.",
        "- Hop de mang theo, tien dam lai khi can hoan thien lop makeup."
      ],
      fragrance: [
        "- Mui huong thanh lich, tao cam giac nu tinh va hien dai.",
        "- Phu hop dung hang ngay, di lam, hen ho hoac lam qua tang.",
        "- Thiet ke chai sang, de trung bay tren ban trang diem.",
        "- Huong thom de phoi voi nhieu phong cach khac nhau."
      ],
      beauty: [
        "- Ho tro cham soc ca nhan nhe nha, phu hop nhu cau lam dep hang ngay.",
        "- Ket cau de su dung, tao cam giac mem min va thoai mai hon.",
        "- Hinh anh san pham thanh lich, phu hop mua dung hoac lam qua tang.",
        "- De them vao routine ca nhan ma khong can thao tac cau ky."
      ]
    },
    8: {
      lip: [
        "- Ho tro duong am moi, giup moi co do bong sach va hien dai.",
        "- Mau son nhe, de dung voi makeup nhanh cho ngay di lam hoac di choi.",
        "- Chat son tron muot, han che cam giac kho moi khi dung nhieu lan.",
        "- Bao bi gon sang, phu hop nguoi thich san pham de mang theo."
      ],
      skincare: [
        "- Ho tro bo sung do am, giup da trong mem va can bang hon sau lam sach.",
        "- Ket cau de hap thu, phu hop dung truoc cac buoc duong tiep theo.",
        "- Lam diu cam giac kho cang, cho be mat da co cam giac min hon.",
        "- Phu hop routine gon nhe, ro cong dung va de theo doi hieu qua."
      ],
      hair: [
        "- Lam sach hoac cham soc toc theo tung dong, giup toc de chiu hon.",
        "- Ho tro da dau thong thoang, cho mai toc co cam giac sach nhe.",
        "- Giam cam giac xao roi, giup toc de chai va de tao nep hon.",
        "- Phu hop nguoi muon routine cham toc don gian nhung ro cong nang."
      ],
      makeup: [
        "- Mau len ro nhung van tu nhien, de tao diem nhan cho guong mat.",
        "- Ket cau min, de tan deu va han che vet loang khi thao tac nhanh.",
        "- Phu hop nhieu tone makeup, tu nhe nha den thanh lich.",
        "- Bao bi sang, de chup anh san pham va mang theo trong tui."
      ],
      fragrance: [
        "- Huong thom co diem nhan, giup tang cam giac tu tin khi su dung.",
        "- Phu hop khach thich mui hien dai, gon gang va de dung.",
        "- Chai thiet ke dep, thich hop lam qua tang cao cap.",
        "- De dung cho nhieu hoan canh: di lam, di choi, gap go."
      ],
      beauty: [
        "- Tap trung vao cong nang ro rang, giup khach de hieu gia tri san pham.",
        "- Cam giac su dung gon sach, phu hop nhu cau lam dep moi ngay.",
        "- Thiet ke san pham cao cap, de tao niem tin khi lua chon.",
        "- Phu hop nguoi can mot mon lam dep tien loi va de bao quan."
      ]
    },
    9: {
      lip: [
        "- Moi mem hon va bong hon, de thay hieu ung ngay khi thoa.",
        "- Mau len nhe nha, giup guong mat tuoi hon ma khong can makeup cau ky.",
        "- Cam giac deo moi thoai mai, phu hop dung lai nhieu lan trong ngay.",
        "- Lua chon tien loi cho tui xach, ban lam viec hoac di du lich."
      ],
      skincare: [
        "- Giup da co cam giac am min nhanh, phu hop khi da thieu nuoc.",
        "- Ho tro lam diu va cai thien be mat da trong routine moi ngay.",
        "- Dung deu giup lop da nhin tuoi hon, mem hon va de trang diem hon.",
        "- Thich hop nguoi can san pham cham soc da don gian, de su dung."
      ],
      hair: [
        "- Toc co cam giac sach va nhe hon, giam tinh trang be xao kho chiu.",
        "- Ho tro cham soc soi toc, giup toc mem va de vao nep hon.",
        "- Phu hop toc can lam sach, can bang hoac bo sung cam giac mem muot.",
        "- De dua vao thoi quen cham soc toc tai nha cho ca nam va nu."
      ],
      makeup: [
        "- Tao mau tu nhien nhanh, giup guong mat co suc song hon.",
        "- De tan, de kiem soat do dam, phu hop ca nguoi moi makeup.",
        "- Hieu ung mem min giup lop trang diem trong gon gang hon.",
        "- Nho gon, thich hop mang theo de dam lai trong ngay."
      ],
      fragrance: [
        "- Mui huong cuon hut, giup co an tuong rieng khi gap go.",
        "- Phu hop dung hang ngay va nhung dip can hinh anh chi chu hon.",
        "- Thiet ke sang, de lam qua tang cho ban be hoac nguoi than.",
        "- Xit nhanh, de su dung truoc khi ra ngoai."
      ],
      beauty: [
        "- Loi ich de nhin thay khi su dung deu, phu hop nhu cau lam dep tai nha.",
        "- Giup san pham tro thanh lua chon nhanh cho routine hang ngay.",
        "- Mang lai cam giac gon gang, mem mai va de chiu khi su dung.",
        "- Phu hop khach muon san pham dep, tien loi va de mua nhanh."
      ]
    }
  };
  return storeBenefits[storeId]?.[type] || storeBenefits[storeId]?.beauty || profile.benefits;
}

function storeDetailFor(storeId) {
  if (storeId === "8") {
    return [
      "- Ket cau de tan deu, giup be mat da hoac toc co cam giac gon sach hon.",
      "- Sau khi dung, cam giac nhe mat, thoang hon va phu hop routine nhanh moi ngay."
    ];
  }
  if (storeId === "9") {
    return [
      "- Cam giac diu nhe, phu hop nguoi can cham soc don gian va de duy tri hang ngay.",
      "- Sau khi dung, be mat co cam giac mem min, de chiu va khong bi nang ne."
    ];
  }
  return [
    "- Ket cau nhe nha, de thao tac va khong tao cam giac kho chiu khi dung.",
    "- Sau khi dung, be mat co cam giac mem mai, tu nhien va gon gang hon."
  ];
}

function basePrompt(task, store, siblingStores = []) {
  const productName = task.productName || "the referenced product";
  return [
    `800x800 PNG Vietnamese Shopee ecommerce poster for ${productName}.`,
    "Keep the same product identity and packaging from reference images.",
    `Use target store style: ${store.style}.`,
    storeDifferentiationPrompt(store, siblingStores),
    imageReviewPrompt(task),
    "Integrated premium ecommerce poster, not pasted collage.",
    "Short readable buyer-facing Vietnamese/English text.",
    "No authenticity badge, Chinh hang, Ban hang chinh hang, Hang chinh hang, Cam ket, 100%, SKU, Doudou, or orange border."
  ].filter(Boolean).join(" ");
}

function storeDifferentiationPrompt(store, siblingStores = []) {
  const profile = STORE_DIFFERENTIATION_BY_ID[store.id] || {
    name: "store-specific",
    palette: store.style,
    composition: "use this store's watermark/frame reference as the layout cue",
    hook: "clear buyer-facing benefit hierarchy",
    avoid: "copying another selected store's visual system"
  };
  const siblingNames = siblingStores.map((item) => item.label).filter(Boolean);
  return [
    `Store differentiation profile: ${profile.name}.`,
    `Palette: ${profile.palette}.`,
    `Composition: ${profile.composition}.`,
    `Primary buyer hook: ${profile.hook}.`,
    `Avoid: ${profile.avoid}.`,
    siblingNames.length
      ? `Do not reuse the layout, palette, hero crop, or benefit hierarchy of ${siblingNames.join(" or ")}.`
      : "Keep this store visually distinct from other shops using the same product."
  ].join(" ");
}

function imageReviewPrompt(task) {
  const review = normalizeImageReview(task?.imageReview || {});
  if (review.status !== "needs_regeneration" && review.flags.length === 0) return "";
  const lines = ["Review-guided regeneration: address the previous manual review before creating this image."];
  if (review.flags.includes("layout_similar")) {
    lines.push("Change the composition, hero crop, product placement, and benefit hierarchy so this version is clearly different.");
  }
  if (review.flags.includes("color_similar")) {
    lines.push("Change the palette balance, background lighting, and accent usage while staying inside the target store visual profile.");
  }
  if (review.flags.includes("quality_issue")) {
    lines.push("Improve visual polish, text readability, product clarity, and overall ecommerce finish.");
  }
  if (review.flags.includes("wrong_product")) {
    lines.push("Prioritize exact product identity and packaging from source references; do not invent a different product.");
  }
  if (review.flags.length === 0) {
    lines.push("Create a visibly different version while keeping the product identity and target store profile.");
  }
  if (review.notes) lines.push(`Operator review note: ${review.notes}.`);
  return lines.join(" ");
}

function productPosterPrompt(task, store, siblingStores = []) {
  return [
    basePrompt(task, store, siblingStores),
    "Main product poster: brand and product name visible, product large, premium lighting, clear benefit bullets."
  ].join(" ");
}

function effectPosterPrompt(task, store, siblingStores = []) {
  return [
    basePrompt(task, store, siblingStores),
    "Effect poster: product plus realistic beauty result/usage scene, 3 concise benefit icons, integrated layout."
  ].join(" ");
}

function realPhotoPrompt(task, store, siblingStores = [], variant) {
  return [
    `800x800 PNG buyer-style real photo for ${task.productName || "the referenced product"}.`,
    "Keep same product and packaging, natural buyer photo, not official advertisement.",
    storeDifferentiationPrompt(store, siblingStores),
    imageReviewPrompt(task),
    variant === 1
      ? "Scene: handheld or vanity tabletop photo in natural indoor light."
      : "Scene: casual home desk or bathroom counter photo with a different angle and background.",
    "Keep the scene natural and avoid poster text, authenticity badge, SKU, or unrelated watermark."
  ].filter(Boolean).join(" ");
}


