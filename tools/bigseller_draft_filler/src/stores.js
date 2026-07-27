export function normalizeStoreText(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/[()]/g, "（")
    .toLowerCase();
}

export function identifyStore(pageText, storeMap) {
  if (!Array.isArray(storeMap) || storeMap.length === 0) {
    throw new Error("storeMap must contain at least one store mapping.");
  }

  const normalizedPageText = normalizeStoreText(pageText);
  const match = storeMap.find((entry) => {
    const candidate = normalizeStoreText(entry.match);
    return candidate.length > 0 && normalizedPageText.includes(candidate);
  });

  if (!match) {
    const configured = storeMap.map((entry) => entry.match).join(", ");
    throw new Error(`No configured store matched the current page. Configured stores: ${configured}`);
  }

  return match;
}
