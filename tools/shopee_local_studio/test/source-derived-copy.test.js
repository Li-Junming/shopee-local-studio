import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSourceDerivedListingDetail,
  extractSourceProductFacts,
  validateSourceDerivedListingDetail
} from "../src/source-derived-copy.js";

test("extracts fragrance facts from confirmed 1-store title", () => {
  const facts = extractSourceProductFacts("100ML Nước Hoa Nam Versace Eros Sang Trọng");
  assert.equal(facts.category, "fragrance");
  assert.equal(facts.gender, "male");
  assert.equal(facts.volume.toLowerCase(), "100ml");
});

test("creates deterministic and different fragrance details", () => {
  const sourceTitle = "100ML Nước Hoa Nam Versace Eros Sang Trọng, Nam Tính";
  const ids = ["4", "5", "6", "7", "8", "9", "warehouse_2_1", "warehouse_2_2", "warehouse_2_3", "warehouse_2_4"];
  const details = ids.map((storeId) => buildSourceDerivedListingDetail({ sourceTitle, storeId }));
  assert.equal(new Set(details).size, details.length);
  for (const detail of details) {
    assert.match(detail, /Versace Eros/);
    assert.match(detail, /Công dụng chính/);
    assert.match(detail, /Cách dùng/);
    assert.match(detail, /(?:hương|xịt|nước hoa)/iu);
    assert.doesNotMatch(detail.split(/\r?\n/).slice(1).join("\n"), /(?:serum|toner|son môi|tóc|massage|lớp nền|rửa mặt)/iu);
  }
  assert.equal(details[0], buildSourceDerivedListingDetail({ sourceTitle, storeId: ids[0] }));
});

test("keeps unknown products on existing fallback path", () => {
  assert.equal(buildSourceDerivedListingDetail({ sourceTitle: "ABC Model 123", storeId: "4" }), null);
});

test("blocks cross-category fragrance copy", () => {
  const facts = extractSourceProductFacts("100ML Nước Hoa Nam Versace Eros");
  const invalid = [
    "100ML Nước Hoa Nam Versace Eros",
    "Công dụng chính", "- Dùng như serum.",
    "Đối tượng phù hợp", "- Phù hợp nam giới.",
    "Cảm giác khi dùng", "- Mùi hương rõ.",
    "Cách dùng", "- Xịt vừa đủ.",
    "Cách bảo quản", "- Tránh nắng."
  ].join("\n");
  assert.throws(() => validateSourceDerivedListingDetail(invalid, facts), /forbidden phrase: serum/);
});

test("creates differentiated source-derived details for every supported category", () => {
  const samples = [
    ["SKINCEUTICALS B5 30ml Serum Cấp Ẩm Phục Hồi Da", "skincare"],
    ["ESTEE LAUDER Foam Cleanser 125ml Sữa Rửa Mặt", "cleanser"],
    ["BOBBI BROWN Foundation 30ml Kem Nền", "makeup"],
    ["SEPHORA Lip Gloss 5ml Son Bóng Môi", "lip"],
    ["KERASTASE Shampoo 250ml Dầu Gội Tóc", "hair"],
    ["L'OCCITANE Almond Body Oil 100ml Dầu Dưỡng Thể", "bodycare"]
  ];
  for (const [sourceTitle, category] of samples) {
    assert.equal(extractSourceProductFacts(sourceTitle).category, category);
    const first = buildSourceDerivedListingDetail({ sourceTitle, storeId: "4" });
    const second = buildSourceDerivedListingDetail({ sourceTitle, storeId: "5" });
    assert.ok(first);
    assert.ok(second);
    assert.notEqual(first, second);
    assert.match(first, new RegExp(sourceTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
