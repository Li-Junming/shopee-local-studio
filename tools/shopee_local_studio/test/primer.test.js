import assert from "node:assert/strict";
import test from "node:test";
import { buildImage2Config, makeListingDraft, validateVietnameseListing } from "../src/core.js";

const names = [
  "cle de peau BEAUTE Correcting Cream Veil SPF25 PA++",
  "𝕔𝕝é 𝕕𝕖 𝕡𝕖𝕒𝕦 𝔹𝔼𝔸𝕌𝕋É 𝐂𝐨𝐫𝐫𝐞𝐜𝐭𝐢𝐧𝐠 𝐂𝐫𝐞𝐚𝐦 𝐕𝐞𝐢𝐥 SPF25 PA++ Kem Lót Hiệu Chỉnh Da Mịn Tự Nhiên Dưỡng Ẩm",
  "Example Hydrating Cream Primer",
  "Example Makeup Base",
  "Example Kem Lót"
];

test("primers use pre-makeup copy, not skincare, serum or foundation instructions", () => {
  for (const productName of names) {
    const listings = ["4", "5", "6", "7", "8", "9"].map((storeId) => makeListingDraft({
      productName, storeId, skuGroup: ["CP80101"], requireIdentity: true,
      notes: "Dưỡng ẩm. Dùng kem lót trước kem nền, sau bước dưỡng da."
    }));
    for (const listing of listings) {
      assert.match(listing.detail, /kem lót/i);
      assert.match(listing.detail, /Tiếp tục với kem nền/i);
      assert.doesNotMatch(listing.title + listing.detail, /HA\s*[/ ]\s*B5|B5\s*[/ ]\s*HA|serum|toner|2-3 giọt|che phu cao|CP80101/i);
      const result = validateVietnameseListing(listing);
      assert.equal(result.valid, true, JSON.stringify(result.errors) + " " + listing.title);
    }
    assert.equal(new Set(listings.map((listing) => listing.title)).size, 6);
    assert.equal(new Set(listings.map((listing) => listing.detail)).size, 6);
  }
});

test("a skincare cream mentioning makeup in usage remains skincare", () => {
  const listing = makeListingDraft({
    productName: "Example Moisturizing Cream", storeId: "4",
    notes: "Apply before primer and foundation."
  });
  assert.doesNotMatch(listing.detail, /đây là bước lót trước trang điểm/i);
});

test("English brand words are not rewritten as Vietnamese in primer details", () => {
  const listing = makeListingDraft({ productName: names[0], storeId: "4" });
  assert.match(listing.detail, /^cle de peau BEAUTE Correcting Cream Veil SPF25 PA\+\+/);
  assert.doesNotMatch(listing.detail, /cle để peau/);
});

test("all 24 primer image prompts carry the product category guard", () => {
  const config = buildImage2Config({
    taskDir: "C:/test/primer", productName: names[1], skuGroup: ["CP80101"],
    sourceImages: ["C:/test/source.jpg"], targetStores: ["4", "5", "6", "7", "8", "9"]
  });
  assert.equal(config.jobs.length, 24);
  for (const job of config.jobs) {
    assert.match(job.prompt, /Product category: makeup primer/);
    assert.match(job.prompt, /Do not invent ingredients/);
  }
});
