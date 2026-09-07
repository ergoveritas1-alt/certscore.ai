import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fullSitePolicy } from "@website-signal-risk-scanner/shared";
import { sitemapEntries, stopCrawlsWithoutDispatchQueues } from "./scheduler";

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
        return { id, userId };
      }
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
    } finally {
      await db.getWritePool().end();
      await db.getReadPool().end();
    }
  },
);
