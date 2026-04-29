const MAX_ARRAY_SAMPLE = 5;
const MAX_STRING_LENGTH = 240;

function compactLongString(value: string) {
  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  const slicePoint = value.lastIndexOf(" ", MAX_STRING_LENGTH);
  const endIndex = slicePoint > 0 ? slicePoint : MAX_STRING_LENGTH;
  return `${value.slice(0, endIndex).trimEnd()}... [truncated ${value.length - endIndex} chars]`;
}

const EVIDENCE_JSON_KEYS_TO_SUPPRESS = new Set([
  "familyPacketFindingId",
  "evidencePreview"
]);

const URL_ALIAS_KEYS_TO_COLLAPSE = new Set([
  "pageUrls",
  "requestUrls",
  "requests",
  "runtimeEvidenceUrls",
  "runtimeRequestUrls",
  "sourceUrls"
]);

type CompactEvidenceJsonContext = {
  seenUrls: Set<string>;
};

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value.trim());
}

function normalizeUrlKey(value: string) {
  return value.trim().toLowerCase();
}

function pushFreshUrl(urls: string[], value: string, context: CompactEvidenceJsonContext) {
  const trimmed = value.trim();
  if (!trimmed || !isHttpUrl(trimmed)) {
    return false;
  }

  const key = normalizeUrlKey(trimmed);
  if (context.seenUrls.has(key)) {
    return true;
  }

  context.seenUrls.add(key);
  urls.push(trimmed);
  return true;
}

function collectUrlStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return isHttpUrl(value) ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectUrlStrings(entry));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  return Object.entries(record).flatMap(([key, entry]) => {
    if (key.toLowerCase() === "url" || key.toLowerCase().endsWith("url")) {
      return collectUrlStrings(entry);
    }

    return [];
  });
}

function compactEvidenceJsonForDisplayInternal(value: unknown, context: CompactEvidenceJsonContext): unknown {
  if (Array.isArray(value)) {
    const compactedItems = value
      .map((entry) => compactEvidenceJsonForDisplayInternal(entry, context))
      .filter((entry) => entry !== undefined);
    const sampledItems = compactedItems.slice(0, MAX_ARRAY_SAMPLE);
    if (value.length > 0 && compactedItems.length === 0) {
      return undefined;
    }
    if (compactedItems.length <= MAX_ARRAY_SAMPLE) {
      return compactedItems;
    }

    return {
      sample: sampledItems,
      totalCount: compactedItems.length,
      truncated: true
    };
  }

  if (typeof value === "string") {
    if (isHttpUrl(value)) {
      const urls: string[] = [];
      return pushFreshUrl(urls, value, context) && urls.length === 0 ? undefined : compactLongString(value.trim());
    }

    return compactLongString(value);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const entries: Array<[string, unknown]> = [];
  const collapsedUrls: string[] = [];
  const objectEntries = Object.entries(value);
  const collapsedAliasKeys = new Set<string>();

  for (const [key, entry] of objectEntries) {
    if (!URL_ALIAS_KEYS_TO_COLLAPSE.has(key)) {
      continue;
    }

    const urls = collectUrlStrings(entry);
    if (urls.length === 0) {
      continue;
    }

    for (const url of urls) {
      pushFreshUrl(collapsedUrls, url, context);
    }
    collapsedAliasKeys.add(key);
  }

  for (const [key, entry] of objectEntries) {
    if (EVIDENCE_JSON_KEYS_TO_SUPPRESS.has(key)) {
      continue;
    }

    if (collapsedAliasKeys.has(key)) {
      continue;
    }

    const compacted = compactEvidenceJsonForDisplayInternal(entry, context);
    if (compacted !== undefined) {
      entries.push([key, compacted]);
    }
  }

  if (collapsedUrls.length > 0) {
    entries.push([
      "urls",
      collapsedUrls.length <= MAX_ARRAY_SAMPLE
        ? collapsedUrls.map((url) => compactLongString(url))
        : {
            sample: collapsedUrls.slice(0, MAX_ARRAY_SAMPLE).map((url) => compactLongString(url)),
            totalCount: collapsedUrls.length,
            truncated: true
          }
    ]);
  }

  return Object.fromEntries(entries);
}

export function compactEvidenceJsonForDisplay(value: unknown): unknown {
  return compactEvidenceJsonForDisplayInternal(value, { seenUrls: new Set() });
}
