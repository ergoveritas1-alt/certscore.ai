/** Documented service configuration context; never an observed IP location or transfer finding. */
export const SERVICE_REGION_REFERENCE_VERSION = "certscore-service-regions-2026-09-07-v1";
export type ServiceRegionReference = Readonly<{
  id: string;
  provider: string;
  region: string;
  label: string;
  basis: "documented_service_region";
  checkedAt: string;
  registryVersion: string;
  note: string;
  sources: ReadonlyArray<Readonly<{ url: string; title: string }>>;
}>;
const sentrySources = [
  { url: "https://docs.sentry.io/api/", title: "Sentry regional domains" },
  { url: "https://sentry.io/changelog/ingestion-ip-addresses-are-changing/", title: "Sentry ingestion endpoint names" },
  { url: "https://sentry.io/changelog/data-storage-location-in-germany-is-generally-available/", title: "Sentry Germany hosting" },
];
const reference = (id: string, provider: string, region: string, label: string, note: string, sources: ServiceRegionReference["sources"]): ServiceRegionReference => ({
  id, provider, region, label, note, sources, basis: "documented_service_region", checkedAt: "2026-09-07", registryVersion: SERVICE_REGION_REFERENCE_VERSION,
});
export const SERVICE_REGION_REFERENCES: readonly ServiceRegionReference[] = [
  reference("sentry-us-ingestion", "Sentry", "US", "Sentry · US region", "The retained ingestion URL selects Sentry's US region. This does not locate the network edge or establish all subsequent processing locations.", sentrySources),
  reference("sentry-de-ingestion", "Sentry", "DE", "Sentry · Germany region", "The retained ingestion URL selects Sentry's Germany region. This does not locate the network edge or establish all subsequent processing locations.", sentrySources),
  reference("google-mp-eu", "Google Analytics", "EU", "Google Analytics · EU collection", "Google documents this Measurement Protocol endpoint for EU collection. This reference does not establish permanent EU storage or apply to other Google endpoint paths.", [
    { url: "https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference", title: "Google Measurement Protocol transport reference" },
  ]),
];

/** Exact HTTPS authorities and documented request paths only; asset URLs and hostname hints fail closed. */
export function resolveDocumentedServiceRegion(requestUrl: string | null | undefined): ServiceRegionReference | null {
  if (!requestUrl) return null;
  let url: URL;
  try { url = new URL(requestUrl); } catch { return null; }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
  const sentry = /^o\d+\.ingest\.(us|de)\.sentry\.io$/.exec(url.hostname);
  if (sentry && /^\/api\/\d+\/(?:envelope|store)\/$/.test(url.pathname)) return SERVICE_REGION_REFERENCES[sentry[1] === "us" ? 0 : 1]!;
  if (url.hostname === "region1.google-analytics.com" && url.pathname === "/mp/collect") return SERVICE_REGION_REFERENCES[2]!;
  return null;
}
export function documentedServiceRegions(requestUrls: readonly string[]): ServiceRegionReference[] {
  const references = new Map<string, ServiceRegionReference>();
  for (const url of requestUrls) { const row = resolveDocumentedServiceRegion(url); if (row) references.set(row.id, row); }
  return [...references.values()];
}
