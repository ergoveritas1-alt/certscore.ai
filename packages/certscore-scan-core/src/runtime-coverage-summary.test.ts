import assert from "node:assert/strict";
import test from "node:test";
import { deriveRuntimeCoverageSummary } from "./index";

const startedAt = "2026-01-01T00:00:00.000Z";

test("runtime coverage marks completed empty runtime as limited none", () => {
  const summary = deriveRuntimeCoverageSummary({
    cookieEvents: [],
    cookieSnapshots: [],
    enabledModules: ["preConsentRuntimeScanner"],
    modulesRun: [{
      moduleName: "preConsentRuntimeScanner",
      status: "completed",
      startedAt,
      completedAt: "2026-01-01T00:00:01.000Z",
      durationMs: 1000,
      evidenceRefs: [],
      errors: [],
    }],
    networkEvents: [],
    normalizedVendorObservations: [],
    observedJourneys: [],
  });

  assert.equal(summary.coverageStatus, "limited_none");
  assert.equal(summary.silentEmpty, true);
  assert.deepEqual(summary.limitationKeys, ["silent_empty_runtime_completed"]);
});

test("runtime coverage remains usable when headed fallback retains evidence", () => {
  const summary = deriveRuntimeCoverageSummary({
    cookieEvents: [],
    cookieSnapshots: [{
      artifactId: "cookie_snapshot_1",
      capturedAtMs: 1000,
      consentStateAtTime: "pre_consent",
      cookieNames: ["_hjSession"],
      cookies: [{
        name: "_hjSession",
        domain: ".example.com",
        path: "/",
        httpOnly: false,
        secure: true,
        sameSite: "Lax",
      }],
      evidenceRefs: [],
    }],
    enabledModules: ["preConsentRuntimeScanner"],
    modulesRun: [{
      moduleName: "preConsentRuntimeScanner",
      status: "completed",
      startedAt,
      completedAt: "2026-01-01T00:00:01.000Z",
      durationMs: 1000,
      evidenceRefs: [],
      errors: ["Headed local fallback used after headless runtime failure: page.goto: net::ERR_HTTP2_PROTOCOL_ERROR"],
    }],
    networkEvents: [],
    normalizedVendorObservations: [],
    observedJourneys: [],
  });

  assert.equal(summary.coverageStatus, "usable");
  assert.equal(summary.silentEmpty, false);
  assert.deepEqual(summary.fallbackModesUsed, ["headed"]);
  assert.equal(summary.observationCounts.cookiesBeforeConsent, 1);
});

test("runtime coverage remains usable when only screenshot fallback failed", () => {
  const summary = deriveRuntimeCoverageSummary({
    cookieEvents: [],
    cookieSnapshots: [],
    enabledModules: ["preConsentRuntimeScanner"],
    modulesRun: [{
      moduleName: "preConsentRuntimeScanner",
      status: "partial",
      startedAt,
      completedAt: "2026-01-01T00:00:01.000Z",
      durationMs: 1000,
      evidenceRefs: [],
      errors: ["Screenshot fallback used: page.screenshot: Timeout 5000ms exceeded."],
    }],
    networkEvents: [{
      eventId: "net_1",
      eventType: "network_request",
      timestampMs: 100,
      sourceScanner: "pre_consent_runtime",
      consentStateAtTime: "pre_consent",
      pagePhase: "initial_navigation",
      url: "https://cdn.example/analytics.js",
      hostname: "cdn.example",
      firstParty: false,
      thirdParty: true,
      evidenceRefs: [],
      confidence: 0.9,
      directVsInferred: "direct",
    }],
    normalizedVendorObservations: [],
    observedJourneys: [],
  });

  assert.equal(summary.coverageStatus, "usable");
  assert.deepEqual(summary.limitationKeys, []);
  assert.equal(summary.observationCounts.networkEvents, 1);
});

test("runtime coverage is not applicable when pre-consent runtime is out of profile", () => {
  const summary = deriveRuntimeCoverageSummary({
    cookieEvents: [],
    cookieSnapshots: [],
    enabledModules: ["policySurfaceScanner"],
    modulesRun: [],
    networkEvents: [],
    normalizedVendorObservations: [],
    observedJourneys: [],
  });

  assert.equal(summary.coverageStatus, "not_applicable");
  assert.deepEqual(summary.limitationKeys, ["pre_consent_runtime_not_in_profile"]);
});
