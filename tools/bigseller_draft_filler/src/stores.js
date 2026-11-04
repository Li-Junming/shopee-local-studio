export function normalizeStoreText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[()（）\-‐‑–—_]/g, "")
    .toLowerCase();
}

// Store numbers are only meaningful together with their region. These keys
// preserve the original asset folders even when BigSeller renames a shop.
export function storeIdentities(text) {
  const value = normalizeStoreText(text);
  const identities = new Set();
  for (const match of value.matchAll(/(?:平政|2仓)(\d+)店/g)) {
    identities.add(`warehouse2:${Number(match[1])}`);
  }
  for (const match of value.matchAll(/(?:胡志明|姐夫)(\d+)店/g)) {
    identities.add(`hcm:${Number(match[1])}`);
  }
  return [...identities];
}

export function storeMatchesText(text, store) {
  const entry = typeof store === "string" ? { match: store } : store || {};
  const wanted = normalizeStoreText(entry.match);
  if (!wanted) return false;
  const expected = storeIdentities(entry.match);
  // The legacy source setting "1店" means the HCM source, not Bình Chánh 1.
  if (wanted === "1店") expected.push("hcm:1");
  const observed = storeIdentities(text);
  if (expected.length) {
    return expected.length === 1 && observed.length === 1 && expected[0] === observed[0];
  }
  // Keep unrelated custom shop mappings working without guessing a region.
  return [entry.match, ...(entry.aliases || [])].filter(Boolean).some((alias) => {
    const escaped = normalizeStoreText(alias).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![0-9])${escaped}(?![0-9])`, "u").test(normalizeStoreText(text));
  });
}

export function chooseCopyDialogStoreCandidate(candidates, store) {
  const entry = typeof store === "string" ? { match: store } : store;
  const controls = candidates.filter((candidate) => candidate.hasCheckbox);
  const exact = controls.filter((candidate) => normalizeStoreText(candidate.text) === normalizeStoreText(entry.match));
  const aliases = controls.filter((candidate) => (entry.aliases || []).some((alias) => normalizeStoreText(candidate.text) === normalizeStoreText(alias)));
  // Current full remarks identify the owner as well as region/number. Only
  // fall back to renamed/legacy identities when no exact configured name exists.
  // An exact but disabled shop must never redirect selection to another owner.
  const named = exact.length ? exact : aliases.length ? aliases : controls.filter((candidate) => storeMatchesText(candidate.text, entry));
  const matches = named.filter((candidate) => !candidate.disabled || candidate.checked);
  const unique = new Map(matches.map((candidate) => [
    candidate.key ?? [candidate.x, candidate.y, candidate.width, candidate.height].join(":"), candidate
  ]));
  if (unique.size > 1) throw new Error(`Ambiguous copy-dialog store: ${entry.match}`);
  return [...unique.values()][0] || null;
}

export function identifyStore(pageText, storeMap, fallbackText = "") {
  if (!Array.isArray(storeMap) || storeMap.length === 0) {
    throw new Error("storeMap must contain at least one store mapping.");
  }

  const visibleIdentities = storeIdentities(pageText);
  if (visibleIdentities.length > 1) throw new Error("Ambiguous store identities on the current page.");
  const match = findStoreInText(pageText, storeMap)
    || (visibleIdentities.length === 0 ? findStoreInText(fallbackText, storeMap) : null);

  if (!match) {
    const configured = storeMap.map((entry) => entry.match).join(", ");
    throw new Error(`No configured store matched the current page. Configured stores: ${configured}`);
  }

  return match;
}

function findStoreInText(text, storeMap) {
  if (!normalizeStoreText(text)) return null;
  const matches = storeMap.filter((entry) => storeMatchesText(text, entry));
  if (matches.length > 1) throw new Error("Ambiguous configured store on the current page.");
  return matches[0] || null;
}
