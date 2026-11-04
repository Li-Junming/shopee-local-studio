import { chooseCopyDialogStoreCandidate } from "./stores.js";

function copyDraftDialog(page) {
  return page.locator(".ant-modal:visible, .el-dialog:visible, [role='dialog']:visible, .modal:visible, .layui-layer:visible, .ivu-modal:visible")
    .filter({ hasText: /shopee/i }).last();
}

export async function waitForCopyDraftDialog(page) {
  const dialog = copyDraftDialog(page);
  try {
    await dialog.waitFor({ state: "visible", timeout: 15000 });
  } catch (error) {
    throw new Error("Could not find the copy-to-Shopee-draft dialog after waiting 15s. No target stores were selected or copy submitted.", { cause: error });
  }
  return dialog;
}

export async function readCopyDialogStores(dialog) {
  return dialog.evaluate((modal) => {
    const controlsIn = (root) => [...root.querySelectorAll("input[type='checkbox'], [role='checkbox']")]
      .filter((element) => !element.matches("[role='checkbox']") || element.matches("input") || !element.querySelector("input[type='checkbox']"));
    // These attributes identify DOM nodes only; no checkbox state or business
    // data is changed by taking a snapshot. Refresh them after any re-render.
    for (const node of modal.querySelectorAll("[data-studio-copy-control], [data-studio-copy-label]")) {
      node.removeAttribute("data-studio-copy-control");
      node.removeAttribute("data-studio-copy-label");
    }
    return controlsIn(modal).map((checkbox, index) => {
      let label = checkbox;
      for (let parent = checkbox.parentElement; parent && parent !== modal; parent = parent.parentElement) {
        if (controlsIn(parent).length > 1) break;
        if ((parent.innerText || parent.textContent || "").trim()) { label = parent; break; }
      }
      const text = (label.innerText || label.textContent || checkbox.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
      const key = String(index);
      checkbox.setAttribute("data-studio-copy-control", key);
      // BigSeller renders the shop title beside an empty checkbox label.
      // The row supplies identity text, but clicking its center does not toggle.
      const nativeLabel = checkbox.closest("label");
      const clickTarget = nativeLabel && modal.contains(nativeLabel) ? nativeLabel : label;
      clickTarget.setAttribute("data-studio-copy-label", key);
      const disabled = Boolean(checkbox.disabled) || checkbox.getAttribute("aria-disabled") === "true"
        || label.getAttribute("aria-disabled") === "true" || clickTarget.getAttribute("aria-disabled") === "true"
        || /(?:^|\s|-)disabled(?:\s|$)/i.test(String(label.className || ""))
        || /(?:^|\s|-)disabled(?:\s|$)/i.test(String(clickTarget.className || ""));
      return {
        key, text, hasCheckbox: true, disabled,
        checked: checkbox.matches("input") ? checkbox.checked : checkbox.getAttribute("aria-checked") === "true"
      };
    });
  });
}

function selectionPlan(candidates, storeMap) {
  if (!storeMap?.length) throw new Error("Copy targets must not be empty.");
  const plan = storeMap.map((target) => ({ target, box: chooseCopyDialogStoreCandidate(candidates, target) }));
  const missing = plan.filter(({ box }) => !box).map(({ target }) => target.match);
  if (missing.length) {
    const available = [...new Set(candidates.map((item) => item.text.trim()))].slice(0, 40);
    throw new Error(`Could not find target stores in copy dialog: ${missing.join(", ")}. Visible stores: ${available.join(" | ") || "(none)"}`);
  }
  if (new Set(plan.map(({ box }) => box.key)).size !== plan.length) throw new Error("Copy targets resolve to duplicate checkboxes.");
  return plan;
}

export async function assertCopyDialogSelection(dialog, storeMap) {
  const candidates = await readCopyDialogStores(dialog);
  const plan = selectionPlan(candidates, storeMap);
  const unchecked = plan.filter(({ box }) => !box.checked).map(({ target }) => target.match);
  const selectedKeys = new Set(plan.map(({ box }) => box.key));
  const unexpected = candidates.filter((box) => box.checked && !/^(?:全选|select\s*all)$/i.test(box.text.trim())
    && !selectedKeys.has(box.key));
  if (unchecked.length || unexpected.length) {
    throw new Error(`Copy selection not verified; unchecked: ${unchecked.join(", ") || "none"}; unexpected checked stores: ${unexpected.map((box) => box.text).join(", ") || "none"}. Copy was not submitted.`);
  }
  return plan;
}

export async function selectCopyDialogStores(page, storeMap) {
  const dialog = await waitForCopyDraftDialog(page);
  // Validate every requested identity before changing any checkbox.
  selectionPlan(await readCopyDialogStores(dialog), storeMap);
  for (const target of storeMap) {
    const [{ box }] = selectionPlan(await readCopyDialogStores(dialog), [target]);
    const checkbox = dialog.locator(`[data-studio-copy-control="${box.key}"]`);
    if (!await checkbox.isChecked({ timeout: 2000 })) {
      const label = dialog.locator(`[data-studio-copy-label="${box.key}"]`);
      await label.scrollIntoViewIfNeeded({ timeout: 5000 });
      await label.click({ timeout: 5000 });
      let checked = false;
      for (let attempt = 0; attempt < 10; attempt += 1) {
        checked = await checkbox.isChecked({ timeout: 2000 });
        if (checked) break;
        await page.waitForTimeout(100);
      }
      if (!checked) throw new Error(`Copy target checkbox did not become checked: ${target.match}. Copy was not submitted.`);
    }
  }
  await assertCopyDialogSelection(dialog, storeMap);
  return storeMap.map((target) => target.match);
}

export function copyNoticeOutcome(notices) {
  for (const notice of notices) {
    const failed = notice.match(/操作失败\s*[:：]?\s*(\d+)/);
    if ((failed && Number(failed[1]) > 0) || /复制失败|请选择.*店铺|请先选择.*店铺|权限不足|无权限/.test(notice)) {
      return { status: "failed", message: notice.slice(0, 500) };
    }
  }
  if (notices.some((notice) => /操作成功\s*[:：]?\s*[1-9]\d*/.test(notice) && /操作失败\s*[:：]?\s*0(?!\d)/.test(notice))) {
    return { status: "success_notice" };
  }
  return { status: "pending" };
}

export async function confirmCopyDialog(page, storeMap, { maxPolls = 40, pollMs = 250 } = {}) {
  const dialog = await waitForCopyDraftDialog(page);
  // Re-check after scrolling/selection, immediately before a single submission.
  await assertCopyDialogSelection(dialog, storeMap);
  const buttons = dialog.locator("button:visible, [role='button']:visible")
    .filter({ hasText: /^\s*(?:确\s*定|确\s*认|ok|confirm)\s*$/i });
  if (await buttons.count() !== 1) throw new Error("Could not identify one exact confirm button in the copy dialog. Copy was not submitted.");
  const button = buttons.first();
  if (await button.isDisabled()) throw new Error("Copy confirm button is disabled. Copy was not submitted.");
  await button.scrollIntoViewIfNeeded({ timeout: 5000 });
  await button.click({ timeout: 5000 });
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const notices = await page.evaluate(() => [...document.querySelectorAll(".ant-message, .ant-notification, .el-message, .el-notification, [role='alert'], .ant-modal, .el-dialog, .layui-layer, .ivu-modal")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      }).map((element) => (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean));
    const outcome = copyNoticeOutcome(notices);
    if (outcome.status === "failed") throw new Error(`BigSeller copy rejected or partially failed: ${outcome.message}. Check existing target drafts before retrying.`);
    if (outcome.status === "success_notice") return outcome;
    if (!await dialog.isVisible()) return { status: "closed_unverified" };
    await page.waitForTimeout(pollMs);
  }
  throw new Error("Copy dialog stayed open after one verified submission. Result is unconfirmed; check target drafts before retrying, do not submit repeatedly.");
}

export async function verifyCopiedDrafts({ stores, readRows, matches, pause, attempts = 3 }) {
  if (!stores?.length) throw new Error("Copy result verification requires target stores.");
  let missing = stores;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rows = await readRows();
    missing = stores.filter((store) => !rows.some((row) => matches(row, store)));
    if (!missing.length) return stores.map((store) => store.match);
    if (attempt + 1 < attempts) await pause();
  }
  throw new Error(`Copy result unconfirmed; target drafts not found: ${missing.map((store) => store.match).join(", ")}. Existing drafts must be checked before retrying; no automatic re-submission was performed.`);
}
