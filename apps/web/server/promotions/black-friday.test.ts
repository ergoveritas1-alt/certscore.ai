import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { applicationSchema,TERMS_VERSION,campaignOpen,addCalendarMonths,entitlementPeriod,cleanAttribution,sourceGroup,csvCell,percentage } from "../../lib/promotions/black-friday";
import { getCampaignConfig } from "./config";
import { createCampaignStore,inviteToken,validInviteToken,type Application,type Sql } from "./repository";
import { campaignDashboard } from "./dashboard";
import { campaignEmail,drainCampaignEmails } from "./email";
import { recordCampaignAggregate } from "./aggregate";
import { assertSameOrigin,boundedBody,rateLimit } from "./http";
const secret="isolated-campaign-test-secret-32-characters";
const now=new Date("2026-11-11T01:00:00Z");
function input(n=0){return {requestId:randomUUID(),fullName:"Test Applicant",email:`person${n}@agency${n}.example`,company:`Agency ${n}`,website:`https://agency${n}.example`,businessType:"Web design/development agency",clientSites:"0–5",intendedUse:"Client launch reviews",terms:true,marketingOptIn:false,analyticsConsent:false};}
test("campaign configuration fails closed and cannot override production timing",()=>{
  assert.deepEqual(getCampaignConfig({}),{emailDelivery:false,testWindow:false});
  assert.equal(getCampaignConfig({NODE_ENV:"production",CERTSCORE_BF26_TEST_WINDOW:"1"}).testWindow,false);
  assert.throws(()=>getCampaignConfig({CERTSCORE_BF26_EMAIL_DELIVERY:"maybe"}));
});
test("Pacific campaign boundaries include Dec 2 and close at next midnight; capacity wins",()=>{
  assert.equal(campaignOpen(new Date("2026-11-10T07:59:59.999Z"),0),false);
  assert.equal(campaignOpen(new Date("2026-11-10T08:00:00Z"),0),true);
  assert.equal(campaignOpen(new Date("2026-12-03T07:59:59.999Z"),9),true);
  assert.equal(campaignOpen(new Date("2026-12-03T08:00:00Z"),9),false);
  assert.equal(campaignOpen(now,10,true),false);
});
test("form validates business identity, no-minimum-size eligibility and separate unchecked marketing consent",()=>{
  assert.equal(applicationSchema.parse(input()).marketingOptIn,false);
  for(const change of [{email:"bad"},{terms:false},{website:"http://localhost"},{website:"https://user:password@example.com"},{website:"https://127.0.0.1"},{websiteConfirm:"bot"},{intendedUse:""},{comments:"x".repeat(1501)}])assert.equal(applicationSchema.safeParse({...input(),...change}).success,false);
  assert.equal(applicationSchema.safeParse({...input(),email:"solo@gmail.com"}).success,true);
  const legacy = applicationSchema.parse({...input(),country:"GB",state:"London"});
  assert.equal("country" in legacy,false);
  assert.equal("state" in legacy,false);
});
test("UTC calendar periods clip month-end without drifting subsequent anniversaries",()=>{
  const start=new Date("2026-11-30T23:59:00Z");
  assert.equal(addCalendarMonths(start,3).toISOString(),"2027-02-28T23:59:00.000Z");
  const jan=new Date("2027-01-31T12:00:00Z");assert.equal(addCalendarMonths(jan,1).toISOString(),"2027-02-28T12:00:00.000Z");assert.equal(addCalendarMonths(jan,2).toISOString(),"2027-03-31T12:00:00.000Z");
  assert.equal(entitlementPeriod(jan,new Date("2027-02-28T11:59:59Z"))?.index,0);assert.equal(entitlementPeriod(jan,new Date("2027-02-28T12:00:00Z"))?.index,1);assert.equal(entitlementPeriod(jan,addCalendarMonths(jan,3)),null);
});
test("attribution honors consent and GPC, removes PII-like values, maps sources; CSV resists formulas",()=>{
  const a={utm_source:"LinkedIn",utm_content:"person@example.com",utm_medium:"paid_social",referrerDomain:"linkedin.com"};
  assert.deepEqual(cleanAttribution(a,false,false),{});assert.deepEqual(cleanAttribution(a,true,true),{});
  assert.equal(cleanAttribution(a,true,false).utm_content,undefined);assert.equal(sourceGroup(cleanAttribution(a,true,false)),"LinkedIn");
  assert.equal(sourceGroup({utm_medium:"email"}),"Email");assert.equal(sourceGroup({}),"Direct/unknown");
  assert.equal(csvCell("=1+1"),'"\'=1+1"');assert.equal(csvCell('A "quote"'),'"A ""quote"""');assert.equal(percentage(0,0),"Unavailable");
});
test("same-origin enforcement and bounded JSON protect campaign mutations",async()=>{
  process.env.NEXT_PUBLIC_APP_URL="http://localhost:3000";
  assert.throws(()=>assertSameOrigin(new Request("http://localhost:3000/api",{method:"POST",headers:{origin:"https://attacker.example"}})));
  assertSameOrigin(new Request("http://localhost:3000/api",{method:"POST",headers:{origin:"http://localhost:3000"}}));
  await assert.rejects(boundedBody(new Request("http://localhost:3000/api",{method:"POST",headers:{"Content-Type":"application/json"},body:'"'+"x".repeat(12000)+'"'})),/large/);
});

const localUrl=process.env.BF26_TEST_DATABASE_URL;
test("isolated PostgreSQL campaign journey, concurrency, quota, delivery and expiry",{skip:!localUrl},async t=>{
  const url=new URL(localUrl!);assert.ok(["127.0.0.1","localhost"].includes(url.hostname));assert.equal(url.port,"55432","Never run campaign tests against a shared/production database");
  const pool=new Pool({connectionString:localUrl,max:12});
  const schema=`bf26_test_${randomUUID().replaceAll("-","")}`;
  await pool.query(`create schema ${schema}`);
  pool.on("connect",client=>{void client.query(`set search_path to ${schema},public`);});
  const sql:Sql={query:async(text,values)=>{const client=await pool.connect();try{await client.query(`set search_path to ${schema},public`);return await client.query(text,values);}finally{client.release();}}};
  const transaction=async<T>(fn:(db:Sql)=>Promise<T>)=>{const client=await pool.connect();try{await client.query("begin");await client.query(`set local search_path to ${schema},public`);const result=await fn(client);await client.query("commit");return result;}catch(e){await client.query("rollback");throw e;}finally{client.release();}};
  const store=createCampaignStore(transaction,sql);
  const actor=randomUUID();
  try{
    await sql.query(`create table users(id uuid primary key,email text);create table organizations(id uuid primary key,plan text default 'free',stripe_subscription_id text,stripe_subscription_status text,stripe_payment_status text,marketplace_browser boolean default false);create table organization_members(user_id uuid,organization_id uuid,role text);create table scans(id uuid primary key default gen_random_uuid(),organization_id uuid,status text,scan_type text,pages_requested integer default 1,scan_config_json jsonb default '{}',created_at timestamptz default now(),completed_at timestamptz);`);
    await sql.query(await readFile("packages/db/migrations/0210_black_friday_2026.sql","utf8"));
    await sql.query(`insert into users values($1,'admin@example.test')`,[actor]);
    let firstId="";let application:Application;let token="";const org=randomUUID(),user=randomUUID();
    await t.test("aggregate events deduplicate transport retries and never bind to applications",async()=>{
      const data={id:randomUUID(),event:"bf26_landing_view" as const,consent:true,attribution:{utm_source:"linkedin"}};
      await Promise.all(Array.from({length:5},()=>recordCampaignAggregate(data,false,transaction)));
      await recordCampaignAggregate({...data,id:randomUUID()},true,transaction);
      const aggregate=await sql.query(`select source,count::int from promotion_aggregate_events order by source`);
      assert.deepEqual(aggregate.rows,[{source:"Direct/unknown",count:1},{source:"LinkedIn",count:1}]);
      assert.equal((await sql.query(`select count(*)::int n from promotion_request_receipts`)).rows[0]!.n,2);
    });
    await t.test("database abuse limits hold under concurrent public requests",async()=>{
      process.env.BETTER_AUTH_SECRET=secret;
      const request=new Request("http://localhost:3000/api",{headers:{"x-forwarded-for":"192.0.2.30"}});
      const responses=await Promise.allSettled(Array.from({length:9},()=>rateLimit(request,"application",sql.query)));
      assert.equal(responses.filter(r=>r.status==="fulfilled").length,5);
      assert.equal((await sql.query(`select key from promotion_rate_limits`)).rows[0]!.key.length,64);
    });
    await t.test("notification enqueue failure rolls back application and operational event together",async()=>{
      const failing=createCampaignStore(fn=>transaction(db=>fn({query:async(text,values)=>{
        if(text.includes("insert into promotion_email_outbox")) throw new Error("mock queue failure");
        return db.query(text,values);
      }})),sql);
      await assert.rejects(failing.submit(input(90),false,now),/mock queue failure/);
      assert.equal((await sql.query(`select count(*)::int n from promotion_applications`)).rows[0]!.n,0);
      assert.equal((await sql.query(`select count(*)::int n from promotion_events`)).rows[0]!.n,0);
    });
    await t.test("public intake does not enumerate subscriptions; approval blocks an existing paid account",async()=>{
      await assert.rejects(transaction(async db=>{
        const isolated=createCampaignStore(fn=>fn(db),db),data=input(91),paidUser=randomUUID(),paidOrg=randomUUID();
        await db.query(`insert into users values($1,$2)`,[paidUser,data.email]);
        await db.query(`insert into organizations(id,plan,stripe_subscription_id,stripe_subscription_status) values($1,'pro','paid-test','active')`,[paidOrg]);
        await db.query(`insert into organization_members values($1,$2,'owner')`,[paidUser,paidOrg]);
        const result=await isolated.submit(data,false,now);
        assert.equal(result.created,true);
        await assert.rejects(isolated.review(result.id!,actor,"approve","","paid-group",true,now),/paid subscription/);
        assert.equal((await isolated.availability(now)).allocated,0);
        throw new Error("rollback paid-account fixture");
      }),/rollback paid-account fixture/);
    });
    await t.test("persistence and outbox are atomic, retries and domain/email duplicates do not allocate",async()=>{
      const data={...input(),email:"hello@agency-review.co.uk",website:"https://agency-review.co.uk"};
      const results=await Promise.all(Array.from({length:8},()=>store.submit(data,false,now)));
      assert.equal(results.filter(r=>r.created).length,1);firstId=results.find(r=>r.id)!.id!;
      const stored=(await sql.query(`select details, terms_version from promotion_applications where id=$1`,[firstId])).rows[0]!;
      assert.equal(stored.details.website,data.website);
      assert.equal("country" in stored.details,false);
      assert.equal("state" in stored.details,false);
      assert.equal(stored.terms_version,TERMS_VERSION);
      assert.equal((await sql.query(`select count(*)::int n from promotion_email_outbox`)).rows[0]!.n,2);
      assert.equal((await store.availability(now)).allocated,0);
      assert.equal((await store.submit({...input(50),website:data.website},false,now)).created,false);
      assert.equal((await store.submit({...input(51),email:data.email},false,now)).created,false);
      assert.equal((await sql.query(`select count(*)::int n from promotion_events where event='bf26_form_submit'`)).rows[0]!.n,1);
    });
    await t.test("manual verification and first-in submission order; duplicate clicks allocate once",async()=>{
      const second=await store.submit(input(1),false,new Date(now.getTime()+1));
      await assert.rejects(store.review(second.id!,actor,"approve","","second",true,now),/earlier/);
      await assert.rejects(store.review(firstId,actor,"approve","","first",false,now),/Confirm/);
      await Promise.all([store.review(firstId,actor,"approve","Verified company","first",true,now),store.review(firstId,actor,"approve","Verified company","first",true,now)]);
      assert.equal((await store.availability(now)).allocated,1);
      await store.review(second.id!,actor,"approve","","second",true,now);
      application=(await store.list()).find(a=>a.id===firstId)!;token=inviteToken(application,secret);
      assert.equal(validInviteToken(token,application,secret),true);assert.equal(validInviteToken(token+"x",application,secret),false);
    });
    await t.test("concurrent approvals cannot allocate an eleventh place",async()=>{
      const ids:string[]=[];for(let i=2;i<12;i++){ids.push((await store.submit(input(i),false,new Date(now.getTime()+i))).id!);}
      // Competing review requests are serialized on campaign capacity; submission order remains authoritative.
      await Promise.allSettled(ids.map((id,i)=>store.review(id,actor,"approve","",`group-${i}`,true,now)));
      for(let i=0;i<ids.length;i++)await store.review(ids[i]!,actor,"approve","",`group-${i}`,true,now).catch(()=>undefined);
      assert.equal((await store.availability(now)).allocated,10);
      assert.equal((await sql.query(`select count(distinct allocation)::int n from promotion_applications where allocation is not null`)).rows[0]!.n,10);
      await assert.rejects(store.submit(input(80),false,now),/closed/);
    });
    await t.test("rejection is idempotent, queues one notice, and cannot be reversed into approval",async()=>{
      const pending=(await store.list()).find(a=>a.allocation===null)!;
      await store.review(pending.id,actor,"under_review","Checking eligibility","",false,now);
      await store.review(pending.id,actor,"reject","Not eligible","",false,now);
      await store.review(pending.id,actor,"reject","Not eligible","",false,now);
      assert.equal((await sql.query(`select count(*)::int n from promotion_email_outbox where application_id=$1 and kind='rejected'`,[pending.id])).rows[0]!.n,1);
      await assert.rejects(store.review(pending.id,actor,"approve","","rejected",true,now),/cannot be approved/);
      await assert.rejects(store.review(firstId,actor,"resend","","",false,now),/queued/);
    });
    await t.test("invitation binds to account email; existing paid accounts cannot be changed",async()=>{
      await sql.query(`insert into users values($1,$2);`,[user,application.email]);await sql.query(`insert into organizations(id,plan) values($1,'pro')`,[org]);await sql.query(`insert into organization_members values($1,$2,'owner')`,[user,org]);
      await assert.rejects(store.activate(token,secret,{id:user,email:"foreign@example.test"},now),/email/);
      await assert.rejects(store.activate(token,secret,{id:user,email:application.email},now),/eligible/);
      assert.equal((await sql.query(`select plan from organizations where id=$1`,[org])).rows[0]!.plan,"pro");
      await sql.query(`update organizations set plan='free' where id=$1`,[org]);
      await assert.rejects(store.activate(token,secret,{id:user,email:application.email},new Date(now.getTime()+14*86400000)),/deadline/);
      const results=await Promise.all([store.activate(token,secret,{id:user,email:application.email},now),store.activate(token,secret,{id:user,email:application.email},now)]);
      assert.equal(results[0]!.entitlement_end!.toISOString(),"2027-02-11T01:00:00.000Z");
      assert.equal(results[0]!.activated_at!.getTime(),results[1]!.activated_at!.getTime());
      assert.equal((await sql.query(`select plan,stripe_subscription_id,promotion_effective_plan(id,plan) effective from organizations where id=$1`,[org])).rows[0]!.effective,"pro");
      assert.equal((await sql.query(`select stripe_subscription_id from organizations where id=$1`,[org])).rows[0]!.stripe_subscription_id,null);
    });
    await t.test("quota reserves requested pages atomically and records first completed scan once",async()=>{
      await sql.query(`insert into scans(organization_id,status,scan_type,pages_requested) select $1,'queued','full',5 from generate_series(1,999)`,[org]);
      const requests=await Promise.allSettled(Array.from({length:5},()=>sql.query(`insert into scans(organization_id,status,scan_type) values($1,'queued','full') returning id`,[org])));
      assert.equal(requests.filter(r=>r.status==="fulfilled").length,1);
      assert.equal((await sql.query(`select pages from promotion_usage where application_id=$1`,[firstId])).rows[0]!.pages,1000);
      await sql.query(`update scans set status='completed',completed_at=now() where organization_id=$1`,[org]);
      assert.equal((await sql.query(`select count(*)::int n from promotion_events where event='bf26_first_scan'`)).rows[0]!.n,1);
    });
    await t.test("monthly rollover uses original anniversary; expiry needs no billing job",async()=>{
      const start=new Date();start.setUTCMonth(start.getUTCMonth()-1);start.setUTCDate(start.getUTCDate()-1);
      await sql.query(`update promotion_applications set activated_at=$2,entitlement_end=promotion_month($2,3) where id=$1`,[firstId,start]);
      await sql.query(`insert into scans(organization_id,status,scan_type,pages_requested,scan_config_json) values($1,'queued','scheduled',1,'{"fullSite":true,"crawlOptions":{"maxPages":7}}')`,[org]);
      assert.equal((await sql.query(`select pages from promotion_usage where application_id=$1 and period_index=1`,[firstId])).rows[0]!.pages,7);
      await sql.query(`update promotion_applications set entitlement_end=now()-interval '1 second' where id=$1`,[firstId]);
      assert.equal((await sql.query(`select promotion_effective_plan(id,plan) p from organizations where id=$1`,[org])).rows[0]!.p,"free");
      await assert.rejects(sql.query(`insert into scans(organization_id,status,scan_type) values($1,'queued','full')`,[org]),/ended/);
      await sql.query(`update organizations set plan='pro',stripe_subscription_id='sub_test',stripe_subscription_status='active',stripe_payment_status='paid' where id=$1`,[org]);
      assert.equal((await sql.query(`select count(*)::int n from promotion_events where event='bf26_paid_conversion'`)).rows[0]!.n,1);
      await sql.query(`insert into scans(organization_id,status,scan_type,pages_requested) values($1,'queued','full',2000)`,[org]);
    });
    await t.test("email content excludes internal notes; mock SMTP failure never removes application",async()=>{
      const rows=await store.list();const a=rows.find(a=>a.id===firstId)!;
      const owner=campaignEmail(a,"owner","http://localhost:3000",secret,10);assert.equal(owner.to,"ben@certscore.ai");assert.match(owner.text,/Agency 0/);assert.ok(!owner.text.includes("Verified company"));
      process.env.CERTSCORE_BF26_EMAIL_DELIVERY="1";process.env.BETTER_AUTH_SECRET=secret;
      const config=()=>({fromEmail:"test@example.test",appPassword:"mock",appUrl:"http://localhost:3000"});
      const mock={query:sql.query,transaction,config,transport:()=>({close(){},async sendMail(){throw Object.assign(new Error("mock refused"),{command:"CONN"});}})};
      await drainCampaignEmails(firstId,mock as never);
      assert.ok((await sql.query(`select * from promotion_email_outbox where application_id=$1 and status='failed'`,[firstId])).rows.length);
      assert.equal((await store.list()).length,12);
      await sql.query(`update promotion_email_outbox set available_at=now() where application_id=$1 and status='failed'`,[firstId]);
      const successful={...mock,transport:()=>({close(){},async sendMail(){return {accepted:["test@example.test"]};}})};
      const delivered=await drainCampaignEmails(firstId,successful as never);assert.ok(delivered.sent>=2);
      // Accepted SMTP followed by uncertain outcome does not retry automatically.
      const other=rows.find(a=>a.id!==firstId && a.allocation!==null)!;
      const uncertain={...mock,transport:()=>({close(){},async sendMail(){throw Object.assign(new Error("mock ambiguous"),{command:"DATA"});}})};
      await drainCampaignEmails(other.id,uncertain as never);
      assert.ok((await sql.query(`select * from promotion_email_outbox where application_id=$1 and status='uncertain'`,[other.id])).rows.length);
      process.env.CERTSCORE_BF26_EMAIL_DELIVERY="0";
    });
    await t.test("dashboard counts reconcile authoritative events with cohort denominators and missing days",async()=>{
      const result=await campaignDashboard("2026-11-01","2026-11-30",{query:sql.query,list:store.list});
      assert.equal(result.allocated,10);assert.equal(result.cohort.submitted,12);assert.equal(result.cohort.approved,10);assert.equal(result.cohort.activated,1);assert.equal(result.cohort.first_scan,1);assert.equal(result.cohort.paid,1);
      assert.equal(result.totals.bf26_form_submit,12);assert.equal(result.totals.bf26_activated,1);assert.equal(Object.keys(result.days).length,30);
    });
    await t.test("SQL UTC anniversaries match calendar contract and no additional plan is ever written",async()=>{
      const r=await sql.query(`select promotion_month('2027-01-31T12:00:00Z',1) first,promotion_month('2027-01-31T12:00:00Z',2) second_month`);
      assert.equal(r.rows[0]!.first.toISOString(),"2027-02-28T12:00:00.000Z");assert.equal(r.rows[0]!.second_month.toISOString(),"2027-03-31T12:00:00.000Z");
      assert.equal((await sql.query(`select count(*)::int n from promotion_events where event='bf26_activated'`)).rows[0]!.n,1);
    });
  }finally{await pool.query(`drop schema ${schema} cascade`);await pool.end();}
});
