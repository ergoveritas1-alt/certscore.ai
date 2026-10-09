// Local-only concurrency diagnostic. Runs actual status/internal route handlers
// and the canonical publisher in separate HTTP processes against disposable PG.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, fork } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
import { buildReportArtifactTransfer } from '../packages/shared/src/report-artifact-transfer';

const root = process.cwd();
const require = createRequire(path.join(root, 'packages/db/package.json'));
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const { Pool } = require('pg');
const outputRoot = path.join(root, 'artifacts/report-publication-ownership-local-20261008');
const database = 'certscore_publication_local_' + process.pid;
const connection = { host: '127.0.0.1', port: 5432, user: process.env.USER, database };
const admin = new Pool({ ...connection, database: 'postgres' });
let pool: any;
let databaseCreated = false;
const children: ReturnType<typeof fork>[] = [];
let directory: string | undefined;

async function main() {
  await mkdir(outputRoot, { recursive: true });
  await admin.query('create database ' + database); // Generated identifier only; always local.
  databaseCreated = true;
  pool = new Pool(connection);
  await pool.query(`
    create table scans(id uuid primary key,status text,scan_config_json jsonb,organization_id uuid);
    create table scan_events(id uuid default gen_random_uuid(),scan_id uuid,event_type text,metadata_json jsonb,created_at timestamptz default now());
    create table scan_score_materialization_requests(scan_id uuid primary key,token_sha256 text,status text,attempt_count int default 1,requested_at timestamptz default now(),last_attempt_at timestamptz,next_attempt_at timestamptz default now(),completed_at timestamptz,last_error text,first_failed_at timestamptz);
    create table test_reports(scan_id uuid primary key,payload jsonb);
    create table test_operations(scan_id uuid,operation text,created_at timestamptz default now());
  `);
  directory = await mkdtemp(path.join(outputRoot, 'http-fixture-'));
  const fixture = path.join(directory, 'fixture.cjs');
  const transport = path.join(directory, 'transport.cjs');
  await build({ entryPoints: [path.join(root, 'packages/shared/src/report-artifact-transfer.ts')], outfile: transport, bundle: true, platform: 'node', format: 'cjs' });
  const artifactRoot = path.join(root, 'artifacts/report-artifact-transfer-20261008/owned-after-1');
  const originals = {
    bundle: await readFile(artifactRoot + '-scanArtifactUri.json'),
    manifest: await readFile(artifactRoot + '-manifestUri.json'),
  };
  const originalId = JSON.parse(originals.bundle.toString()).scanId;
  await writeFile(fixture, `
    const {Pool}=require(${JSON.stringify(require.resolve('pg'))});
    const pool=new Pool(${JSON.stringify(connection)});
    const {withNonBlockingDatabaseLock:lock}=require(${JSON.stringify(path.join(root,'packages/db/dist/non-blocking-lock.js'))});
    const transport=require(${JSON.stringify(transport)});
    const fs=require('node:fs');
    const originals={bundle:fs.readFileSync(${JSON.stringify(artifactRoot+'-scanArtifactUri.json')}),manifest:fs.readFileSync(${JSON.stringify(artifactRoot+'-manifestUri.json')})};
    const hash=body=>require('node:crypto').createHash('sha256').update(body).digest('hex');
    const identities=Object.fromEntries(Object.entries(originals).map(([kind,body])=>[kind,{uri:'s3://retained-local-replay/'+kind,sha256:hash(body),sizeBytes:body.length}]));
    async function queryOne(sql,values){return (await pool.query(sql,values)).rows[0]??null}
    async function load(input){
      const scan=await queryOne('select * from scans where id=$1',[input.scanId]);if(!scan)return null;
      const events=(await pool.query('select id,event_type as "eventType",created_at as "createdAt" from scan_events where scan_id=$1 order by created_at,id',[input.scanId])).rows.map(e=>({...e,id:String(e.id),createdAt:e.createdAt.toISOString()}));
      const report=await queryOne('select payload from test_reports where scan_id=$1',[input.scanId]);
      return {scan:{id:input.scanId,status:scan.status},events,snapshot:report?.payload??{},signalEnrichmentWorkflow:{mergedSignalsReady:events.some(e=>e.eventType==='signals.merge_completed'),findingsReady:events.some(e=>e.eventType==='findings.unified_derivation_completed')}};
    }
    module.exports={queryOne,query:(sql,values)=>pool.query(sql,values),
      withNonBlockingDatabaseLock:async(key,run)=>{await pool.query('insert into test_operations values($1,$2,now())',[key.split(':').pop(),'lock_attempt']);return lock(key,run,()=>pool.connect())},
      getScanById:load,getAnonymousScanById:scanId=>load({scanId}),
      getLocalV2DagReportInput:()=>({}),
      materializeLocalV2DagScanDetail:async(record,options)=>{
        const bytes=transport.verifyReportArtifactTransfer({scanId:record.scan.id,transfer:options.artifactTransfer,...identities});
        await pool.query('insert into test_operations values($1,$2,now())',[record.scan.id,bytes.size===2?'transfer_used':'s3_fallback']);
        await new Promise(resolve=>setTimeout(resolve,180));return {...record,retainedArtifactHashes:Object.values(identities).map(v=>v.sha256)};
      },
      persistScanReportProjection:async record=>{await pool.query('insert into test_reports values($1,$2) on conflict(scan_id) do update set payload=excluded.payload',[record.scan.id,record]);await pool.query('insert into test_operations values($1,$2,now())',[record.scan.id,'publication'])},
      getPersistedScanReportProjection:record=>record.snapshot.scan?record.snapshot:null,
      isCurrentScanReportProjectionReady:snapshot=>Boolean(snapshot.scan),
      SCAN_REPORT_PROJECTION_VERSION:'local-concurrency-fixture',
      getPublicScanStatusProjection:async scanId=>{const record=await load({scanId});return record?{id:scanId,organizationId:null,status:record.scan.status,reportProjectionRequired:true,reportInputsReady:record.signalEnrichmentWorkflow.findingsReady&&record.signalEnrichmentWorkflow.mergedSignalsReady,reportReady:Boolean(record.snapshot.scan)}:null},
      buildLightweightScanStatusResponse:projection=>projection,
      getPublicOpsScanStatus:async()=>null,
      loadPersistedScanReportProjection:load,
      persistAdminScanSummaryForPublishedRecord:async()=>true,
      persistCompletedLegacyGdprEprivacyAssessment:async()=>({reason:'inserted'}),
    };
  `);
  const oldPublisher = path.join(directory, 'old-publisher.ts');
  await writeFile(oldPublisher, execFileSync('git', ['show', '53ae6fde:apps/web/server/scans/canonical-scan-report-publisher.ts'], { encoding: 'utf8' }));
  const modes = ['before', 'after'] as const;
  const servers: Record<string, string[]> = {};
  for (const mode of modes) {
    const entry = path.join(directory, mode + '-entry.ts');
    const outfile = path.join(directory, mode + '.cjs');
    await writeFile(entry, `
      import {createServer} from 'node:http';
      import {GET} from ${JSON.stringify(path.join(root,'apps/web/app/api/scan-status/[scanId]/route.ts'))};
      import {POST} from ${JSON.stringify(path.join(root,'apps/web/app/api/internal/scan-score-materialization/route.ts'))};
      const server=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const url='http://localhost'+req.url;
        const request=new Request(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})});
        const response=req.method==='POST'?await POST(request):await GET(request,{params:Promise.resolve({scanId:new URL(url).pathname.split('/').pop()})});
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
      }catch(e){res.writeHead(500);res.end(String(e));}});
      server.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
    `);
    await build({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'local-boundaries', setup(b) {
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'empty' }));
      b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: '', loader: 'js' }));
      b.onResolve({ filter: /canonical-scan-report-publisher$/ }, () => ({ path: mode === 'before' ? oldPublisher : path.join(root,'apps/web/server/scans/canonical-scan-report-publisher.ts') }));
      b.onResolve({ filter: /report-publication-ownership$/ }, () => ({ path: path.join(root,'apps/web/server/scans/report-publication-ownership.ts') }));
      b.onResolve({ filter: /scan-report-projection-generation$/ }, () => ({ path: path.join(root,'apps/web/server/scans/scan-report-projection-generation.ts') }));
      b.onResolve({ filter: /log-server-timing$/ }, () => ({ path: path.join(root,'apps/web/server/performance/log-server-timing.ts') }));
      b.onResolve({ filter: /(?:@website-signal-risk-scanner\/db|(?:get-scan-by-id|local-v2-dag-report|scan-report-projection|scan-report-projection-contract|scan-status-projection|ops-status|score-assessment-lifecycle|admin-scan-summary))$/ }, () => ({ path: fixture, external: true }));
      b.onResolve({ filter: /^@(?:certscore|website-signal-risk-scanner)\// }, args => ({ path: webRequire.resolve(args.path), external: true }));
    } }] });
    servers[mode] = [];
    for (let index=0;index<2;index++) {
      const child = fork(outfile, [], { stdio: ['ignore','pipe','pipe','ipc'], execArgv: [] });
      children.push(child);
      const chunks: string[] = [];child.stdout?.on('data', chunk=>chunks.push(String(chunk)));child.stderr?.on('data',chunk=>chunks.push(String(chunk)));
      const port = await new Promise<number>((resolve,reject)=>{child.once('message',(message:any)=>resolve(message.port));child.once('error',reject);child.once('exit',code=>reject(new Error('Fixture exited '+code+' '+chunks.join(''))));});
      servers[mode].push('http://127.0.0.1:'+port);
      child.on('exit',()=>{void writeFile(path.join(outputRoot,mode+'-'+index+'-server.log'),chunks.join(''));});
    }
  }
  const token='t'.repeat(43);
  async function reset(id:string, owner:'queued'|'active'|'expired'|'failed'|'missing'|'terminal'|'completed'|'unverified'|'new_unverified'|'local'|'limited'|'stale'|'incomplete') {
    await pool.query('delete from test_reports;delete from test_operations;delete from scan_events;delete from scan_score_materialization_requests;delete from scans');
    await pool.query('insert into scans values($1,$2,$3,null)',[id,owner==='limited'?'completed_limited':'completed',{processor:'local-certscore-v2-dag-parallel-v1'}]);
    await pool.query('insert into scan_events(scan_id,event_type,metadata_json) values($1,$2,$3)',[id,'v2_lambda_result.received',{resultStatus:'completed',targetEnvironment:owner==='local'?'local':'production',...(owner!=='unverified'?{artifactVerification:{verifiedAt:new Date().toISOString()}}:{})}]);
    if(owner==='new_unverified')await pool.query('insert into scan_events(scan_id,event_type,metadata_json) values($1,$2,$3)',[id,'v2_lambda_result.received',{resultStatus:'completed',targetEnvironment:'production'}]);
    if(owner==='stale')await pool.query("update scan_events set created_at=now()-interval '8 days' where scan_id=$1",[id]);
    if(owner!=='incomplete')for(const name of ['signals.merge_completed','findings.unified_derivation_completed'])await pool.query('insert into scan_events(scan_id,event_type,metadata_json) values($1,$2,$3)',[id,name,{}]);
    if(owner!=='missing')await pool.query(`insert into scan_score_materialization_requests(scan_id,token_sha256,status,last_attempt_at,requested_at,next_attempt_at)
      values($1,$2,$3,case when $4='active' then now() when $4='expired' then now()-interval '151 seconds' else null end,
      case when $4='expired' then now()-interval '151 seconds' else now() end,case when $4='failed' then now()+interval '10 seconds' else now() end)`,[id,createHash('sha256').update(token).digest('hex'),owner==='terminal'?'terminal_failure':owner==='completed'?'completed':'pending',owner]);
  }
  async function poll(mode:string,id:string){return fetch(servers[mode][0]+'/api/scan-status/'+id+'?includeFindings=0')}
  async function publish(mode:string,id:string,transfer?:unknown){return fetch(servers[mode][1]+'/api/internal/scan-score-materialization',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:'publish_report',scanId:id,token,artifactTransfer:transfer})})}
  const results:any[]=[];
  for(const mode of modes){
    await reset(originalId,'queued');
    const transfer=buildReportArtifactTransfer({scanId:originalId,...originals});
    const polling=poll(mode,originalId);
    if(mode==='before') {
      for(let n=0;n<100;n++){if((await pool.query("select 1 from test_operations where operation='s3_fallback'")).rowCount)break;await new Promise(r=>setTimeout(r,5));}
    }else{
      assert.equal((await polling).status,200);
      assert.equal((await pool.query('select * from test_operations')).rowCount,0,'polling must not acquire the publication lock');
    }
    const publishing=publish(mode,originalId,transfer);
    if(mode==='after') {
      let entered=false;
      for(let n=0;n<100;n++){
        if((await pool.query("select 1 from test_operations where operation='transfer_used'")).rowCount){entered=true;break;}
        await new Promise(r=>setTimeout(r,5));
      }
      assert.ok(entered,'worker must be inside materialization before the polling burst');
      assert.equal((await pool.query("select 1 from test_operations where operation='publication'")).rowCount,0);
    }
    const pollingResponses=await Promise.all([polling,...Array.from({length:24},()=>poll(mode,originalId))]);
    for(const response of pollingResponses)assert.equal(response.status,200,'status polling must stay usable');
    const response=await publishing;
    const readyStatus=await poll(mode,originalId);
    assert.equal(readyStatus.status,200);
    assert.equal((await readyStatus.json()).reportReady,true,'status API must expose the published report');
    const operations=(await pool.query('select operation from test_operations order by created_at')).rows.map((r:any)=>r.operation);
    assert.equal(response.status,mode==='before'?503:200);
    assert.equal(operations.filter((o:string)=>o==='publication').length,1);
    assert.equal(operations.filter((o:string)=>o==='transfer_used').length,mode==='before'?0:1);
    if(mode==='after')assert.equal(operations.filter((o:string)=>o==='lock_attempt').length,1,'only the worker may acquire the publication lock');
    results.push({mode,concurrentStatusPolls:24,statusPollingHTTP:200,reportReady:true,workerHTTP:response.status,publications:1,transferredArtifactsUsed:mode==='after'?2:0,operations});
  }
  for(const owner of ['active','expired','failed','missing','terminal','completed','unverified','new_unverified','local','limited','stale','incomplete'] as const){
    const id=randomUUID();await reset(id,owner);
    const response=await poll('after',id);assert.equal(response.status,200);
    const operations=(await pool.query('select operation from test_operations')).rows.map((r:any)=>r.operation);
    const shouldDefer=owner==='active'||owner==='incomplete';
    assert.equal(operations.includes('publication'),!shouldDefer,owner);
    assert.equal(operations.includes('lock_attempt'),!shouldDefer,owner);
    results.push({owner,recoveryPublished:operations.includes('publication')});
  }
  // Authenticated worker recovery works without a cached transfer.
  const recoveryId=randomUUID();await reset(recoveryId,'active');
  assert.equal((await publish('after',recoveryId)).status,200);
  results.push({owner:'authenticated_recovery_without_transfer',published:true});
  await writeFile(path.join(outputRoot,'localhost-concurrency-receipt.json'),JSON.stringify({status:'passed',localDatabaseHost:connection.host,independentHTTPProcesses:4,actualHandlers:true,actualAdvisoryLocks:true,retainedArtifactReplay:true,results},null,2));
  console.log(JSON.stringify({status:'passed',results}));
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{
  for(const child of children)child.kill();
  await Promise.all(children.map(child=>child.exitCode!==null?undefined:new Promise(resolve=>child.once('exit',resolve))));
  if(pool)await pool.end();
  if(databaseCreated)await admin.query('drop database if exists '+database+' with (force)');
  await admin.end();
  if(directory)await rm(directory,{recursive:true,force:true});
});
