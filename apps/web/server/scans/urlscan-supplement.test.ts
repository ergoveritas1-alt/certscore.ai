import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFullScanUrlscanSupplementPayload,
  shouldAttemptFullScanUrlscanSupplement
} from "./urlscan-supplement";

test("attempts urlscan supplement for homepage-blocked full scans even when legal surfaces were verified", () => {
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
        pages_scanned: 4,
        verified_public_surfaces_count: 1
      }
    }),
    true
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
          cookies: [{ name: "_ga", domain: ".example.com" }, { name: "visitor_id", domain: "analytics.example.net" }],
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
      homepage_fetch_status: "blocked",
      verified_public_surfaces_count: 2
    }
  });

  assert.ok(payload);
  assert.equal(payload.fallbackEvidence?.source, "urlscan");
  assert.equal(payload.fallbackEvidence?.reportUrl, "https://urlscan.io/result/rich/");
  assert.equal(payload.fallbackEvidence?.metrics?.requestCount, 40);
  assert.equal(payload.fallbackEvidence?.metrics?.domainCount, 3);
  assert.deepEqual(payload.fallbackEvidence?.entities?.cookieNames, ["_ga", "visitor_id"]);
  assert.deepEqual(payload.fallbackEvidence?.entities?.cookieDomains, [".example.com", "analytics.example.net"]);
  assert.equal(payload.fallbackEvidence?.cookieFootprint?.summary, "2 initial cookies retained from supplemental public runtime evidence.");
  assert.deepEqual(payload.fallbackEvidence?.entities?.technologyNames, ["Cloudflare", "Google Tag Manager"]);
  assert.equal(payload.evidence?.verifiedPublicSurfacesCount, 2);
  assert.equal(payload.sampleFindings.length, 0);
  assert.match(payload.summaryBullets.join(" "), /not treated as a verified CertScore finding/);
});

test("labels submitted-domain urlscan evidence when the requested domain redirects off-domain", () => {
  const payload = buildFullScanUrlscanSupplementPayload({
    domainHostname: "freefunz.site",
    evidenceRelation: "off_domain_redirect",
    hostname: "freefunz.site",
    normalizedUrl: "https://freefunz.site/",
    selectedSource: {
      reportUrl: "https://urlscan.io/result/redirect/",
      resultApiUrl: "https://urlscan.io/api/v1/result/redirect/",
      result: {
        data: {
          requests: new Array(116).fill({})
        },
        lists: {
          domains: ["fojik.site", "cdn.example.net"],
          ips: ["192.0.2.1"],
          servers: ["cloudflare"]
        },
        page: {
          title: "Fojik",
          url: "https://fojik.site/"
        },
        stats: {
          totalRequests: 116
        }
      }
    },
    snapshot: {
      blocked_flag: true,
      verified_public_surfaces_count: 0
    },
    urlscanFinalHostname: "fojik.site"
  });

  assert.ok(payload);
  assert.equal(payload.resultState?.code, "full_scan_urlscan_redirect_supplement");
  assert.equal(payload.evidence?.urlscanEvidenceRelation, "off_domain_redirect");
  assert.equal(payload.evidence?.urlscanFinalHostname, "fojik.site");
  assert.equal(payload.sampleFindings.length, 0);
  assert.equal(payload.summaryBullets.some((bullet) => bullet.includes("redirected to fojik.site")), true);
});
