"use client";

export type CtaLocation = "header" | "homepage" | "footer" | "unknown";
export type GuidePageType = "guide" | "benchmark" | "unknown";
export type GuideCtaType = "scan" | "contact" | "pricing" | "unknown";
export type ScanSource = "homepage" | "header" | "dashboard" | "unknown";
export type ScanTargetType = "domain" | "url" | "unknown";

export type CertScoreDataLayerEvent =
  | { event: "pricing_viewed"; page_path: "/pricing" }
  | { event: "contact_clicked"; cta_location: CtaLocation }
  | { event: "sign_in_clicked"; cta_location: Extract<CtaLocation, "header" | "unknown"> }
  | { event: "guide_cta_clicked"; page_type: GuidePageType; cta_type: GuideCtaType }
  | { event: "scan_started"; scan_source: ScanSource; scan_target_type: ScanTargetType; scan_status: "queued" }
  | { event: "scan_completed"; scan_source: Extract<ScanSource, "homepage" | "dashboard" | "unknown">; scan_status: "completed" };

type CertScoreDataLayerNavigationEvent = CertScoreDataLayerEvent & {
  eventCallback?: () => void;
  eventTimeout?: number;
};

declare global {
  interface Window {
    dataLayer?: CertScoreDataLayerEvent[];
  }
}

const pushedEventKeys = new Set<string>();

export function pushDataLayerEvent(event: CertScoreDataLayerEvent) {
  if (typeof window === "undefined") {
    return;
  }

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(event);
}

export function pushDataLayerEventBeforeNavigation(event: CertScoreDataLayerEvent, timeoutMs = 300) {
  if (typeof window === "undefined") {
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
