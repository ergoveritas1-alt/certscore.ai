"use client";

import { hasAnalyticsConsent } from "./consent";
import { getStoredCampaignAttribution, type CampaignAttribution } from "../attribution/campaign-attribution";

export type CtaLocation = "header" | "homepage" | "footer" | "unknown";
export type GptCtaLocation = "footer" | "api_pulse" | "guides_findings" | "homepage";
export type GuidePageType = "guide" | "benchmark" | "unknown";
export type GuideCtaType = "scan" | "contact" | "pricing" | "unknown";
export type ReportCtaType = "share" | "email" | "monitor" | "checklist" | "sample_report" | "pricing" | "unknown";
export type PricingCtaType = "free_scan" | "sample_report" | "one_time_review" | "monitoring" | "contact_sales" | "unknown";
export type LeadFormType = "contact_sales" | "monitor_request" | "demo_request";
export type ScanSource = "homepage" | "header" | "dashboard" | "unknown";
export type ScanTargetType = "domain" | "url" | "unknown";
export type McpLightAction = "copy" | "scan" | "connect" | "support";

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
  | { event: "scan_completed"; scan_source: Extract<ScanSource, "homepage" | "dashboard" | "unknown">; scan_status: "completed" }
  | { event: "campaign_landing_page_viewed"; page_path: string }
  | { event: "registration_completed"; auth_method: "password" | "google" | "unknown" }
  | { event: "first_scan_completed"; scan_source: Extract<ScanSource, "homepage" | "dashboard" | "unknown"> }
  | { event: "second_distinct_domain_scanned"; scan_source: Extract<ScanSource, "homepage" | "dashboard" | "unknown"> }
  | { event: "mcp_light_action"; action: McpLightAction; target: string };

export type CampaignAttributedDataLayerEvent = CertScoreDataLayerEvent & {
  campaign_attribution?: CampaignAttribution;
};

type CertScoreDataLayerNavigationEvent = CampaignAttributedDataLayerEvent & {
  eventCallback?: () => void;
  eventTimeout?: number;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    umami?: {
      track: (eventName: string, data?: Record<string, unknown>) => unknown;
    };
    certscoreUmamiEventQueue?: UmamiEvent[];
  }
}

const pushedEventKeys = new Set<string>();

function withCampaignAttribution(event: CertScoreDataLayerEvent): CampaignAttributedDataLayerEvent {
  const attribution = getStoredCampaignAttribution();
  return attribution ? { ...event, campaign_attribution: attribution } : event;
}

function pushGoogleAnalyticsEvent(event: CampaignAttributedDataLayerEvent, eventCallback?: () => void, eventTimeout?: number) {
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

type UmamiEvent = {
  eventName: CertScoreDataLayerEvent["event"];
  properties?: Record<string, string>;
};

export function toUmamiEvent(event: CertScoreDataLayerEvent): UmamiEvent {
  switch (event.event) {
    case "contact_clicked":
    case "sign_in_clicked":
      return { eventName: event.event, properties: { cta_location: event.cta_location } };
    case "guide_cta_clicked":
      return { eventName: event.event, properties: { page_type: event.page_type, cta_type: event.cta_type } };
    case "report_cta_clicked":
      return { eventName: event.event, properties: { cta_type: event.cta_type } };
    case "pricing_cta_clicked":
      return { eventName: event.event, properties: { cta_type: event.cta_type } };
    case "gpt_cta_clicked":
      return { eventName: event.event, properties: { location: event.location } };
    case "lead_form_submit_attempted":
      return { eventName: event.event, properties: { form_type: event.form_type } };
    case "scan_started":
      return {
        eventName: event.event,
        properties: {
          scan_source: event.scan_source,
          scan_target_type: event.scan_target_type,
          scan_status: event.scan_status
        }
      };
    case "scan_completed":
      return {
        eventName: event.event,
        properties: { scan_source: event.scan_source, scan_status: event.scan_status }
      };
    case "registration_completed":
      return { eventName: event.event, properties: { auth_method: event.auth_method } };
    case "first_scan_completed":
    case "second_distinct_domain_scanned":
      return { eventName: event.event, properties: { scan_source: event.scan_source } };
    case "mcp_light_action":
      return { eventName: event.event, properties: { action: event.action } };
    case "pricing_viewed":
    case "sample_report_viewed":
    case "hero_book_demo_clicked":
    case "hero_sample_report_clicked":
    case "campaign_landing_page_viewed":
      return { eventName: event.event };
  }
}

function pushUmamiEvent(event: CertScoreDataLayerEvent) {
  if (typeof window === "undefined") {
    return;
  }

  const umamiEvent = toUmamiEvent(event);
  if (typeof window.umami?.track === "function") {
    window.umami.track(umamiEvent.eventName, umamiEvent.properties);
    return;
  }

  window.certscoreUmamiEventQueue = window.certscoreUmamiEventQueue ?? [];
  window.certscoreUmamiEventQueue.push(umamiEvent);
}

export function pushDataLayerEvent(event: CertScoreDataLayerEvent) {
  if (typeof window === "undefined") {
    return;
  }

  if (!hasAnalyticsConsent()) {
    return;
  }

  pushUmamiEvent(event);
  window.dataLayer = window.dataLayer ?? [];
  const attributedEvent = withCampaignAttribution(event);
  window.dataLayer.push(attributedEvent);
  pushGoogleAnalyticsEvent(attributedEvent);
}

export function pushDataLayerEventBeforeNavigation(event: CertScoreDataLayerEvent, timeoutMs = 300) {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }

  if (!hasAnalyticsConsent()) {
    return Promise.resolve();
  }

  pushUmamiEvent(event);
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
    const attributedEvent = withCampaignAttribution(event);
    const eventWithCallback: CertScoreDataLayerNavigationEvent = {
      ...attributedEvent,
      eventCallback: () => {
        window.clearTimeout(timeout);
        finish();
      },
      eventTimeout: timeoutMs
    };

    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push(eventWithCallback);
    pushGoogleAnalyticsEvent(attributedEvent, finish, timeoutMs);
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
