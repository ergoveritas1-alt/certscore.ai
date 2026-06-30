"use client";

import {
  ANALYTICS_CONSENT_CHANGE_EVENT,
  ANALYTICS_CONSENT_STORAGE_KEY,
  type AnalyticsConsentChoice,
  getGoogleConsentModeState
} from "./consent-shared";

export { ANALYTICS_CONSENT_CHANGE_EVENT, ANALYTICS_CONSENT_STORAGE_KEY, type AnalyticsConsentChoice, getGoogleConsentModeState };

declare global {
  interface Window {
    certscoreAnalyticsConsent?: AnalyticsConsentChoice;
    certscoreLoadGoogleTag?: () => void;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function getStoredAnalyticsConsent(): AnalyticsConsentChoice | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.certscoreAnalyticsConsent === "granted" || getStoredAnalyticsConsent() === "granted";
}

export function applyGoogleConsentMode(choice: AnalyticsConsentChoice) {
  if (typeof window === "undefined") {
    return;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(["consent", "update", getGoogleConsentModeState(choice)]);
  window.certscoreAnalyticsConsent = choice;
}

export function saveAnalyticsConsent(choice: AnalyticsConsentChoice) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, choice);
  } catch {
    // Ignore storage failures; runtime consent state still applies for this page.
  }

  applyGoogleConsentMode(choice);

  if (choice === "granted") {
    window.certscoreLoadGoogleTag?.();
  }

  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_CHANGE_EVENT, { detail: { choice } }));
}
