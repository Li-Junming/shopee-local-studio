import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySavedListingText, verifySavedImageCount, pendingSaveJobs, buildDiscoveredOutputConfig } from '../src/fill-drafts.js';

test('saved draft verification accepts only persisted matching title and detail', () => {
  const expected = { title: 'Tinh chất', detail: 'Dòng một\nDòng hai' };
  assert.equal(verifySavedListingText({ title: 'Tinh cha\u0302\u0301t', detail: 'Dòng một\r\nDòng hai' }, expected), true);
  assert.throws(() => verifySavedListingText({ ...expected, title: 'Old title' }, expected), /does not match/);
  assert.throws(() => verifySavedListingText({ ...expected, detail: 'Old cleanser copy' }, expected), /does not match/);
});

test('missing or extra saved images fail final acceptance', () => {
  assert.equal(verifySavedImageCount(4, 4), true);
  for (const count of [0, 3, 5]) assert.throws(() => verifySavedImageCount(count, 4), /completion was not recorded/);
});

test('unverified or changed assets are not skipped on resume', () => {
  const jobs = [{ editUrl: 'draft-1' }, { editUrl: 'draft-2' }, { editUrl: 'draft-3' }];
  const progress = { completedJobs: [
    { key: 'draft-1' },
    { key: 'draft-2', verificationVersion: 1, assetSignature: 'old' },
    { key: 'draft-3', verificationVersion: 1, assetSignature: 'same' }
  ] };
  assert.deepEqual(pendingSaveJobs(jobs, progress, 1, { 'draft-1': 'new', 'draft-2': 'new', 'draft-3': 'same' }), jobs.slice(0, 2));
});

test('discovery retains final acceptance policy in generated save jobs', () => {
  const config = { verifySavedText: true, verifySavedImages: true, requiredImageCount: 4, requiredSaveVerificationVersion: 1, storeCooldownMs: 1000 };
  const output = buildDiscoveredOutputConfig(config, [{ editUrl: 'fixture' }]);
  for (const field of Object.keys(config)) assert.equal(output[field], config[field]);
});
