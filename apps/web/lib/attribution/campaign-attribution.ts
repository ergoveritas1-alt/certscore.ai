export const CAMPAIGN_ATTRIBUTION_STORAGE_KEY = "certscore:campaign-attribution:v1";
const CAMPAIGN_LANDING_SEEN_KEY = "certscore:campaign-landing-seen:v1";
const CAMPAIGN_COMPLETED_DOMAINS_KEY = "certscore:campaign-completed-domains:v1";
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
  if (!normalized || normalized.length > MAX_ATTRIBUTION_VALUE_LENGTH || /[\u0000-\u001f\u007f]/.test(normalized)) {
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

function readStoredCampaignAttribution(): CampaignAttribution | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(CAMPAIGN_ATTRIBUTION_STORAGE_KEY);
    return raw ? normalizeCampaignAttribution(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function getStoredCampaignAttribution(): CampaignAttribution | null {
  return readStoredCampaignAttribution();
}

export function captureCampaignAttribution(search = typeof window === "undefined" ? "" : window.location.search) {
  const incoming = readCampaignAttributionFromSearch(search);
  const stored = readStoredCampaignAttribution();
  const merged: CampaignAttribution = { ...(stored ?? {}) };

  for (const key of CAMPAIGN_ATTRIBUTION_KEYS) {
    if (!merged[key] && incoming?.[key]) {
      merged[key] = incoming[key];
    }
  }

  const attribution = normalizeCampaignAttribution(merged);
  if (typeof window !== "undefined" && attribution && JSON.stringify(attribution) !== JSON.stringify(stored)) {
    try {
      window.localStorage.setItem(CAMPAIGN_ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
    } catch {
      // Attribution is best effort and must not block the visitor flow.
    }
  }

  return {
    attribution,
    hasIncoming: Boolean(incoming),
    isNewLanding: Boolean(incoming) && !hasSeenCampaignLanding()
  };
}

export function markCampaignLandingSeen() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CAMPAIGN_LANDING_SEEN_KEY, "1");
  } catch {
    // Best effort only.
  }
}

function hasSeenCampaignLanding() {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(CAMPAIGN_LANDING_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function recordCampaignCompletedDomain(domain: string): 1 | 2 | null {
  if (typeof window === "undefined" || !getStoredCampaignAttribution()) return null;
  const normalized = domain.trim().toLowerCase();
  if (!normalized) return null;

  try {
    const raw = window.localStorage.getItem(CAMPAIGN_COMPLETED_DOMAINS_KEY);
    const domains = raw ? JSON.parse(raw) : [];
    const existing = Array.isArray(domains) ? domains.filter((item): item is string => typeof item === "string") : [];
    if (!existing.includes(normalized)) {
      existing.push(normalized);
      window.localStorage.setItem(CAMPAIGN_COMPLETED_DOMAINS_KEY, JSON.stringify(existing.slice(-20)));
    }
    const position = existing.indexOf(normalized) + 1;
    return position === 1 || position === 2 ? position : null;
  } catch {
    return null;
  }
}
