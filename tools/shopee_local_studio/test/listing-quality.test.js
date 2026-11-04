import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAuditedListings, auditListingSet, countTitleCharacters, COPY_STORE_IDS, extractCoreProductName } from '../src/listing-quality.js';
import { validateVietnameseListing } from '../src/core.js';
import { extractSourceProductFacts } from '../src/source-derived-copy.js';
const productName = '𝕊𝕂𝕀ℕℂ𝔼𝕌𝕋𝕀ℂ𝔸𝕃𝕊 Blemish + Age Defense 30ml Tinh Chất BHA LHA';
const options = { productName, storeIds: COPY_STORE_IDS };

test('Advanced cream long Vietnamese source title generates ten distinct titles and cream details', () => {
  const name = '𝕊𝕂𝕀ℕℂ𝔼𝕌𝕋𝕀ℂ𝔸𝕃𝕊 𝐀.𝐆.𝐄. 𝐈𝐧𝐭𝐞𝐫𝐫𝐮𝐩𝐭𝐞𝐫 𝐀𝐝𝐯𝐚𝐧𝐜𝐞𝐝 Kem Dưỡng Chống Lão Hóa Mờ Nếp Nhăn Sâu Da Săn Chắc';
  const listings = makeAuditedListings({productName:name});
  assert.equal(auditListingSet(listings,{productName:name}).valid,true);
  assert.equal(new Set(Object.values(listings).map(x=>x.title)).size,10);
  for(const listing of Object.values(listings)) {
    assert.match(listing.title,/Kem dưỡng SkinCeuticals A.G.E. Interrupter Advanced/);
    assert.doesNotMatch(listing.detail,/Ultra Serum|30ml|HA\/B5|tạo bọt/);
  }
  assert.equal(extractSourceProductFacts(name,'sau khi làm sạch da').category,'skincare');
  const sizedListings = makeAuditedListings({ productName: `${name} 48g` });
  assert.ok(Object.values(sizedListings).every(listing => listing.title.includes('48g')));
  sizedListings['4'].title = sizedListings['4'].title.replace('Advanced', 'AdvanCedX');
  assert.match(auditListingSet(sizedListings, { productName: `${name} 48g` }).errors.join(' '), /identity changed/);
});

test('long source marketing tails do not truncate exact AGE product identity or block ten stores', () => {
  const name = '𝕊𝕂𝕀ℕℂ𝔼𝕌𝕋𝕀ℂ𝔸𝕃𝕊 𝐀.𝐆.𝐄. 𝐈𝐧𝐭𝐞𝐫𝐫𝐮𝐩𝐭𝐞𝐫 𝐔𝐥𝐭𝐫𝐚 𝐒𝐞𝐫𝐮𝐦 𝟑𝟎𝐦𝐥 Tinh Chất Proxylane Săn Chắc Nâng Gọn Mặt Mờ Nhăn';
  assert.equal(extractCoreProductName(name), 'SKINCEUTICALS A.G.E. Interrupter Ultra Serum 30ml');
  assert.equal(extractCoreProductName('Brand Foundation 30ml Shade 2N Bundle 2'), 'Brand Foundation 30ml Shade 2N Bundle 2');
  const listings = makeAuditedListings({ productName: name });
  assert.equal(auditListingSet(listings, { productName: name }).valid, true);
  assert.equal(new Set(Object.values(listings).map(x => x.title)).size, 10);
  for (const listing of Object.values(listings)) {
    assert.match(listing.title, /A\.G\.E\. Interrupter Ultra Serum 30ml/);
    assert.ok(countTitleCharacters(listing.title) >= 90 && countTitleCharacters(listing.title) <= 100);
    assert.doesNotMatch(listing.detail, /HA\/B5|B5\/HA|2-3 giọt|tạo bọt/);
  }
});

test('ten stores get distinct plain Vietnamese serum copy, with exact identity and strict title length', () => {
  const listings = makeAuditedListings(options);
  assert.deepEqual(listings, makeAuditedListings(options));
  assert.equal(new Set(Object.values(listings).map(x => x.title)).size, 10);
  assert.equal(new Set(Object.values(listings).map(x => x.detail)).size, 10);
  for (const listing of Object.values(listings)) {
    assert.ok(countTitleCharacters(listing.title) >= 90 && countTitleCharacters(listing.title) <= 100);
    assert.match(listing.title, /SkinCeuticals Blemish \+ Age Defense 30ml/);
    assert.doesNotMatch(listing.detail, /tạo bọt|rửa sạch với nước|sữa rửa mặt/iu);
    assert.equal(validateVietnameseListing(listing).valid, true);
  }
  assert.equal(auditListingSet(listings, options).valid, true);
});

test('89 and 101 character titles fail; 90 and 100 pass; NFC counts combining accents consistently', () => {
  const listing = makeAuditedListings(options)['4'];
  for (const size of [89, 90, 100, 101]) {
    const title = listing.title.slice(0, 80) + 'a'.repeat(30);
    const candidate = { ...listing, title: title.slice(0, size) };
    const audit = auditListingSet({ '4': candidate }, { productName, storeIds: ['4'] });
    assert.equal(audit.errors.some(x => x.includes('title must')), size < 90 || size > 100);
    assert.equal(validateVietnameseListing(candidate).errors.some(x => x.includes('Title must')), size < 90 || size > 100);
  }
  assert.equal(countTitleCharacters('a\u0301'), 1);
});

test('duplicates and paragraph shuffling cannot pass cross-store audit', () => {
  const listings = makeAuditedListings(options);
  listings['5'] = { ...listings['4'] };
  assert.match(auditListingSet(listings, options).errors.join(' '), /duplicate title|duplicate detail/);
  listings['5'].title = makeAuditedListings(options)['5'].title;
  listings['5'].detail = listings['4'].detail.split('\n\n').reverse().join('\n\n');
  assert.match(auditListingSet(listings, options).errors.join(' '), /reuses too much/);
});

test('wrong serum usage, fabricated promises and incorrect volume are blocked', () => {
  for (const bad of ['Tạo bọt rồi rửa sạch với nước.', 'Cam kết trị dứt điểm trong 3 ngày.']) {
    const listings = makeAuditedListings(options);
    listings['4'].detail += `\n\n${bad}`;
    assert.equal(auditListingSet(listings, options).valid, false);
  }
  const listings = makeAuditedListings(options);
  listings['4'].title = listings['4'].title.replace('30ml', '50ml');
  assert.match(auditListingSet(listings, options).errors.join(' '), /identity or volume/);
});

test('Vietnamese tinh chất and styled source names are recognized as skincare; unknown type stops generation', () => {
  assert.equal(extractSourceProductFacts(productName).category, 'skincare');
  assert.throws(() => makeAuditedListings({ productName: 'ABC Model 123', storeIds: ['4'] }), /loại sản phẩm/);
});

test('small word substitutions cannot disguise copied paragraphs', () => {
  const listings = makeAuditedListings(options);
  listings['5'].detail = listings['4'].detail.split('\n\n').map(part => part.length > 45 ? `${part} Lưu ý.` : part).reverse().join('\n\n');
  const audit = auditListingSet(listings, options);
  assert.match(audit.errors.join(' '), /too similar/);
});

test('invented concentrations and missing source sizes fail the audit', () => {
  const listings = makeAuditedListings(options);
  listings['4'].detail += '\n\nChứa 20% thành phần dưỡng da.';
  assert.match(auditListingSet(listings, options).errors.join(' '), /unsupported specification 20%/);
  const listing = makeAuditedListings(options)['4'];
  const name = 'Example Serum 50ml';
  const audit = auditListingSet({ '4': listing }, { productName: name, storeIds: ['4'] });
  assert.match(audit.errors.join(' '), /exact product identity|50ml is missing/);
  assert.equal(audit.reviewLevel, 'generic_rules');
  assert.ok(audit.warnings.length);
});
