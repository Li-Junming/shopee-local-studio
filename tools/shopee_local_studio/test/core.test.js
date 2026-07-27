import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {
  buildBigSellerSkuConfig,
  buildBigSellerSourceConfig,
  buildImage2CliArgs,
  buildImage2Config,
  makeListingDraft,
  parseTaskText,
  parseSkuGroup,
  requireBuyerProductIdentity,
  shouldShowTask,
  sourceReviewState,
  assertSourceReviewReady,
  sourceSkuMatchRisk,
  sourceImagesMissingMessage,
  storesFor,
  taskMatchesQuery,
  validateVietnameseListing
} from "../src/core.js";

const VIETNAMESE_DIACRITIC_RE = /[\u00C0-\u1EF9]/;

function folded(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

function detailSection(detail, start, end) {
  const foldedDetail = folded(detail);
  return foldedDetail.split(start)[1].split(end)[0].trim();
}

test("parseSkuGroup normalizes whitespace and duplicate SKU values", () => {
  assert.deepEqual(parseSkuGroup("YSLD80501  YSLD80502\nYSLD80501"), [
    "YSLD80501",
    "YSLD80502"
  ]);
});

test("parseTaskText extracts product task fields from pasted Chinese format", () => {
  const parsed = parseTaskText(`
SKU：YSLD80501  YSLD80502
目标店铺：7、8、9
图片：C:/tmp/a.png
C:/tmp/b.png
草稿箱：已复制
备注：产品图要有品牌名，不要正品标识
  `);

  assert.equal(parsed.productName, "");
  assert.deepEqual(parsed.skuGroup, ["YSLD80501", "YSLD80502"]);
  assert.deepEqual(parsed.targetStores, []);
  assert.equal(parsed.sourceImages, "C:/tmp/a.png\nC:/tmp/b.png");
  assert.equal(parsed.draftCopied, true);
  assert.equal(parsed.notes, "产品图要有品牌名，不要正品标识");
});

test("parseTaskText accepts product name aliases and ignores pasted stores", () => {
  const parsed = parseTaskText(`
商品名称: Estee Lauder Soft Clean Infusion
SKU组: YSLD80501,YSLD80502
目标店铺: 7,9
图片路径:
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
});

test("storesFor resolves supported target stores and rejects unknown stores", () => {
  assert.deepEqual(storesFor(["7", "9"]).map((store) => store.folder), [
    "store_7_skinora",
    "store_9_elora_skin"
  ]);
  assert.throws(() => storesFor(["10"]), /Unsupported store/);
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
    notes: "产品图要有品牌名，不要正品标识"
  });

  assert.equal(config.jobs[0].prompt.includes("产品图"), false);
  assert.equal(config.jobs[0].prompt.includes("品牌名"), false);
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

  assert.ok(store7Jobs.every((job) => job.images.includes("C:/frames/store-7-watermark.png")));
  assert.ok(store7Jobs.every((job) => !job.images.includes("C:/frames/store-9-watermark.png")));
  assert.ok(store9Jobs.every((job) => job.images.includes("C:/frames/store-9-watermark.png")));
  assert.ok(store9Jobs.every((job) => !job.images.includes("C:/frames/store-7-watermark.png")));
  assert.ok(config.jobs[0].prompt.includes("target store watermark/frame reference"));
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
  const title = "Estee Lauder Soft Clean Infusion nước hoa hồng dưỡng ẩm làm dịu da khô 400ml cao cấp";
  const detail = [
    "Estee Lauder Soft Clean Infusion",
    "Công dụng chính",
    "- Dưỡng ẩm nhẹ nhàng, giúp bề mặt da mềm mịn hơn sau bước làm sạch.",
    "- Làm dịu cảm giác khô căng, phù hợp dùng đều trong quy trình chăm sóc da.",
    "Đối tượng phù hợp",
    "- Phù hợp da khô, da thiếu ẩm hoặc người muốn sản phẩm dễ dùng mỗi ngày.",
    "Cảm giác khi dùng",
    "- Kết cấu nhẹ, thấm nhanh và không tạo cảm giác nặng mặt.",
    "Cách dùng",
    "- Dùng sau bước làm sạch, thoa đều lên da và tiếp tục kem dưỡng nếu cần.",
    "Cách bảo quản",
    "- Bảo quản nơi khô thoáng, tránh ánh nắng trực tiếp và đóng kín nắp sau khi dùng."
  ].join("\n");
  assert.equal(validateVietnameseListing({ title, detail }).valid, true);

  assert.deepEqual(validateVietnameseListing({
    title: "Qua ngan",
    detail: "SKU YSLD80501"
  }).errors, [
    "Title must be 80-100 characters.",
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

  assert.ok(listing.title.length >= 80);
  assert.ok(listing.title.length <= 100);
  assert.equal(VIETNAMESE_DIACRITIC_RE.test(listing.title + listing.detail), true);
  assert.equal(validateVietnameseListing(listing).valid, true);
});

test("makeListingDraft pads short product names to Shopee title length", () => {
  const listing = makeListingDraft({
    productName: "Demo Product Check",
    notes: "demo only",
    storeId: "7"
  });

  assert.ok(listing.title.length >= 80);
  assert.ok(listing.title.length <= 100);
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
  const titles = ["7", "8", "9"].map((storeId) => makeListingDraft({ ...base, storeId }).title);
  const identity = "ESTEE LAUDER Nutritious 2-in-1 Foam Cleanser 125ml";

  for (const title of titles) {
    assert.ok(title.startsWith(identity), title);
    assert.ok(title.length >= 80, title);
    assert.ok(title.length <= 100, title);
    assert.match(title, /, /, title);
    assert.equal(/\bShopee\b/i.test(title), false, title);
    assert.equal(/\bchinh hang\b/i.test(title), false, title);
    assert.equal(validateVietnameseListing({
      title,
      detail: [
        "ESTEE LAUDER Nutritious 2-in-1 Foam Cleanser 125ml",
        "Công dụng chính",
        "- Làm sạch dịu nhẹ, hỗ trợ da thông thoáng và giúp bề mặt da mềm mịn hơn.",
        "- Phù hợp dùng hằng ngày trong quy trình chăm sóc da đơn giản tại nhà.",
        "Đối tượng phù hợp",
        "- Phù hợp da dầu, da hỗn hợp và người cần làm sạch sau khi ra ngoài.",
        "Cảm giác khi dùng",
        "- Tạo bọt mịn, dễ rửa sạch và không gây cảm giác khô căng.",
        "Cách dùng",
        "- Làm ướt mặt, tạo bọt rồi mát xa nhẹ nhàng trước khi rửa sạch.",
        "Cách bảo quản",
        "- Bảo quản nơi khô thoáng, tránh ánh nắng trực tiếp."
      ].join("\n")
    }).valid, true);
  }
  assert.equal(new Set(titles).size, 3, titles.join("\n"));
  assert.match(folded(titles[0]), /Lam sach sau|Loai bo bui ban|mem min/i);
  assert.match(folded(titles[1]), /dau thua|thoang mat|can bang/i);
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
    assert.ok(listing.title.length >= 80 && listing.title.length <= 100, listing.title);
    assert.ok(listing.title.startsWith("ESTEE LAUDER Nutritious 2-in-1 Foam Cleanser 125ml"), listing.title);
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

test("makeListingDraft keeps English brand and product name as identity", () => {
  const listing = makeListingDraft({
    productName: "[Chinh hang] Estee Lauder Soft Clean Infusion Nuoc hoa hong duong am 400ml",
    skuGroup: ["YSLD80501"],
    notes: "duong am, lam diu da, chai hong, phu hop da kho",
    storeId: "8"
  });

  assert.match(listing.title, /Estee Lauder Soft Clean Infusion/i);
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
  assert.match(listing.title, /Estee Lauder Soft Clean Infusion/i);
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

  assert.match(listing.title, /HydraSoft Soothing Lotion/i);
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
    detail: "San pham nay co SKU YSLD80501 va noi dung 中文 khong co dau tieng Viet."
  };

  assert.deepEqual(validateVietnameseListing(listing).errors, [
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

test("task management search matches product, SKU, status, and target store", () => {
  const task = {
    productName: "Estee Lauder Soft Clean Infusion",
    skuGroup: ["YSLD80501", "YSLD80502"],
    status: "pipeline_done",
    targetStores: ["7", "9"]
  };

  assert.equal(taskMatchesQuery(task, "soft clean"), true);
  assert.equal(taskMatchesQuery(task, "ysld80502"), true);
  assert.equal(taskMatchesQuery(task, "pipeline_done"), true);
  assert.equal(taskMatchesQuery(task, "store:9"), true);
  assert.equal(taskMatchesQuery(task, "kerastase"), false);
  assert.equal(taskMatchesQuery(task, ""), true);
});

test("task management archive filter hides archived tasks by default", () => {
  const activeTask = { productName: "Active", archived: false };
  const archivedTask = { productName: "Archived", archived: true };

  assert.equal(shouldShowTask(activeTask), true);
  assert.equal(shouldShowTask(archivedTask), false);
  assert.equal(shouldShowTask(archivedTask, { includeArchived: true }), true);
  assert.equal(shouldShowTask(activeTask, { query: "missing" }), false);
});
