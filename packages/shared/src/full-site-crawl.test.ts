import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import {
  aggregateFullSite,
  canUseFullSite,
  compactCrawlObservation,
  fullSitePolicy,
  validateFullSiteRequest,
  FULL_SITE_CONDITION,
  FULL_SITE_CONTRACT,
  type CrawlPage,
  type CrawlObservation,
  type CrawlOccurrence,
  type CrawlState,
} from "./full-site-crawl";
import {
  crawlDisplayUrl,
  crawlExclusion,
  normalizeCrawlUrl,
  parseCrawlRobots,
  robotsAllows,
  robotsDisallowAll,
  robotsRestrictionMessage,
} from "./full-site-urls";

export const state: CrawlState = {
  scanId: randomUUID(),
  status: "running",
  requested: { maxPages: 200, concurrency: 3, waitSeconds: 5 },
  effective: { concurrency: 1, waitSeconds: 10 },
  region: "eu-west-1",
  configurationHash: "a".repeat(64),
  startedAt: "2026-09-06T00:00:00.000Z",
  completedAt: null,
  homepageDurationMs: 30000,
  stopReason: null,
  discoveryExhausted: false,
  discovered: 200,
  peakWorkers: 1,
  pauseMs: 0,
};
export function occurrence(
  kind: CrawlOccurrence["kind"],
  identity: string,
  id = identity,
): CrawlOccurrence {
  return {
    id,
    kind,
    identity,
    label: identity,
    vendor: null,
    domain: null,
    serviceId: null,
    purpose: "unknown",
    resourceType: kind,
    relationship: "unknown",
    confidence: "unknown",
    assessment: "Not assessed",
    eventCount: 1,
    firstSeenMs: 100,
    evidenceRefs: [id],
    details: {},
  };
}
export function page(
  source: string,
  rows: CrawlOccurrence[],
  status: CrawlObservation["status"] = "completed",
): CrawlPage {
  const id = randomUUID();
  return {
    id,
    url: `https://example.test/${source}`,
    finalUrl: null,
    source,
    selectionReason: "fixture",
    status,
    limitation: null,
    attemptCount: 1,
    observation: {
      contractVersion: FULL_SITE_CONTRACT,
      parentScanId: state.scanId,
      pageJobId: id,
      attemptId: randomUUID(),
      executionProfile:
        source === "homepage" ? "homepage_baseline" : "inventory_only",
      condition: FULL_SITE_CONDITION,
      configurationHash: state.configurationHash,
      requestedUrl: `https://example.test/${source}`,
      finalUrl: null,
      startedAt: state.startedAt,
      completedAt: "2026-09-06T00:00:10.000Z",
      status,
      limitations: [],
      sourceHash: "b".repeat(64),
      occurrences: rows,
      links: [],
      redirects: [],
      httpStatus: 200,
      retryAfterSeconds: null,
      failureKind: null,
    },
  };
}
test("trusted roles, explicit opt-in, defaults, inactive options and malformed bounds", () => {
  for (const role of [null, undefined, "member", "viewer", "owner", "ADMIN"])
    assert.equal(canUseFullSite(role), false);
  for (const role of ["admin", "advanced"])
    assert.equal(canUseFullSite(role), true);
  assert.deepEqual(validateFullSiteRequest({}, false), { fullSite: false });
  assert.deepEqual(validateFullSiteRequest({ fullSite: false }, false), {
    fullSite: false,
  });
  assert.deepEqual(
    validateFullSiteRequest(
      { fullSite: false, crawlOptions: "inactive" },
      true,
    ),
    { fullSite: false },
  );
  for (const input of [
    { fullSite: true },
    { crawlOptions: {} },
    { fullSite: false, crawlOptions: { maxPages: 1 } },
  ])
    assert.throws(() => validateFullSiteRequest(input, false), { status: 403 });
  assert.deepEqual(validateFullSiteRequest({ fullSite: true }, true), {
    fullSite: true,
    crawlOptions: { maxPages: 10, concurrency: 4, waitSeconds: 5 },
  });
  assert.equal(
    validateFullSiteRequest(
      { fullSite: true, crawlOptions: { maxPages: 1 } },
      true,
    ).fullSite,
    true,
  );
  for (const invalid of [
    null,
    [],
    "2",
    { maxPages: null },
    { maxPages: 0 },
    { maxPages: 1.1 },
    { maxPages: 501 },
    { concurrency: 13 },
    { concurrency: 1.1 },
    { waitSeconds: Infinity },
    { waitSeconds: NaN },
    { waitSeconds: 4.9 },
    { waitSeconds: -1 },
    { unknown: 1 },
  ])
    assert.throws(
      () =>
        validateFullSiteRequest(
          { fullSite: true, crawlOptions: invalid },
          true,
        ),
      { status: 400 },
    );
  assert.throws(() => validateFullSiteRequest({ fullSite: "true" }, true), {
    status: 400,
  });
  assert.equal(
    fullSitePolicy({ CERTSCORE_FULL_SITE_MAX_PAGES: "2000" }).maxPages.max,
    2000,
  );
});
test("normalization preserves application identity, limits scope/traps, redacts values and respects robots", () => {
  const base = "https://www.example.test/";
  assert.equal(
    normalizeCrawlUrl("/contact?utm_source=x&lang=de#team", base),
    base + "contact?lang=de",
  );
  assert.equal(
    normalizeCrawlUrl("/#/catalog?category=2", base),
    base + "#/catalog?category=2",
  );
  assert.notEqual(
    normalizeCrawlUrl("/products?page=1", base),
    normalizeCrawlUrl("/products?page=2", base),
  );
  for (const input of [
    "javascript:alert(1)",
    "https://u:p@example.test/",
    "http://example.test:5432/",
  ])
    assert.equal(normalizeCrawlUrl(input, base), null);
  assert.equal(
    crawlExclusion("https://sub.example.test/", ["www.example.test"]),
    "outside_validated_hostname_scope",
  );
  for (const path of ["/logout", "/checkout", "/file.pdf", "/?token=secret"])
    assert.ok(crawlExclusion(base + path.slice(1), ["www.example.test"]));
  assert.ok(
    !crawlDisplayUrl(
      base + "?email=secret@example.test&token=private#route?auth=hidden",
    ).match(/secret|private|hidden/),
  );
  assert.ok(
    !crawlDisplayUrl(base + "#access_token=private-fragment").includes(
      "private-fragment",
    ),
  );
  const robots = parseCrawlRobots(
    "User-agent: *\nDisallow: /\nUser-agent: CertScore\nDisallow: /private\nAllow: /private/public$\nCrawl-delay: 12\nSitemap: https://www.example.test/index.xml",
    "CertScoreBot",
  );
  assert.equal(robots.crawlDelaySeconds, 12);
  assert.equal(robotsAllows(base + "contact", robots), true);
  assert.equal(robotsAllows(base + "private/x", robots), false);
  assert.equal(robotsAllows(base + "private/public", robots), true);
});
test("identities, page occurrences, repeated events, embed instances and retry dedup remain separate", () => {
  const home = page("homepage", [
    occurrence("service", "shared"),
    occurrence("cookie", "cookie-domain-path-partition-1"),
  ]);
  const child = page("contact", [
    occurrence("service", "shared"),
    occurrence("service", "contact-embed"),
    occurrence("cookie", "cookie-domain-path-partition-1"),
    occurrence("cookie", "cookie-domain-path-partition-2"),
    occurrence("request", "same-endpoint", "r1"),
    occurrence("request", "same-endpoint", "r2"),
    occurrence("request", "same-endpoint", "r2"),
    occurrence("embed", "same-frame", "e1"),
    occurrence("embed", "same-frame", "e2"),
  ]);
  const a = aggregateFullSite(state, [home, child]);
  assert.equal(a.totals.services, 2);
  assert.equal(a.totals.cookies, 2);
  assert.equal(a.totals.requestEvents, 2);
  assert.equal(a.totals.embedInstances, 2);
  assert.equal(a.totals.additionalServices, 1);
  assert.equal(
    a.resources.find((r) => r.key === "service:shared")?.pageIds.length,
    2,
  );
  assert.equal(
    a.resources.find((r) => r.key === "service:contact-embed")?.homepage,
    "not_observed",
  );
  const compact = aggregateFullSite(state, [
    home,
    { ...child, observation: compactCrawlObservation(child.observation!) },
  ]);
  assert.deepEqual(compact.totals, a.totals);
});
test("incomplete/mismatched homepages never establish absence; partial positives and mixed classifications survive", () => {
  const home = page("homepage", [occurrence("service", "s")], "partial");
  const child = page(
    "contact",
    [
      { ...occurrence("service", "s"), purpose: "analytics" },
      occurrence("service", "new"),
    ],
    "partial",
  );
  const failed = page(
    "error",
    [occurrence("service", "challenge-script")],
    "blocked",
  );
  const a = aggregateFullSite(state, [home, child, failed]);
  assert.equal(a.totals.additionalServices, null);
  assert.equal(a.totals.services, 2);
  assert.deepEqual(a.resources.find((r) => r.key === "service:s")?.purposes, [
    "unknown",
    "analytics",
  ]);
  assert.equal(a.timing.sampleCount, 0);
  home.observation!.configurationHash = "c".repeat(64);
  assert.equal(
    aggregateFullSite(state, [home, child]).resources[0]?.homepage,
    "unknown",
  );
});
test("200 independent pages aggregate to bounded identities with exact event counts", () => {
  const pages = Array.from({ length: 200 }, (_, i) =>
    page(i === 0 ? "homepage" : String(i), [
      occurrence("service", "shared"),
      ...Array.from({ length: 200 }, (_, n) =>
        occurrence("request", `endpoint-${n % 10}`, `event-${n}`),
      ),
    ]),
  );
  const started = performance.now();
  const result = aggregateFullSite(
    state,
    pages.map((p) => ({
      ...p,
      observation: compactCrawlObservation(p.observation!),
    })),
  );
  assert.equal(result.counts.completed, 200);
  assert.equal(result.totals.requestEvents, 40000);
  assert.equal(result.resources.length, 11);
  assert.equal(result.totals.services, 1);
  assert.ok(performance.now() - started < 3000);
});

test("owner-approved crawl limits and robots subset boundaries", () => {
  const policy = fullSitePolicy();
  assert.deepEqual(policy.concurrency, { min: 1, max: 12, default: 4 });
  assert.equal(policy.wallClockSeconds, 14400);
  assert.equal(policy.pageSeconds, 20);
  assert.equal(policy.leaseSeconds, 30);
  assert.equal(
    validateFullSiteRequest(
      { fullSite: true, crawlOptions: { concurrency: 12 } },
      true,
    ).fullSite,
    true,
  );
  const denied = parseCrawlRobots("User-agent: *\nDisallow: /", "CertScoreBot");
  assert.equal(robotsDisallowAll(denied), true);
  assert.equal(
    robotsDisallowAll(
      parseCrawlRobots("User-agent: *\nDisallow: /*$", "CertScoreBot"),
    ),
    true,
  );
  assert.equal(
    robotsDisallowAll(
      parseCrawlRobots("User-agent: *\nDisallow: /$", "CertScoreBot"),
    ),
    false,
  );
  assert.throws(
    () =>
      parseCrawlRobots(
        "User-agent: *\nAllow: /" + "a".repeat(2001),
        "CertScoreBot",
      ),
    /robots_policy_limit/,
  );
  assert.match(
    robotsRestrictionMessage(denied)!,
    /No additional pages were crawled/,
  );
  const subset = parseCrawlRobots(
    "User-agent: *\nDisallow: /\nAllow: /public/",
    "CertScoreBot",
  );
  assert.equal(robotsDisallowAll(subset), false);
  assert.equal(robotsAllows("https://example.test/public/page", subset), true);
  assert.equal(robotsAllows("https://example.test/private", subset), false);
  assert.equal(robotsAllows("https://example.test/sitemap.xml", subset), false);
  assert.match(robotsRestrictionMessage(subset)!, /Only permitted URLs/);
  assert.equal(
    robotsDisallowAll({
      rules: [],
      byHost: { "a.test": denied, "b.test": subset },
      crawlDelaySeconds: 0,
      sitemaps: [],
    }),
    false,
  );
});
