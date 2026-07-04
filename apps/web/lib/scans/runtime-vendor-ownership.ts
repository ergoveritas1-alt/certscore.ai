import { getDomain as getTldtsDomain, getHostname as getTldtsHostname } from "tldts";

export type RuntimeVendorAttributionEvidence = {
  signatureId: string;
  matchedOn: "cookie_name" | "domain" | "request_pattern" | "id_sync";
  matchedValue: string;
};

export type RuntimeEntityOwnership = {
  category?: string;
  domains: string[];
  entity: string;
  vendor: string;
};

const RUNTIME_ENTITY_OWNERSHIP: RuntimeEntityOwnership[] = [
  { entity: "Axel Springer", vendor: "Axel Springer", domains: ["bild.de", "bildstatic.de"] },
  { entity: "Agora S.A.", vendor: "Agora", domains: ["agora.pl", "gazeta.pl", "im-g.pl", "wyborcza.pl"], category: "publisher_infrastructure" },
  { entity: "Gremi Media", vendor: "Gremi Media", domains: ["rp.pl", "gremimedia.pl"], category: "publisher_infrastructure" },
  { entity: "Google", vendor: "YouTube", domains: ["youtube.com", "youtube-nocookie.com", "googlevideo.com", "ytimg.com"], category: "embedded_content" },
  { entity: "Google", vendor: "Google", domains: ["google.com", "googleadservices.com", "googlesyndication.com", "doubleclick.net", "g.doubleclick.net"], category: "advertising" },
  { entity: "Adobe", vendor: "Adobe", domains: ["adobedtm.com", "demdex.net", "omtrdc.net"], category: "tag_management" },
  { entity: "Cloudflare", vendor: "Cloudflare", domains: ["cloudflare.com"], category: "security" },
  { entity: "Gemius", vendor: "Gemius", domains: ["gemius.pl"], category: "audience_measurement" },
  { entity: "1&1 Mail & Media", vendor: "1&1 Mail & Media", domains: ["gmx.net", "web.de"], category: "authentication" },
  { entity: "OneTrust", vendor: "OneTrust", domains: ["onetrust.com", "cookielaw.org"], category: "consent_management" },
  { entity: "Sourcepoint", vendor: "Sourcepoint", domains: ["privacy-mgmt.com", "sourcepoint.com"], category: "consent_management" },
  { entity: "Salesmanago", vendor: "Salesmanago", domains: ["salesmanago.pl", "salesmanago.com"], category: "marketing_automation" },
  { entity: "Ad Alliance", vendor: "Ad Alliance", domains: ["asadcdn.com"], category: "advertising" },
  { entity: "GreenVideo", vendor: "GreenVideo", domains: ["greenvideo.io"], category: "embedded_content" }
];

const COOKIE_NAME_SIGNATURES: Array<{
  signatureId: string;
  vendor: string;
  category?: string;
  pattern: RegExp;
}> = [
  { signatureId: "cookie_sourcepoint_sp", vendor: "Sourcepoint", category: "consent_management", pattern: /^_sp_/i },
  { signatureId: "cookie_onetrust_optanon", vendor: "OneTrust", category: "consent_management", pattern: /^(optanon|onetrust|cookielaw)/i },
  { signatureId: "cookie_google_ads_analytics", vendor: "Google", category: "advertising", pattern: /^(_ga|_gid|_gcl|_gads|_gpi|__gads|__gpi|gcl_)/i },
  { signatureId: "cookie_meta_pixel", vendor: "Meta Pixel", category: "advertising", pattern: /^_fb[pc]$/i },
  { signatureId: "cookie_klaviyo", vendor: "Klaviyo", category: "marketing_automation", pattern: /^__kla_id$/i },
  { signatureId: "cookie_salesmanago", vendor: "Salesmanago", category: "marketing_automation", pattern: /^(smuuid|smvr|_smvs)$/i },
  { signatureId: "cookie_adobe_ecid", vendor: "Adobe", category: "analytics", pattern: /^(kndctr_|demdex|s_vi|s_fid|AMCV_)/i },
  { signatureId: "cookie_cloudflare", vendor: "Cloudflare", category: "security", pattern: /^(__cf|cf_clearance|cf_chl)/i },
  { signatureId: "cookie_akamai", vendor: "Akamai Bot Manager / Edge", category: "security", pattern: /^(ak_bmsc|bm_sz|bm_sv|bm_mi|_abck)$/i },
  { signatureId: "cookie_quantcast", vendor: "Quantcast", category: "analytics", pattern: /^(__qca|mc|d)$/i },
  { signatureId: "cookie_piano", vendor: "Piano", category: "personalisation", pattern: /^(pnes_|pcid|tinypass)/i },
  { signatureId: "cookie_optimizely", vendor: "Optimizely", category: "a_b_testing", pattern: /^optimizely/i },
  { signatureId: "cookie_stripe", vendor: "Stripe", category: "payment_processors", pattern: /^__stripe/i }
];

export function normalizeRuntimeInventoryHost(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const normalizedValue = value.trim().replace(/^\.+/, "");
  if (!normalizedValue) {
    return null;
  }
  const hostname = getTldtsHostname(normalizedValue.includes("://") ? normalizedValue : `https://${normalizedValue}`);
  return hostname?.replace(/^www\./, "").toLowerCase() ?? null;
}

export function runtimeRegistrableDomain(value: string | null | undefined) {
  const hostname = normalizeRuntimeInventoryHost(value);
  if (!hostname) {
    return null;
  }
  return getTldtsDomain(hostname, { allowPrivateDomains: true }) ?? hostname;
}

function domainPatternMatches(host: string, pattern: string) {
  const normalizedPattern = pattern.toLowerCase();
  return host === normalizedPattern || host.endsWith(`.${normalizedPattern}`);
}

export function findRuntimeEntityOwner(value: string | null | undefined) {
  const host = normalizeRuntimeInventoryHost(value);
  if (!host) {
    return null;
  }
  for (const owner of RUNTIME_ENTITY_OWNERSHIP) {
    const matchedDomain = owner.domains.find((domain) => domainPatternMatches(host, domain));
    if (matchedDomain) {
      return {
        ...owner,
        matchedDomain,
        attributionEvidence: {
          signatureId: `domain_owner:${owner.vendor.toLowerCase().replace(/[^a-z0-9]+/g, "_")}:${matchedDomain}`,
          matchedOn: "domain" as const,
          matchedValue: host
        }
      };
    }
  }
  return null;
}

export function findRuntimeCookieNameVendor(cookieName: string | null | undefined) {
  const trimmed = cookieName?.trim();
  if (!trimmed) {
    return null;
  }
  const signature = COOKIE_NAME_SIGNATURES.find((candidate) => candidate.pattern.test(trimmed));
  if (!signature) {
    return null;
  }
  return {
    category: signature.category,
    vendor: signature.vendor,
    attributionEvidence: {
      signatureId: signature.signatureId,
      matchedOn: "cookie_name" as const,
      matchedValue: trimmed
    }
  };
}

export function hostsShareRuntimeEntity(left: string | null | undefined, right: string | null | undefined) {
  const leftOwner = findRuntimeEntityOwner(left);
  const rightOwner = findRuntimeEntityOwner(right);
  if (leftOwner && rightOwner && leftOwner.entity === rightOwner.entity) {
    return true;
  }
  const leftDomain = runtimeRegistrableDomain(left);
  const rightDomain = runtimeRegistrableDomain(right);
  return Boolean(leftDomain && rightDomain && leftDomain === rightDomain);
}

export function isLikelyCookieName(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return false;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return false;
  }
  if (trimmed.includes("=") || trimmed.includes(";")) {
    return true;
  }
  if (/^[_A-Za-z][A-Za-z0-9_.-]{1,80}$/.test(trimmed) && !trimmed.includes(".")) {
    return true;
  }
  return Boolean(findRuntimeCookieNameVendor(trimmed));
}
