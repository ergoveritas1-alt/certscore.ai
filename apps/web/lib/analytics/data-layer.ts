"use client";

import { hasAnalyticsConsent } from "./consent";

export type CtaLocation = "header" | "homepage" | "footer" | "unknown";
export type GptCtaLocation = "footer" | "api_pulse" | "guides_findings" | "homepage";
export type GuidePageType = "guide" | "benchmark" | "unknown";
export type GuideCtaType = "scan" | "contact" | "pricing" | "unknown";
export type ReportCtaType = "share" | "email" | "monitor" | "checklist" | "sample_report" | "pricing" | "unknown";
export type PricingCtaType = "free_scan" | "sample_report" | "one_time_review" | "monitoring" | "contact_sales" | "unknown";
export type LeadFormType = "contact_sales" | "monitor_request" | "demo_request";
export type ScanSource = "homepage" | "header" | "dashboard" | "unknown";
export type ScanTargetType = "domain" | "url" | "unknown";

export type CertScoreDataLayerEvent =
  | { event: "pricing_viewed"; page_path: "/pricing" }
  | { event: "sample_report_viewed"; page_path: "/sample-report" }
  | { event: "contact_clicked"; cta_location: CtaLocation }
  | { event: "sign_in_clicked"; cta_location: Extract<CtaLocation, "header" | "unknown"> }
  | { event: "guide_cta_clicked"; page_type: GuidePageType; cta_type: GuideCtaType }
  | { event: "report_cta_clicked"; cta_type: ReportCtaType }
  | { event: "hero_book_demo_clicked" }
  | { event: "hero_sample_report_clicked" }
  | { event: "pricing_cta_clicked"; cta_type: PricingCtaType; plan: string }
  | { event: "gpt_cta_clicked"; location: GptCtaLocation; destination: "certscore_gpt"; url: string }
  | { event: "lead_form_submit_attempted"; form_type: LeadFormType }
  | { event: "scan_started"; scan_source: ScanSource; scan_target_type: ScanTargetType; scan_status: "queued" }
  | { event: "scan_completed"; scan_source: Extract<ScanSource, "homepage" | "dashboard" | "unknown">; scan_status: "completed" };

type CertScoreDataLayerNavigationEvent = CertScoreDataLayerEvent & {
  eventCallback?: () => void;
  eventTimeout?: number;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const pushedEventKeys = new Set<string>();

function pushGoogleAnalyticsEvent(event: CertScoreDataLayerEvent, eventCallback?: () => void, eventTimeout?: number) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }

  const { event: eventName, ...parameters } = event;
  window.gtag("event", eventName, {
    ...parameters,
    ...(eventCallback ? { event_callback: eventCallback } : {}),
    ...(eventTimeout ? { event_timeout: eventTimeout } : {})
  });
}

export function pushDataLayerEvent(event: CertScoreDataLayerEvent) {
  if (typeof window === "undefined" || !hasAnalyticsConsent()) {
    return;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(event);
  pushGoogleAnalyticsEvent(event);
}

export function pushDataLayerEventBeforeNavigation(event: CertScoreDataLayerEvent, timeoutMs = 300) {
  if (typeof window === "undefined" || !hasAnalyticsConsent()) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    let didResolve = false;
    const finish = () => {
      if (didResolve) {
        return;
      }

      didResolve = true;
      resolve();
    };
    const timeout = window.setTimeout(finish, timeoutMs);
    const eventWithCallback: CertScoreDataLayerNavigationEvent = {
      ...event,
      eventCallback: () => {
        window.clearTimeout(timeout);
        finish();
      },
      eventTimeout: timeoutMs
    };

    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push(eventWithCallback);
    pushGoogleAnalyticsEvent(event, finish, timeoutMs);
  });
}

export function pushDataLayerEventOnce(key: string, event: CertScoreDataLayerEvent) {
  if (typeof window === "undefined" || pushedEventKeys.has(key)) {
    return;
  }

  pushedEventKeys.add(key);
  pushDataLayerEvent(event);
}

export function getScanTargetType(value: string): ScanTargetType {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return "unknown";
  }

  if (/^https?:\/\//.test(normalized) || normalized.includes("/")) {
    return "url";
  }

  if (normalized.includes(".")) {
    return "domain";
  }

  return "unknown";
}
