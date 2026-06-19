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

test("runtime coverage records CMP limitation when no actionable consent controls are retained", () => {
  const summary = deriveRuntimeCoverageSummary({
    cmpRuntimeObservations: [{
      observationId: "cmp_runtime_vendor_onetrust",
      observedAtMs: 1200,
      sourceScanner: "pre_consent_runtime",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      vendorObservationId: "vendor_onetrust",
      entity: "OneTrust, LLC",
      vendor: "OneTrust",
      product: "OneTrust CMP",
      signals: [],
      evidenceRefs: [],
      confidence: 0.95,
      directVsInferred: "direct",
    }],
    consentUiObservations: [{
      observationId: "consent_ui_pre_consent",
      observedAtMs: 1300,
      likelyPresent: false,
      basis: ["bounded_capture_timeout_or_failure"],
      textExcerpt: "",
      layerInspected: "unknown",
      visibleChoiceLabels: [],
      acceptControlObserved: false,
      rejectControlObserved: false,
      managePreferencesControlObserved: false,
      controls: [],
      evidenceRefs: [],
      confidence: 0.4,
    }],
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
    networkEvents: [{
      eventId: "net_1",
      eventType: "network_request",
      timestampMs: 100,
      sourceScanner: "pre_consent_runtime",
      consentStateAtTime: "pre_consent",
      pagePhase: "initial_navigation",
      url: "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js",
      hostname: "cdn.cookielaw.org",
      firstParty: false,
      thirdParty: true,
      evidenceRefs: [],
      confidence: 0.95,
      directVsInferred: "direct",
    }],
    normalizedVendorObservations: [],
    observedJourneys: [],
  });

  assert.equal(summary.coverageStatus, "limited_partial");
  assert.deepEqual(summary.limitationKeys, ["cmp_runtime_without_actionable_surface"]);
  assert.match(summary.notes.join("\n"), /CMP runtime evidence was observed/);
});

test("runtime coverage stays usable when CMP and actionable first-layer controls are retained", () => {
  const summary = deriveRuntimeCoverageSummary({
    cmpRuntimeObservations: [{
      observationId: "cmp_runtime_vendor_onetrust",
      observedAtMs: 1200,
      sourceScanner: "pre_consent_runtime",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      vendorObservationId: "vendor_onetrust",
      entity: "OneTrust, LLC",
      vendor: "OneTrust",
      product: "OneTrust CMP",
      signals: [],
      evidenceRefs: [],
      confidence: 0.95,
      directVsInferred: "direct",
    }],
    consentUiObservations: [{
      observationId: "consent_ui_pre_consent",
      observedAtMs: 1300,
      likelyPresent: true,
      basis: ["control:reject_all:Reject All"],
      textExcerpt: "We use cookies. Reject All. Accept All.",
      layerInspected: "first_layer",
      visibleChoiceLabels: ["Reject All", "Accept All"],
      acceptControlObserved: true,
      rejectControlObserved: true,
      managePreferencesControlObserved: false,
      controls: [{
        actionType: "reject_all",
        label: "Reject All",
        selectorHint: "button",
        tagName: "button",
        visible: true,
      }],
      evidenceRefs: [],
      confidence: 0.86,
    }],
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
    networkEvents: [{
      eventId: "net_1",
      eventType: "network_request",
      timestampMs: 100,
      sourceScanner: "pre_consent_runtime",
      consentStateAtTime: "pre_consent",
      pagePhase: "initial_navigation",
      url: "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js",
      hostname: "cdn.cookielaw.org",
      firstParty: false,
      thirdParty: true,
      evidenceRefs: [],
      confidence: 0.95,
      directVsInferred: "direct",
    }],
    normalizedVendorObservations: [],
    observedJourneys: [],
  });

  assert.equal(summary.coverageStatus, "usable");
  assert.deepEqual(summary.limitationKeys, []);
});

test("runtime coverage keeps privacy-choice controls actionable while post-consent flows are disabled", () => {
  const summary = deriveRuntimeCoverageSummary({
    cmpRuntimeObservations: [{
      observationId: "cmp_runtime_vendor_onetrust",
      observedAtMs: 1200,
      sourceScanner: "pre_consent_runtime",
      scenario: "fresh_pre_consent",
      consentStateAtTime: "pre_consent",
      vendorObservationId: "vendor_onetrust",
      entity: "OneTrust, LLC",
      vendor: "OneTrust",
      product: "OneTrust CMP",
      signals: [],
      evidenceRefs: [],
      confidence: 0.95,
      directVsInferred: "direct",
    }],
    consentUiObservations: [{
      observationId: "consent_ui_pre_consent",
      observedAtMs: 1300,
      likelyPresent: true,
      basis: ["control:do_not_sell_share:Your Privacy Choices"],
      textExcerpt: "Your Privacy Choices",
      layerInspected: "first_layer",
      visibleChoiceLabels: ["Your Privacy Choices"],
      acceptControlObserved: false,
      rejectControlObserved: false,
      managePreferencesControlObserved: true,
      controls: [{
        actionType: "do_not_sell_share",
        label: "Your Privacy Choices",
        selectorHint: "button",
        tagName: "button",
        visible: true,
      }],
      evidenceRefs: [],
      confidence: 0.86,
    }],
    cookieEvents: [],
    cookieSnapshots: [],
    enabledModules: ["preConsentRuntimeScanner", "consentFlowRuntimeScanner"],
    modulesRun: [{
      moduleName: "preConsentRuntimeScanner",
      status: "completed",
      startedAt,
      completedAt: "2026-01-01T00:00:01.000Z",
      durationMs: 1000,
      evidenceRefs: [],
      errors: [],
    }, {
      moduleName: "consentFlowRuntimeScanner",
      status: "not_testable",
      startedAt,
      completedAt: startedAt,
      durationMs: 0,
      evidenceRefs: [],
      errors: ["Post-consent consent-flow runtime is intentionally disabled for WC01 scanner runs."],
    }],
    networkEvents: [{
      eventId: "net_1",
      eventType: "network_request",
      timestampMs: 100,
      sourceScanner: "pre_consent_runtime",
      consentStateAtTime: "pre_consent",
      pagePhase: "initial_navigation",
      url: "https://cdn.cookielaw.org/scripttemplates/otSDKStub.js",
      hostname: "cdn.cookielaw.org",
      firstParty: false,
      thirdParty: true,
      evidenceRefs: [],
      confidence: 0.95,
      directVsInferred: "direct",
    }],
    normalizedVendorObservations: [],
    observedJourneys: [],
  });

  assert.equal(summary.coverageStatus, "limited_partial");
  assert.deepEqual(summary.limitationKeys, ["post_consent_flow_runtime_disabled"]);
  assert.doesNotMatch(summary.notes.join("\n"), /no actionable consent surface/);
  assert.match(summary.notes.join("\n"), /intentionally disabled/);
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
