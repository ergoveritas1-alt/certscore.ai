"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { ANALYTICS_CONSENT_CHANGE_EVENT } from "../../lib/analytics/consent";
import { normalizeAnalyticsRoute } from "../../lib/product-analytics/contract";
import { clearProductAnalyticsIdentity, trackProductEvent } from "../../lib/product-analytics/client";

function stableElementId(element: HTMLElement) {
  const declared = element.dataset.analyticsId ?? element.dataset.analyticsEvent;
  if (declared) return declared;
  if (element instanceof HTMLAnchorElement) {
    const href = element.getAttribute("href");
    return href?.startsWith("/") ? `link:${normalizeAnalyticsRoute(href)}` : "external_link";
  }
  return element.id || element.getAttribute("name") || element.tagName.toLowerCase();
}

function stableFormId(form: HTMLFormElement) {
  const declared = form.dataset.analyticsForm ?? form.dataset.analyticsId;
  if (declared) return declared;
  const action = form.getAttribute("action");
  return action?.startsWith("/") ? `form:${normalizeAnalyticsRoute(action)}` : form.id || "form";
}

export function ProductAnalyticsTracker() {
  const pathname = usePathname();
  const previousRoute = useRef<string | undefined>(undefined);
  const startedForms = useRef(new WeakSet<HTMLFormElement>());

  useReportWebVitals((metric) => {
    trackProductEvent({ eventName: "web_vital_recorded", category: "performance", feature: metric.name.toLowerCase(), outcome: "observed", numericValue: Math.max(0, metric.value) });
  });

  useEffect(() => {
    const eventName = pathname.includes("/scans/") ? "scan_viewed" : pathname.includes("/reports/") ? "report_viewed" : "page_viewed";
    trackProductEvent({ eventName, category: eventName === "scan_viewed" ? "scan" : eventName === "report_viewed" ? "report" : "navigation", feature: "route", outcome: "observed", previousRoute: previousRoute.current, route: pathname });
    previousRoute.current = pathname;
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("a,button,[role='button']") : null;
      if (!target) return;
      const isLink = target instanceof HTMLAnchorElement;
      trackProductEvent({
        eventName: isLink ? "navigation_clicked" : "action_clicked",
        category: isLink ? "navigation" : "interaction",
        feature: target.dataset.analyticsFeature ?? "ui_control",
        elementId: stableElementId(target),
        outcome: "observed"
      });
    }

    function onFocus(event: FocusEvent) {
      const form = event.target instanceof Element ? event.target.closest<HTMLFormElement>("form") : null;
      if (!form || startedForms.current.has(form)) return;
      startedForms.current.add(form);
      const formId = stableFormId(form);
      trackProductEvent({ eventName: "form_started", category: "form", feature: formId, formId, outcome: "started" });
    }

    function onSubmit(event: SubmitEvent) {
      const form = event.target instanceof HTMLFormElement ? event.target : null;
      if (!form) return;
      const formId = stableFormId(form);
      trackProductEvent({ eventName: "form_submitted", category: "form", feature: formId, formId, outcome: "submitted" });
    }

    document.addEventListener("click", onClick);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  useEffect(() => {
    const reached = new Set<number>();
    function onScroll() {
      const available = document.documentElement.scrollHeight - window.innerHeight;
      if (available <= 0) return;
      const percent = Math.round((window.scrollY / available) * 100);
      for (const threshold of [25, 50, 75, 100]) {
        if (percent >= threshold && !reached.has(threshold)) {
          reached.add(threshold);
          trackProductEvent({ eventName: "scroll_depth_reached", category: "engagement", feature: "page_scroll", outcome: "observed", numericValue: threshold });
        }
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    const engagedTimer = window.setTimeout(() => trackProductEvent({ eventName: "session_engaged", category: "engagement", feature: "active_10s", outcome: "observed", durationMs: 10_000 }), 10_000);
    return () => { window.removeEventListener("scroll", onScroll); window.clearTimeout(engagedTimer); };
  }, [pathname]);

  useEffect(() => {
    function onError() {
      trackProductEvent({ eventName: "client_error", category: "reliability", feature: "javascript", outcome: "failure" });
    }
    function onUnhandledRejection() {
      trackProductEvent({ eventName: "client_error", category: "reliability", feature: "unhandled_promise", outcome: "failure" });
    }
    function onConsent(event: Event) {
      const choice = (event as CustomEvent<{ choice?: string }>).detail?.choice;
      if (choice === "denied") {
        clearProductAnalyticsIdentity();
        trackProductEvent({ eventName: "analytics_opted_out", category: "preference", feature: "analytics", outcome: "opted_out", anonymousAggregate: true });
      }
      if (choice === "granted") trackProductEvent({ eventName: "analytics_opted_in", category: "preference", feature: "analytics", outcome: "opted_in" });
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener(ANALYTICS_CONSENT_CHANGE_EVENT, onConsent);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener(ANALYTICS_CONSENT_CHANGE_EVENT, onConsent);
    };
  }, []);

  return null;
}
