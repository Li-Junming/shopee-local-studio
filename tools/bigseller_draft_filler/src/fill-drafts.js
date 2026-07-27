#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadStoreAssets } from "./assets.js";
import { loadConfig, parseArgs, printHelp } from "./config.js";
import { identifyStore } from "./stores.js";

const TITLE_INPUT_INDEX = 0;
const PRODUCT_IMAGE_SECTION_TITLE = "产品图";
const ADD_LOCAL_IMAGE_TEXT = "从本地添加";
const DEFAULT_DRAFT_LIST_URL = "https://www.bigseller.pro/web/listing/shopee/index.htm?bsStatus=1";
const DEFAULT_ACTIVE_LIST_URL = "https://www.bigseller.pro/web/listing/shopee/active/index.htm?bsStatus=4";
const SOURCE_IMAGE_MANIFEST = "source-images.json";
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

export function isSkuSearchModeText(text) {
  return /^sku$/i.test(normalizeSearchModeText(text));
}

function isSearchModeCandidateText(text) {
  const normalized = normalizeSearchModeText(text);
  return isSkuSearchModeText(normalized)
    || normalized === "产品名称"
    || normalized === "商品名称"
    || /^product name$/i.test(normalized)
    || /^item name$/i.test(normalized);
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

export function normalizeSourceRowText(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 260);
}

function resolveFromConfig(config, maybeRelativePath) {
  if (path.isAbsolute(maybeRelativePath)) return maybeRelativePath;
  return path.resolve(config.baseDir, maybeRelativePath);
}

async function visibleInnerText(page) {
  await page.locator("body").waitFor({ state: "visible", timeout: 30000 });
  return page.locator("body").innerText({ timeout: 30000 });
}

async function fillTitleAndDetail(page, assets) {
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
}

async function uploadProductImages(page, imagePaths) {
  const section = productImageSection(page);

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
  await fileChooser.setFiles(imagePaths, { timeout: 60000 });
  await page.waitForFunction(
    ({ sectionTitle, expected }) => {
      const sections = [...document.querySelectorAll(".page_edit_item")];
      const section = sections.find((candidate) => {
        const title = candidate.querySelector(".title");
        return title?.textContent?.includes(sectionTitle);
      });
      const count = section?.querySelectorAll(".page_edit_img_item.imgItem").length ?? 0;
      return count === expected;
    },
    { sectionTitle: PRODUCT_IMAGE_SECTION_TITLE, expected: imagePaths.length },
    { timeout: 120000 }
  );
  console.log(`[images] Uploaded ${imagePaths.length} product images.`);
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
  await page.waitForTimeout(3000);
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

function buildDiscoveredOutputConfig(config, jobs) {
  return {
    browser: config.browser,
    storeMap: config.storeMap,
    jobs
  };
}

async function findDraftRowIndex(page, skus, storeMatch) {
  return page.evaluate(
    ({ skus: targetSkus, storeMatch: targetStore }) => {
      const normalizeStore = (value) => String(value ?? "")
        .replace(/\s+/g, "")
        .replace(/[()]/g, "（")
        .toLowerCase();
      const wantedStore = normalizeStore(targetStore);
      const wantedSkus = targetSkus.map((sku) => String(sku).trim()).filter(Boolean);
      const primaryRows = [...document.querySelectorAll("tr.product_native_row")];
      const fallbackRows = [...document.querySelectorAll("tbody tr, [role='row']")]
        .filter((row) => row.innerText && row.querySelector("td, [role='cell'], img, a"));
      const rows = primaryRows.length ? primaryRows : fallbackRows;

      return rows.findIndex((row) => {
        const rowText = row.innerText || "";
        const rowStoreMatched = normalizeStore(rowText).includes(wantedStore);
        const skuMatched = wantedSkus.some((sku) => rowText.includes(sku));
        return rowStoreMatched && skuMatched;
      });
    },
    { skus, storeMatch }
  );
}

async function openEditUrlFromRow(context, listPage, rowIndex, returnUrl = DEFAULT_DRAFT_LIST_URL) {
  const editButton = listPage.locator("tr.product_native_row").nth(rowIndex).locator([
    "a.action_btn.addEditProduct",
    "a[href*='/web/listing/shopee/edit/']",
    "a[href*='/listing/shopee/edit/']"
  ].join(", ")).first();
  const editButtonCount = await editButton.count();
  if (editButtonCount === 0) throw new Error(`Could not find edit button in draft row index ${rowIndex}.`);

  await editButton.scrollIntoViewIfNeeded({ timeout: 10000 });
  const newPagePromise = context.waitForEvent("page", { timeout: 10000 }).catch(() => null);
  const samePagePromise = listPage.waitForURL(/\/web\/listing\/shopee\/edit\//, { timeout: 15000 }).catch(() => null);
  await editButton.click({ timeout: 10000 });

  const newPage = await newPagePromise;
  if (newPage) {
    await newPage.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
    const editUrl = newPage.url();
    await newPage.close();
    return editUrl;
  }

  const samePage = await samePagePromise;
  if (samePage) {
    const editUrl = listPage.url();
    await listPage.goto(returnUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await listPage.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    return editUrl;
  }

  throw new Error(`Clicking draft row index ${rowIndex} did not open an edit page.`);
}

async function findSourceRowIndex(page, skus, sourceStoreMatch) {
  return page.evaluate(
    ({ skus: targetSkus, storeMatch: targetStore }) => {
      const normalizeStore = (value) => String(value ?? "")
        .replace(/\s+/g, "")
        .replace(/[()（）]/g, "")
        .toLowerCase();
      const wantedStore = normalizeStore(targetStore);
      const wantedSkus = targetSkus.map((sku) => String(sku).trim()).filter(Boolean);
      const primaryRows = [...document.querySelectorAll("tr.product_native_row")];
      const fallbackRows = [...document.querySelectorAll("tbody tr, [role='row']")]
        .filter((row) => {
          const rowText = row.innerText || "";
          return rowText.trim() && row.querySelector("td, [role='cell'], img, a");
        });
      const rows = primaryRows.length ? primaryRows : fallbackRows;

      return rows.findIndex((row) => {
        const rowText = row.innerText || "";
        const rowStoreMatched = !wantedStore || normalizeStore(rowText).includes(wantedStore);
        const skuMatched = wantedSkus.some((sku) => rowText.includes(sku));
        return rowStoreMatched && skuMatched;
      });
    },
    { skus, storeMatch: sourceStoreMatch }
  );
}

async function waitForSkuRowOnCurrentPage(page, skus, sourceStoreMatch, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let rowIndex = await findSourceRowIndex(page, skus, sourceStoreMatch);
    if (rowIndex >= 0) return rowIndex;
    if (sourceStoreMatch) {
      rowIndex = await findSourceRowIndex(page, skus, "");
      if (rowIndex >= 0) return rowIndex;
    }
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

async function searchSourceRowBySkuGroup(page, listUrl, skus, sourceStoreMatch) {
  for (const sku of skus) {
    console.log(`[source] Searching active list by SKU "${sku}".`);
    await page.goto(listUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

    let rowIndex = await waitForSkuRowOnCurrentPage(page, skus, sourceStoreMatch, 3000);
    if (rowIndex >= 0) return rowIndex;

    const searched = await searchVisibleInputs(page, sku);
    if (!searched) {
      console.log("[source] Could not find a visible search input; staying on the current list page.");
    }

    rowIndex = await waitForSkuRowOnCurrentPage(page, skus, sourceStoreMatch, 10000);
    if (rowIndex >= 0) return rowIndex;
  }

  return -1;
}

async function searchVisibleInputs(page, value) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }).catch(() => {});
  await page.waitForTimeout(500);

  const inputIndexes = await page.evaluate(() => {
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
  console.log(`[source] Visible input candidates: ${inputIndexes.length}.`);

  for (const index of inputIndexes) {
    const input = page.locator("input, textarea, [contenteditable='true']").nth(index);
    await input.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    await ensureSkuSearchMode(page, index);
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

    if ((await findSourceRowIndex(page, [value], "")) >= 0) return true;

    await clickSearchButtonNearInput(page, index) || await clickSearchButton(page);
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
    if ((await findSourceRowIndex(page, [value], "")) >= 0) return true;
  }

  return false;
}

async function ensureSkuSearchMode(page, inputIndex) {
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
  if (!trigger) return false;
  if (isSkuSearchModeText(trigger.text)) return true;

  console.log(`[source] Switching search type "${trigger.text}" to SKU.`);
  const clicked = await page.locator(SEARCH_MODE_TRIGGER_SELECTOR).nth(trigger.index).click({ timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!clicked) return false;

  await page.waitForTimeout(300);
  return clickNearestSkuOption(page, trigger.box);
}

async function clickNearestSkuOption(page, triggerBox) {
  const optionIndex = await page.evaluate(({ selector, triggerBox }) => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const textOf = (element) => [
      element.innerText,
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title")
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const elements = [...document.querySelectorAll(selector)];
    const candidates = elements
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => visible(element) && /^sku$/i.test(textOf(element)))
      .map(({ element, index }) => {
        const rect = element.getBoundingClientRect();
        const dx = Math.abs(rect.x - triggerBox.x);
        const dy = Math.abs(rect.y - (triggerBox.y + triggerBox.height));
        return { index, dx, dy };
      })
      .filter((candidate) => candidate.dx <= 360 && candidate.dy <= 360)
      .sort((a, b) => (a.dy + a.dx) - (b.dy + b.dx));
    return candidates[0]?.index ?? -1;
  }, { selector: SEARCH_MODE_OPTION_SELECTOR, triggerBox }).catch(() => -1);

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
    if (rowIndex < 0 && sourceStoreMatch) {
      console.log(`[source] No row matched store "${sourceStoreMatch}", retrying by SKU only.`);
      rowIndex = await findSourceRowIndex(listPage, product.skus, "");
    }
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

    for (const store of config.storeMap) {
      const rowIndex = await findDraftRowIndex(listPage, product.skus, store.match);
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
  const page = await context.newPage();
  console.log(`\n[open] ${job.name ?? editUrl}`);
  await page.goto(editUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});

  const pageText = await visibleInnerText(page);
  const store = identifyStore(pageText, config.storeMap);
  const assets = await loadStoreAssets(assetRoot, store.folder);

  console.log(`[match] ${store.match} -> ${store.folder}`);
  console.log(`[assets] title=${assets.title.length} chars, detail=${assets.detail.length} chars, images=${assets.images.length}`);
  for (const imagePath of assets.images) console.log(`  - ${imagePath}`);

  if (mode === "dry-run") {
    console.log("[dry-run] No page fields changed and no save clicked.");
    return;
  }

  await fillTitleAndDetail(page, assets);
  await clearExistingProductImages(page);
  await uploadProductImages(page, assets.images);
  await waitAfterPotentialUpload(page);

  if (mode === "fill") {
    console.log("[fill] Filled page and uploaded images. Save was not clicked.");
    return;
  }

  await clickWhiteSaveButton(page);
  await page.waitForTimeout(3000);
  console.log("[save] Clicked the white 保存 button only.");
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

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chrome",
    headless: Boolean(config.browser.headless),
    viewport: null,
    args: ["--start-maximized"]
  });

  try {
    if (args.mode === "login") {
      const firstJobUrl = config.jobs?.[0]?.editUrl ?? config.draftListUrl ?? DEFAULT_DRAFT_LIST_URL;
      await waitForLogin(context, firstJobUrl);
      return;
    }

    if (args.mode === "discover") {
      await discoverJobsFromSkuGroups(context, config, args.outPath);
      return;
    }

    if (args.mode === "source") {
      await downloadSourceImagesFromSkuGroups(context, config, args.outDir);
      return;
    }

    for (const job of config.jobs) {
      await processJob(context, config, job, args.mode);
    }
  } finally {
    await context.close();
  }
}

const isCli = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  main().catch((error) => {
    console.error(`\nERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
