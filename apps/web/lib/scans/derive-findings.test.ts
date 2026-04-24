import assert from "node:assert/strict";
import test from "node:test";
import { deriveCertScoreFindings } from "./derive-findings";

test("deriveCertScoreFindings now returns metrics without surfaced findings", () => {
  const summary = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        networkSummary: {
          thirdPartyRequestCount: 124,
          thirdPartyDomainCount: 6
        },
        vendorSummary: {
          normalizedVendors: ["Google Analytics", "Meta Pixel", "Xandr", "TikTok"],
          rawThirdPartyDomains: ["google-analytics.com", "connect.facebook.net", "ib.adnxs.com"],
          vendorCategoryCounts: {
            advertising: 2,
            analytics: 1,
            functional: 2,
            unknown: 5
          }
        },
        requestObservations: [
          { domain: "router.infolinks.com", thirdParty: true },
          { domain: "my.rtmark.net", thirdParty: true },
          { domain: "ib.adnxs.com", thirdParty: true }
        ],
        cookieWriteObservations: [
          { cookieName: "_ga", domain: ".fojik.site" },
          { cookieName: "uuid2", domain: ".adnxs.com" },
          { cookieName: "cf_clearance", domain: ".fojik.site" }
        ],
        fingerprintSummary: {
          tier: 3,
          confidence: "high",
          reasons: ["Multiple device attributes collected", "Data transmitted to third-party endpoint"],
          attributeCategoryCount: 4
        }
      }
    },
    snapshot: {
      certscore_overall: 42,
      final_url: "https://fojik.site/"
    },
    scan: {
      completedAt: "2026-04-02T10:00:00.000Z",
      createdAt: "2026-04-02T09:59:00.000Z",
      domainHostname: "freefunz.site"
    }
  });

  assert.deepEqual(summary.findings, []);
  assert.deepEqual(summary.groupedFindings, []);
  assert.equal(summary.posture, "Action Needed");
  assert.equal(summary.score, 42);
  assert.equal(summary.finalHost, "fojik.site");
  assert.equal(summary.landedOnDifferentHost, true);
  assert.equal(summary.thirdPartyRequestCount, 124);
  assert.equal(summary.vendorCount, 4);
  assert.equal(summary.vendorCategoryCounts.advertising, 2);
  assert.ok(summary.rawAdtechHosts.includes("ib.adnxs.com"));
  assert.ok(summary.topObservedEntities.some((entity) => entity.label === "router.infolinks.com"));
  assert.deepEqual(summary.analyticsCookieNames, ["_ga"]);
  assert.deepEqual(summary.adtechCookieNames, ["uuid2"]);
  assert.deepEqual(summary.securityCookieNames, ["cf_clearance"]);
});

test("deriveCertScoreFindings preserves landed-host attribution and host alias handling", () => {
  const offOrigin = deriveCertScoreFindings({
    events: [
      {
        eventType: "runtime.browser_pass_diagnostic",
        metadataJson: {
          currentUrl: "https://www.brandforce.com/domain/Helio.com/",
          homepageUrl: "https://helio.com/",
          stepKey: "homepage_navigation"
        }
      }
    ],
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        navigationSummary: {
          finalUrl: "https://helio.com/",
          initialUrl: "https://helio.com/"
        }
      }
    },
    snapshot: {
      certscore_overall: 65,
      final_url: "https://helio.com/"
    },
    scan: {
      completedAt: "2026-04-18T20:02:33.000Z",
      createdAt: "2026-04-18T20:01:12.000Z",
      domainHostname: "helio.com"
    }
  });

  assert.equal(offOrigin.finalHost, "www.brandforce.com");
  assert.equal(offOrigin.landedOnDifferentHost, true);

  const alias = deriveCertScoreFindings({
    runtimeArtifacts: {
      hybrid_runtime_evidence: {
        navigationSummary: {
          finalUrl: "https://www.google.com/",
          initialUrl: "https://google.com/"
        }
      }
    },
    snapshot: {
      certscore_overall: 74,
      final_url: "https://www.google.com/"
    },
    scan: {
      completedAt: "2026-04-18T20:08:10.000Z",
      createdAt: "2026-04-18T20:07:11.000Z",
      domainHostname: "google.com"
    }
  });

  assert.equal(alias.finalHost, "www.google.com");
  assert.equal(alias.landedOnDifferentHost, false);
});

test("deriveCertScoreFindings derives score-based posture when no executive findings are returned", () => {
  const clear = deriveCertScoreFindings({
    runtimeArtifacts: null,
    snapshot: {
      certscore_overall: 88
    },
    scan: {
      completedAt: "2026-04-23T20:27:18.000Z",
      createdAt: "2026-04-23T20:27:00.000Z",
      domainHostname: "example.com"
    }
  });

  const watch = deriveCertScoreFindings({
    runtimeArtifacts: null,
    snapshot: {
      certscore_overall: 60
    },
    scan: {
      completedAt: "2026-04-23T20:27:18.000Z",
      createdAt: "2026-04-23T20:27:00.000Z",
      domainHostname: "example.com"
    }
  });

  const actionNeeded = deriveCertScoreFindings({
    runtimeArtifacts: null,
    snapshot: {
      certscore_overall: 32
    },
    scan: {
      completedAt: "2026-04-23T20:27:18.000Z",
      createdAt: "2026-04-23T20:27:00.000Z",
      domainHostname: "example.com"
    }
  });

  assert.equal(clear.posture, "Clear");
  assert.equal(watch.posture, "Watch");
  assert.equal(actionNeeded.posture, "Action Needed");
});
