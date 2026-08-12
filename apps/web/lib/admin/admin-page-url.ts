export type AdminPageUrlSource = "requested_url" | "normalized_url" | "scan_config" | "scan_domain";

type ResolveAdminPageUrlInput = {
  normalizedUrl?: unknown;
  requestedUrl?: unknown;
  scanConfig?: Record<string, unknown> | null;
  scanDomain?: unknown;
};

export type ResolvedAdminPageUrl = {
  source: AdminPageUrlSource;
  url: string;
};

function nonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function scanConfigPageUrl(scanConfig: Record<string, unknown> | null | undefined) {
  for (const key of ["targetUrl", "startUrl", "homepageUrl", "normalizedUrl", "url"]) {
    const value = nonEmptyString(scanConfig?.[key]);
    if (value) return value;
  }
  return null;
}

function scanDomainPageUrl(value: unknown) {
  const domain = nonEmptyString(value);
  if (!domain) return null;

  try {
    const url = new URL(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function resolveAdminPageUrl(input: ResolveAdminPageUrlInput): ResolvedAdminPageUrl | null {
  const requestedUrl = nonEmptyString(input.requestedUrl);
  if (requestedUrl) return { source: "requested_url", url: requestedUrl };

  const normalizedUrl = nonEmptyString(input.normalizedUrl);
  if (normalizedUrl) return { source: "normalized_url", url: normalizedUrl };

  const configuredUrl = scanConfigPageUrl(input.scanConfig);
  if (configuredUrl) return { source: "scan_config", url: configuredUrl };

  const scanDomain = scanDomainPageUrl(input.scanDomain);
  return scanDomain ? { source: "scan_domain", url: scanDomain } : null;
}
