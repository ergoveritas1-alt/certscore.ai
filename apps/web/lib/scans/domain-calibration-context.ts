export type DomainHostKind =
  | "public_site"
  | "platform_or_hosting_root"
  | "infrastructure_service"
  | "adtech_or_measurement_service"
  | "suspicious_or_typo_candidate";

export type DomainCalibrationContext = {
  hostKind: DomainHostKind;
  reasons: string[];
};

const HOSTING_ROOTS = new Set([
  "appspot.com",
  "azurewebsites.net",
  "cloudapp.net",
  "elasticbeanstalk.com",
  "firebaseapp.com",
  "github.io",
  "herokuapp.com",
  "netlify.app",
  "pages.dev",
  "run.app",
  "vercel.app"
]);

const INFRA_ROOTS = new Set([
  "akamaiedge.net",
  "cloudfront.net",
  "fastly.net",
  "googleapis.com",
  "gstatic.com"
]);

const INFRA_TOKENS = [
  "api",
  "assets",
  "auth",
  "cache",
  "cdn",
  "dns",
  "edge",
  "events",
  "gateway",
  "ingest",
  "metrics",
  "origin",
  "relay",
  "sdk",
  "service",
  "static",
  "telemetry"
];

const ADTECH_TOKENS = [
  "ad",
  "ads",
  "adservice",
  "analytics",
  "bid",
  "click",
  "doubleclick",
  "pixel",
  "segment",
  "tag",
  "tracker"
];

const SUSPICIOUS_BRAND_MISSPELLINGS: Record<string, string> = {
  mvidia: "nvidia"
};

function normalizeHostname(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return value.trim().toLowerCase().replace(/^www\./, "") || null;
  }
}

function labelsFor(hostname: string) {
  return hostname.split(".").filter(Boolean);
}

function tokensFor(hostname: string) {
  return labelsFor(hostname).flatMap((label) => label.split(/[-_]/)).filter(Boolean);
}

function rootDomain(hostname: string) {
  const labels = labelsFor(hostname);
  return labels.slice(-2).join(".");
}

function hasToken(hostname: string, tokens: readonly string[]) {
  const domainTokens = tokensFor(hostname);
  return tokens.some((token) =>
    domainTokens.some((domainToken) => domainToken === token || domainToken.startsWith(token) || domainToken.endsWith(token))
  );
}

export function deriveDomainCalibrationContext(value: string | null | undefined): DomainCalibrationContext {
  const hostname = normalizeHostname(value);
  if (!hostname) {
    return { hostKind: "public_site", reasons: [] };
  }

  const labels = labelsFor(hostname);
  const root = rootDomain(hostname);
  const firstLabel = labels[0] ?? "";
  const reasons: string[] = [];

  const misspellingTarget = SUSPICIOUS_BRAND_MISSPELLINGS[firstLabel];
  if (misspellingTarget) {
    return {
      hostKind: "suspicious_or_typo_candidate",
      reasons: [`Domain label "${firstLabel}" is a known lookalike candidate for "${misspellingTarget}".`]
    };
  }

  if (HOSTING_ROOTS.has(hostname) || HOSTING_ROOTS.has(root)) {
    reasons.push("Domain is a known platform or hosting root rather than a normal owned public site.");
    return { hostKind: "platform_or_hosting_root", reasons };
  }

  if (INFRA_ROOTS.has(root) || hasToken(hostname, INFRA_TOKENS) || labels.length >= 4) {
    reasons.push("Domain shape suggests infrastructure, API, CDN, or service-host traffic rather than a normal public site.");
    if (hasToken(hostname, ADTECH_TOKENS)) {
      reasons.push("Domain also contains adtech or measurement-like tokens.");
      return { hostKind: "adtech_or_measurement_service", reasons };
    }
    return { hostKind: "infrastructure_service", reasons };
  }

  if (hasToken(hostname, ADTECH_TOKENS)) {
    return {
      hostKind: "adtech_or_measurement_service",
      reasons: ["Domain contains adtech or measurement-like tokens."]
    };
  }

  return { hostKind: "public_site", reasons };
}
