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
  "appliedRules",
  "bridgeGeneratedBy",
  "bridgeMappingType",
  "bridgeRuleId",
  "cipaPenRegisterTheorySupport",
  "concernPolicyId",
  "concernPolicyIds",
  "concernPolicyRuleId",
  "concernPolicyRuleIds",
  "cpraSharingSupport",
  "defaultSurfacePriority",
  "familyPacketFindingId",
  "ftcDarkPatternOrDeceptionSupport",
  "gdprEprivacyConsentSupport",
  "internalPolicyId",
  "internalPolicyIds",
  "legalRelevance",
  "normalizedConcernId",
  "normalizedConcernIds",
  "policyAnchorRef",
  "policyAnchors",
  "policyId",
  "policyIds",
  "preconsent_violation_count",
  "runtimeAnchorRef",
  "sourceEvidenceIds",
  "supportTargetId",
  "supports",
  "surfacing",
  "surfacingDecision",
  "family",
  "evidencePreview"
]);

const INTERNAL_KEY_PATTERNS = [
  /defaultSurfacePriority/i,
  /legalRelevance/i,
  /PenRegisterTheorySupport/i,
  /EprivacyConsentSupport/i,
  /cpraSharingSupport/i,
  /DarkPatternOrDeceptionSupport/i,
  /normalized.*concern/i,
  /concern.*policy/i,
  /internal.*policy/i,
  /policy.*rule.*id/i,
  /preconsent_?violation_?count/i,
  /projection.*support/i,
  /support.*lane/i,
  /surface.*priority/i,
  /confirmed_when_validation_and_runtime_artifacts/i,
  /review_runtime_without_effect_evidence/i
];

const SENSITIVE_PUBLIC_KEYS = [
  /cookie.*value/i,
  /payload.*body/i,
  /payload(?:Value|Values|Content|Contents|Data)/i,
  /raw.*dom/i,
  /screenshot/i,
  /user.*entered/i,
  /personal.*data/i,
  /identifier.*value/i
];

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

function shouldSuppressKey(key: string) {
  return EVIDENCE_JSON_KEYS_TO_SUPPRESS.has(key) || INTERNAL_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function shouldRedactSensitiveValue(key: string) {
  return SENSITIVE_PUBLIC_KEYS.some((pattern) => pattern.test(key));
}

function sanitizeUrlForPublicDisplay(value: string) {
  try {
    const parsed = new URL(value.trim());
    const queryKeys = [...parsed.searchParams.keys()].filter(Boolean);
    const originPath = `${parsed.origin}${parsed.pathname}`;
    if (queryKeys.length === 0 && parsed.hash.length === 0) {
      return originPath;
    }

    const queryKeySuffix = queryKeys.length > 0 ? ` query_keys=${[...new Set(queryKeys)].slice(0, 8).join(",")}` : "";
    return `${originPath} [query_redacted=true${queryKeySuffix}]`;
  } catch {
    return value;
  }
}

function sanitizeEmbeddedUrlsForPublicDisplay(value: string) {
  return value.replace(/https?:\/\/[^\s"'<>)]+/gi, (match) => sanitizeUrlForPublicDisplay(match));
}

export function sanitizePublicReportEvidenceText(value: string) {
  return sanitizeEmbeddedUrlsForPublicDisplay(value)
    .replace(/\bpreconsent_violation_count\b/gi, "preConsentSignalCount")
    .replace(/\bdoes not yet prove\b/gi, "does not yet fully support")
    .replace(/\bWCAG rule violations\b/gi, "automated accessibility rule examples for review")
    .replace(/\bviolation risk\b/gi, "review risk");
}

function withEvidenceRole(value: unknown, role: string): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => withEvidenceRole(entry, role));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return record.evidenceRole || record.role ? record : { evidenceRole: role, ...record };
  }
  return value;
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
  urls.push(sanitizeUrlForPublicDisplay(trimmed));
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
      return pushFreshUrl(urls, value, context) && urls.length === 0 ? undefined : compactLongString(urls[0] ?? sanitizeUrlForPublicDisplay(value));
    }

    return compactLongString(sanitizePublicReportEvidenceText(value));
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
    if (shouldSuppressKey(key)) {
      continue;
    }

    if (shouldRedactSensitiveValue(key)) {
      if (entry !== null && entry !== undefined && entry !== false) {
        entries.push([key, "[redacted_for_public_report]"]);
      }
      continue;
    }

    if (collapsedAliasKeys.has(key)) {
      continue;
    }

    const roleAnnotatedEntry =
      key === "cookieWriteEvidence" || key === "storageEvidence"
        ? withEvidenceRole(entry, "finding_supporting_artifact")
        : key === "relatedRuntimeRequests"
          ? withEvidenceRole(entry, "related_context_only")
          : entry;
    const compacted = compactEvidenceJsonForDisplayInternal(roleAnnotatedEntry, context);
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
