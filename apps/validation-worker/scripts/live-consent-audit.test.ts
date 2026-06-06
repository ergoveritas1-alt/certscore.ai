import assert from "node:assert/strict";
import test from "node:test";

import { buildSiteReport, classifyCookieArtifact, classifyUrlArtifact } from "./live-consent-audit";

function makeScenario(overrides: Record<string, unknown> = {}) {
  return {
    actionSummary: {
      acceptPath: { attempted: false, clicks: null, labels: [], timeMs: null },
      rejectPath: { attempted: false, clicks: null, labels: [], timeMs: null }
    },
    banner: {
      bannerHtmlPath: null,
      bannerPresent: false,
      bannerText: null,
      frameUrl: null,
      screenshots: {
        banner: null,
        firstLoad: null,
        preferencesCenter: null
      },
      visibleActions: {
        accept: false,
        manage: false,
        reject: false
      }
    },
    cmpSignals: [],
    errors: [],
    network: [],
    notes: [],
    preferences: null,
    refresh: null,
    storageDiffs: {
      acceptPhase: null,
      refreshPhase: null
    },
    storageAfterAction: null,
    storageBeforeInteraction: {
      cookies: [],
      indexedDbNames: [],
      localStorage: [],
      sessionStorage: []
    },
    timestamp: "2026-03-26T00:00:00.000Z",
    url: "https://www.example.com/",
    ...overrides
  };
}

test("buildSiteReport treats visible first-layer reject control as present", () => {
  const scenarios: any = {
    accept_all: makeScenario(),
    custom_preferences: makeScenario(),
    fresh_visit: makeScenario({
      banner: {
        bannerHtmlPath: null,
        bannerPresent: true,
        bannerText: "Your Privacy Accept All Open preferences Reject All",
        frameUrl: "https://www.betterment.com/",
        screenshots: { banner: null, firstLoad: null, preferencesCenter: null },
        visibleActions: {
          accept: true,
          manage: true,
          reject: true
        }
      },
      url: "https://www.betterment.com/"
    }),
    fresh_visit_gpc: makeScenario(),
    reject_all: makeScenario({
      url: "https://www.betterment.com/"
    })
  };

  const report = buildSiteReport("https://betterment.com", scenarios);
  assert.equal(report.consentUxScorecard.rejectAllFirstLayer, "yes");
  assert.equal(report.findings.some((finding) => finding.findingId === "F002"), false);
});

test("buildSiteReport does not claim reject-path failure when reject click never completed", () => {
  const scenarios: any = {
    accept_all: makeScenario(),
    custom_preferences: makeScenario(),
    fresh_visit: makeScenario({
      banner: {
        bannerHtmlPath: null,
        bannerPresent: true,
        bannerText: "Your Privacy Accept All Open preferences Reject All",
        frameUrl: "https://www.betterment.com/",
        screenshots: { banner: null, firstLoad: null, preferencesCenter: null },
        visibleActions: {
          accept: true,
          manage: true,
          reject: true
        }
      },
      url: "https://www.betterment.com/"
    }),
    fresh_visit_gpc: makeScenario(),
    reject_all: makeScenario({
      actionSummary: {
        acceptPath: { attempted: false, clicks: null, labels: [], timeMs: null },
        rejectPath: { attempted: true, clicks: null, labels: [], timeMs: null }
      },
      network: [
        {
          documentUrl: "https://www.betterment.com/",
          hostname: "analytics.google.com",
          initiator: "script",
          method: "GET",
          phase: "after_choice",
          resourceType: "script",
          timestamp: "2026-03-26T00:00:01.000Z",
          url: "https://analytics.google.com/g/collect",
          vendorCategory: "analytics",
          vendorName: "Google Analytics"
        }
      ],
      storageAfterAction: {
        cookies: [],
        indexedDbNames: [],
        localStorage: [],
        sessionStorage: []
      },
      url: "https://www.betterment.com/"
    })
  };

  const report = buildSiteReport("https://betterment.com", scenarios);
  assert.equal(report.findings.some((finding) => finding.findingId === "F003"), false);
});

test("buildSiteReport reports domain resolution failures explicitly", () => {
  const scenarios: any = {
    accept_all: makeScenario(),
    custom_preferences: makeScenario(),
    fresh_visit: makeScenario({
      errors: ["Navigation failed: page.goto: net::ERR_NAME_NOT_RESOLVED at https://howeycoins.com/"],
      url: "https://howeycoins.com/"
    }),
    fresh_visit_gpc: makeScenario(),
    reject_all: makeScenario()
  };

  const report = buildSiteReport("https://howeycoins.com", scenarios);
  assert.equal(report.executiveSummary.overallTestingStatus, "blocked by domain resolution failure during scenario startup");
  assert.equal(report.finalClassification, "inconclusive / needs manual review");
});

test("buildSiteReport does not treat always-active preferences as optional preselection", () => {
  const scenarios: any = {
    accept_all: makeScenario(),
    custom_preferences: makeScenario({
      preferences: {
        optionalCategoriesPreselected: false,
        toggleStates: [
          { checked: true, disabled: true, label: "Always Active", role: "switch" },
          { checked: true, disabled: false, label: "", role: "switch" }
        ]
      }
    }),
    fresh_visit: makeScenario(),
    fresh_visit_gpc: makeScenario(),
    reject_all: makeScenario()
  };

  const report = buildSiteReport("https://betterment.com", scenarios);
  assert.equal(report.findings.some((finding) => finding.findingId === "F004"), false);
});

test("classifyUrlArtifact does not treat first-party /guides paths as DoubleClick", () => {
  const classified = classifyUrlArtifact("https://certscore.ai/guides?_rsc=178l4");
  assert.equal(classified.vendorName, null);
  assert.equal(classified.category, "unknown_needs_manual_review");
});

test("classifyCookieArtifact still recognizes DoubleClick cookie names", () => {
  const classified = classifyCookieArtifact(".doubleclick.net", "IDE");
  assert.equal(classified.vendorName, "DoubleClick");
  assert.equal(classified.category, "advertising_marketing");
});

test("classifyCookieArtifact recognizes CMP infrastructure by canonical vendor", () => {
  const cookieYes = classifyCookieArtifact(".example.com", "cookieyes-consent");
  assert.equal(cookieYes.vendorName, "CookieYes");
  assert.equal(cookieYes.category, "strictly_necessary");

  const transcend = classifyCookieArtifact(".example.com", "airgap");
  assert.equal(transcend.vendorName, "Transcend");
  assert.equal(transcend.category, "strictly_necessary");
});

test("classifyUrlArtifact recognizes Transcend and Usercentrics CMP infrastructure", () => {
  const transcend = classifyUrlArtifact("https://cdn.transcend-cdn.com/cm/airgap.js");
  assert.equal(transcend.vendorName, "Transcend");
  assert.equal(transcend.category, "strictly_necessary");

  const usercentrics = classifyUrlArtifact("https://consent-api.service.consent.usercentrics.eu/consent");
  assert.equal(usercentrics.vendorName, "Usercentrics");
  assert.equal(usercentrics.category, "strictly_necessary");
});

test("buildSiteReport does not treat inline homepage marketing copy as a consent banner", () => {
  const scenarios: any = {
    accept_all: makeScenario(),
    custom_preferences: makeScenario(),
    fresh_visit: makeScenario({
      banner: {
        bannerHtmlPath: null,
        bannerPresent: false,
        bannerText: null,
        frameUrl: null,
        screenshots: { banner: null, firstLoad: null, preferencesCenter: null },
        visibleActions: {
          accept: false,
          manage: false,
          reject: false
        }
      },
      url: "https://certscore.ai/"
    }),
    fresh_visit_gpc: makeScenario(),
    reject_all: makeScenario({
      url: "https://certscore.ai/"
    })
  };

  const report = buildSiteReport("https://certscore.ai", scenarios);
  assert.equal(report.consentUxScorecard.bannerPresent, "no");
  assert.equal(report.consentUxScorecard.rejectAllFirstLayer, "inconclusive");
  assert.equal(report.findings.length, 0);
  assert.equal(report.finalClassification, "no obvious issue observed");
});
