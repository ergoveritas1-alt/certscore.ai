"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  type CtaLocation,
  type GuideCtaType,
  type GuidePageType,
  type GptCtaLocation,
  type LeadFormType,
  type PricingCtaType,
  type ReportCtaType,
  type ScanSource,
  pushDataLayerEvent,
  pushDataLayerEventOnce
} from "../../lib/analytics/data-layer";

const PENDING_SCAN_STARTED_KEY = "certscore:analytics:pending-scan-started";

function isCtaLocation(value: string | undefined): value is CtaLocation {
  return value === "header" || value === "homepage" || value === "footer" || value === "unknown";
}

function isGuideCtaType(value: string | undefined): value is GuideCtaType {
  return value === "scan" || value === "contact" || value === "pricing" || value === "unknown";
}

function isScanSource(value: string | undefined): value is ScanSource {
  return value === "homepage" || value === "header" || value === "dashboard" || value === "unknown";
}

function isReportCtaType(value: string | undefined): value is ReportCtaType {
  return value === "share" || value === "email" || value === "monitor" || value === "checklist" || value === "sample_report" || value === "pricing" || value === "unknown";
}

function isPricingCtaType(value: string | undefined): value is PricingCtaType {
  return value === "free_scan" || value === "sample_report" || value === "one_time_review" || value === "monitoring" || value === "contact_sales" || value === "unknown";
}

function isLeadFormType(value: string | undefined): value is LeadFormType {
  return value === "contact_sales" || value === "monitor_request" || value === "demo_request";
}

function isGptCtaLocation(value: string | undefined): value is GptCtaLocation {
  return value === "footer" || value === "api_pulse" || value === "guides_findings" || value === "homepage";
}

function getGuidePageType(pathname: string): GuidePageType {
  if (pathname.startsWith("/guides/")) {
    return "guide";
  }

  if (pathname.startsWith("/benchmarks/")) {
    return "benchmark";
  }

  return "unknown";
}

export function DataLayerClickTracker() {
  const pathname = usePathname();
  const lastTrackedPathnameRef = useRef<string | null>(null);

  useEffect(() => {
    if (pathname === lastTrackedPathnameRef.current) {
      return;
    }

    lastTrackedPathnameRef.current = pathname;

    if (pathname === "/pricing") {
      pushDataLayerEvent({
        event: "pricing_viewed",
        page_path: "/pricing"
      });
    }

    if (pathname === "/sample-report") {
      pushDataLayerEvent({
        event: "sample_report_viewed",
        page_path: "/sample-report"
      });
    }
  }, [pathname]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const trackedElement = target?.closest<HTMLElement>("[data-analytics-event]");
      const clickedLink = target?.closest<HTMLAnchorElement>("a[href]");
      const href = clickedLink?.getAttribute("href") ?? "";

      if (!trackedElement) {
        if (href.startsWith("/contact-sales")) {
          pushDataLayerEvent({
            event: "contact_clicked",
            cta_location: "unknown"
          });
          return;
        }

        return;
      }

      const eventName = trackedElement.dataset.analyticsEvent;

      if (eventName === "contact_clicked") {
        pushDataLayerEvent({
          event: "contact_clicked",
          cta_location: isCtaLocation(trackedElement.dataset.analyticsCtaLocation)
            ? trackedElement.dataset.analyticsCtaLocation
            : "unknown"
        });
        return;
      }

      if (eventName === "sign_in_clicked") {
        const location = trackedElement.dataset.analyticsCtaLocation === "header" ? "header" : "unknown";
        pushDataLayerEvent({
          event: "sign_in_clicked",
          cta_location: location
        });
        return;
      }

      if (eventName === "guide_cta_clicked") {
        pushDataLayerEvent({
          event: "guide_cta_clicked",
          page_type: getGuidePageType(pathname),
          cta_type: isGuideCtaType(trackedElement.dataset.analyticsCtaType)
            ? trackedElement.dataset.analyticsCtaType
            : "unknown"
        });
        return;
      }

      if (eventName === "report_cta_clicked") {
        pushDataLayerEvent({
          event: "report_cta_clicked",
          cta_type: isReportCtaType(trackedElement.dataset.analyticsCtaType)
            ? trackedElement.dataset.analyticsCtaType
            : "unknown"
        });
        return;
      }

      if (eventName === "hero_book_demo_clicked") {
        pushDataLayerEvent({
          event: "hero_book_demo_clicked"
        });
        return;
      }

      if (eventName === "hero_sample_report_clicked") {
        pushDataLayerEvent({
          event: "hero_sample_report_clicked"
        });
        return;
      }

      if (eventName === "pricing_cta_clicked") {
        pushDataLayerEvent({
          event: "pricing_cta_clicked",
          cta_type: isPricingCtaType(trackedElement.dataset.analyticsCtaType)
            ? trackedElement.dataset.analyticsCtaType
            : "unknown",
          plan: trackedElement.dataset.analyticsPlan ?? "unknown"
        });
        return;
      }

      if (eventName === "gpt_cta_clicked") {
        pushDataLayerEvent({
          event: "gpt_cta_clicked",
          location: isGptCtaLocation(trackedElement.dataset.analyticsCtaLocation)
            ? trackedElement.dataset.analyticsCtaLocation
            : "homepage",
          destination: "certscore_gpt",
          url: trackedElement.dataset.analyticsDestinationUrl ?? href
        });
      }
    }

    document.addEventListener("click", handleClick);

    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, [pathname]);

  return null;
}

export function markPendingScanStarted(scanSource: ScanSource) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(PENDING_SCAN_STARTED_KEY, scanSource);
}

export function clearPendingScanStarted() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(PENDING_SCAN_STARTED_KEY);
}

export function PendingScanStartedEvent() {
  useEffect(() => {
    const pendingSource = window.sessionStorage.getItem(PENDING_SCAN_STARTED_KEY);

    if (!pendingSource) {
      return;
    }

    clearPendingScanStarted();
    const scanSource = isScanSource(pendingSource) ? pendingSource : "unknown";

    pushDataLayerEvent({
      event: "scan_started",
      scan_source: scanSource,
      scan_target_type: "domain",
      scan_status: "queued"
    });
  }, []);

  return null;
}

export function ScanCompletedEvent({ scanSource }: { scanSource: Extract<ScanSource, "homepage" | "dashboard" | "unknown"> }) {
  const pathname = usePathname();

  useEffect(() => {
    pushDataLayerEventOnce(`scan_completed:${pathname}`, {
      event: "scan_completed",
      scan_source: scanSource,
      scan_status: "completed"
    });
  }, [pathname, scanSource]);

  return null;
}

export function pushLeadFormSubmitAttempted(formType: LeadFormType) {
  pushDataLayerEvent({
    event: "lead_form_submit_attempted",
    form_type: isLeadFormType(formType) ? formType : "contact_sales"
  });
}
