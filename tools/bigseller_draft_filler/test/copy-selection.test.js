import assert from "node:assert/strict";
import test from "node:test";
import { assertCopyDialogSelection, confirmCopyDialog, copyNoticeOutcome, selectCopyDialogStores, verifyCopiedDrafts } from "../src/copy-dialog.js";
import { rowMatchesSkuAndStore } from "../src/fill-drafts.js";

const targets = [1, 2, 3, 4].map((n) => ({ match: `陈--平政--${n}店` }));
const candidate = (store, key, extra = {}) => ({ text: store.match, key: String(key), hasCheckbox: true, checked: false, ...extra });

function fixture(candidates, { ignoredClick = false, drift = false, closeAfterSubmit = true, notices = [], buttonCount = 1, buttonDisabled = false } = {}) {
  const state = candidates.map((item) => ({ ...item }));
  const calls = [];
  let submitted = 0;
  let noticeIndex = 0;
  const scrolled = new Set();
  const dialog = {
    waitFor: async () => {},
    evaluate: async () => state.map((item) => ({ ...item })),
    isVisible: async () => !submitted || !closeAfterSubmit,
    locator: (selector) => {
      if (selector.startsWith("button")) return { filter: ({ hasText }) => {
        assert.equal(hasText.test("确定"), true);
        assert.equal(hasText.test("发布"), false);
        return { count: async () => buttonCount, first: () => ({
          isDisabled: async () => buttonDisabled,
          scrollIntoViewIfNeeded: async () => {},
          click: async () => { submitted += 1; calls.push(["submit"]); }
        }) };
      } };
      const key = selector.match(/="([^"]+)"/)[1];
      const item = state.find((entry) => entry.key === key);
      return {
        isChecked: async () => item.checked,
        scrollIntoViewIfNeeded: async () => { scrolled.add(key); calls.push(["scroll", key]); },
        click: async () => {
          assert.ok(scrolled.has(key), "off-screen shop must be scrolled into view");
          calls.push(["check", key]);
          if (!ignoredClick) item.checked = !item.checked;
          if (drift && key === "3") state[0].checked = false;
        }
      };
    }
  };
  const page = {
    locator: () => ({ filter: () => ({ last: () => dialog }) }),
    evaluate: async () => notices[Math.min(noticeIndex++, notices.length - 1)] || [],
    waitForTimeout: async () => {},
    mouse: { click: () => { throw new Error("raw coordinates forbidden"); } }
  };
  return { page, dialog, state, calls, submitted: () => submitted };
}

test("all four off-screen shops are scrolled, checked and re-verified", async () => {
  const f = fixture(targets.map((store, i) => candidate(store, i)));
  assert.deepEqual(await selectCopyDialogStores(f.page, targets), targets.map((store) => store.match));
  assert.equal(f.calls.filter(([type]) => type === "scroll").length, 4);
  assert.equal(f.state.filter((item) => item.checked).length, 4);
  assert.equal(f.submitted(), 0);
});

test("already-checked shops are preserved and missing/disabled/ambiguous shops fail before clicks", async () => {
  const f = fixture(targets.map((store, i) => candidate(store, i, { checked: i === 0 })));
  await selectCopyDialogStores(f.page, targets);
  assert.equal(f.calls.some(([type, key]) => type === "check" && key === "0"), false);
  for (const candidates of [
    targets.slice(0, 3).map(candidate),
    targets.map((store, i) => candidate(store, i, { disabled: i === 2 })),
    [...targets.map(candidate), candidate(targets[0], "duplicate")]
  ]) {
    const invalid = fixture(candidates);
    await assert.rejects(selectCopyDialogStores(invalid.page, targets), /Could not find target stores|Ambiguous/);
    assert.deepEqual(invalid.calls, []);
  }
});

test("an ignored click, lost checked state or extra checked store cannot be reported as selected", async () => {
  for (const options of [{ ignoredClick: true }, { drift: true }]) {
    const f = fixture(targets.map(candidate), options);
    await assert.rejects(selectCopyDialogStores(f.page, targets), /did not become checked|selection not verified/);
    assert.equal(f.submitted(), 0);
  }
  const extra = fixture([...targets.map((s, i) => candidate(s, i, { checked: true })), candidate({ match: "陈--胡志明--1店" }, "source", { checked: true })]);
  await assert.rejects(assertCopyDialogSelection(extra.dialog, targets), /unexpected checked stores/);
});

test("submission re-checks all targets and requires one exact enabled confirm button", async () => {
  for (const options of [{}, { buttonCount: 2 }, { buttonDisabled: true }]) {
    const f = fixture(targets.map((s, i) => candidate(s, i, { checked: options.buttonCount || options.buttonDisabled })), options);
    await assert.rejects(confirmCopyDialog(f.page, targets), /selection not verified|exact confirm|disabled/);
    assert.equal(f.submitted(), 0);
  }
});

test("another owner's checked shop is rejected even when its region and number match", async () => {
  const wanted = { match: "陈--胡志明--4店" };
  const f = fixture([
    candidate(wanted, "target", { checked: true }),
    candidate({ match: "雪儿胡志明4店" }, "other", { checked: true })
  ]);
  await assert.rejects(assertCopyDialogSelection(f.dialog, [wanted]), /unexpected checked stores: 雪儿胡志明4店/);
  assert.equal(f.submitted(), 0);
});

test("closing a dialog is unverified, while success/partial failure signals are distinguished", async () => {
  const checked = targets.map((s, i) => candidate(s, i, { checked: true }));
  const closed = fixture(checked);
  assert.deepEqual(await confirmCopyDialog(closed.page, targets), { status: "closed_unverified" });
  assert.equal(closed.submitted(), 1);
  const success = fixture(checked, { closeAfterSubmit: false, notices: [[], ["操作成功：4 操作失败：0"]] });
  assert.deepEqual(await confirmCopyDialog(success.page, targets, { maxPolls: 3 }), { status: "success_notice" });
  assert.equal(success.submitted(), 1);
  const partial = fixture(checked, { notices: [["操作成功：3 操作失败：1"]] });
  await assert.rejects(confirmCopyDialog(partial.page, targets), /partially failed/);
  assert.equal(partial.submitted(), 1);
  assert.equal(copyNoticeOutcome(["操作成功：4 操作失败：10"]).status, "failed");
});

test("an unresolved submission times out without a second confirmation click", async () => {
  const f = fixture(targets.map((s, i) => candidate(s, i, { checked: true })), { closeAfterSubmit: false });
  await assert.rejects(confirmCopyDialog(f.page, targets, { maxPolls: 2 }), /Result is unconfirmed/);
  assert.equal(f.submitted(), 1);
});

test("post-copy proof requires every target draft with the right SKU and warehouse identity", async () => {
  const rows = targets.map((s) => `XL86801 ${s.match}`);
  let reads = 0;
  assert.deepEqual(await verifyCopiedDrafts({ stores: targets, readRows: async () => ++reads === 1 ? rows.slice(0, 2) : rows,
    matches: (row, store) => rowMatchesSkuAndStore(row, ["XL86801"], store), pause: async () => {} }), targets.map((s) => s.match));
  assert.equal(reads, 2);
  reads = 0;
  await assert.rejects(verifyCopiedDrafts({ stores: targets, readRows: async () => { reads++; return [...rows.slice(0, 3), "OTHER 陈--平政--4店", "XL86801 陈--胡志明--4店"]; },
    matches: (row, store) => rowMatchesSkuAndStore(row, ["XL86801"], store), pause: async () => {} }), /target drafts not found: 陈--平政--4店/);
  assert.equal(reads, 3);
});
