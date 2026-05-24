import type { UnifiedFindingDisplayPacket } from "./unified-findings";

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

export function stripReportUrlAnnotation(value: string) {
  return value.replace(/\s+\[(?:query_redacted|redacted|query_keys)=[^\]]+\]$/i, "").trim();
}

export function isRuntimeRequestEvidenceUrl(value: string | null | undefined) {
  if (!value || !/^https?:\/\//i.test(value)) {
    return false;
  }

  const normalizedValue = stripReportUrlAnnotation(value);
  try {
    const parsed = new URL(normalizedValue);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    const runtimeHosts = [
      "ajax.googleapis.com",
      "assets.adobedtm.com",
      "cdn.cookielaw.org",
      "cdn.jwplayer.com",
      "cdn.quantummetric.com",
      "cms.quantserve.com",
      "dpm.demdex.net",
      "idsync.rlcdn.com",
      "maps.googleapis.com",
      "securepubads.g.doubleclick.net"
    ];
    const runtimeHostSuffixes = [
      ".doubleverify.com",
      ".doubleclick.net",
      ".googlesyndication.com",
      ".google-analytics.com",
      ".googletagmanager.com",
      ".quantserve.com",
      ".rubiconproject.com",
      ".rlcdn.com"
    ];
    const runtimePathPattern = /\.(?:gif|js|mjs|css|png|jpg|jpeg|webp|svg|woff2?)$|\/(?:collect|g\/collect|id|pixel|sync|tag|track|tr)\b/i;

    return (
      runtimeHosts.includes(host) ||
      runtimeHostSuffixes.some((suffix) => host.endsWith(suffix)) ||
      runtimePathPattern.test(pathname) ||
      (pathname === "/maps/api/js" && host === "maps.googleapis.com")
    );
  } catch {
    return false;
  }
}

export function getReportFacingScannedPageUrls(finding: Pick<UnifiedFindingDisplayPacket, "evidence" | "primaryPageUrl">) {
  return uniqueStrings([...(finding.evidence?.pageUrls ?? []), finding.primaryPageUrl])
    .map(stripReportUrlAnnotation)
    .filter((candidate) => /^https?:\/\//i.test(candidate) && !isRuntimeRequestEvidenceUrl(candidate));
}

export function getReportFacingScannedPageUrl(finding: Pick<UnifiedFindingDisplayPacket, "evidence" | "primaryPageUrl">) {
  const candidates = uniqueStrings([
    ...(finding.evidence?.pageUrls ?? []),
    finding.primaryPageUrl,
    ...(finding.evidence?.sourceUrls ?? [])
  ]);

  for (const candidate of candidates) {
    const normalizedCandidate = stripReportUrlAnnotation(candidate);
    if (/^https?:\/\//i.test(normalizedCandidate) && !isRuntimeRequestEvidenceUrl(normalizedCandidate)) {
      return normalizedCandidate;
    }
  }

  return null;
}
