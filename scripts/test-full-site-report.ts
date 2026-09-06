process.env.CERTSCORE_FULL_SITE_INTERNAL_ENABLED = "1";
/** Local-only integration harness. Run after scheduler.test.ts against its disposable database. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import {
  canUseFullSite,
  compactCrawlObservation,
  fullSitePolicy,
  FULL_SITE_CONTRACT,
  FULL_SITE_CONDITION,
  type CrawlOccurrence,
} from "../packages/shared/src/full-site-crawl";

async function main() {
  const databaseUrl = process.env.FULL_SITE_TEST_DATABASE_URL;
  assert.ok(databaseUrl);
  const url = new URL(databaseUrl);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/full_site_test");
  process.env.DATABASE_URL = databaseUrl;
  process.env.DATABASE_READ_URL = databaseUrl;
  process.env.DATABASE_SSL_MODE = "disable";
  process.env.DB_QUERY_LOG_ENABLED = "false";
  const db = await import("../packages/db/src/index");
  const { loadFullSiteReport, loadFullSiteExport } = await import(
    "../apps/web/server/scans/full-site-report"
  );
  const scanId = randomUUID(),
    userId = randomUUID(),
    organizationId = randomUUID(),
    configurationHash = "a".repeat(64);
  const policy = fullSitePolicy(),
    requested = { maxPages: 250, concurrency: 3, waitSeconds: 5 },
    date = "2026-09-06T12:00:00.000Z";
  const row = (
    kind: CrawlOccurrence["kind"],
    identity: string,
    purpose = "unknown",
  ): CrawlOccurrence => ({
    kind,
    identity,
    id: identity,
    label: identity,
    vendor: "Fixture vendor",
    serviceId: kind === "service" ? identity : null,
    domain: "example.test",
    purpose,
    resourceType: kind,
    relationship: "first_party",
    assessment: "Not assessed",
    confidence: "unknown",
    firstSeenMs: 100,
    eventCount: 1,
    evidenceRefs: [identity],
    details: kind === "cookie" ? { persistence: "session" } : {},
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined,
    server: ReturnType<typeof createServer> | undefined;
  try {
    await db.query(`insert into users(id) values($1)`, [userId]);
    await db.query(
      `insert into organization_members values($1,$2,'advanced')`,
      [userId, organizationId],
    );
    await db.query(
      `insert into scans(id,organization_id,status,scan_config_json) values($1,$2,'completed',$3)`,
      [
        scanId,
        organizationId,
        { fullSite: true, crawlOptions: requested, hostname: "example.test" },
      ],
    );
    await db.withWriteTransaction((client) =>
      db.insertFullSiteCrawl(client, {
        scanId,
        userId,
        requested,
        policy,
        region: "eu-west-1",
        url: "https://example.test/",
        siteKey: "example.test",
      }),
    );
    await db.query(
      `update full_site_crawls set status='running',configuration_hash=$2,crawl_started_at=$3,homepage_duration_ms=30000,peak_workers=2 where scan_id=$1`,
      [scanId, configurationHash, date],
    );
    const [home] = await db.loadFullSitePages(scanId);
    assert.ok(home);
    let contactId = "";
    for (let i = 0; i < 201; i++) {
      const id = i === 0 ? home.id : randomUUID(),
        target =
          i === 0
            ? "https://example.test/"
            : `https://example.test/${i === 1 ? "contact" : `pages/${i}`}?lang=private-query-value`;
      if (i === 1) contactId = id;
      const status =
        i === 200 ? "blocked" : i === 199 ? "partial" : "completed";
      const occurrences =
        status === "blocked"
          ? []
          : [
              row("service", "Shared analytics", "analytics"),
              row(
                "cookie",
                "scope-bound cookie",
                i % 2 ? "analytics" : "functional",
              ),
              row("request", "safe request endpoint"),
              ...(i === 1
                ? [
                    row("service", "Contact map", "functional"),
                    row("embed", "Contact map frame", "functional"),
                  ]
                : []),
            ];
      const observation = {
        contractVersion: FULL_SITE_CONTRACT,
        parentScanId: scanId,
        pageJobId: id,
        attemptId: randomUUID(),
        executionProfile:
          i === 0
            ? ("homepage_baseline" as const)
            : ("inventory_only" as const),
        condition: FULL_SITE_CONDITION,
        configurationHash,
        requestedUrl: target.split("?")[0]!,
        finalUrl: null,
        startedAt: date,
        completedAt: "2026-09-06T12:00:10.000Z",
        status,
        limitations: status === "completed" ? [] : ["collection_limited"],
        sourceHash: "b".repeat(64),
        occurrences,
        links: [],
        redirects: [],
        httpStatus: status === "blocked" ? 429 : 200,
        retryAfterSeconds: null,
        failureKind: null,
      };
      if (i > 0)
        await db.query(
          `insert into full_site_pages(id,scan_id,target_url,source,selection_reason,section,status,scheduled) values($1,$2,$3,'fixture','Breadth fixture','pages',$4,true)`,
          [id, scanId, target, status],
        );
      await db.query(
        `update full_site_pages set status=$2,observation_json=$3,compact_json=$4,attempt_count=1 where id=$1`,
        [id, status, observation, compactCrawlObservation(observation)],
      );
    }
    await db.query(`update full_site_crawls set robots_json=$2 where scan_id=$1`, [scanId, {rules:[{allow:false,path:"/private/"}],crawlDelaySeconds:0,sitemaps:[]}]);
    const report = await loadFullSiteReport(scanId);
    assert.ok(report);
    assert.match(report.summary.state.robotsRestriction!, /Only permitted URLs/);
    assert.equal(report.summary.totals.services, 2);
    assert.equal(report.summary.totals.cookies, 1);
    assert.equal(report.summary.totals.requestEvents, 200);
    assert.equal(report.summary.totals.additionalServices, 1);
    assert.equal(report.pages.rows.length, 50);
    assert.equal(report.pageChoices.length, 201);
    assert.equal(report.evidence, null);
    assert.ok(!JSON.stringify(report).includes("private-query-value"));
    const cookie = await loadFullSiteReport(
      scanId,
      new URLSearchParams({ kind: "cookie", purpose: "mixed" }),
    );
    assert.equal(cookie?.resources.total, 1);
    assert.equal(cookie?.charts.cookies[0]?.label, "mixed");
    assert.equal(
      (
        await loadFullSiteReport(
          scanId,
          new URLSearchParams({ kind: "cookie", persistence: "session" }),
        )
      )?.resources.total,
      1,
    );
    const detail = await loadFullSiteReport(
      scanId,
      new URLSearchParams({
        resource: "service:Contact map",
        detailPage: contactId,
      }),
    );
    assert.equal(detail?.selectedResource?.pageIds[0], contactId);
    assert.equal(detail?.evidence?.total, 1);
    const exported = await loadFullSiteExport(scanId);
    assert.ok(exported);
    assert.deepEqual(exported.summary.totals, report.summary.totals);
    assert.equal(exported.pages.length, 201);
    assert.ok(
      Buffer.byteLength(JSON.stringify(report)) < 150000,
      "Initial response remains bounded with 201 page targets",
    );
    const bundle = await build({
      stdin: {
        contents: `import React from 'react';import{createRoot}from'react-dom/client';import{FullSiteControls}from'./apps/web/components/scans/full-site-controls';import{FullSiteWorkspace}from'./apps/web/components/scans/full-site-workspace';function Fixture(){return <><form onSubmit={e=>{e.preventDefault();window.submitted=Object.fromEntries(new FormData(e.currentTarget))}}><FullSiteControls/><button>Submit fixture</button></form><FullSiteWorkspace scanId="${scanId}" requested={${JSON.stringify(requested)}}><p>Homepage audit fixture score: 87</p></FullSiteWorkspace></>}createRoot(document.getElementById('root')).render(<Fixture/>);`,
        resolveDir: process.cwd(),
        loader: "tsx",
      },
      bundle: true,
      write: false,
      platform: "browser",
      jsx: "automatic",
      tsconfig: "tsconfig.base.json",
      define: { "process.env.NODE_ENV": "'development'" },
    });
    const css = await postcss([
      tailwindcss({
        content: ["apps/web/components/scans/full-site-*.tsx"],
        theme: {},
        plugins: [],
      }),
    ]).process("@tailwind base;@tailwind components;@tailwind utilities;", {
      from: undefined,
    });
    let role = "advanced";
    let calls = 0;
    server = createServer(async (req, res) => {
      const requestUrl = new URL(req.url ?? "/", "http://localhost");
      try {
        if (requestUrl.pathname === "/api/full-scan/options") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ allowed: canUseFullSite(role), policy }));
        } else if (requestUrl.pathname.startsWith("/api/scans/")) {
          calls++;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify(
              await loadFullSiteReport(scanId, requestUrl.searchParams),
            ),
          );
        } else if (requestUrl.pathname === "/fixture.js") {
          res.setHeader("Content-Type", "text/javascript");
          res.end(bundle.outputFiles[0]!.text);
        } else
          res.end(
            `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>`,
          );
      } catch (error) {
        res.statusCode = 500;
        res.end(String(error));
      }
    });
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1100 },
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const fixtureUrl = `http://127.0.0.1:${address.port}`;
    await page.goto(fixtureUrl);
    await page
      .getByRole("checkbox", { name: "Full site", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Max pages", { exact: true }).count(),
      0,
    );
    await page
      .getByRole("checkbox", { name: "Full site", exact: true })
      .check();
    assert.equal(
      await page.getByLabel("Max pages", { exact: true }).inputValue(),
      "10",
    );
    assert.equal(await page.getByLabel("Concurrency", { exact: true }).inputValue(), "4");
    assert.equal(await page.getByLabel("Concurrency", { exact: true }).getAttribute("max"), "12");
    await page.getByText(/robots.txt restricts crawl coverage/).waitFor();
    await page.getByLabel("Max pages", { exact: true }).fill("0");
    assert.equal(
      await page
        .getByLabel("Max pages", { exact: true })
        .getAttribute("aria-invalid"),
      "true",
    );
    await page.getByLabel("Max pages", { exact: true }).fill("200");
    await page
      .getByRole("checkbox", { name: "Full site", exact: true })
      .uncheck();
    await page
      .getByRole("button", { name: "Submit fixture", exact: true })
      .click();
    assert.deepEqual(await page.evaluate("window.submitted"), {});
    await page
      .getByRole("button", { name: "Contact map 1 pages" })
      .first()
      .waitFor();
    await page
      .getByRole("button", { name: "Contact map 1 pages" })
      .first()
      .click();
    await page
      .getByRole("heading", { name: "Contact map", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("button", { name: "Cookies", exact: true }).click();
    await page
      .getByLabel("Search resources, vendors, domains or pages")
      .fill("scope-bound");
    await page
      .getByRole("button", { name: "scope-bound cookie", exact: true })
      .waitFor();
    const before = calls;
    await page.waitForFunction(
      () =>
        document
          .querySelector('input[type="search"]')
          ?.getAttribute("value") === "scope-bound",
    );
    await page.screenshot({
      path: "/tmp/certscore-full-site-report-desktop.png",
      fullPage: true,
    });
    // Live refresh preserves search and selected workspace; no route refresh is involved.
    await page.waitForTimeout(11000);
    assert.ok(calls > before);
    assert.equal(
      await page
        .getByLabel("Search resources, vendors, domains or pages")
        .inputValue(),
      "scope-bound",
    );
    await page
      .getByRole("button", { name: "Homepage audit", exact: true })
      .click();
    await page.getByText("Homepage audit fixture score: 87").waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Resources", exact: true }).click();
    await page.screenshot({
      path: "/tmp/certscore-full-site-report-mobile.png",
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
      "Mobile document must not overflow horizontally",
    );
    for (role of ["admin", "member", "anonymous"]) {
      await Promise.all([
        page.waitForResponse((r) => r.url().includes("full-scan/options")),
        page.goto(fixtureUrl),
      ]);
      await page.waitForTimeout(100);
      assert.equal(
        await page
          .getByRole("checkbox", { name: "Full site", exact: true })
          .count(),
        role === "admin" ? 1 : 0,
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: real PostgreSQL report aggregation, filters, export parity, lazy evidence, 201 pages, role visibility, form validation, live UI state, desktop/mobile layout.",
    );
  } finally {
    await browser?.close();
    server?.closeAllConnections();
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    await db.query(`delete from scans where id=$1`, [scanId]);
    await db.query(`delete from organization_members where user_id=$1`, [
      userId,
    ]);
    await db.query(`delete from users where id=$1`, [userId]);
    await db.getWritePool().end();
    await db.getReadPool().end();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
