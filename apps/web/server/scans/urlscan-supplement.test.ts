import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFullScanUrlscanSupplementPayload,
  shouldAttemptFullScanUrlscanSupplement
} from "./urlscan-supplement";

test("attempts urlscan supplement only for blocked full scans without verified public surfaces", () => {
  assert.equal(
    shouldAttemptFullScanUrlscanSupplement({
      snapshot: {
        blocked_flag: true,
        verified_public_surfaces_count: 0
      }
    }),
    true
  );

  assert.equal(
    shouldAttemptFullScanUrlscanSupplement({
      snapshot: {
        blocked_flag: true,
        verified_public_surfaces_count: 1
      }
    }),
    false
  );

  assert.equal(
    shouldAttemptFullScanUrlscanSupplement({
      snapshot: {
        homepage_fetch_status: "ok",
        pages_scanned: 1,
        verified_public_surfaces_count: 0
      }
    }),
    false
  );
});

test("builds supplemental urlscan evidence without promoted sample findings", () => {
  const payload = buildFullScanUrlscanSupplementPayload({
    domainHostname: "example.com",
    hostname: "example.com",
    normalizedUrl: "https://example.com/",
    selectedSource: {
      reportUrl: "https://urlscan.io/result/rich/",
      resultApiUrl: "https://urlscan.io/api/v1/result/rich/",
      result: {
        data: {
          cookies: [{}, {}],
          requests: new Array(40).fill({})
        },
        lists: {
          countries: ["US"],
          domains: ["example.com", "cdn.example.net", "analytics.example.net"],
          ips: ["192.0.2.1", "192.0.2.2"],
          servers: ["cloudflare"]
        },
        page: {
          title: "Example",
          url: "https://example.com/"
        },
        stats: {
          totalRequests: 40
        },
        technologies: ["Cloudflare", "Google Tag Manager"]
      }
    },
    snapshot: {
      blocked_flag: true,
      homepage_fetch_http_status: 403,
      homepage_fetch_status: "blocked"
    }
  });

  assert.ok(payload);
  assert.equal(payload.fallbackEvidence?.source, "urlscan");
  assert.equal(payload.fallbackEvidence?.reportUrl, "https://urlscan.io/result/rich/");
  assert.equal(payload.fallbackEvidence?.metrics?.requestCount, 40);
  assert.equal(payload.fallbackEvidence?.metrics?.domainCount, 3);
  assert.deepEqual(payload.fallbackEvidence?.entities?.technologyNames, ["Cloudflare", "Google Tag Manager"]);
  assert.equal(payload.sampleFindings.length, 0);
  assert.match(payload.summaryBullets.join(" "), /not treated as a verified CertScore finding/);
});
