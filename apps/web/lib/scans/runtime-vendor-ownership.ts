import { resolveCanonicalVendorLabel, resolveVendorDisplayCategory, resolveVendorObservations } from "@certscore/vendor-resolver";
import { getDomain as getTldtsDomain, getHostname as getTldtsHostname } from "tldts";

export type RuntimeVendorAttributionEvidence = {
  signatureId: string;
  matchedOn: "cookie_name" | "domain" | "request_pattern" | "id_sync" | "vendor_label";
  matchedValue: string;
};

function resolveCanonicalOwner(input: { hostname?: string; cookieName?: string; url?: string }) {
  return resolveVendorObservations([{
    type: input.cookieName ? "cookie" : "request",
    hostname: input.hostname,
    cookieName: input.cookieName,
    url: input.url,
    matchSource: input.cookieName ? "cookie_name" : "network_request"
  }])[0] ?? null;
}

export function normalizeRuntimeInventoryHost(value: string | null | undefined) {
  if (!value) return null;
  const normalizedValue = value.trim().replace(/^\.+/, "");
  if (!normalizedValue) return null;
  const hostname = getTldtsHostname(normalizedValue.includes("://") ? normalizedValue : `https://${normalizedValue}`);
  return hostname?.replace(/^www\./, "").toLowerCase() ?? null;
}

export function runtimeRegistrableDomain(value: string | null | undefined) {
  const hostname = normalizeRuntimeInventoryHost(value);
  return hostname ? getTldtsDomain(hostname, { allowPrivateDomains: true }) ?? hostname : null;
}

export function findRuntimeEntityOwner(value: string | null | undefined) {
  const hostname = normalizeRuntimeInventoryHost(value);
  if (!hostname) return null;
  const observation = resolveCanonicalOwner({ hostname });
  if (!observation) return null;
  return {
    category: observation.purpose,
    confidence: observation.confidence,
    entity: observation.entity,
    product: observation.product ?? observation.vendor,
    regulatoryRelevance: observation.regulatoryRelevance,
    vendor: observation.vendor,
    vendorDisplayCategory: resolveVendorDisplayCategory(observation),
    attributionEvidence: {
      signatureId: observation.basis[0] ?? "canonical_vendor_resolver",
      matchedOn: "domain" as const,
      matchedValue: hostname
    }
  };
}

export function findRuntimeVendorLabelOwner(value: string | null | undefined) {
  const resolution = resolveCanonicalVendorLabel(value);
  if (!resolution) return null;
  return {
    category: resolution.purpose,
    confidence: resolution.confidence,
    entity: resolution.entity,
    product: resolution.product,
    regulatoryRelevance: resolution.regulatoryRelevance,
    vendor: resolution.vendor,
    vendorDisplayCategory: resolution.displayCategory,
    attributionEvidence: {
      signatureId: resolution.basis,
      matchedOn: "vendor_label" as const,
      matchedValue: value?.trim() ?? resolution.product
    }
  };
}

export function findRuntimeCookieNameVendor(cookieName: string | null | undefined) {
  const trimmed = cookieName?.trim();
  if (!trimmed) return null;
  const observation = resolveCanonicalOwner({ cookieName: trimmed });
  if (!observation) return null;
  return {
    category: observation.purpose,
    product: observation.product ?? observation.vendor,
    vendor: observation.vendor,
    attributionEvidence: {
      signatureId: observation.basis[0] ?? "canonical_vendor_resolver",
      matchedOn: "cookie_name" as const,
      matchedValue: trimmed
    }
  };
}

export function findRuntimeCookieOwner(cookieName: string | null | undefined, hostname: string | null | undefined) {
  const trimmed = cookieName?.trim();
  const normalizedHostname = normalizeRuntimeInventoryHost(hostname);
  if (!trimmed) return null;
  const observation = resolveCanonicalOwner({ cookieName: trimmed, hostname: normalizedHostname ?? undefined });
  if (!observation) return null;
  return {
    category: observation.purpose,
    confidence: observation.confidence,
    entity: observation.entity,
    product: observation.product ?? observation.vendor,
    regulatoryRelevance: observation.regulatoryRelevance,
    vendor: observation.vendor,
    attributionEvidence: {
      signatureId: observation.basis[0] ?? "canonical_vendor_resolver",
      matchedOn: "cookie_name" as const,
      matchedValue: trimmed
    }
  };
}

export function findRuntimeRequestOwner(url: string | null | undefined) {
  if (!url) return null;
  const hostname = normalizeRuntimeInventoryHost(url);
  const observation = resolveCanonicalOwner({ hostname: hostname ?? undefined, url });
  if (!observation) return null;
  return {
    category: observation.purpose,
    confidence: observation.confidence,
    entity: observation.entity,
    product: observation.product ?? observation.vendor,
    regulatoryRelevance: observation.regulatoryRelevance,
    vendor: observation.vendor,
    attributionEvidence: {
      signatureId: observation.basis[0] ?? "canonical_vendor_resolver",
      matchedOn: "request_pattern" as const,
      matchedValue: url
    }
  };
}

export function hostsShareRuntimeEntity(left: string | null | undefined, right: string | null | undefined) {
  const leftOwner = findRuntimeEntityOwner(left);
  const rightOwner = findRuntimeEntityOwner(right);
  if (leftOwner && rightOwner && leftOwner.entity === rightOwner.entity) return true;
  const leftDomain = runtimeRegistrableDomain(left);
  const rightDomain = runtimeRegistrableDomain(right);
  return Boolean(leftDomain && rightDomain && leftDomain === rightDomain);
}

export function isLikelyCookieName(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return false;
  if (trimmed.includes("=") || trimmed.includes(";")) return true;
  if (/^[_A-Za-z][A-Za-z0-9_.-]{1,80}$/.test(trimmed) && !trimmed.includes(".")) return true;
  return Boolean(findRuntimeCookieNameVendor(trimmed));
}
