import { build } from "esbuild";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

/** Real canonical publication with only I/O replaced. Never connects to a DB or S3. */
export async function redirectPublicationHarness(options: {materializationRoute?: boolean} = {}) {
  await mkdir(path.resolve("artifacts/local-v2-dag-scans"), { recursive: true });
  const directory = await mkdtemp(path.resolve("artifacts/local-v2-dag-scans/redirect-publication-"));
  const infrastructure = path.join(directory, "infrastructure.cjs");
  const output = path.join(directory, "pipeline.cjs");
  const webRequire = createRequire(path.resolve("apps/web/package.json"));
  await writeFile(infrastructure, `
    const state = {record:null,writes:[],objects:new Map(),databaseQuery:null,sourceReadError:null};
    module.exports = {state,
      getAnonymousScanById:async()=>state.record,getScanById:async()=>state.record,
      withNonBlockingDatabaseLock:async(key,run)=>({acquired:true,value:await run()}),
      queryOne:async (sql,params)=>{
        if(sql.includes('join public.scan_snapshots projection')){
          const saved=state.writes.findLast(row=>row.sql.includes('insert into public.scan_snapshots')&&row.params[0]===params[0]);
          if(!saved)return null;const p=saved.params;
          return {scan_id:p[0],scan_status:state.record.scan.status,report_projection_status:'ready',report_projection_version:p[28],report_projection_source_hash:p[29],
            report_projection_computed_at:state.record.scan.completedAt,report_projection_payload:JSON.parse(p[37]),report_projection_payload_sha256:p[38],report_projection_payload_size_bytes:p[39]};
        }
        if(state.databaseQuery&&sql.includes('scan_score_materialization_requests'))return (await state.databaseQuery(sql,params)).rows[0]??null;
        if(sql.includes('as report_inputs_ready'))return {report_inputs_ready:true};
        if(sql.includes('as event_count')){if(state.sourceReadError)throw state.sourceReadError;return {event_count:state.record.events.length,latest_event_id:state.record.events.at(-1)?.id??null};}
        if(sql.includes('tranco_rank_settings'))return null;
        throw new Error('Unexpected offline DB read: '+sql.slice(0,80));
      },
      query:async(sql,params)=>{
        if(state.databaseQuery&&sql.includes('scan_score_materialization_requests'))return state.databaseQuery(sql,params);
        if(!sql.includes('insert into public.scan_snapshots')&&!sql.includes('update public.scans'))throw new Error('Unexpected offline DB write');
        state.writes.push({sql,params});return {rowCount:1,rows:[]};
      },
      getStorageBucketName:()=> 'offline-fixture',
      getS3Client:()=>({send:async command=>{
        const input=command.input;
        if(command.constructor.name==='PutObjectCommand'){state.objects.set(input.Key,Buffer.from(input.Body));return {}}
        const bytes=state.objects.get(input.Key);if(!bytes)throw new Error('Offline object missing');
        return {ContentLength:bytes.length,Body:(async function*(){yield bytes})()};
      }}),
    };
  `);
  await build({
    stdin: { contents: `
      export {publishCanonicalScanReportProjection} from './apps/web/server/scans/canonical-scan-report-publisher';
      export {materializeLocalV2DagScanDetail} from './apps/web/server/scans/local-v2-dag-report';
      export {deriveScanReportProjection,persistScanReportProjection} from './apps/web/server/scans/scan-report-projection';
      export {readPersistedScanReportProjection,SCAN_REPORT_PROJECTION_VERSION} from './apps/web/server/scans/scan-report-projection-contract';
      export {buildCanonicalReportExport} from './apps/web/server/scans/report-export';
      export {renderCanonicalReportPdf} from './apps/web/server/scans/report-export-pdf';
      export {buildApiV2ScanResource,buildApiV2ScanStatus} from './apps/web/lib/api-v2/scan-resource';
      ${options.materializationRoute ? `
      export {POST} from './apps/web/app/api/internal/scan-score-materialization/route';
      export {completeScoreMaterializationRequest,failScoreMaterializationRequest,recordScoreMaterializationRequestError} from './apps/web/server/scans/score-materialization-request-repository';
      export {getReadTriggeredPublicationDeferral} from './apps/web/server/scans/report-publication-ownership';
      export {ensureCompletedScanScoresPersisted} from './apps/validation-worker/src/validation/local-v2-dag-lambda-results';
      ` : ""}
    `, resolveDir: process.cwd(), loader: "ts" },
    outfile: output, bundle: true, platform: "node", format: "cjs", packages: "external",
    plugins: [{ name: "offline-publication-io", setup(builder) {
      builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
      builder.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
      builder.onResolve({ filter: /^(?:@website-signal-risk-scanner\/db|\.\/get-scan-by-id)$/ }, () => ({ path: infrastructure, external: true }));
      builder.onResolve({ filter: /^@(?:certscore|website-signal-risk-scanner)\// }, args => ({ path: webRequire.resolve(args.path), external: true }));
    } }],
  });
  const require = createRequire(import.meta.url);
  return { directory, pipeline: require(output), state: require(infrastructure).state,
    close: () => rm(directory, { recursive: true, force: true }) };
}
