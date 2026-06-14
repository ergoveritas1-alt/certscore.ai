import { isIP } from "node:net";
import { getDomain, getHostname as getTldtsHostname } from "tldts";

export type PartyClassification = "first_party" | "third_party" | "unknown";

const PUBLIC_SUFFIX_OPTIONS = { allowPrivateDomains: true };

export function getHostname(urlOrHostname: string | null | undefined): string | null {
  const normalizedInput = normalizeHostnameInput(urlOrHostname);
  if (!normalizedInput) {
    return null;
  }
  const hostname = getTldtsHostname(normalizedInput);
  return normalizeHostnameInput(hostname);
}

export function getRegistrableDomain(hostname: string | null | undefined): string | null {
  const normalizedHostname = getHostname(hostname);
  if (!normalizedHostname) {
    return null;
  }

  const registrableDomain = getDomain(normalizedHostname, PUBLIC_SUFFIX_OPTIONS);
  if (registrableDomain) {
    return registrableDomain;
  }

  if (isIP(normalizedHostname) || isLocalhost(normalizedHostname) || isSingleLabelHostname(normalizedHostname)) {
    return normalizedHostname;
  }

  return null;
}

export function getRegistrableDomainFromUrl(url: string | null | undefined): string | null {
  return getRegistrableDomain(getHostname(url));
}

export function isSameSiteOrParty(requestUrl: string | null | undefined, topLevelUrl: string | null | undefined): boolean {
  return classifyParty(requestUrl, topLevelUrl) === "first_party";
}

export function classifyParty(
  requestUrl: string | null | undefined,
  topLevelUrl: string | null | undefined,
): PartyClassification {
  return classifyHostnameParty(getHostname(requestUrl), getHostname(topLevelUrl));
}

export function classifyHostnameParty(
  requestHostname: string | null | undefined,
  topLevelHostname: string | null | undefined,
): PartyClassification {
  const requestSite = getRegistrableDomain(requestHostname);
  const topLevelSite = getRegistrableDomain(topLevelHostname);
  if (!requestSite || !topLevelSite) {
    return "unknown";
  }
  return requestSite === topLevelSite ? "first_party" : "third_party";
}

export function classifyCookieParty(
  cookieDomain: string | null | undefined,
  topLevelHostname: string | null | undefined,
): PartyClassification {
  return classifyHostnameParty(normalizeCookieDomain(cookieDomain), topLevelHostname);
}

function normalizeCookieDomain(cookieDomain: string | null | undefined): string | null {
  return normalizeHostnameInput(cookieDomain?.replace(/^\./, ""));
}

function normalizeHostnameInput(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  const withoutTrailingDot = trimmed.replace(/\.+$/, "");
  if (!withoutTrailingDot) {
    return null;
  }
  return withoutTrailingDot.toLowerCase();
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost";
}

function isSingleLabelHostname(hostname: string): boolean {
  return !hostname.includes(".");
}
