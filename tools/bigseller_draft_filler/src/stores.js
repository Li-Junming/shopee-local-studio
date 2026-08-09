export function normalizeStoreText(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/[()]/g, "（")
    .toLowerCase();
}

export function identifyStore(pageText, storeMap, fallbackText = "") {
  if (!Array.isArray(storeMap) || storeMap.length === 0) {
    throw new Error("storeMap must contain at least one store mapping.");
  }

  const match = findStoreInText(pageText, storeMap) || findStoreInText(fallbackText, storeMap);

  if (!match) {
    const configured = storeMap.map((entry) => entry.match).join(", ");
    throw new Error(`No configured store matched the current page. Configured stores: ${configured}`);
  }

  return match;
}

function findStoreInText(text, storeMap) {
  const normalizedText = normalizeStoreText(text);
  if (!normalizedText) return null;
  return storeMap.find((entry) => {
    const candidate = normalizeStoreText(entry.match);
    return candidate.length > 0 && normalizedText.includes(candidate);
  }) || null;
}
