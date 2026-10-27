import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { Pool } from "pg";
import { requestFullSiteControl, FULL_SITE_PAGE_DISPATCH } from "./full-site-page";

const databaseUrl = process.env.FULL_SITE_TEST_DATABASE_URL;
test("claim HTTP deadline survives database lock and pool contention without phantom active workers", { skip: !databaseUrl, timeout: 25000 }, async () => {
  const url = new URL(databaseUrl!);
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/full_site_test", "Only the disposable local test database is permitted");
  const schema = `claim_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl });
  await admin.query(`create schema ${schema}`);
  url.searchParams.set("options", `-c search_path=${schema}`);
  const names = ["DATABASE_URL", "DATABASE_READ_URL", "DATABASE_SSL_MODE", "CERTSCORE_FULL_SITE_INTERNAL_ENABLED",
    "CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER", "SCAN_PROXY_ENABLED", "CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE"];
  const previous = names.map(name => process.env[name]);
  process.env.DATABASE_URL = url.href;
  process.env.DATABASE_READ_URL = url.href;
  process.env.DATABASE_SSL_MODE = "disable";
  process.env.CERTSCORE_FULL_SITE_INTERNAL_ENABLED = "1";
  const db = await import("../../../packages/db/src/index");
  let handled: Promise<unknown> = Promise.resolve();
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    handled = db.claimFullSitePage({ ...body, claimDeadlineAtMs: Number(request.headers["x-certscore-claim-deadline-ms"]) });
    try {
      const grant = await handled;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ grant }));
    } catch {
      response.writeHead(500); response.end();
    }
  });
  const fixturePool = new Pool({ connectionString: url.href });
  try {
    await fixturePool.query(`create table users(id uuid primary key);
      create table scans(id uuid primary key,organization_id uuid,status text,scan_config_json jsonb);
      create table organization_members(user_id uuid,organization_id uuid,role text)`);
    await fixturePool.query(await readFile(new URL("../../../packages/db/migrations/0194_full_site_resource_crawls.sql", import.meta.url), "utf8"));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    process.env.CERTSCORE_V2_DAG_LAMBDA_PROXY_SERVER = `http://127.0.0.1:${address.port}`;
    process.env.SCAN_PROXY_ENABLED = "1";
    process.env.CERTSCORE_PUBLIC_NETWORK_GUARD_FORCE = "true";
    const controlUrl = new URL("http://93.184.216.34/api/internal/full-site/page");
    async function job(host: string, maxRetries = 1) {
      const scanId = randomUUID(), pageId = randomUUID(), userId = randomUUID(), org = randomUUID();
      await fixturePool.query(`insert into users values($1);`, [userId]);
      await fixturePool.query(`insert into scans values($1,$2,'completed',$3)`, [scanId, org, { fullSite: true, hostname: host }]);
      await fixturePool.query(`insert into organization_members values($1,$2,'advanced')`, [userId, org]);
      await fixturePool.query(`insert into full_site_crawls(scan_id,authorized_user_id,status,requested_json,policy_json,region,
        configuration_json,configuration_hash,hosts,site_keys,bucket,artifact_prefix,discovery_complete)
        values($1,$2,'running',$3,$4,'eu-central-1','{}',$5,$6,$6,'fixture','fixture',true)`,
      [scanId, userId, { maxPages: 2, concurrency: 1, waitSeconds: 1 },
        { wallClockSeconds: 300, leaseSeconds: 30, maxRetries }, "a".repeat(64), [host]]);
      await fixturePool.query(`insert into full_site_pages(id,scan_id,target_url,source,selection_reason,section,status)
        values($1,$2,$3,'fixture','fixture','/','queued')`, [pageId, scanId, `https://${host}/page`]);
      const [dispatch] = await db.reserveFullSiteDispatches(); assert.ok(dispatch);
      assert.equal(dispatch.pageId, pageId);
      return { ...dispatch, scanId, host, contractVersion: FULL_SITE_PAGE_DISPATCH };
    }
    async function lockedClaim(dispatch: Awaited<ReturnType<typeof job>>, delayMs: number) {
      const lock = await fixturePool.connect();
      await lock.query("begin");
      await lock.query("select site_key from full_site_safety where site_key=$1 for update", [dispatch.host]);
      const released = new Promise<void>(resolve => setTimeout(async () => {
        await lock.query("commit"); lock.release(); resolve();
      }, delayMs));
      const startedAt = Date.now();
      const message = { contractVersion: FULL_SITE_PAGE_DISPATCH, pageId: dispatch.pageId, attemptId: dispatch.attemptId, token: dispatch.token };
      try {
        return await requestFullSiteControl(controlUrl, message, { operation: "claim", region: dispatch.region }, startedAt + 24000);
      } finally {
        await released;
        await handled;
      }
    }
    const dispatch = await job("late-claim.test");
    await assert.rejects(lockedClaim(dispatch, 3300), { name: "TimeoutError" });
    let page = (await fixturePool.query("select * from full_site_pages where id=$1", [dispatch.pageId])).rows[0];
    assert.equal(page.status, "queued");
    assert.equal(page.limitation, "claim_deadline_expired");
    assert.equal(page.attempt_count, 1);
    assert.equal(page.worker_lease_until, null);
    assert.equal(page.observation_json, null);
    assert.equal(await db.claimFullSitePage({ ...dispatch, claimDeadlineAtMs: Date.now() + 3000 }), null, "An expired credential cannot be replayed");
    await fixturePool.query("update full_site_pages set next_attempt_at=now()-interval '1 second' where id=$1", [dispatch.pageId]);
    const [retry] = await db.reserveFullSiteDispatches(); assert.ok(retry);
    await assert.rejects(lockedClaim({ ...dispatch, ...retry }, 3300), { name: "TimeoutError" });
    page = (await fixturePool.query("select * from full_site_pages where id=$1", [dispatch.pageId])).rows[0];
    assert.equal(page.status, "failed", "Existing one-retry limit is preserved");
    assert.equal(page.attempt_count, 2);
    assert.equal(page.worker_lease_until, null);
    assert.deepEqual((await fixturePool.query("select status,limitation,artifact_json from full_site_attempts where page_id=$1 order by ordinal", [dispatch.pageId])).rows,
      Array.from({ length: 2 }, () => ({ status: "failed", limitation: "claim_deadline_expired", artifact_json: null })));

    const fast = await job("fast-claim.test");
    const admitted = await lockedClaim(fast, 100);
    assert.equal(admitted.grant.pageId, fast.pageId);
    await fixturePool.query("update full_site_crawls set status='completed' where scan_id=$1", [fast.scanId]);

    const writing = await job("write-claim.test", 0);
    await fixturePool.query(`create function delay_claim_insert() returns trigger language plpgsql as $$
      begin if new.page_id='${writing.pageId}'::uuid and new.status='active' then perform pg_sleep(0.15); end if; return new; end $$;
      create trigger slow_claim before insert on full_site_attempts for each row execute function delay_claim_insert()`);
    assert.equal(await db.claimFullSitePage({ ...writing, claimDeadlineAtMs: Date.now() + 100 }), null);
    assert.deepEqual((await fixturePool.query("select status,attempt_count,worker_lease_until from full_site_pages where id=$1", [writing.pageId])).rows[0],
      { status: "failed", attempt_count: 1, worker_lease_until: null }, "A deadline reached during activation writes cannot leave an active worker");

    const pooled = await job("pool-claim.test", 0);
    const clients = await Promise.all(Array.from({ length: 10 }, () => db.getWritePool().connect()));
    const pending = db.claimFullSitePage({ ...pooled, claimDeadlineAtMs: Date.now() + 50 });
    await new Promise(resolve => setTimeout(resolve, 100));
    clients.forEach(client => client.release());
    assert.equal(await pending, null);
    const pooledPage = (await fixturePool.query("select status,attempt_count,worker_lease_until from full_site_pages where id=$1", [pooled.pageId])).rows[0];
    assert.deepEqual(pooledPage, { status: "failed", attempt_count: 1, worker_lease_until: null });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await Promise.all([fixturePool.end(), db.getWritePool().end(), db.getReadPool().end()]);
    await admin.query(`drop schema ${schema} cascade`);
    await admin.end();
    names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; });
  }
});
