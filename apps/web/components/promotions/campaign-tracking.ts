"use client";

import { hasAnalyticsConsent } from "../../lib/analytics/consent";
import { cleanAttribution } from "../../lib/promotions/black-friday";

let landingAttribution: ReturnType<typeof cleanAttribution> = {};

export function campaignAttribution() {
  const consent = hasAnalyticsConsent() && !(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
  const params = new URLSearchParams(window.location.search);
  let referrerDomain = "";
  try {
    referrerDomain = document.referrer ? new URL(document.referrer).hostname : "";
  } catch {}
  const current = cleanAttribution({ ...Object.fromEntries(params), referrerDomain }, consent, !consent);
  if (!consent) landingAttribution = {};
  if (window.location.pathname === "/black-friday" || current.utm_source) landingAttribution = current;
  return { consent, attribution: consent && Object.keys(landingAttribution).length ? landingAttribution : current };
}

// Each mounted page owns its events. A React effect replay or repeated focus uses
// the same transport ID, while a later navigation creates a new page visit.
export function createCampaignVisit() {
  const sent = new Set<string>();
  return (event: "bf26_landing_view" | "bf26_form_start") => {
    if (sent.has(event)) return;
    sent.add(event);
    void fetch("/api/promotions/black-friday/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: crypto.randomUUID(), event, ...campaignAttribution() }),
      keepalive: true
    }).catch(() => undefined);
  };
}
