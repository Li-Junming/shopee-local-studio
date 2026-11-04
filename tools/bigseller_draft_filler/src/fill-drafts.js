#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isCliEntrypoint, runCliWithCompletion } from "./cli-result.js";
import { resolveChromeLaunchOptions } from "./browser-runtime.js";

import { loadStoreAssets, fingerprintAssets } from "./assets.js";
import { loadConfig, parseArgs, printHelp } from "./config.js";
import { identifyStore, storeMatchesText } from "./stores.js";
import { selectCopyDialogStores, confirmCopyDialog, verifyCopiedDrafts } from "./copy-dialog.js";
export { selectCopyDialogStores, waitForCopyDraftDialog } from "./copy-dialog.js";

const TITLE_INPUT_INDEX = 0;
const PRODUCT_IMAGE_SECTION_TITLE = "产品图";
const ADD_LOCAL_IMAGE_TEXT = "从本地添加";
const DEFAULT_DRAFT_LIST_URL = "https://www.bigseller.pro/web/listing/shopee/index.htm?bsStatus=1";
const DEFAULT_ACTIVE_LIST_URL = "https://www.bigseller.pro/web/listing/shopee/active/index.htm?bsStatus=4";
const SOURCE_IMAGE_MANIFEST = "source-images.json";
const DEFAULT_STORE_COOLDOWN_MS = 15000;
const DEFAULT_SAVE_JOB_ATTEMPTS = 2;
const DEFAULT_SAVE_RETRY_COOLDOWN_MS = 30000;
const SEARCH_MODE_TRIGGER_SELECTOR = [
  "button",
  "a",
  "[role='button']",
  ".ant-select",
  ".ant-select-selector",
  ".ant-select-selection-item",
  ".el-select",
  ".el-select__wrapper",
  ".el-input-group__prepend",
  "span",
  "div"
].join(", ");
const SEARCH_MODE_OPTION_SELECTOR = [
  "li",
  "[role='option']",
  ".ant-select-item-option",
  ".ant-select-item-option-content",
  ".el-select-dropdown__item",
  "button",
  "a",
  "span",
  "div"
].join(", ");

function normalizeSearchModeText(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function normalizeSearchModeToken(text) {
  return normalizeSearchModeText(text)
    .replace(/[\s\p{P}\p{S}\uE000-\uF8FF]+/gu, "")
    .toLowerCase();
}

export function isSkuSearchModeText(text) {
  return normalizeSearchModeToken(text) === "sku";
}

export function isItemIdSearchModeText(text) {
  const normalized = normalizeSearchModeToken(text);
  return normalized === "itemid"
    || normalized === "\u5546\u54c1id"
    || normalized === "\u4ea7\u54c1id"
    || normalized === "\u8d27\u54c1id";
}

function isSearchModeCandidateText(text) {
  const normalized = normalizeSearchModeToken(text);
  return isSkuSearchModeText(normalized)
    || isItemIdSearchModeText(normalized)
    || normalized === "\u4ea7\u54c1\u540d\u79f0"
    || normalized === "\u5546\u54c1\u540d\u79f0"
    || normalized === "产品名称"
    || normalized === "商品名称"
    || normalized === "productname"
    || normalized === "itemname";
}

function searchModeOptionTextMatches(text, mode) {
  const normalized = normalizeSearchModeText(text);
  if (mode === "Item ID") {
    const compact = normalized.replace(/\s+/g, "").toLowerCase();
    return ["itemid", "itemiditemid", "\u5546\u54c1id", "\u5546\u54c1id\u5546\u54c1id", "\u4ea7\u54c1id", "\u4ea7\u54c1id\u4ea7\u54c1id", "\u8d27\u54c1id", "\u8d27\u54c1id\u8d27\u54c1id"].includes(compact);
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => /^sku$/i.test(token));
}

function verticalOverlapRatio(a, b) {
  const overlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return overlap / Math.max(1, Math.min(a.height, b.height));
}

export function chooseSearchModeTrigger(inputBox, candidates) {
  if (!inputBox) return null;
  const ranked = candidates
    .filter((candidate) => candidate?.box && isSearchModeCandidateText(candidate.text))
    .map((candidate) => {
      const box = candidate.box;
      const gap = inputBox.x - (box.x + box.width);
      const overlap = verticalOverlapRatio(inputBox, box);
      return { candidate, gap, overlap };
    })
    .filter(({ gap, overlap }) => gap >= -8 && gap <= 260 && overlap >= 0.45)
    .sort((a, b) => a.gap - b.gap || b.overlap - a.overlap);
  return ranked[0]?.candidate ?? null;
}

export function fallbackSearchModeTriggerBox(inputBox) {
  if (!inputBox
    || !Number.isFinite(inputBox.x)
    || !Number.isFinite(inputBox.y)
    || !Number.isFinite(inputBox.width)
    || !Number.isFinite(inputBox.height)) {
    return null;
  }

  const width = Math.round(Math.min(140, Math.max(80, inputBox.width * 0.28)) * 100) / 100;
  return {
    x: Math.round(Math.max(0, inputBox.x - width) * 100) / 100,
    y: inputBox.y,
    width,
    height: inputBox.height
  };
}

export function chooseSearchModeOption(triggerBox, options = [], mode = "SKU") {
  if (!triggerBox) return null;
  const ranked = options
    .filter((option) => option?.box && searchModeOptionTextMatches(option.text, mode))
    .map((option) => {
      const dx = Math.abs(option.box.x - triggerBox.x);
      const dy = Math.abs(option.box.y - (triggerBox.y + triggerBox.height));
      return { option, dx, dy };
    })
    .filter((candidate) => candidate.dx <= 420 && candidate.dy <= 520)
    .sort((a, b) => (a.dy + a.dx) - (b.dy + b.dx));
  return ranked[0]?.option ?? null;
}

export function normalizeSourceRowText(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 260);
}

export function rowMatchesSkuAndStore(rowText, skus, storeMatch) {
  const text = String(rowText || "");
  const wantedSkus = (Array.isArray(skus) ? skus : [])
    .map((sku) => String(sku).trim())
    .filter(Boolean);
  return storeMatchesText(text, storeMatch)
    && wantedSkus.some((sku) => text.includes(sku));
}

export function buildCopyDraftPlan({ draftRowTexts = [], skus = [], storeMap = [] } = {}) {
  const targets = [];
  const skipped = [];
  for (const store of storeMap) {
    const exists = draftRowTexts.some((rowText) => rowMatchesSkuAndStore(rowText, skus, store));
    if (exists) skipped.push(store);
    else targets.push(store);
  }
  return { targets, skipped };
}

export function chooseCopyToDraftControl(controls = [], rowBox = null) {
  const rowRightFallbackX = rowBox ? rowBox.x + rowBox.width * 0.85 : Number.POSITIVE_INFINITY;
  const scored = controls
    .map((control) => {
      const text = [control.text, control.aria, control.title].filter(Boolean).join(" ");
      const className = String(control.className || "");
      const centerX = control.box ? control.box.x + control.box.width / 2 : 0;
      const draftAction = /复制.*(?:草稿|draft)|copy.*draft|clone.*draft/i.test(text);
      const actionArea = centerX >= rowRightFallbackX || /action[_-]btn|product[_-]action/i.test(className);
      // SKU/Item-ID/URL clipboard controls also say "copy", especially on the
      // sold-out list. A generic copy icon is not proof of a draft action.
      if (control.visible === false || control.disabled || /复制.*(?:SKU|Item\s*ID|链接)|copy.*(?:sku|item\s*id|url|link)/i.test(text)
        || /sku[_-]?copy|copy[_-]?sku|clipboard/i.test(className)
        || (!draftAction && !actionArea)) return { control, score: 0, centerX };
      let score = 0;
      if (draftAction) score += 100;
      if (/\u590D\u5236|copy|clone/i.test(text)) score += 80;
      if (/\b(copy|clone)\b|copy-/i.test(className) && centerX >= rowRightFallbackX) score += 30;
      if (/\bsku\b|sku-/i.test(className) && !text) score -= 40;
      return { control, score, centerX };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.centerX - a.centerX);
  return scored[0]?.control ?? null;
}

export function chooseStatusTabControl(controls = [], label) {
  const wanted = String(label || "").replace(/\s+/g, "");
  return controls
    .filter((control) => {
      const text = String(control?.text || "").replace(/\s+/g, "");
      return text === wanted || text.startsWith(`${wanted}(`) || text.startsWith(`${wanted}\uFF08`);
    })
    .map((control) => ({
      control,
      area: Math.max(1, Number(control.box?.width || 0) * Number(control.box?.height || 0))
    }))
    .sort((a, b) => a.area - b.area)
    .map((item) => item.control)[0] ?? null;
}

export function buildSourceSearchAttempts({ skus = [], itemIds = [] } = {}) {
  const skuValues = [...new Set((Array.isArray(skus) ? skus : [])
    .map((value) => String(value).trim())
    .filter(Boolean))];
  const itemIdValues = [...new Set([
    ...skuValues,
    ...(Array.isArray(itemIds) ? itemIds : [])
  ]
    .map((value) => String(value).trim())
    .filter((value) => /^\d{8,20}$/.test(value)))];
  const attempts = [];
  if (skuValues.length) {
    attempts.push({ mode: "SKU", values: skuValues, soldOut: false });
    attempts.push({ mode: "SKU", values: skuValues, soldOut: true });
  }
  if (itemIdValues.length) {
    attempts.push({ mode: "Item ID", values: itemIdValues, soldOut: false });
    attempts.push({ mode: "Item ID", values: itemIdValues, soldOut: true });
  }
  return attempts;
}

function resolveFromConfig(config, maybeRelativePath) {
  if (path.isAbsolute(maybeRelativePath)) return maybeRelativePath;
  return path.resolve(config.baseDir, maybeRelativePath);
}

async function visibleInnerText(page) {
  await page.locator("body").waitFor({ state: "visible", timeout: 30000 });
  return page.locator("body").innerText({ timeout: 30000 });
}

function isHiddenBodyTimeout(error) {
  const message = String(error?.message || error || "");
  return /locator\.waitFor: Timeout/i.test(message)
    && /locator\('body'\)|locator\("body"\)|body/i.test(message)
    && /visible/i.test(message);
}

export async function openEditPageWithRetry(context, editUrl, { maxAttempts = 2, logger = console } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const page = await context.newPage();
    try {
      await page.goto(editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      const pageText = await visibleInnerText(page);
      return { page, pageText, attempt };
    } catch (error) {
      lastError = error;
      await page.close().catch(() => {});
      if (attempt >= maxAttempts || !isHiddenBodyTimeout(error)) throw error;
      logger.log(`[open] Page body stayed hidden; retrying edit page (${attempt + 1}/${maxAttempts}).`);
    }
  }
  throw lastError;
}

export function resolveEditUrlCandidate(candidate, baseUrl) {
  const value = String(candidate ?? "").trim();
  if (!value || value === "#" || /^javascript:/i.test(value)) return "";

  try {
    const url = new URL(value, baseUrl);
    if (!/^https?:$/.test(url.protocol)) return "";
    if (!/\/(?:web\/)?listing\/shopee\/(?:active\/)?edit\//i.test(url.pathname)) return "";
    return url.href;
  } catch {
    return "";
  }
}

export async function fillTitleAndDetail(page, assets) {
  await waitForVisibleFormField(page, 'input[type="text"]', TITLE_INPUT_INDEX);
  await waitForVisibleFormField(page, "textarea", 0);

  const textInputs = page.locator('input[type="text"]:visible');
  const inputCount = await textInputs.count();
  if (inputCount <= TITLE_INPUT_INDEX) {
    throw new Error("Could not find the product title text input.");
  }

  await textInputs.nth(TITLE_INPUT_INDEX).fill(assets.title, { timeout: 30000 });

  const textareas = page.locator("textarea:visible");
  const textareaCount = await textareas.count();
  if (textareaCount === 0) {
    throw new Error("Could not find the product detail textarea.");
  }

  await textareas.nth(0).fill(assets.detail, { timeout: 30000 });
}

async function waitForVisibleFormField(page, selector, index) {
  await page.waitForFunction(
    ({ selector: targetSelector, index: targetIndex }) => {
      const visible = (element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden"
          && style.display !== "none"
          && rect.width > 0
          && rect.height > 0;
      };
      return [...document.querySelectorAll(targetSelector)].filter(visible).length > targetIndex;
    },
    { selector, index },
    { timeout: 45000 }
  );
}

function productImageSection(page) {
  return page.locator(".page_edit_item").filter({
    has: page.locator(".title", { hasText: PRODUCT_IMAGE_SECTION_TITLE })
  }).first();
}

async function productImageCount(page) {
  return page.evaluate((sectionTitle) => {
    const sections = [...document.querySelectorAll(".page_edit_item")];
    const section = sections.find((candidate) => {
      const title = candidate.querySelector(".title");
      return title?.textContent?.includes(sectionTitle);
    });
    return section?.querySelectorAll(".page_edit_img_item.imgItem").length ?? 0;
  }, PRODUCT_IMAGE_SECTION_TITLE);
}

async function confirmDeleteIfNeeded(page) {
  const confirmButtons = page.locator(".ant-modal:visible button, .ant-popover:visible button").filter({ hasText: "确定" });
  const count = await confirmButtons.count();
  if (count > 0) {
    await confirmButtons.first().click({ timeout: 10000 });
  }
}

async function clearExistingProductImages(page) {
  const section = productImageSection(page);
  await section.waitFor({ state: "visible", timeout: 30000 });

  let remaining = await productImageCount(page);
  console.log(`[images] Existing product images: ${remaining}`);

  for (let i = 0; i < 20 && remaining > 0; i += 1) {
    const items = section.locator(".page_edit_img_item.imgItem");
    const itemCount = await items.count();
    if (itemCount === 0) break;

    const lastItem = items.nth(itemCount - 1);
    await lastItem.hover({ timeout: 10000 });
    const deleteButtons = lastItem.locator('[title="删除"]');
    const deleteCount = await deleteButtons.count();
    if (deleteCount === 0) {
      throw new Error("Could not find the delete button for an existing product image.");
    }

    await deleteButtons.first().click({ timeout: 10000, force: true });
    await confirmDeleteIfNeeded(page);
    await page.waitForFunction(
      ({ sectionTitle, previous }) => {
        const sections = [...document.querySelectorAll(".page_edit_item")];
        const section = sections.find((candidate) => {
          const title = candidate.querySelector(".title");
          return title?.textContent?.includes(sectionTitle);
        });
        const count = section?.querySelectorAll(".page_edit_img_item.imgItem").length ?? 0;
        return count < previous;
      },
      { sectionTitle: PRODUCT_IMAGE_SECTION_TITLE, previous: remaining },
      { timeout: 15000 }
    );
    remaining = await productImageCount(page);
  }

  if (remaining !== 0) {
    throw new Error(`Could not clear all old product images. Remaining: ${remaining}`);
  }

  console.log("[images] Cleared old product images.");
  await page.waitForTimeout(2000);
}

async function uploadProductImages(page, imagePaths, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts) || 2);
  const timeoutMs = Math.max(10000, Number(options.timeoutMs) || 60000);
  let uploaded = await productImageCount(page);
  for (const imagePath of imagePaths) {
    const expectedCount = uploaded + 1;
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await uploadSingleProductImage(page, imagePath, expectedCount, timeoutMs);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        await page.waitForTimeout(2000);
        const currentCount = await productImageCount(page).catch(() => uploaded);
        if (currentCount >= expectedCount) {
          lastError = null;
          break;
        }
        const notices = await page.evaluate(() => {
          const visible = (element) => {
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
          };
          return [...document.querySelectorAll(".ant-message, .ant-notification, .el-message, .el-notification, [role='alert'], .ant-modal, .el-dialog")]
            .filter(visible)
            .map((element) => (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim())
            .filter(Boolean)
            .slice(0, 8);
        }).catch(() => []);
        if (notices.length) {
          console.log(`[images] Upload page notices: ${notices.join(" | ")}`);
        }
        if (attempt === 1) {
          const screenshotPath = path.join(process.env.TEMP || process.cwd(), "bigseller-upload-timeout.png");
          await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
          console.log(`[images] Upload failure screenshot: ${screenshotPath}`);
        }
        if (isNonRetryableBigSellerError(error)) throw error;
        if (attempt < maxAttempts) {
          console.log(`[images] Upload retry ${attempt}/${maxAttempts - 1} for ${path.basename(imagePath)} after: ${String(error?.message || error).split("\n")[0]}`);
          await page.keyboard.press("Escape").catch(() => {});
        }
      }
    }
    if (lastError) throw lastError;
    uploaded = await productImageCount(page);
    await page.waitForTimeout(1500);
  }
  console.log(`[images] Uploaded ${imagePaths.length} product images.`);
}

export function saveProgressPath(configPath) {
  return `${path.resolve(configPath)}.save-progress.json`;
}

export function jobProgressKey(job) {
  return String(job?.editUrl || job?.name || "").trim();
}

export function completedSaveJobKeys(progress = {}, requiredVerificationVersion = 0) {
  return new Set((Array.isArray(progress.completedJobs) ? progress.completedJobs : [])
    .filter((entry) => !requiredVerificationVersion || Number(entry?.verificationVersion || 0) >= requiredVerificationVersion)
    .map((entry) => typeof entry === "string" ? entry : entry?.key || entry?.editUrl)
    .map((value) => String(value || "").trim())
    .filter(Boolean));
}

export function pendingSaveJobs(jobs = [], progress = {}, requiredVerificationVersion = 0, signatures = null) {
  const completed = completedSaveJobKeys(progress, requiredVerificationVersion);
  return jobs.filter((job) => {
    const jobKey = jobProgressKey(job);
    if (!completed.has(jobKey)) return true;
    return signatures && !(progress.completedJobs || []).some(entry => entry?.key === jobKey && entry?.assetSignature === signatures[jobKey]);
  });
}

export function bigSellerUploadBlockReason(payload = {}) {
  const message = String(payload?.msg || payload?.message || "").trim();
  if (Number(payload?.code) !== 0 && message) return message;
  if (Number(payload?.data?.hasImageSpace) === 0) {
    const used = payload?.data?.usedSizeStr;
    const allowed = payload?.data?.allowSizeStr;
    const sizeHint = used != null && allowed != null ? `（已用 ${used} MB / 额度 ${allowed} MB）` : "";
    return `BigSeller 素材中心空间不足${sizeHint}`;
  }
  return "";
}

export function isNonRetryableBigSellerError(error) {
  return /BigSeller blocked image upload|素材中心空间不足/i.test(String(error?.message || error || ""));
}

async function loadSaveProgress(configPath) {
  const progressPath = saveProgressPath(configPath);
  try {
    return JSON.parse(await readFile(progressPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { version: 1, completedJobs: [] };
    throw new Error(`Could not read save progress ${progressPath}: ${error.message}`);
  }
}

async function recordCompletedSaveJob(configPath, progress, job, verification = {}) {
  const key = jobProgressKey(job);
  const completedJobs = (Array.isArray(progress.completedJobs) ? progress.completedJobs : [])
    .filter((entry) => (typeof entry === 'string' ? entry : entry.key || entry.editUrl) !== key);
  if (!completedSaveJobKeys({ completedJobs }).has(key)) {
    completedJobs.push({
      key,
      name: job.name ?? "",
      editUrl: job.editUrl ?? "",
      savedAt: new Date().toISOString(),
      ...verification
    });
  }
  progress.version = 1;
  progress.completedJobs = completedJobs;
  progress.updatedAt = new Date().toISOString();
  const progressPath = saveProgressPath(configPath);
  await writeFile(progressPath, `${JSON.stringify(progress, null, 2)}\n`, "utf8");
  console.log(`[progress] Saved checkpoint: ${job.name ?? key}`);
}

async function uploadSingleProductImage(page, imagePath, expectedCount, timeoutMs = 60000) {
  const section = productImageSection(page);
  const networkEvents = [];
  const networkDetailPromises = [];
  let resolveUploadBlock;
  const uploadBlockPromise = new Promise((resolve) => {
    resolveUploadBlock = resolve;
  });
  const pushNetworkEvent = (value) => {
    if (networkEvents.length < 12) networkEvents.push(value);
  };
  const safeRequestPath = (rawUrl) => {
    try {
      const url = new URL(rawUrl);
      return `${url.hostname}${url.pathname}`;
    } catch {
      return "(invalid upload URL)";
    }
  };
  const safeStatusFields = (value, prefix = "", output = []) => {
    if (!value || typeof value !== "object" || output.length >= 16) return output;
    for (const [key, child] of Object.entries(value)) {
      if (output.length >= 16) break;
      const field = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === "object") {
        safeStatusFields(child, field, output);
      } else if (/code|success|message|msg|space|capacity|size|count|limit|used|remain|available|total/i.test(key)) {
        output.push(`${field}=${String(child).slice(0, 160)}`);
      }
    }
    return output;
  };
  const onResponse = (response) => {
    const request = response.request();
    const method = request.method().toUpperCase();
    if (["POST", "PUT", "PATCH"].includes(method) || response.status() >= 400) {
      pushNetworkEvent(`${method} ${response.status()} ${safeRequestPath(response.url())}`);
    }
    if (/\/api\/v1\/image\/(?:getUploadInfoAndCheckSpace|getAlbumUserSummary)\.json/i.test(response.url())) {
      networkDetailPromises.push(response.json()
        .then((body) => {
          const fields = safeStatusFields(body);
          if (fields.length) pushNetworkEvent(`DETAIL ${safeRequestPath(response.url())}: ${fields.join(", ")}`);
          const reason = bigSellerUploadBlockReason(body);
          if (reason) resolveUploadBlock(reason);
        })
        .catch(() => {}));
    }
  };
  const onRequestFailed = (request) => {
    const method = request.method().toUpperCase();
    if (["POST", "PUT", "PATCH"].includes(method)) {
      pushNetworkEvent(`${method} FAILED ${safeRequestPath(request.url())}: ${request.failure()?.errorText || "unknown"}`);
    }
  };
  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);

  try {
    const chooseButtons = section.locator('[autoid="select_images_button"]');
    const chooseButtonCount = await chooseButtons.count();
    if (chooseButtonCount === 0) {
      throw new Error("Could not find the product image selection button.");
    }

    await chooseButtons.first().click({ timeout: 10000 });

    const localOptions = page.getByText(ADD_LOCAL_IMAGE_TEXT, { exact: true });
    const localOptionCount = await localOptions.count();
    if (localOptionCount === 0) {
      throw new Error(`Could not find the "${ADD_LOCAL_IMAGE_TEXT}" image upload option.`);
    }

    const fileChooserPromise = page.waitForEvent("filechooser", { timeout: 15000 });
    await localOptions.first().click({ timeout: 10000 });
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([imagePath], { timeout: 60000 });
    await Promise.race([
      page.waitForFunction(
        ({ sectionTitle, expected }) => {
          const sections = [...document.querySelectorAll(".page_edit_item")];
          const section = sections.find((candidate) => {
            const title = candidate.querySelector(".title");
            return title?.textContent?.includes(sectionTitle);
          });
          const count = section?.querySelectorAll(".page_edit_img_item.imgItem").length ?? 0;
          return count >= expected;
        },
        { sectionTitle: PRODUCT_IMAGE_SECTION_TITLE, expected: expectedCount },
        { timeout: timeoutMs }
      ),
      uploadBlockPromise.then((reason) => {
        throw new Error(`BigSeller blocked image upload: ${reason}`);
      })
    ]);
  } catch (error) {
    await Promise.allSettled(networkDetailPromises);
    const networkSummary = networkEvents.length
      ? networkEvents.join(" | ")
      : "no POST/PUT/PATCH upload request or error response observed";
    throw new Error(`${error.message}\nUpload network: ${networkSummary}`);
  } finally {
    page.off("response", onResponse);
    page.off("requestfailed", onRequestFailed);
  }
}

async function clickWhiteSaveButton(page) {
  const clicked = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")];
    const saveButton = buttons.find((button) => {
      const normalizedText = (button.innerText || "").replace(/\s+/g, "");
      const className = String(button.className || "");
      return normalizedText === "保存" && !className.includes("ant-btn-primary") && !button.disabled;
    });
    if (!saveButton) return false;
    saveButton.click();
    return true;
  });

  if (!clicked) throw new Error("Could not find the white 保存 button.");
}

async function waitAfterPotentialUpload(page) {
  await page.waitForTimeout(1000);
}

export function visibleCharacterLength(value) {
  return Array.from(String(value ?? "")).length;
}

export function formatAssetSummary(assets) {
  const title = String(assets.title ?? "");
  const detail = String(assets.detail ?? "");
  const images = Array.isArray(assets.images) ? assets.images : [];
  return `[assets] titleVisible=${visibleCharacterLength(title)} chars, titleJs=${title.length} chars, detail=${detail.length} chars, images=${images.length}`;
}

export async function waitForSaveFeedback(page, options = {}) {
  const timeoutMs = options.timeoutMs ?? 12000;
  const fallbackMs = options.fallbackMs ?? 3000;

  try {
    await page.waitForFunction(
      () => {
        const text = String(document.body?.innerText || "").replace(/\s+/g, "");
        return /保存成功|已保存|操作成功|success/i.test(text);
      },
      null,
      { timeout: timeoutMs }
    );
    await page.waitForTimeout(500);
    return "confirmed";
  } catch {
    await page.waitForTimeout(fallbackMs);
    return "settled";
  }
}

export function shouldSkipImageUpload(config = {}, job = {}) {
  if (Object.hasOwn(job, "skipImages")) return Boolean(job.skipImages);
  return Boolean(config.skipImages);
}

async function waitForLogin(context, targetUrl) {
  const page = await context.newPage();
  console.log("[login] Opening BigSeller login in the automation Chrome profile.");
  console.log("[login] Please sign in in the opened Chrome window. This process will continue after login.");
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(3000);
    const url = page.url();
    const title = await page.title().catch(() => "");
    if (!url.includes("/login") && !title.includes("登录")) {
      console.log(`[login] Logged in. Current page: ${url}`);
      return;
    }
  }

  throw new Error("Timed out waiting for BigSeller login.");
}

export function buildDiscoveredOutputConfig(config, jobs) {
  return {
    browser: config.browser,
    storeMap: config.storeMap,
    verifySavedText: config.verifySavedText,
    verifySavedImages: config.verifySavedImages,
    requiredImageCount: config.requiredImageCount,
    requiredSaveVerificationVersion: config.requiredSaveVerificationVersion,
    storeCooldownMs: config.storeCooldownMs,
    saveJobAttempts: config.saveJobAttempts,
    jobs
  };
}

export async function findDraftRowIndex(page, skus, storeMatch) {
  const rows = await productRowTexts(page);
  return rows.findIndex((text) => rowMatchesSkuAndStore(text, skus, storeMatch));
}

async function neutralizeBigSellerFeedbackPanel(page) {
  return page.evaluate(() => {
    const promptText = "目前的功能是否已经满足您的需求";
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const panel = [...document.querySelectorAll(".right_nav_menu")]
      .find((element) => visible(element) && (element.innerText || element.textContent || "").includes(promptText));
    if (!panel) return false;

    for (const element of [panel, ...panel.querySelectorAll("*")]) {
      element.style.setProperty("pointer-events", "none", "important");
    }
    return true;
  }).catch(() => false);
}

async function openEditUrlFromRow(context, listPage, rowIndex, returnUrl = DEFAULT_DRAFT_LIST_URL) {
  const editButton = listPage.locator("tr.product_native_row").nth(rowIndex).locator([
    "a.action_btn.addEditProduct",
    "a[href*='/web/listing/shopee/edit/']",
    "a[href*='/listing/shopee/edit/']"
  ].join(", ")).first();
  const editButtonCount = await editButton.count();
  if (editButtonCount === 0) throw new Error(`Could not find edit button in draft row index ${rowIndex}.`);

  const rawHref = await editButton.getAttribute("href").catch(() => "");
  const directUrl = resolveEditUrlCandidate(rawHref, listPage.url());
  if (directUrl) return directUrl;
  console.log(`[source] Edit action href was not directly usable: ${rawHref || "(empty)"}`);

  await editButton.scrollIntoViewIfNeeded({ timeout: 10000 });
  const feedbackPanelNeutralized = await neutralizeBigSellerFeedbackPanel(listPage);
  if (feedbackPanelNeutralized) {
    console.log("[source] Neutralized the BigSeller feedback panel before opening the matched edit action.");
  }
  const newPagePromise = context.waitForEvent("page", { timeout: 10000 }).catch(() => null);
  const samePagePromise = listPage.waitForURL(/\/(?:web\/)?listing\/shopee\/(?:active\/)?edit\//, { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  await editButton.click({ timeout: 10000 });

  const newPage = await newPagePromise;
  if (newPage) {
    await newPage.waitForURL(/\/(?:web\/)?listing\/shopee\/(?:active\/)?edit\//, { timeout: 15000 }).catch(() => {});
    await newPage.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
    const editUrl = resolveEditUrlCandidate(newPage.url(), listPage.url());
    if (!editUrl) console.log(`[source] New edit window URL was not recognized: ${newPage.url() || "(empty)"}`);
    await newPage.close().catch(() => {});
    if (editUrl) return editUrl;
  }

  if (await samePagePromise) {
    const editUrl = resolveEditUrlCandidate(listPage.url(), returnUrl);
    if (!editUrl) console.log(`[source] Same-page edit URL was not recognized: ${listPage.url() || "(empty)"}`);
    await listPage.goto(returnUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await listPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    if (editUrl) return editUrl;
  }

  const missedEditPage = context.pages().find((page) => (
    page !== listPage && Boolean(resolveEditUrlCandidate(page.url(), listPage.url()))
  ));
  if (missedEditPage) {
    const editUrl = resolveEditUrlCandidate(missedEditPage.url(), listPage.url());
    console.log(`[source] Recovered edit URL from an already-opened BigSeller page: ${editUrl}`);
    await missedEditPage.close().catch(() => {});
    return editUrl;
  }

  throw new Error(`Clicking draft row index ${rowIndex} did not produce a valid BigSeller edit URL.`);
}

export async function findSourceRowIndex(page, skus, sourceStoreMatch) {
  const rows = await productRowTexts(page);
  return rows.findIndex((text) => sourceStoreMatch
    ? rowMatchesSkuAndStore(text, skus, sourceStoreMatch)
    : skus.some((sku) => text.includes(String(sku))));
}

async function productRowTexts(page) {
  return page.evaluate(() => {
    const primaryRows = [...document.querySelectorAll("tr.product_native_row")];
    const fallbackRows = [...document.querySelectorAll("tbody tr, [role=\'row\']")]
      .filter((row) => (row.innerText || "").trim() && row.querySelector("td, [role=\'cell\'], img, a"));
    const rows = primaryRows.length ? primaryRows : fallbackRows;
    return rows.map((row) => row.innerText || "");
  });
}

async function waitForSkuRowOnCurrentPage(page, skus, sourceStoreMatch, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let rowIndex = await findSourceRowIndex(page, skus, sourceStoreMatch);
    if (rowIndex >= 0) return rowIndex;
    await page.waitForTimeout(600);
  }
  return -1;
}

async function sourceRowTextAt(page, rowIndex) {
  return page.evaluate((index) => {
    const primaryRows = [...document.querySelectorAll("tr.product_native_row")];
    const fallbackRows = [...document.querySelectorAll("tbody tr, [role='row']")]
      .filter((row) => {
        const rowText = row.innerText || "";
        return rowText.trim() && row.querySelector("td, [role='cell'], img, a");
      });
    const rows = primaryRows.length ? primaryRows : fallbackRows;
    return rows[index]?.innerText || "";
  }, rowIndex).then(normalizeSourceRowText).catch(() => "");
}

async function visibleProductRowTexts(page) {
  return page.evaluate(() => {
    const primaryRows = [...document.querySelectorAll("tr.product_native_row")];
    const fallbackRows = [...document.querySelectorAll("tbody tr, [role='row']")]
      .filter((row) => {
        const rowText = row.innerText || "";
        return rowText.trim() && row.querySelector("td, [role='cell'], img, a");
      });
    const rows = primaryRows.length ? primaryRows : fallbackRows;
    return rows.map((row) => row.innerText || "").filter(Boolean);
  }).catch(() => []);
}

async function clickSoldOutTab(page) {
  const snapshot = await page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    return [...document.querySelectorAll("button, a, span, div, li, [role='tab']")]
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        return {
          index,
          text: (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim(),
          box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          visible: visible(element)
        };
      })
      .filter((control) => control.visible && control.text && control.text.length <= 80);
  }).catch(() => []);
  const tab = chooseStatusTabControl(snapshot, "\u552e\u5b8c");
  const clicked = tab ? await page.evaluate(({ index }) => {
    const elements = [...document.querySelectorAll("button, a, span, div, li, [role='tab']")];
    const element = elements[index];
    if (!element) return false;
    element.click();
    return true;
  }, { index: tab.index }).catch(() => false) : false;
  if (clicked) {
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    console.log("[source] Switched to sold-out tab.");
  } else {
    console.log("[source] Could not click sold-out tab; continuing on current active-list tab.");
  }
  return clicked;
}

async function searchSourceRowBySkuGroup(page, listUrl, skus, sourceStoreMatch, { itemIds = [] } = {}) {
  const attempts = buildSourceSearchAttempts({ skus, itemIds });
  for (const attempt of attempts) {
    for (const value of attempt.values) {
      const tabLabel = attempt.soldOut ? " sold-out" : "";
      console.log(`[source] Searching active${tabLabel} list by ${attempt.mode} "${value}".`);
      await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      if (attempt.soldOut) {
        await clickSoldOutTab(page);
      }

      let rowIndex = await waitForSkuRowOnCurrentPage(page, attempt.values, sourceStoreMatch, 3000);
      if (rowIndex >= 0) return rowIndex;

      const searched = await searchVisibleInputs(page, value, { mode: attempt.mode, matchValues: attempt.values });
      if (!searched) {
        console.log("[source] Could not find a visible search input; staying on the current list page.");
      }

      rowIndex = await waitForSkuRowOnCurrentPage(page, attempt.values, sourceStoreMatch, 10000);
      if (rowIndex >= 0) return rowIndex;
    }
  }

  return -1;
}

export async function clickCopyToDraftFromRow(page, rowIndex) {
  const snapshot = await page.evaluate(({ rowIndex: targetIndex }) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const primaryRows = [...document.querySelectorAll("tr.product_native_row")];
    const fallbackRows = [...document.querySelectorAll("tbody tr, [role='row']")]
      .filter((row) => (row.innerText || "").trim() && row.querySelector("td, [role='cell'], img, a"));
    const rows = primaryRows.length ? primaryRows : fallbackRows;
    const row = rows[targetIndex];
    if (!row) return null;
    const candidates = [...row.querySelectorAll("button, a, i, span, svg, [role='button']")];
    const rowRect = row.getBoundingClientRect();
    return {
      rowSelector: primaryRows.length ? "tr.product_native_row" : "tbody tr, [role='row']",
      rowLocatorIndex: primaryRows.length ? targetIndex : [...document.querySelectorAll("tbody tr, [role='row']")].indexOf(row),
      rowBox: { x: rowRect.x, y: rowRect.y, width: rowRect.width, height: rowRect.height },
      controls: candidates
        .map((element, index) => {
          const rect = element.getBoundingClientRect();
          return {
            index,
            text: (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim(),
            aria: element.getAttribute("aria-label") || "",
            title: element.getAttribute("title") || element.getAttribute("data-original-title") || element.getAttribute("data-title") || "",
            className: element.getAttribute("class") || "",
            disabled: Boolean(element.disabled) || element.getAttribute("aria-disabled") === "true",
            visible: visible(element),
            box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
          };
        })
        .filter((control) => control.visible)
    };
  }, { rowIndex });

  const copyControl = chooseCopyToDraftControl(snapshot?.controls ?? [], snapshot?.rowBox ?? null);
  if (!copyControl) {
    throw new Error(`Could not find a safe copy-to-draft action in source row index ${rowIndex}; SKU/Item ID clipboard controls are excluded. No copy was submitted.`);
  }

  const control = page.locator(snapshot.rowSelector).nth(snapshot.rowLocatorIndex)
    .locator("button, a, i, span, svg, [role='button']").nth(copyControl.index);
  const feedbackPanelNeutralized = await neutralizeBigSellerFeedbackPanel(page);
  if (feedbackPanelNeutralized) console.log("[copy] Neutralized the known BigSeller feedback panel.");
  console.log(`[copy] Opening row ${rowIndex} draft action: ${String(copyControl.title || copyControl.aria || copyControl.text || copyControl.className).slice(0, 120)}`);
  await control.scrollIntoViewIfNeeded({ timeout: 10000 });
  // A real click checks visibility, overlays and hit-testing instead of silently
  // dispatching a JS click on a stale/covered icon. Never force or double-click.
  await control.click({ timeout: 10000 });
}


async function visibleSearchInputIndexes(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width >= 20 && rect.height >= 12 && style.visibility !== "hidden" && style.display !== "none" && rect.bottom > 0 && rect.top < window.innerHeight;
    };
    return [...document.querySelectorAll("input, textarea, [contenteditable='true']")]
      .map((input, index) => {
        const containerText = input.closest("form, tr, .ant-row, .el-row, .search, .filter, .search-item, .filter-item, .ant-form-item, .form-item")?.innerText
          || input.parentElement?.innerText
          || "";
        const text = [
          input.placeholder,
          input.getAttribute("aria-label"),
          input.getAttribute("name"),
          input.getAttribute("id"),
          input.getAttribute("role"),
          input.getAttribute("class"),
          input.closest("label, .ant-form-item, .form-item, .search-item, .filter-item")?.textContent,
          containerText
        ].filter(Boolean).join(" ");
        return {
          index,
          text,
          type: String(input.type || "text").toLowerCase(),
          disabled: input.disabled || input.readOnly,
          visible: visible(input)
        };
      })
      .filter((item) => item.visible && !item.disabled && !["checkbox", "radio", "file", "hidden"].includes(item.type))
      .sort((a, b) => {
        const rank = (item) => {
          if (/sku|skuid/i.test(item.text)) return 0;
          if (/\u641C\u7D22|search|filter|query/i.test(item.text)) return 1;
          if (/product|item|name|code|\u5546\u54C1|\u4EA7\u54C1/i.test(item.text)) return 2;
          if (/搜索|search|filter|query/i.test(item.text)) return 1;
          if (/product|item|name|code|商品|产品|產品/i.test(item.text)) return 2;
          if (/date|time|price|库存|价格|日期|时间/i.test(item.text)) return 5;
          return 3;
        };
        return rank(a) - rank(b);
      })
      .slice(0, 20)
      .map((item) => item.index);
  });
}

async function searchVisibleInputs(page, value, { mode = "SKU", matchValues = [value] } = {}) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }).catch(() => {});
  await page.waitForTimeout(500);

  const inputIndexes = await visibleSearchInputIndexes(page);
  console.log(`[source] Visible input candidates: ${inputIndexes.length}.`);

  for (const initialIndex of inputIndexes) {
    await ensureSearchMode(page, initialIndex, mode);
    await page.waitForTimeout(400);
    const refreshedIndexes = await visibleSearchInputIndexes(page).catch(() => []);
    const index = refreshedIndexes[0] ?? initialIndex;
    const input = page.locator("input, textarea, [contenteditable='true']").nth(index);
    await input.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    await input.click({ timeout: 5000 }).catch(() => {});
    await input.fill("", { timeout: 5000 }).catch(async () => {
      await page.keyboard.press("Control+A").catch(() => {});
      await page.keyboard.press("Backspace").catch(() => {});
    });
    await input.fill(value, { timeout: 5000 }).catch(async () => {
      await page.keyboard.type(value).catch(() => {});
    });
    await input.press("Enter", { timeout: 5000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);

    if ((await findSourceRowIndex(page, matchValues, "")) >= 0) return true;

    await clickSearchButtonNearInput(page, index) || await clickSearchButton(page);
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    if ((await findSourceRowIndex(page, matchValues, "")) >= 0) return true;
  }

  return false;
}

async function ensureSkuSearchMode(page, inputIndex) {
  return ensureSearchMode(page, inputIndex, "SKU");
}

async function ensureSearchMode(page, inputIndex, mode) {
  const layout = await page.evaluate(({ inputIndex: targetIndex, selector }) => {
    const inputs = [...document.querySelectorAll("input, textarea, [contenteditable='true']")];
    const input = inputs[targetIndex];
    if (!input) return null;

    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const toBox = (rect) => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    });
    const textOf = (element) => [
      element.innerText,
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title")
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

    const elements = [...document.querySelectorAll(selector)];
    const candidates = elements
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => visible(element))
      .map(({ element, index }) => ({
        index,
        text: textOf(element),
        box: toBox(element.getBoundingClientRect())
      }))
      .filter((candidate) => candidate.text && candidate.text.length <= 40);

    return {
      inputBox: toBox(input.getBoundingClientRect()),
      candidates
    };
  }, { inputIndex, selector: SEARCH_MODE_TRIGGER_SELECTOR }).catch(() => null);

  const trigger = chooseSearchModeTrigger(layout?.inputBox, layout?.candidates ?? []);
  if (trigger && searchModeTextMatches(trigger.text, mode)) return true;

  const triggerBox = trigger?.box ?? fallbackSearchModeTriggerBox(layout?.inputBox);
  if (!triggerBox) return false;

  let clicked;
  if (trigger) {
    console.log(`[source] Switching search type "${trigger.text}" to ${mode}.`);
    clicked = await page.locator(SEARCH_MODE_TRIGGER_SELECTOR).nth(trigger.index).click({ timeout: 5000 })
      .then(() => true)
      .catch(() => false);
  } else {
    console.log(`[source] Switching search type by position to ${mode}.`);
    clicked = await page.mouse.click(
      triggerBox.x + (triggerBox.width / 2),
      triggerBox.y + (triggerBox.height / 2)
    ).then(() => true).catch(() => false);
  }
  if (!clicked) return false;

  await page.waitForTimeout(300);
  return clickNearestSearchModeOption(page, triggerBox, mode);
}

async function clickNearestSkuOption(page, triggerBox) {
  return clickNearestSearchModeOption(page, triggerBox, "SKU");
}

function searchModeTextMatches(text, mode) {
  return mode === "Item ID" ? isItemIdSearchModeText(text) : isSkuSearchModeText(text);
}

async function clickNearestSearchModeOption(page, triggerBox, mode) {
  const options = await page.evaluate(({ selector }) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const toBox = (rect) => ({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    });
    const textOf = (element) => [
      element.innerText,
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title")
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    return [...document.querySelectorAll(selector)]
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => visible(element))
      .map(({ element, index }) => ({
        index,
        text: textOf(element),
        box: toBox(element.getBoundingClientRect())
      }))
      .filter((option) => option.text && option.text.length <= 80);
  }, { selector: SEARCH_MODE_OPTION_SELECTOR }).catch(() => []);

  const optionIndex = chooseSearchModeOption(triggerBox, options, mode)?.index ?? -1;

  if (optionIndex < 0) return false;
  return page.locator(SEARCH_MODE_OPTION_SELECTOR).nth(optionIndex).click({ timeout: 5000 })
    .then(async () => {
      await page.waitForTimeout(300);
      return true;
    })
    .catch(() => false);
}

async function clickSearchButtonNearInput(page, inputIndex) {
  return page.evaluate(({ inputIndex: targetIndex }) => {
    const inputs = [...document.querySelectorAll("input, textarea, [contenteditable='true']")];
    const input = inputs[targetIndex];
    if (!input) return false;
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const isSearchControl = (element) => {
      const text = [
        element.innerText,
        element.textContent,
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.getAttribute("class")
      ].filter(Boolean).join(" ").replace(/\s+/g, "");
      if (/\u641C\u7D22/.test(text)) return true;
      return /搜索|search|magnifier|icon-search|el-icon-search|anticon-search/i.test(text);
    };

    let root = input.parentElement;
    for (let depth = 0; root && depth < 6; depth += 1, root = root.parentElement) {
      const controls = [...root.querySelectorAll("button, a, [role='button'], i, span")].filter((element) => element !== input);
      const control = controls.find((element) => visible(element) && isSearchControl(element));
      if (control) {
        control.click();
        return true;
      }
    }
    return false;
  }, { inputIndex }).catch(() => false);
}

async function clickSearchButton(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const labels = ["搜索", "search", "Search", "sku", "item", "product", "filter", "query"];
    const controls = [...document.querySelectorAll("button, a, [role='button']")];
    const control = controls.find((element) => {
      const text = [
        element.innerText,
        element.textContent,
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.getAttribute("class")
      ].filter(Boolean).join(" ").replace(/\s+/g, "");
      return visible(element) && !element.disabled && (
        labels.some((label) => text.includes(label)) ||
        /search|magnifier|icon-search|el-icon-search|anticon-search/i.test(text)
      );
    });
    if (!control) return false;
    control.click();
    return true;
  }).catch(() => false);
}

async function collectProductImageUrls(page, limit = 9) {
  return page.evaluate(({ limit: maxImages }) => {
    const sectionTitles = ["product", "image", "gallery", "photo", "picture"];
    const sections = [...document.querySelectorAll(".page_edit_item")];
    const section = sections.find((candidate) => {
      const title = candidate.querySelector(".title");
      const text = title?.textContent || "";
      return sectionTitles.some((sectionTitle) => text.includes(sectionTitle));
    }) || document;

    const urls = [];
    const seen = new Set();
    for (const image of [...section.querySelectorAll("img")]) {
      const rect = image.getBoundingClientRect();
      const src = image.currentSrc || image.src || image.getAttribute("src") || "";
      if (!src || seen.has(src)) continue;
      if ((image.naturalWidth || rect.width) < 80 || (image.naturalHeight || rect.height) < 80) continue;
      if (/\.svg(?:\?|$)/i.test(src)) continue;
      seen.add(src);
      urls.push(src);
      if (urls.length >= maxImages) break;
    }
    return urls;
  }, { limit });
}

async function collectSourceListingText(page) {
  const title = await page.locator('input[type="text"]:visible').nth(TITLE_INPUT_INDEX).inputValue({ timeout: 10000 }).catch(() => "");
  const detail = await page.locator("textarea:visible").nth(0).inputValue({ timeout: 10000 }).catch(() => "");
  return {
    sourceTitle: String(title || "").trim(),
    sourceDetail: String(detail || "").trim()
  };
}

async function downloadImageUrl(page, url, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  if (url.startsWith("data:")) {
    const match = url.match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i);
    if (!match) throw new Error("Unsupported data URL image.");
    await writeFile(outputPath, Buffer.from(match[2], "base64"));
    return;
  }

  const response = await page.request.get(url, { timeout: 60000 });
  if (!response.ok()) {
    throw new Error(`Could not download source image ${url}: HTTP ${response.status()}`);
  }
  await writeFile(outputPath, await response.body());
}

function extensionFromUrl(url) {
  const clean = String(url).split("?")[0].toLowerCase();
  if (clean.endsWith(".png")) return ".png";
  if (clean.endsWith(".webp")) return ".webp";
  if (clean.endsWith(".jpeg")) return ".jpg";
  return ".jpg";
}

async function downloadSourceImagesFromSkuGroups(context, config, outDirArg) {
  if (!Array.isArray(config.sourceJobs) || config.sourceJobs.length === 0) {
    throw new Error("Config must contain sourceJobs when using --source.");
  }

  const listUrl = config.sourceListUrl ?? DEFAULT_ACTIVE_LIST_URL;
  const listPage = await context.newPage();
  await listPage.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await listPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  for (const product of config.sourceJobs) {
    if (!Array.isArray(product.skus) || product.skus.length === 0) {
      throw new Error(`Source job "${product.name ?? "(unnamed)"}" must contain at least one SKU.`);
    }

    const outDir = resolveFromConfig(config, product.outDir ?? outDirArg);
    const sourceStoreMatch = product.sourceStoreMatch ?? config.sourceStoreMatch ?? "1店";
    let rowIndex = await findSourceRowIndex(listPage, product.skus, sourceStoreMatch);
    if (rowIndex < 0) {
      rowIndex = await searchSourceRowBySkuGroup(listPage, listUrl, product.skus, sourceStoreMatch);
    }
    if (rowIndex < 0) {
      throw new Error(`No source row matched SKU group [${product.skus.join(", ")}]. Make sure the 1-store active listing is online and searchable in BigSeller, or provide source image paths manually.`);
    }

    const sourceRowText = await sourceRowTextAt(listPage, rowIndex);
    const editUrl = await openEditUrlFromRow(context, listPage, rowIndex, listUrl);
    const editPage = await context.newPage();
    await editPage.goto(editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await editPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    const sourceListing = await collectSourceListingText(editPage);
    const urls = await collectProductImageUrls(editPage, product.limit ?? 9);
    if (urls.length === 0) {
      throw new Error(`No product images found on source edit page: ${editUrl}`);
    }

    await mkdir(outDir, { recursive: true });
    const sourceImages = [];
    for (let index = 0; index < urls.length; index += 1) {
      const outputPath = path.join(outDir, `${String(index + 1).padStart(2, "0")}_source${extensionFromUrl(urls[index])}`);
      await downloadImageUrl(editPage, urls[index], outputPath);
      sourceImages.push(outputPath);
      console.log(`[source] ${path.basename(outputPath)} <- ${urls[index]}`);
    }

    const manifestPath = path.join(outDir, SOURCE_IMAGE_MANIFEST);
    await writeFile(manifestPath, `${JSON.stringify({
      name: product.name ?? product.skus[0],
      skus: product.skus,
      sourceStoreMatch,
      editUrl,
      sourceRowText,
      ...sourceListing,
      sourceImages
    }, null, 2)}\n`, "utf8");
    await editPage.close();
    console.log(`[source] Wrote manifest: ${manifestPath}`);
  }
}

async function copySourceProductsToDrafts(context, config) {
  if (!Array.isArray(config.copyJobs) || config.copyJobs.length === 0) {
    throw new Error("Config must contain copyJobs when using --copy.");
  }

  const draftListUrl = config.draftListUrl ?? DEFAULT_DRAFT_LIST_URL;
  const activeListUrl = config.sourceListUrl ?? config.activeListUrl ?? DEFAULT_ACTIVE_LIST_URL;
  const draftPage = await context.newPage();
  const activePage = await context.newPage();

  await draftPage.goto(draftListUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await draftPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await activePage.goto(activeListUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await activePage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  for (const product of config.copyJobs) {
    if (!Array.isArray(product.skus) || product.skus.length === 0) {
      throw new Error(`Copy job "${product.name ?? "(unnamed)"}" must contain at least one SKU.`);
    }

    console.log(`\n[copy] ${product.name ?? product.skus[0]}: checking existing target drafts.`);
    await searchSourceRowBySkuGroup(draftPage, draftListUrl, product.skus, "");
    const draftRowTexts = await visibleProductRowTexts(draftPage);
    const plan = buildCopyDraftPlan({
      draftRowTexts,
      skus: product.skus,
      storeMap: config.storeMap
    });

    for (const store of plan.skipped) {
      console.log(`[copy] Skip existing draft: ${store.match}`);
    }
    if (plan.targets.length === 0) {
      console.log("[copy] All target stores already have matching drafts. Nothing to copy.");
      continue;
    }

    const sourceStoreMatch = product.sourceStoreMatch ?? config.sourceStoreMatch ?? "1\u5E97";
    let sourceRowIndex = await findSourceRowIndex(activePage, product.skus, sourceStoreMatch);
    if (sourceRowIndex < 0) {
      sourceRowIndex = await searchSourceRowBySkuGroup(activePage, activeListUrl, product.skus, sourceStoreMatch, {
        itemIds: product.itemIds ?? config.itemIds ?? []
      });
    }
    if (sourceRowIndex < 0) {
      throw new Error(`No 1-store active row matched SKU group [${product.skus.join(", ")}].`);
    }

    const sourceRowText = await sourceRowTextAt(activePage, sourceRowIndex);
    console.log(`[copy] Source row: ${sourceRowText}`);
    await clickCopyToDraftFromRow(activePage, sourceRowIndex);
    const selected = await selectCopyDialogStores(activePage, plan.targets);
    console.log(`[copy] Verified checked target stores: ${selected.join(", ")}`);
    const outcome = await confirmCopyDialog(activePage, plan.targets);
    console.log(`[copy] Submitted once; result signal: ${outcome.status}. Checking actual target drafts.`);
    const verified = await verifyCopiedDrafts({
      stores: plan.targets,
      readRows: async () => {
        await searchSourceRowBySkuGroup(draftPage, draftListUrl, product.skus, "");
        return visibleProductRowTexts(draftPage);
      },
      matches: (row, store) => rowMatchesSkuAndStore(row, product.skus, store),
      pause: () => draftPage.waitForTimeout(1000)
    });
    console.log(`[copy] Verified existing target drafts for SKU [${product.skus.join(", ")}]: ${verified.join(", ")}`);
  }
}

async function discoverJobsFromSkuGroups(context, config, outPath) {
  if (!Array.isArray(config.discoverJobs) || config.discoverJobs.length === 0) {
    throw new Error("Config must contain discoverJobs when using --discover.");
  }

  const listUrl = config.draftListUrl ?? DEFAULT_DRAFT_LIST_URL;
  const listPage = await context.newPage();
  await listPage.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await listPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  const jobs = [];
  for (const product of config.discoverJobs) {
    if (!Array.isArray(product.skus) || product.skus.length === 0) {
      throw new Error(`Discover job "${product.name ?? "(unnamed)"}" must contain at least one SKU.`);
    }
    if (!product.assetRoot) {
      throw new Error(`Discover job "${product.name ?? "(unnamed)"}" is missing assetRoot.`);
    }

    await searchSourceRowBySkuGroup(listPage, listUrl, product.skus, "");

    for (const store of config.storeMap) {
      const rowIndex = await findDraftRowIndex(listPage, product.skus, store);
      if (rowIndex < 0) {
        throw new Error(`No draft row matched SKU group [${product.skus.join(", ")}] for store "${store.match}".`);
      }

      const editUrl = await openEditUrlFromRow(context, listPage, rowIndex);
      const name = `${product.name ?? product.skus[0]} - ${store.match}`;
      jobs.push({ name, assetRoot: product.assetRoot, editUrl });
      console.log(`[discover] ${name} -> ${editUrl}`);
    }
  }

  const outputConfig = buildDiscoveredOutputConfig(config, jobs);
  const outputPath = resolveFromConfig(config, outPath);
  await writeFile(outputPath, `${JSON.stringify(outputConfig, null, 2)}\n`, "utf8");
  console.log(`[discover] Wrote ${jobs.length} jobs to ${outputPath}`);
}

async function processJob(context, config, job, mode) {
  const editUrl = job.editUrl;
  if (!editUrl) throw new Error(`Job "${job.name ?? "(unnamed)"}" is missing editUrl.`);

  const assetRoot = resolveFromConfig(config, job.assetRoot);
  console.log(`\n[open] ${job.name ?? editUrl}`);

  let page;
  try {
    const opened = await openEditPageWithRetry(context, editUrl);
    page = opened.page;
    const store = identifyStore(opened.pageText, config.storeMap, job.name);
    const assets = await loadStoreAssets(assetRoot, store.folder);
    const skipImages = shouldSkipImageUpload(config, job);
    const assetSignature = await fingerprintAssets(assets, { skipImages });
    if (!skipImages && config.requiredImageCount != null) verifySavedImageCount(assets.images.length, config.requiredImageCount, 'Local image set');
    const expectedImageCount = skipImages ? await productImageCount(page) : assets.images.length;

    console.log(`[match] ${store.match} -> ${store.folder}`);
    console.log(formatAssetSummary(assets));
    for (const imagePath of assets.images) console.log(`  - ${imagePath}`);

    if (mode === "dry-run") {
      console.log("[dry-run] No page fields changed and no save clicked.");
      return;
    }

    await fillTitleAndDetail(page, assets);
    if (shouldSkipImageUpload(config, job)) {
      console.log("[images] Skipped image upload by config.");
    } else {
      await clearExistingProductImages(page);
      await uploadProductImages(page, assets.images, {
        maxAttempts: config.imageUploadAttempts,
        timeoutMs: config.imageUploadTimeoutMs
      });
      await waitAfterPotentialUpload(page);
    }

    if (mode === "fill") {
      console.log("[fill] Filled page and uploaded images. Save was not clicked.");
      return;
    }

    await clickWhiteSaveButton(page);
    console.log("[save] Clicked the white 保存 button only.");
    const saveState = await waitForSaveFeedback(page);
    console.log(`[save] Feedback wait: ${saveState}.`);
    const verifyText = config.verifySavedText !== false;
    const verifyImages = config.verifySavedImages !== false;
    if (verifyText || verifyImages) {
      await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      await waitForVisibleFormField(page, 'input[type="text"]', TITLE_INPUT_INDEX);
      await waitForVisibleFormField(page, "textarea", 0);
      const savedTitle = await page.locator('input[type="text"]:visible').nth(TITLE_INPUT_INDEX).inputValue();
      const savedDetail = await page.locator('textarea:visible').nth(0).inputValue();
      if (verifyText) verifySavedListingText({ title: savedTitle, detail: savedDetail }, assets);
      if (verifyImages) {
        await productImageSection(page).waitFor({ state: 'visible', timeout: 30000 });
        await page.waitForFunction(({ title, expected }) => {
          const section = [...document.querySelectorAll('.page_edit_item')].find(el => el.querySelector('.title')?.textContent?.includes(title));
          return section && section.querySelectorAll('.page_edit_img_item.imgItem').length === expected;
        }, { title: PRODUCT_IMAGE_SECTION_TITLE, expected: expectedImageCount }, { timeout: 30000 });
        verifySavedImageCount(await productImageCount(page), expectedImageCount);
      }
      console.log(`[save verified] Reloaded draft; text=${verifyText}, images=${verifyImages ? expectedImageCount : 'not checked'}.`);
    }
    return { verificationVersion: verifyText && verifyImages ? 1 : 0, verifiedImageCount: verifyImages ? expectedImageCount : null, assetSignature };
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

export function verifySavedListingText(actual, expected) {
  const normalize = value => String(value || "").normalize("NFC").replace(/\r\n/g, "\n").trim();
  if (normalize(actual.title) !== normalize(expected.title) || normalize(actual.detail) !== normalize(expected.detail)) {
    throw new Error(`Saved draft text does not match reviewed copy after reload; completion was not recorded. Title ${visibleCharacterLength(actual.title)}/${visibleCharacterLength(expected.title)}, detail ${String(actual.detail || '').length}/${String(expected.detail || '').length}.`);
  }
  return true;
}

export function verifySavedImageCount(actual, expected, label = 'Saved draft') {
  if (!Number.isInteger(expected) || expected < 0 || actual !== expected) {
    throw new Error(`${label} image count mismatch: expected ${expected}, received ${actual}; completion was not recorded.`);
  }
  return true;
}

async function processSaveJobWithRetry(context, config, job) {
  const maxAttempts = Math.max(1, Number(config.saveJobAttempts) || DEFAULT_SAVE_JOB_ATTEMPTS);
  const cooldownMs = Math.max(0, Number(config.saveRetryCooldownMs) || DEFAULT_SAVE_RETRY_COOLDOWN_MS);
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await processJob(context, config, job, "save");
    } catch (error) {
      lastError = error;
      if (isNonRetryableBigSellerError(error)) break;
      if (attempt >= maxAttempts) break;
      console.log(`[retry] ${job.name ?? job.editUrl} failed; reopening a fresh page in ${Math.round(cooldownMs / 1000)}s (${attempt + 1}/${maxAttempts}).`);
      await new Promise((resolve) => setTimeout(resolve, cooldownMs));
    }
  }
  throw lastError;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(printHelp());
    return;
  }

  const config = await loadConfig(args.configPath);
  const { chromium } = await import("playwright");
  const userDataDir = resolveFromConfig(config, config.browser.userDataDir);
  const browserOptions = await resolveChromeLaunchOptions(config.browser);
  console.log(`[browser] Using Chrome: ${browserOptions.executablePath || browserOptions.channel}`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    ...browserOptions,
    headless: Boolean(config.browser.headless),
    viewport: null,
    args: ["--start-maximized"]
  });

  try {
    if (args.mode === "login") {
      const firstJobUrl = config.jobs?.[0]?.editUrl ?? config.draftListUrl ?? DEFAULT_DRAFT_LIST_URL;
      await waitForLogin(context, firstJobUrl);
      return args.mode;
    }

    if (args.mode === "discover") {
      await discoverJobsFromSkuGroups(context, config, args.outPath);
      return args.mode;
    }

    if (args.mode === "source") {
      await downloadSourceImagesFromSkuGroups(context, config, args.outDir);
      return args.mode;
    }

    if (args.mode === "copy") {
      await copySourceProductsToDrafts(context, config);
      return args.mode;
    }

    if (args.mode === "save") {
      const progress = await loadSaveProgress(config.configPath);
      const signatures = {};
      for (const job of config.jobs) {
        const store = identifyStore('', config.storeMap, job.name);
        const assets = await loadStoreAssets(resolveFromConfig(config, job.assetRoot), store.folder);
        signatures[jobProgressKey(job)] = await fingerprintAssets(assets, { skipImages: shouldSkipImageUpload(config, job) });
      }
      const pendingJobs = pendingSaveJobs(config.jobs, progress, config.requiredSaveVerificationVersion || 0, signatures);
      const skippedCount = config.jobs.length - pendingJobs.length;
      if (skippedCount > 0) console.log(`[progress] Skipping ${skippedCount} already-saved job(s).`);
      const storeCooldownMs = Math.max(0, Number(config.storeCooldownMs) || DEFAULT_STORE_COOLDOWN_MS);
      for (let index = 0; index < pendingJobs.length; index += 1) {
        const job = pendingJobs[index];
        const verification = await processSaveJobWithRetry(context, config, job);
        await recordCompletedSaveJob(config.configPath, progress, job, verification);
        if (index < pendingJobs.length - 1 && storeCooldownMs > 0) {
          console.log(`[cooldown] Waiting ${Math.round(storeCooldownMs / 1000)}s before the next store.`);
          await new Promise((resolve) => setTimeout(resolve, storeCooldownMs));
        }
      }
      return args.mode;
    }

    for (const job of config.jobs) {
      await processJob(context, config, job, args.mode);
    }
  } finally {
    await context.close();
  }
  return args.mode;
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  runCliWithCompletion(main).catch((error) => {
    console.error(`\nERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
