import assert from "node:assert/strict";
import test from "node:test";

import { buildSiteReport } from "./live-consent-audit";

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
