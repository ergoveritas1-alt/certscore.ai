import assert from "node:assert/strict";
import test from "node:test";
import {
  BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
  browserScanEventSchema,
  browserScanEventsUploadSchema,
  browserScanObservedSignalPackageSchema
} from "./schema";

test("accepts cookie metadata without cookie values", () => {
  const result = browserScanEventSchema.safeParse({
    cookieName: "_ga",
    domain: ".example.com",
    eventType: "cookie_added",
    httpOnly: false,
    observedAtMs: 42,
    path: "/",
    sameSite: "lax",
    secure: true,
    source: "chrome.cookies.onChanged",
    timingPrecision: "exact_event",
    valueCaptured: false
  });

  assert.equal(result.success, true);
});

test("rejects cookie events that claim a value was captured", () => {
  const result = browserScanEventSchema.safeParse({
    cookieName: "_ga",
    domain: ".example.com",
    eventType: "cookie_added",
    observedAtMs: 42,
    valueCaptured: true
  });

  assert.equal(result.success, false);
});

test("bounds browser scan event uploads", () => {
  const result = browserScanEventsUploadSchema.safeParse({
    events: []
  });

  assert.equal(result.success, false);
});

test("accepts bounded browser capture notes for skipped screenshot provenance", () => {
  const result = browserScanEventSchema.safeParse({
    eventType: "browser_capture_note",
    message: "Visible-tab screenshot skipped because it exceeded the BX01 MVP upload size limit.",
    observedAtMs: 1200,
    sourceId: "BX01",
    sourceType: "browser_extension"
  });

  assert.equal(result.success, true);
});

test("accepts WS01-normalized BX01 observed signal packages", () => {
  const result = browserScanObservedSignalPackageSchema.safeParse({
    observedSignals: [
      {
        category: "privacy",
        confidence: 0.82,
        evidenceRefs: ["https://www.googletagmanager.com/gtm.js?id=GTM-TEST"],
        key: "privacy.preconsent_tracking_detected",
        label: "Pre-consent tracking detected",
        observedAtMs: 120,
        populationSource: BROWSER_SCAN_SIGNAL_POPULATION_SOURCE,
        provenance: {
          captureMode: "single_page_user_browser",
          sourceId: "BX01",
          sourceType: "browser_extension"
        },
        value: true,
        valueType: "boolean"
      }
    ],
    provenance: {
      sourceId: "BX01",
      sourceType: "browser_extension"
    }
  });

  assert.equal(result.success, true);
});

test("rejects BX01 observed signal packages with non-WS01 population source", () => {
  const result = browserScanObservedSignalPackageSchema.safeParse({
    observedSignals: [
      {
        key: "privacy.preconsent_tracking_detected",
        label: "Pre-consent tracking detected",
        populationSource: "scanner",
        provenance: {
          sourceId: "BX01",
          sourceType: "browser_extension"
        },
        value: true,
        valueType: "boolean"
      }
    ],
    provenance: {
      sourceId: "BX01",
      sourceType: "browser_extension"
    }
  });

  assert.equal(result.success, false);
});
