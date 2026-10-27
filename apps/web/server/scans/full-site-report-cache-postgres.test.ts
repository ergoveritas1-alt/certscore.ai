import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { Pool } from "pg";
import { build } from "esbuild";

const databaseUrl = process.env.FULL_SITE_TEST_DATABASE_URL;
test("concurrent HTTP report reads cannot reuse an obsolete source after a PostgreSQL cache-write lock", {skip:!databaseUrl, timeout:20000}, async () => {
  const url = new URL(databaseUrl!);
  assert.equal(url.hostname,"127.0.0.1");
  assert.equal(url.pathname,"/full_site_test");
  const schema = `cache_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({connectionString:url.href});
  await admin.query(`create schema ${schema}`);
  url.searchParams.set("options",`-c search_path=${schema}`);
  const pool = new Pool({connectionString:url.href});
  const directory = await mkdtemp(resolve("apps/web/.cache-postgres-"));
  const scanId = randomUUID(), userId = randomUUID(), pageId = randomUUID();
  let writes = 0;
  let ready!: () => void;
  const bothWrites = new Promise<void>(resolve => {ready=resolve;});
  const globals = globalThis as typeof globalThis & {coverageCachePgQuery?:(sql:string,args:unknown[])=>ReturnType<Pool["query"]>};
  globals.coverageCachePgQuery = (sql,args) => {
    if (sql.startsWith("insert into full_site_report_cache") && ++writes === 2) ready();
    return pool.query(sql,args);
  };
  const lock = await pool.connect();
  const server = createServer();
  try {
    await pool.query("create table users(id uuid primary key); create table scans(id uuid primary key)");
    for (const migration of ["0194_full_site_resource_crawls.sql","0207_full_site_report_cache.sql"])
      await pool.query(await readFile(resolve("packages/db/migrations",migration),"utf8"));
    await pool.query("create table scan_snapshots(scan_id uuid primary key,report_projection_payload_sha256 text,report_projection_status text,report_projection_version text)");
    await pool.query("insert into users values($1)",[userId]);
    await pool.query("insert into scans values($1)",[scanId]);
    await pool.query(`insert into full_site_crawls(scan_id,authorized_user_id,status,requested_json,policy_json,region)
      values($1,$2,'completed','{}','{}','eu-central-1')`,[scanId,userId]);
    await pool.query("insert into scan_snapshots values($1,'retained-sha','ready','retained-version')",[scanId]);
    await pool.query(`insert into full_site_pages(id,scan_id,target_url,source,selection_reason,section,status)
      values($1,$2,'https://fixture.test/','homepage','fixture','/','completed')`,[pageId,scanId]);
    const output = join(directory,"cache.cjs");
    await build({entryPoints:[resolve("apps/web/server/scans/full-site-report-cache.ts")],outfile:output,bundle:true,platform:"node",format:"cjs",packages:"external",
      plugins:[{name:"postgres",setup(builder) {
        const fixtures:Record<string,string> = {"server-only":"", "@website-signal-risk-scanner/db":"export const query=(sql,args)=>globalThis.coverageCachePgQuery(sql,args);",
          "../runtime-version":"export const getRuntimeVersionInfo=()=>({gitSha:'release-fixture'});"};
        builder.onResolve({filter:/.*/},args=>args.path in fixtures?{path:args.path,namespace:"fixture"}:undefined);
        builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:fixtures[args.path]!,loader:"js"}));
      }}]});
    const require = createRequire(import.meta.url);
    let cache = require(output);
    const originalKey = `${await cache.fullSiteReportSourceKey(scanId)}:overview.v1`;
    await cache.writeFullSiteReportCache(scanId,originalKey,{pageStatus:"completed"},"overview");
    await pool.query("update full_site_report_cache set source_key='obsolete'");
    writes=0;
    await lock.query("begin");
    await lock.query("select slot from full_site_report_cache for update");
    server.on("request",async (_request,response) => {
      try {
        const key = `${await cache.fullSiteReportSourceKey(scanId)}:overview.v1`;
        let report = await cache.readFullSiteReportCache(scanId,key);
        if (!report) {
          const row = (await pool.query("select status from full_site_pages where id=$1",[pageId])).rows[0];
          report={pageStatus:row.status};
          await cache.writeFullSiteReportCache(scanId,key,report,"overview");
        }
        response.setHeader("content-type","application/json");response.end(JSON.stringify(report));
      } catch {response.writeHead(500);response.end();}
    });
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    const address=server.address();assert.ok(address&&typeof address==="object");
    const endpoint=`http://127.0.0.1:${address.port}/report`;
    const pending=Promise.all([fetch(endpoint),fetch(endpoint)]);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([bothWrites,new Promise<never>((_resolve,reject)=>{deadline=setTimeout(()=>reject(new Error("Concurrent cache writes did not reach the lock")),5000);})]); }
    finally { clearTimeout(deadline); }
    await pool.query("update full_site_pages set status='partial',limitation='fixture_limit' where id=$1",[pageId]);
    await lock.query("commit");
    const responses=await pending;
    assert.deepEqual(await Promise.all(responses.map(response=>response.json())),[{pageStatus:"completed"},{pageStatus:"completed"}]);
    const changedKey=`${await cache.fullSiteReportSourceKey(scanId)}:overview.v1`;
    assert.notEqual(changedKey,originalKey);
    assert.equal(await cache.readFullSiteReportCache(scanId,changedKey),null,"late writes cannot be read under a changed source");
    delete require.cache[output];cache=require(output);
    assert.deepEqual(await (await fetch(endpoint)).json(),{pageStatus:"partial"});
    assert.deepEqual(await cache.readFullSiteReportCache(scanId,changedKey),{pageStatus:"partial"});
    assert.equal((await pool.query("select count(*)::int as count from full_site_report_cache")).rows[0].count,1);
  } finally {
    await lock.query("rollback");lock.release();
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
    delete globals.coverageCachePgQuery;
    await pool.end();await admin.query(`drop schema ${schema} cascade`);await admin.end();
    await rm(directory,{recursive:true,force:true});
  }
});
