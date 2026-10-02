import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fullSitePolicy, crawlDiscoveryDiagnosticsSchema } from "@website-signal-risk-scanner/shared";
import { sitemapEntries, stopCrawlsWithoutDispatchQueues, fetchDiscoveryDocument, discoveryDiagnostic } from "./scheduler";

test("sitemap indexes and URL sets are bounded parse inputs without entity expansion", () => {
  assert.deepEqual(
    sitemapEntries(
      "<sitemapindex><sitemap><loc>https://example.test/one.xml</loc></sitemap></sitemapindex>",
    ),
    { indexes: ["https://example.test/one.xml"], urls: [] },
  );
  assert.deepEqual(
    sitemapEntries(
      "<urlset><url><loc>https://example.test/contact?lang=de&amp;page=1</loc></url></urlset>",
    ),
    { indexes: [], urls: ["https://example.test/contact?lang=de&page=1"] },
  );
  assert.throws(() =>
    sitemapEntries(
      '<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><urlset/>',
    ),
  );
});

test("discovery fetch returns redirects without following them and releases the response body", async () => {
  const original = globalThis.fetch;
  const opened: string[] = [];
  let cancelled = false;
  globalThis.fetch = (async input => {
    opened.push(String(input));
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }), {
      status: 301, headers: { location: "https://example.test/sitemap_index.xml" },
    });
  }) as typeof fetch;
  try {
    assert.deepEqual(await fetchDiscoveryDocument("https://example.test/sitemap.xml", 1024), {status: 301, text: "", retryAfter: null});
    assert.deepEqual(opened, ["https://example.test/sitemap.xml"]);
    assert.equal(cancelled, true);
  } finally { globalThis.fetch = original; }
});

test("sitemap parsing rejects HTML, malformed XML, and unsafe declarations", () => {
  for (const input of ["<!DOCTYPE html><html><body>Not found</body></html>", "<html><body>Not found</body></html>", "<urlset><url></urlset>", "", "null"]) {
    assert.throws(() => sitemapEntries(input));
  }
});

test("discovery diagnostics omit credentials, query values, fragments, and bound paths", () => {
  assert.deepEqual(discoveryDiagnostic("sitemap", "https://user:secret@example.test/map.xml?token=secret#secret", "fetch_failed"), {
    stage: "sitemap", path: "/map.xml", status: null, reason: "fetch_failed",
  });
  assert.equal(discoveryDiagnostic("sitemap", `https://example.test/${"a".repeat(300)}`, "timeout").path?.length, 256);
});

const databaseUrl = process.env.FULL_SITE_TEST_DATABASE_URL;
test(
  "PostgreSQL admission, budgets, shared pacing, backoff, retries, revocation and recovery",
  { skip: !databaseUrl, timeout: 60000 },
  async () => {
    const url = new URL(databaseUrl!);
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(
      url.pathname,
      "/full_site_test",
      "Use a dedicated disposable local database.",
    );
    process.env.DATABASE_URL = databaseUrl;
    process.env.CERTSCORE_FULL_SITE_INTERNAL_ENABLED = "1";
    process.env.DATABASE_READ_URL = databaseUrl;
    process.env.DATABASE_SSL_MODE = "disable";
    process.env.DB_QUERY_LOG_ENABLED = "false";
    const db = await import("@website-signal-risk-scanner/db");
    const { sweepFullSiteCrawls, addFullSiteCandidates, discoverSitemaps } =
      await import("./scheduler");
    try {
      await db.query(`create table if not exists users(id uuid primary key);create table if not exists scans(id uuid primary key,organization_id uuid,status text,scan_config_json jsonb,duration_ms int);
      create table if not exists organization_members(user_id uuid,organization_id uuid,role text);
      create table if not exists scan_events(scan_id uuid,event_type text,metadata_json jsonb,created_at timestamptz default now())`);
      await db.query(
        await readFile(
          require.resolve(
            "../../../../packages/db/migrations/0194_full_site_resource_crawls.sql",
          ),
          "utf8",
        ),
      );
      await db.query(await readFile(require.resolve("../../../../packages/db/migrations/0195_full_site_completion_emails.sql"), "utf8"));
      await db.query(
        `truncate users,scans,organization_members,scan_events,full_site_crawls,full_site_pages,full_site_attempts,full_site_safety cascade`,
      );
      async function parent(
        host: string,
        maxPages = 10,
        concurrency = 2,
        region = "eu-west-1",
      ) {
        const id = randomUUID(),
          userId = randomUUID(),
          org = randomUUID();
        await db.query(`insert into users(id) values($1)`, [userId]);
        await db.query(
          `insert into organization_members values($1,$2,'advanced')`,
          [userId, org],
        );
        await db.query(
          `insert into scans(id,organization_id,status,scan_config_json) values($1,$2,'completed',$3)`,
          [id, org, { fullSite: true, hostname: host }],
        );
        await db.withWriteTransaction((client) =>
          db.insertFullSiteCrawl(client, {
            scanId: id,
            userId,
            requested: { maxPages, concurrency, waitSeconds: 1 },
            policy: fullSitePolicy({
              CERTSCORE_FULL_SITE_MIN_WAIT_SECONDS: "1",
            }),
            region,
            url: `https://${host}/`,
            siteKey: host,
          }),
        );
        await db.query(
          `update full_site_crawls set status='running',discovery_complete=true,configuration_json='{}',configuration_hash=$2,bucket='fixture',artifact_prefix='fixture',hosts=$3 where scan_id=$1`,
          [id, "a".repeat(64), [host]],
        );
        await db.query(
          `update full_site_pages set status='completed' where scan_id=$1 and source='homepage'`,
          [id],
        );
        await addFullSiteCandidates(
          id,
          Array.from({ length: 10 }, (_, n) => ({
            url: `https://${host}/section-${n}/page`,
            source: "fixture",
          })),
        );
        return { id, userId, organizationId: org };
      }
      const quota = await parent("quota.test", 300);
      await db.query(
        `update full_site_crawls set policy_json=jsonb_set(jsonb_set(policy_json,'{maxSectionPages}','2'::jsonb),'{maxQueryVariants}','3'::jsonb) where scan_id=$1`,
        [quota.id],
      );
      await addFullSiteCandidates(quota.id, [
        { url: "https://outside.test/en/hotel/external", source: "fixture" },
        { url: "https://quota.test/en/hotel/one", source: "fixture" },
        { url: "https://quota.test/en/hotel/two", source: "fixture" },
        { url: "https://quota.test/en/hotel/zzz-overflow", source: "fixture" },
        { url: "https://quota.test/en/business/one", source: "fixture" },
        { url: "https://quota.test/en/business/two", source: "fixture" },
        { url: "https://quota.test/path/[", source: "fixture" },
        { url: "https://quota.test/path/[suite]", source: "fixture" },
      ]);
      const quotaPages = await db.loadFullSitePages(quota.id);
      const byUrl = (suffix: string) => quotaPages.find((page) => page.target_url === `https://quota.test${suffix}`);
      assert.equal(byUrl("/en/hotel/one")?.status, "queued");
      assert.equal(byUrl("/en/hotel/two")?.status, "queued");
      assert.equal(byUrl("/en/hotel/zzz-overflow")?.limitation, "section_trap_limit");
      assert.equal(byUrl("/en/business/one")?.status, "queued");
      assert.equal(byUrl("/en/business/two")?.status, "queued");
      assert.equal(byUrl("/path/[")?.limitation, "malformed_path");
      assert.equal(byUrl("/path/[suite]")?.status, "queued");
      await db.query(
        `update full_site_pages set section='en' where scan_id=$1 and target_url like 'https://quota.test/en/hotel/%'`,
        [quota.id],
      );
      await db.query(
        `update full_site_crawls set policy_json=jsonb_set(policy_json,'{maxSectionPages}','5'::jsonb) where scan_id=$1`,
        [quota.id],
      );
      await addFullSiteCandidates(quota.id, [
        { url: "https://quota.test/en/hotel/third", source: "fixture" },
        { url: "https://quota.test/?page_id=1", source: "fixture" },
        { url: "https://quota.test/?page_id=2", source: "fixture" },
        { url: "https://quota.test/?page_id=3", source: "fixture" },
      ]);
      const renewed = await db.loadFullSitePages(quota.id);
      assert.equal(renewed.find((page) => page.target_url.endsWith("/en/hotel/third"))?.status, "queued");
      assert.equal(renewed.find((page) => page.target_url.endsWith("/?page_id=1"))?.status, "queued");
      assert.equal(renewed.find((page) => page.target_url.endsWith("/?page_id=2"))?.status, "queued");
      assert.equal(renewed.find((page) => page.target_url.endsWith("/?page_id=3"))?.limitation, "query_variant_limit");
      await db.query(
        `update full_site_crawls set policy_json=jsonb_set(policy_json,'{maxQueryVariants}','4'::jsonb) where scan_id=$1`,
        [quota.id],
      );
      await addFullSiteCandidates(quota.id, [
        { url: "https://quota.test/?page_id=4", source: "fixture" },
      ]);
      assert.equal(
        (await db.loadFullSitePages(quota.id)).find((page) => page.target_url.endsWith("/?page_id=4"))?.status,
        "queued",
        "Previously excluded query variants must not consume admission quotas",
      );
      await db.query(`update full_site_crawls set status='completed',completed_at=now() where scan_id=$1`, [quota.id]);
      // Exercise the actual discovery fetch + guard, not a mock of their boundary.
      for (const scenario of ["redirect", "html", "malformed", "timeout", "oversized", "http_error", "rate_limit"] as const) {
        const host = `sitemap-${scenario.replaceAll("_", "-")}.test`;
        const candidate = await parent(host, 3);
        await db.query(`update full_site_crawls set discovery_complete=false where scan_id=$1`, [candidate.id]);
        const opened: string[] = [];
        const original = globalThis.fetch;
        globalThis.fetch = (async input => {
          const url = String(input);
          opened.push(url);
          if (url.endsWith("robots.txt")) return new Response("");
          if (scenario === "timeout") throw new DOMException("sensitive exception text", "TimeoutError");
          if (scenario === "redirect") return new Response(null, {status: 301, headers: {location: `https://${host}/sitemap_index.xml`}});
          if (scenario === "rate_limit") return new Response(null, {status: 429, headers: {"retry-after": "120"}});
          if (scenario === "http_error") return new Response(null, {status: 503});
          return new Response(scenario === "html" ? "<!DOCTYPE html><html><body>Not found</body></html>" :
            scenario === "malformed" ? "<urlset><url></urlset>" : "x".repeat(2097153));
        }) as typeof fetch;
        try { await discoverSitemaps((await db.loadFullSiteCrawl(candidate.id))!); }
        finally { globalThis.fetch = original; }
        assert.deepEqual(opened, [`https://${host}/robots.txt`, `https://${host}/sitemap.xml`]);
        const result = (await db.loadFullSiteCrawl(candidate.id))!;
        assert.equal(result.status, "running");
        assert.equal(result.discovery_complete, true);
        assert.equal(result.stop_reason, "sitemap_discovery_limited");
        const diagnostic = crawlDiscoveryDiagnosticsSchema.parse((result.policy_json as Record<string, unknown>).discoveryDiagnostics)[0]!;
        assert.equal(diagnostic.stage, "sitemap");
        assert.equal(diagnostic.reason, {redirect: "redirect_not_followed", html: "invalid_sitemap", malformed: "invalid_sitemap", timeout: "timeout", oversized: "byte_limit", http_error: "http_error", rate_limit: "rate_limited"}[scenario]);
        const queued = (await db.loadFullSitePages(candidate.id)).filter(p => p.status === "queued");
        assert.equal(queued.length, 10, "Optional sitemap failure must preserve rendered links");
        const queuedIds = new Set(queued.map(p => p.id));
        const dispatches = (await db.reserveFullSiteDispatches()).filter(p => queuedIds.has(p.pageId));
        assert.equal(dispatches.length > 0, scenario !== "rate_limit", "Admission must continue unless shared backoff applies");
        await db.query(`update full_site_crawls set status='completed',completed_at=now() where scan_id=$1`, [candidate.id]);
      }
      const redirectRobots = await parent("robots-redirect.test");
      await db.query(`update full_site_crawls set discovery_complete=false where scan_id=$1`, [redirectRobots.id]);
      const redirectRobotsCrawl = (await db.loadFullSiteCrawl(redirectRobots.id))!;
      const originalFetch = globalThis.fetch;
      const robotsOpened: string[] = [];
      globalThis.fetch = (async input => {
        robotsOpened.push(String(input));
        return new Response(null, {status: 302, headers: {location: "https://robots-redirect.test/other-robots.txt"}});
      }) as typeof fetch;
      try {
        await assert.rejects(() => discoverSitemaps(redirectRobotsCrawl), /robots_unavailable_or_blocked/);
      } finally { globalThis.fetch = originalFetch; }
      assert.deepEqual(robotsOpened, ["https://robots-redirect.test/robots.txt"]);
      const robotsResult = (await db.loadFullSiteCrawl(redirectRobots.id))!;
      assert.equal(robotsResult.discovery_complete, false);
      assert.equal(crawlDiscoveryDiagnosticsSchema.parse((robotsResult.policy_json as Record<string, unknown>).discoveryDiagnostics)[0]!.reason, "redirect_not_followed");
      assert.equal((await db.reserveFullSiteDispatches()).length, 0);
      await db.query(`update full_site_crawls set status='stopped',completed_at=now() where scan_id=$1`, [redirectRobots.id]);
      const unavailable = await parent("missing-queue.test", 3, 2, "eu-central-1");
      await stopCrawlsWithoutDispatchQueues({ "eu-west-1": "https://queue.example.test" });
      const stopped = await db.loadFullSiteCrawl(unavailable.id);
      assert.equal(stopped?.status, "stopped");
      assert.equal(stopped?.stop_reason, "dispatch_queue_unavailable");
      assert.deepEqual(await db.reserveFullSiteDispatches(), [], "Missing-region jobs must never be dispatched");
      assert.equal((await db.queryOne<{status:string}>(`select status from full_site_pages where scan_id=$1 and source='homepage'`, [unavailable.id]))?.status, "completed");
      const homeOnly = await parent("only.test", 1);
      assert.deepEqual(await db.reserveFullSiteDispatches(), []);
      assert.equal(
        (await db.loadFullSitePages(homeOnly.id)).filter((p) => p.scheduled)
          .length,
        1,
      );
      await db.query(
        `update full_site_crawls set status='completed' where scan_id=$1`,
        [homeOnly.id],
      );
      const a = await parent("example.test", 3),
        b = await parent("example.test", 3, 1, "us-west-1");
      const jobs = (
        await Promise.all(
          Array.from({ length: 6 }, () => db.reserveFullSiteDispatches()),
        )
      ).flat();
      assert.equal(
        jobs.length,
        1,
        "Shared reserved invocation cap across regions and scheduler races",
      );
      const job = jobs[0]!;
      const grant = await db.claimFullSitePage({ ...job, region: job.region });
      assert.ok(grant);
      assert.equal(
        await db.claimFullSitePage({ ...job, region: job.region }),
        null,
        "Duplicate delivery is one-use",
      );
      assert.equal(
        await db.homepageMayStartAlongsideFullSite("www.example.test"),
        false,
      );
      await db.query(
        `update full_site_safety set last_start_at=now()-interval '2 seconds',last_dispatch_at=now()-interval '2 seconds'`,
      );
      assert.deepEqual(
        await db.reserveFullSiteDispatches(),
        [],
        "Most restrictive overlap stays at one active invocation",
      );
      const finish = {
        ...job,
        status: "blocked",
        observation: { httpStatus: 429 },
        compact: null,
        finalUrl: null,
        failureKind: "rate_limit",
        retryAfterSeconds: 120,
        artifact: {},
      };
      assert.equal(await db.completeFullSitePage(finish), true);
      assert.equal(
        await db.completeFullSitePage(finish),
        false,
        "Retry delivery cannot overwrite a pending representative attempt",
      );
      assert.deepEqual(
        await db.reserveFullSiteDispatches(),
        [],
        "Retry-After overrides requested one-second pacing across crawls",
      );
      assert.equal(
        await db.homepageMayStartAlongsideFullSite("example.test"),
        true,
      );
      const used = (
        await db.query<{ count: string }>(
          `select count(*)::text from full_site_pages where scan_id=$1 and scheduled`,
          [grant.scanId],
        )
      ).rows[0]!.count;
      assert.equal(used, "2");
      await db.query(
        `update full_site_safety set backoff_until=null,last_start_at=null,last_dispatch_at=null;update full_site_crawls set backoff_until=null;update full_site_pages set next_attempt_at=now()-interval '1 second'`,
      );
      const [retry] = await db.reserveFullSiteDispatches();
      assert.ok(retry);
      assert.equal(
        retry.pageId,
        job.pageId,
        "Retry retains target budget slot",
      );
      assert.ok(await db.claimFullSitePage({ ...retry, region: retry.region }));
      await db.query(
        `update full_site_pages set worker_lease_until=now()-interval '1 second' where id=$1`,
        [retry.pageId],
      );
      await sweepFullSiteCrawls();
      assert.equal(
        (await db.loadFullSitePages(grant.scanId, retry.pageId))[0]?.status,
        "failed",
        "Expired worker terminates after bounded retries",
      );
      await db.query(
        `update scans set status='cancelled' where id=any($1::uuid[])`,
        [[a.id, b.id]],
      );
      await sweepFullSiteCrawls();
      assert.equal((await db.loadFullSiteCrawl(a.id))?.status, "cancelled");
      assert.equal(
        (await db.loadFullSitePages(a.id)).some((p) => p.status === "queued"),
        false,
      );
      const revoked = await parent("revoked.test");
      const [denied] = await db.reserveFullSiteDispatches();
      assert.ok(denied);
      await db.query(
        `update organization_members set role='member' where user_id=$1`,
        [revoked.userId],
      );
      assert.equal(
        await db.claimFullSitePage({ ...denied, region: denied.region }),
        null,
      );
      const before = (await db.loadFullSitePages(revoked.id)).filter(
        (p) => p.scheduled,
      ).length;
      assert.ok(before <= 3);
      process.env.CERTSCORE_FULL_SITE_INTERNAL_ENABLED = "0";
      assert.deepEqual(await db.reserveFullSiteDispatches(), []);
      assert.equal(
        await db.claimFullSitePage({ ...denied, region: denied.region }),
        null,
      );
      process.env.CERTSCORE_FULL_SITE_INTERNAL_ENABLED = "1";
      const blocked = await parent("robots-blocked.test");
      const calls: string[] = [];
      await discoverSitemaps(
        (await db.loadFullSiteCrawl(blocked.id))!,
        async (url) => {
          calls.push(url);
          return {
            status: 200,
            text: "User-agent: *\nDisallow: /\nSitemap: https://robots-blocked.test/sitemap.xml",
            retryAfter: null,
          };
        },
      );
      assert.deepEqual(calls, ["https://robots-blocked.test/robots.txt"]);
      assert.equal(
        (await db.loadFullSiteCrawl(blocked.id))!.stop_reason,
        "robots_disallowed_all",
      );
      assert.ok(
        (await db.loadFullSitePages(blocked.id))
          .filter((p) => p.source !== "homepage")
          .every((p) => p.status === "excluded"),
      );
      const blockedIds = new Set(
        (await db.loadFullSitePages(blocked.id)).map((p) => p.id),
      );
      assert.equal(
        (await db.reserveFullSiteDispatches()).some((p) =>
          blockedIds.has(p.pageId),
        ),
        false,
      );
      const subset = await parent("robots-subset.test");
      const subsetCalls: string[] = [];
      await discoverSitemaps(
        (await db.loadFullSiteCrawl(subset.id))!,
        async (url) => {
          subsetCalls.push(url);
          return {
            status: 200,
            text: url.endsWith("robots.txt")
              ? "User-agent: *\nDisallow: /\nAllow: /public/\nSitemap: https://robots-subset.test/public/sitemap.xml"
              : "<urlset><url><loc>https://robots-subset.test/public/page</loc></url><url><loc>https://robots-subset.test/private/page</loc></url></urlset>",
            retryAfter: null,
          };
        },
      );
      assert.deepEqual(subsetCalls, [
        "https://robots-subset.test/robots.txt",
        "https://robots-subset.test/public/sitemap.xml",
      ]);
      const subsetPages = await db.loadFullSitePages(subset.id);
      assert.equal(
        subsetPages.find((p) => p.target_url.endsWith("/public/page"))!.status,
        "queued",
      );
      assert.equal(
        subsetPages.find((p) => p.target_url.endsWith("/private/page"))!
          .limitation,
        "robots_disallowed",
      );
      await db.query(`alter table users add column if not exists email text`);
      const mail = await parent("mail.test");
      await db.query(`update users set email='owner@example.test' where id=$1`,[mail.userId]);
      await db.query(`delete from full_site_completion_emails where scan_id<>$1`,[mail.id]);
      assert.equal(await db.reserveFullSiteCompletionEmail(), null, "No email while crawl is running");
      await db.query(`update full_site_crawls set status='completed',completed_at=now() where scan_id=$1`,[mail.id]);
      assert.equal(await db.reserveFullSiteCompletionEmail(), null, "Wait for all page jobs to settle");
      await db.query(`update full_site_pages set status='completed' where scan_id=$1`,[mail.id]);
      const reservations = await Promise.all([db.reserveFullSiteCompletionEmail(),db.reserveFullSiteCompletionEmail()]);
      assert.equal(reservations.filter(Boolean).length, 1);
      const emailJob = reservations.find(Boolean)!;
      assert.equal(await db.beginFullSiteCompletionEmail(emailJob.scanId,"f".repeat(64)),null);
      assert.deepEqual(await db.beginFullSiteCompletionEmail(emailJob.scanId,emailJob.token),{email:"owner@example.test"});
      assert.equal(await db.beginFullSiteCompletionEmail(emailJob.scanId,emailJob.token),null,"Duplicate dispatch cannot send again");
      await db.finishFullSiteCompletionEmail(emailJob.scanId,emailJob.token,"sent","fixture-message");
      assert.equal(await db.reserveFullSiteCompletionEmail(),null,"Sent emails remain terminal");
      await db.query(`update full_site_completion_emails set status='sending',lease_until=now()-interval '1 second' where scan_id=$1`,[mail.id]);
      assert.equal(await db.reserveFullSiteCompletionEmail(),null,"Ambiguous SMTP outcome must not resend");
      assert.equal((await db.queryOne<{status:string}>(`select status from full_site_completion_emails where scan_id=$1`,[mail.id]))!.status,"uncertain");
      await db.query(`update scans set status='cancelled'`);
      await sweepFullSiteCrawls();
      const lost = await parent("lost-admission.test");
      const [lostJob] = await db.reserveFullSiteDispatches();
      assert.ok(lostJob);
      await db.query(`update full_site_pages set dispatch_lease_until=now()-interval '1 second' where id=$1`, [lostJob.pageId]);
      assert.equal(await db.claimFullSitePage({ ...lostJob, region: lostJob.region }), null, "An expired claim cannot start a browser before the sweep");
      await sweepFullSiteCrawls();
      assert.equal((await db.loadFullSiteCrawl(lost.id))?.status, "running", "One lost dispatch does not stop sibling pages");
      assert.equal((await db.loadFullSitePages(lost.id, lostJob.pageId))[0]?.status, "failed");
      assert.equal((await db.loadFullSitePages(lost.id, lostJob.pageId))[0]?.limitation, "dispatch_admission_timeout");
      assert.equal(await db.claimFullSitePage({ ...lostJob, region: lostJob.region }), null, "Late credentials cannot restart a failed page");
      await sweepFullSiteCrawls();
      await db.query(`update full_site_safety set last_dispatch_at=now()-interval '2 seconds' where site_key='lost-admission.test'`);
      const survivingJobs = await db.reserveFullSiteDispatches();
      const siblingIds = new Set((await db.loadFullSitePages(lost.id)).filter(page => page.id !== lostJob.pageId).map(page => page.id));
      assert.ok(survivingJobs.some(job => siblingIds.has(job.pageId)), "An eligible sibling remains dispatchable");
      assert.equal(survivingJobs.some(job => job.pageId === lostJob.pageId), false, "Expired admission is terminal, never requeued");
      await db.query(`update full_site_crawls set status='stopped',stop_reason='fixture_cleanup' where scan_id=$1`, [lost.id]);
      await sweepFullSiteCrawls();
      const interrupted = await parent("interrupted.test");
      const [interruptedJob] = await db.reserveFullSiteDispatches();
      assert.ok(interruptedJob);
      await db.query(`update scans set status='cancelled' where id=$1`, [interrupted.id]);
      assert.equal(await db.claimFullSitePage({ ...interruptedJob, region: interruptedJob.region }), null, "Cancellation blocks admission even before the sweep");
      await sweepFullSiteCrawls();
      assert.deepEqual(await db.reserveFullSiteDispatches(), []);

      // Incident: 2 successful + 8 HTTP failures, all failures retained error-page links.
      const incident = await parent("finalization-failed-links.test", 10);
      const candidates = (await db.loadFullSitePages(incident.id)).filter(page => page.source !== "homepage");
      for (const [index, page] of candidates.slice(0, 9).entries()) {
        await db.query(`update full_site_pages set scheduled=true,status=$2,completed_at=now(),
          observation_json=$3,limitation=$4 where id=$1`, [page.id, index ? "failed" : "completed",
          { links: [`https://finalization-failed-links.test/${index ? "error-only" : "valid-child"}`] }, index ? "http_error" : null]);
      }
      await sweepFullSiteCrawls();
      assert.equal((await db.loadFullSiteCrawl(incident.id))?.status, "completed");
      assert.equal((await db.loadFullSiteCrawl(incident.id))?.stop_reason, "max_pages");
      const incidentPages = await db.loadFullSitePages(incident.id);
      assert.equal(incidentPages.filter(page => page.status === "failed").length, 8, "Failure evidence stays failed");
      assert.ok(incidentPages.some(page => page.target_url.endsWith("/valid-child")), "Usable pending links are processed before finalization");
      assert.ok(!incidentPages.some(page => page.target_url.endsWith("/error-only")), "Error page links never expand discovery");
      assert.ok(!incidentPages.some(page => ["queued", "active", "dispatching"].includes(page.status)));
      await sweepFullSiteCrawls();
      assert.equal((await db.loadFullSiteCrawl(incident.id))?.status, "completed", "Finalization is idempotent");

      const cancelledDiscovery = await parent("cancel-discovery.test");
      let discoveryFetches = 0;
      await discoverSitemaps((await db.loadFullSiteCrawl(cancelledDiscovery.id))!, async () => {
        discoveryFetches++;
        await db.cancelFullSiteCrawl({ scanId: cancelledDiscovery.id, userId: cancelledDiscovery.userId, organizationId: cancelledDiscovery.organizationId });
        return { status: 200, text: "User-agent: *\nDisallow: /", retryAfter: null };
      });
      assert.equal(discoveryFetches, 1);
      assert.equal((await db.loadFullSiteCrawl(cancelledDiscovery.id))?.status, "cancelled", "Late discovery must not overwrite cancellation");
      assert.equal((await db.loadFullSiteCrawl(cancelledDiscovery.id))?.stop_reason, "user_cancelled");

      const cancellation = await parent("cancel-inventory.test", 3);
      const cancelInput = { scanId: cancellation.id, userId: cancellation.userId, organizationId: cancellation.organizationId };
      assert.equal(await db.cancelFullSiteCrawl({ ...cancelInput, userId: randomUUID() }), null);
      assert.equal(await db.cancelFullSiteCrawl({ ...cancelInput, organizationId: randomUUID() }), null);
      await db.query(`update organization_members set role='user' where user_id=$1`, [cancellation.userId]);
      assert.equal(await db.cancelFullSiteCrawl(cancelInput), null, "Revoked role cannot mutate the crawl");
      await db.query(`update organization_members set role='advanced' where user_id=$1`, [cancellation.userId]);
      const [activeJob] = await db.reserveFullSiteDispatches();
      assert.ok(activeJob);
      assert.ok(await db.claimFullSitePage({ ...activeJob, region: activeJob.region }));
      await db.query(`update full_site_safety set last_dispatch_at=null,last_start_at=null where site_key='cancel-inventory.test'`);
      const [unclaimedJob] = await db.reserveFullSiteDispatches();
      assert.ok(unclaimedJob);
      assert.deepEqual(await db.cancelFullSiteCrawl(cancelInput), { status: "cancelled" });
      assert.deepEqual(await db.cancelFullSiteCrawl(cancelInput), { status: "cancelled" });
      assert.equal(await db.claimFullSitePage({ ...unclaimedJob, region: unclaimedJob.region }), null, "Cancellation invalidates queued dispatch credentials");
      assert.deepEqual(await db.reserveFullSiteDispatches(), [], "No further visits after cancellation");
      assert.ok(await db.completeFullSitePage({ ...activeJob, status: "completed", observation: { links: [] }, compact: {},
        finalUrl: "https://cancel-inventory.test/", failureKind: null, retryAfterSeconds: null, artifact: {} }), "An already-active worker may retain its result");
      await sweepFullSiteCrawls();
      assert.equal((await db.loadFullSiteCrawl(cancellation.id))?.status, "cancelled");
      const cancelledPages = await db.loadFullSitePages(cancellation.id);
      assert.equal(cancelledPages.filter(page => page.status === "completed").length, 2, "Homepage and active result survive");
      assert.ok(cancelledPages.filter(page => page.status === "cancelled").length > 0);
      assert.ok(!cancelledPages.some(page => ["active", "queued", "dispatching"].includes(page.status)));
      await db.query(`delete from full_site_completion_emails where scan_id<>$1`, [cancellation.id]);
      assert.equal(await db.reserveFullSiteCompletionEmail(), null, "Cancellation does not send a completion email");
      assert.deepEqual(await db.cancelFullSiteCrawl({ scanId: incident.id, userId: incident.userId, organizationId: incident.organizationId }), { status: "completed" }, "A late Stop does not overwrite completion");
      const waiting = await parent("cancel-waiting-homepage.test");
      await db.query(`update scans set status='running' where id=$1`, [waiting.id]);
      await db.query(`update full_site_crawls set status='waiting_homepage',discovery_complete=false where scan_id=$1`, [waiting.id]);
      await db.query(`update full_site_pages set status='queued' where scan_id=$1 and source='homepage'`, [waiting.id]);
      await db.cancelFullSiteCrawl({ scanId: waiting.id, userId: waiting.userId, organizationId: waiting.organizationId });
      assert.equal((await db.queryOne<{status:string}>(`select status from scans where id=$1`, [waiting.id]))?.status, "running", "The independent initial audit is not cancelled");
      assert.ok(!(await db.loadFullSitePages(waiting.id)).some(page => page.status === "queued"), "Cancelled waiting crawls leave no inventory work queued");

    } finally {
      await db.getWritePool().end();
      await db.getReadPool().end();
    }
  },
);
