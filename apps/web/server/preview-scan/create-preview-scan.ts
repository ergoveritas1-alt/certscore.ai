import { createPreviewScanRecord, findOrCreateAnonymousPreviewDomain } from "./preview-scan-repository";

export async function createPreviewScan(input: { hostname: string; normalizedUrl: string }) {
  const domain = await findOrCreateAnonymousPreviewDomain(input.hostname, input.normalizedUrl);
  const scan = await createPreviewScanRecord({
    domainId: domain.id,
    hostname: domain.hostname,
    normalizedUrl: domain.normalized_url
  });

  return {
    domain,
    scan
  };
}
