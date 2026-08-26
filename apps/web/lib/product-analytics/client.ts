"use client";

import { getStoredAnalyticsConsent } from "../analytics/consent";
import { extractScanIdFromPath, type ProductAnalyticsPayload } from "./contract";

const ACTOR_KEY = "certscore:product-analytics:actor:v1";
const SESSION_KEY = "certscore:product-analytics:session:v1";
const ENTRY_ROUTE_KEY = "certscore:product-analytics:entry:v1";
const SESSION_TIMEOUT_MS = 30 * 60 * 1_000;

type SessionState = { id: string; lastSeenAt: number };

export function clearProductAnalyticsIdentity() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(ACTOR_KEY); } catch { /* Best-effort preference cleanup. */ }
  try { window.localStorage.removeItem(SESSION_KEY); } catch { /* Best-effort preference cleanup. */ }
  try { window.sessionStorage.removeItem(ENTRY_ROUTE_KEY); } catch { /* Best-effort preference cleanup. */ }
}

function safeStorage(storage: Storage, key: string) {
  try { return storage.getItem(key); } catch { return null; }
}

function setSafeStorage(storage: Storage, key: string, value: string) {
  try { storage.setItem(key, value); } catch { /* Measurement remains best-effort. */ }
}

function getActorId() {
  const current = safeStorage(window.localStorage, ACTOR_KEY);
  if (current) return current;
  const id = crypto.randomUUID();
  setSafeStorage(window.localStorage, ACTOR_KEY, id);
  return id;
}

function getSessionId() {
  const now = Date.now();
  const current = safeStorage(window.localStorage, SESSION_KEY);
  try {
    const parsed = current ? JSON.parse(current) as SessionState : null;
    if (parsed?.id && now - parsed.lastSeenAt < SESSION_TIMEOUT_MS) {
      setSafeStorage(window.localStorage, SESSION_KEY, JSON.stringify({ id: parsed.id, lastSeenAt: now }));
      return parsed.id;
    }
  } catch { /* Replace malformed local state. */ }
  const id = crypto.randomUUID();
  setSafeStorage(window.localStorage, SESSION_KEY, JSON.stringify({ id, lastSeenAt: now }));
  return id;
}

function viewportBand(): ProductAnalyticsPayload["viewportBand"] {
  const width = window.innerWidth;
  return width < 480 ? "xs" : width < 768 ? "sm" : width < 1024 ? "md" : width < 1440 ? "lg" : "xl";
}

function campaignValue(name: string) {
  return new URLSearchParams(window.location.search).get(name)?.slice(0, 120) || undefined;
}

export function trackProductEvent(input: Omit<ProductAnalyticsPayload, "actorId" | "entryRoute" | "language" | "route" | "scanId" | "sessionId" | "viewportBand"> & { route?: string; anonymousAggregate?: boolean }) {
  if (typeof window === "undefined") return;
  const choice = getStoredAnalyticsConsent();
  const privacyBounded = input.anonymousAggregate || choice === "denied";
  const actualRoute = input.route ?? window.location.pathname;
  const entryRoute = privacyBounded ? actualRoute : safeStorage(window.sessionStorage, ENTRY_ROUTE_KEY) ?? actualRoute;
  if (!privacyBounded) setSafeStorage(window.sessionStorage, ENTRY_ROUTE_KEY, entryRoute);
  const payload: ProductAnalyticsPayload = {
    ...input,
    route: actualRoute,
    scanId: privacyBounded ? undefined : extractScanIdFromPath(actualRoute),
    entryRoute,
    language: navigator.language,
    viewportBand: viewportBand(),
    campaignSource: privacyBounded ? undefined : campaignValue("utm_source"),
    campaignMedium: privacyBounded ? undefined : campaignValue("utm_medium"),
    campaignName: privacyBounded ? undefined : campaignValue("utm_campaign"),
    ...(privacyBounded ? {} : { actorId: getActorId(), sessionId: getSessionId() })
  };
  delete (payload as ProductAnalyticsPayload & { anonymousAggregate?: boolean }).anonymousAggregate;
  const body = JSON.stringify(payload);

  async function deliver(attempt = 0): Promise<void> {
    try {
      const response = await fetch("/api/operational-events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-certscore-analytics-consent": choice === "denied" ? "denied" : choice === "granted" ? "granted" : "measurement"
        },
        body,
        keepalive: true,
        credentials: "same-origin"
      });
      if (!response.ok) throw new Error(`Operational event ingestion returned HTTP ${response.status}.`);
    } catch (error) {
      if (attempt < 2) {
        await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
        return deliver(attempt + 1);
      }
      console.warn("[certscore] operational event ingestion failed", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        eventName: payload.eventName,
        route: payload.route
      });
    }
  }

  void deliver();
}
