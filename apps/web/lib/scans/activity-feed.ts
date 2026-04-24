const METADATA_PRIORITY_KEYS = [
  "requestedPageCount",
  "pagesRequested",
  "pagesScanned",
  "pagesPersisted",
  "source",
  "originIp",
  "githubRunId",
  "githubWorkflow",
  "totalSignals",
  "trackerCountTotal",
  "trackerRowsPersisted",
  "profile",
  "scanPlanProfile",
  "crawlSource",
  "homepageFetchStatus",
  "robotsFetchStatus",
  "hasPreviousSnapshot",
  "scanConfidence",
  "savedChangeEvents",
  "savedVendorRows",
  "savedAccessibilityRuleCounts",
  "privacyPolicyPresent",
  "termsOfServicePresent",
  "contactPagePresent",
  "trackingBeforeConsentDetected",
  "thirdPartyCookieSetBeforeConsent",
  "cookieBannerPresent",
  "legalCoverageScore",
  "accessibilityScore",
  "wcagErrorCountTotal",
  "isBaseline"
] as const;

function formatMetadataValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.slice(0, 3).join(",");
  }

  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

export function formatMetadataPreview(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }

  const metadataEntries = Object.entries(metadata).filter(([, value]) => value !== null && value !== undefined);
  const prioritizedKeys = new Set(METADATA_PRIORITY_KEYS);
  const orderedEntries = [
    ...METADATA_PRIORITY_KEYS.map((key) => metadataEntries.find(([entryKey]) => entryKey === key)).filter(
      (entry): entry is [string, unknown] => Boolean(entry)
    ),
    ...metadataEntries.filter(([key]) => !prioritizedKeys.has(key as (typeof METADATA_PRIORITY_KEYS)[number]))
  ];

  const entries = orderedEntries
    .slice(0, 6)
    .map(([key, value]) => {
      const nextValue = formatMetadataValue(value);
      return nextValue ? `${key}=${nextValue}` : null;
    })
    .filter((value): value is string => Boolean(value));

  if (entries.length === 0) {
    return [];
  }

  const grouped: string[] = [];

  for (let index = 0; index < entries.length; index += 2) {
    grouped.push(entries.slice(index, index + 2).join(" · "));
  }

  return grouped;
}

export function buildEventActivityFeed(input: {
  events: Array<{
    eventType: string;
    message: string;
    metadataJson: unknown;
  }>;
  fallbackLines: string[];
  latestLabel: string;
  maxEvents?: number;
}) {
  if (input.events.length === 0) {
    return input.fallbackLines;
  }

  return input.events.slice(-(input.maxEvents ?? 16)).flatMap((event, index, source) => {
    const label = index === source.length - 1 ? input.latestLabel : "log";
    const metadataLines = formatMetadataPreview(event.metadataJson);
    const eventLine = `${label} evt=${event.eventType} · ${event.message}`;
    const detailLines = metadataLines.map((metadataLine) => `data> ${metadataLine}`);
    return [eventLine, ...detailLines];
  });
}
