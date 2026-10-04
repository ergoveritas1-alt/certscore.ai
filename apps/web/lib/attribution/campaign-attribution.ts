import { hasAnalyticsConsent } from "../analytics/consent";

export const CAMPAIGN_ATTRIBUTION_STORAGE_KEY = "certscore:campaign-attribution:v2";
const CAMPAIGN_LANDING_SEEN_KEY = "certscore:campaign-landing-seen:v1";
const CAMPAIGN_COMPLETED_DOMAINS_KEY = "certscore:campaign-completed-domains:v1";
export const CAMPAIGN_SESSION_KEY = "certscore:campaign-session:v2";
export const CAMPAIGN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CAMPAIGN_SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_ATTRIBUTION_VALUE_LENGTH = 200;

export const CAMPAIGN_ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term"
] as const;

export type CampaignAttribution = Partial<Record<(typeof CAMPAIGN_ATTRIBUTION_KEYS)[number], string>>;

function sanitizeValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_ATTRIBUTION_VALUE_LENGTH || /[\u0000-\u001f\u007f]/.test(normalized) || /@|https?:\/\/|bearer\s|password|secret|token/i.test(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizeCampaignAttribution(input: unknown): CampaignAttribution | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }

  const record = input as Record<string, unknown>;
  const normalized: CampaignAttribution = {};
  for (const key of CAMPAIGN_ATTRIBUTION_KEYS) {
    const value = sanitizeValue(record[key]);
    if (value) {
      normalized[key] = value;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function readCampaignAttributionFromSearch(search: string): CampaignAttribution | null {
  const params = new URLSearchParams(search);
  const values: Record<string, string> = {};
  for (const key of CAMPAIGN_ATTRIBUTION_KEYS) {
    const value = params.get(key);
    if (value !== null) {
      values[key] = value;
    }
  }
  return normalizeCampaignAttribution(values);
}

type CampaignRecord = { attribution: CampaignAttribution; expiresAt: number };
function readRecord(store: Storage, key: string): CampaignAttribution | null {
  try {
    const record = JSON.parse(store.getItem(key) ?? "null") as CampaignRecord | null;
    if (!record || !Number.isFinite(record.expiresAt) || record.expiresAt <= Date.now()) {
      store.removeItem(key);
      return null;
    }
    return normalizeCampaignAttribution(record.attribution);
  } catch { return null; }
}

export function clearCampaignAttribution() {
  if (typeof window === "undefined") return;
  for (const key of [CAMPAIGN_ATTRIBUTION_STORAGE_KEY, "certscore:campaign-attribution:v1", CAMPAIGN_COMPLETED_DOMAINS_KEY]) {
    try { window.localStorage.removeItem(key); } catch { /* Best effort. */ }
  }
  for (const key of [CAMPAIGN_SESSION_KEY, CAMPAIGN_LANDING_SEEN_KEY]) {
    try { window.sessionStorage.removeItem(key); } catch { /* Best effort. */ }
  }
}

export function getFirstTouchCampaignAttribution(): CampaignAttribution | null {
  if (typeof window === "undefined" || !hasAnalyticsConsent()) return null;
  try { return readRecord(window.localStorage, CAMPAIGN_ATTRIBUTION_STORAGE_KEY); } catch { return null; }
}

/** Current session only: never silently credit a new direct visit to an old campaign. */
export function getStoredCampaignAttribution(): CampaignAttribution | null {
  if (typeof window === "undefined" || !hasAnalyticsConsent()) return null;
  try { return readRecord(window.sessionStorage, CAMPAIGN_SESSION_KEY); } catch { return null; }
}

export function captureCampaignAttribution(search = typeof window === "undefined" ? "" : window.location.search) {
  if (typeof window === "undefined" || !hasAnalyticsConsent()) {
    clearCampaignAttribution();
    return { attribution: null, hasIncoming: false, isNewLanding: false };
  }
  const incoming = readCampaignAttributionFromSearch(search);
  // A campaign is an atomic set of fields. Never merge unrelated visits.
  const attribution = incoming ?? getStoredCampaignAttribution();
  try {
    window.localStorage.removeItem("certscore:campaign-attribution:v1");
    if (incoming && !getFirstTouchCampaignAttribution()) {
      window.localStorage.setItem(CAMPAIGN_ATTRIBUTION_STORAGE_KEY, JSON.stringify({ attribution: incoming, expiresAt: Date.now() + CAMPAIGN_TTL_MS }));
    }
    if (attribution) {
      window.sessionStorage.setItem(CAMPAIGN_SESSION_KEY, JSON.stringify({ attribution, expiresAt: Date.now() + CAMPAIGN_SESSION_TTL_MS }));
    }
  } catch { /* Attribution must not block navigation. */ }
  const landingKey = JSON.stringify([window.location.pathname, incoming]);
  let seen = false;
  try { seen = window.sessionStorage.getItem(CAMPAIGN_LANDING_SEEN_KEY) === landingKey; } catch { /* Best effort. */ }
  return { attribution, hasIncoming: Boolean(incoming), isNewLanding: Boolean(incoming) && !seen };
}

export function markCampaignLandingSeen() {
  if (typeof window === "undefined" || !hasAnalyticsConsent()) return;
  try {
    window.sessionStorage.setItem(CAMPAIGN_LANDING_SEEN_KEY, JSON.stringify([window.location.pathname, readCampaignAttributionFromSearch(window.location.search)]));
  } catch { /* Best effort. */ }
}

export function recordCampaignCompletedDomain(domain: string): 1 | 2 | null {
  if (typeof window === "undefined" || !hasAnalyticsConsent() || !getStoredCampaignAttribution()) return null;
  const normalized = domain.trim().toLowerCase();
  if (!normalized) return null;

  try {
    const raw = window.localStorage.getItem(CAMPAIGN_COMPLETED_DOMAINS_KEY);
    const domains = raw ? JSON.parse(raw) : [];
    const existing = Array.isArray(domains) ? domains.filter((item): item is string => typeof item === "string") : [];
    if (existing.includes(normalized) || existing.length >= 2) return null;
    existing.push(normalized);
    window.localStorage.setItem(CAMPAIGN_COMPLETED_DOMAINS_KEY, JSON.stringify(existing));
    const position = existing.indexOf(normalized) + 1;
    return position === 1 || position === 2 ? position : null;
  } catch {
    return null;
  }
}
