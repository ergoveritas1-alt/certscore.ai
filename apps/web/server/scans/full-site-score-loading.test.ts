import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

test("completed crawls persist permanent page limitations but never persist failed evidence reads", async () => {
  const directory = await mkdtemp(resolve("apps/web/.site-score-loading-"));
  try {
    const output = join(directory, "loader.cjs");
    await build({ entryPoints: [resolve("apps/web/server/scans/full-site-score.ts")], outfile: output,
      bundle: true, platform: "node", format: "cjs", packages: "external", plugins: [{ name: "score-fixtures", setup(builder) {
        const fixtures: Record<string, string> = {
          "server-only": "",
          "@website-signal-risk-scanner/db": `
            export async function query(sql, args) {
              if (sql.startsWith('update')) { globalThis.scoreWrites.push(JSON.parse(args[1])); return {rows:[]}; }
              if (sql.includes('full_site_attempts')) return {rows:[{id:'attempt',page_id:'child',artifact_json:{bucket:'bucket',evidenceKey:'prefix/child/attempt/evidence.json',sourceHash:'a'.repeat(64)}}]};
              return {rows:[{report_projection_payload_sha256:globalThis.snapshotHash}]};
            }
            export async function readFullSiteArtifact(){ throw new Error('Temporary S3 failure'); }
          `,
          "./scan-report-projection-contract": "export const readPersistedScanReportProjection=()=>({runtimeArtifacts:{}});",
          "./persisted-canonical-report-projection": "export const getPersistedCanonicalReportProjection=()=>({checklistRows:[],globalUnifiedFindings:[],ownerUnifiedFindings:[]});",
          "./canonical-overall-score": "export const deriveCanonicalOverallScoreForReport=()=>100; export const deriveCanonicalOverallScoreExplanationForReport=()=>({score:100,deductions:[]});",
        };
        builder.onResolve({filter:/.*/}, args => args.path in fixtures ? {path:args.path,namespace:"fixture"} : undefined);
        builder.onLoad({filter:/.*/,namespace:"fixture"}, args => ({contents:fixtures[args.path]!,loader:"js"}));
      } }] });
    const globals = globalThis as typeof globalThis & {scoreWrites: Array<{sourceHash:string;score:unknown}>;snapshotHash:string};
    globals.scoreWrites = []; globals.snapshotHash = "b".repeat(64);
    const require = createRequire(import.meta.url);
    const {loadFullSiteScore} = require(output);
    const crawl = {scan_id:"scan",status:"completed",completed_at:new Date(),configuration_hash:"config",policy_json:{},bucket:"bucket",artifact_prefix:"prefix",region:"eu-west-1"};
    const home = {id:"home",source:"homepage",url:"https://example.com/",status:"completed",observation:{executionProfile:"homepage_baseline"}};
    const failed = {id:"child",url:"https://example.com/child",status:"failed",observation:null};
    const first = await loadFullSiteScore(crawl,[home,failed]);
    assert.equal(first.limitedPages,1);
    assert.equal(first.value,100);
    assert.deepEqual(first.deductions,[]);
    assert.equal(globals.scoreWrites.length,1, "permanent failed page must not prevent durable reuse");
    delete require.cache[output];
    const cached = await require(output).loadFullSiteScore({...crawl,policy_json:{fullSiteScore:globals.scoreWrites[0]}},[home,failed]);
    assert.deepEqual(cached,first);
    assert.equal(globals.scoreWrites.length,1);
    const v12 = { ...first, version: "full-site-distinct-findings.v12", value: 80,
      deductions: [{ family: "policy_transparency", label: "Policy transparency", deductionPoints: 20,
        rules: [{ ruleId: "privacy_notice_availability", label: "Historical privacy notice finding", policyDeductionPoints: 20,
          decisionVerification: "not_applicable" }] }] };
    const v12Key = (posture: string, source = globals.snapshotHash, configuration = crawl.configuration_hash,
      pageRows: unknown[] = [home, failed].map(page => [page.id, page.status, undefined])) =>
      createHash("sha256").update(JSON.stringify([v12.version, "site-priority-review.v19", posture,
        source, configuration, pageRows])).digest("hex");
    for (const posture of ["gdpr-eprivacy-posture.v26-consent-only", "gdpr-eprivacy-posture.v25-narrow",
      "gdpr-eprivacy-posture.v24", "gdpr-eprivacy-posture.v23", "gdpr-eprivacy-posture.v22"]) {
      const sourceHash = v12Key(posture);
      for (const value of [80, null]) {
        const score = { ...v12, value };
        assert.deepEqual(await loadFullSiteScore({ ...crawl, policy_json: { fullSiteScore: { sourceHash, score } } }, [home, failed]), score,
          `exact v12/${posture} cache keeps its historical amount or unknown value`);
      }
      assert.deepEqual(await loadFullSiteScore({ ...crawl, policy_json: { fullSiteScore: {
        sourceHash, score: { ...v12, version: first.version },
      } } }, [home, failed]), first, "a v12 key cannot authenticate current-version scoring");
      assert.deepEqual(await loadFullSiteScore({ ...crawl, policy_json: { fullSiteScore: {
        sourceHash, score: { ...v12, version: "full-site-distinct-findings.v11" },
      } } }, [home, failed]), first, "historical keys cannot authenticate a different historical version");
    }
    for (const sourceHash of [
      v12Key("gdpr-eprivacy-posture.v21"),
      v12Key("gdpr-eprivacy-posture.v25-narrow", "d".repeat(64)),
      v12Key("gdpr-eprivacy-posture.v25-narrow", globals.snapshotHash, "different-config"),
      v12Key("gdpr-eprivacy-posture.v25-narrow", globals.snapshotHash, crawl.configuration_hash,
        [[home.id, home.status, undefined], [failed.id, "completed", "e".repeat(64)]]),
    ]) {
      assert.deepEqual(await loadFullSiteScore({ ...crawl, policy_json: { fullSiteScore: { sourceHash, score: v12 } } }, [home, failed]), first,
        "unknown posture or changed source/configuration/page evidence cannot reuse historical scoring");
    }
    const v12Gpc = { ...v12, deductions: [{ family: "gpc", label: "GPC", deductionPoints: 20,
      rules: [{ ruleId: "gpc_response", label: "GPC", policyDeductionPoints: 20, decisionVerification: "not_applicable" }] }] };
    assert.deepEqual(await loadFullSiteScore({ ...crawl, policy_json: { fullSiteScore: {
      sourceHash: v12Key("gdpr-eprivacy-posture.v25-narrow"), score: v12Gpc,
    } } }, [home, failed]), first, "newly recognized historical pairs retain the existing GPC exclusion");
    assert.equal(globals.scoreWrites.length, 1, "historical cache reads and rejected cache keys do not rewrite reports");
    const historical = { ...first, version: "full-site-distinct-findings.v6", value: 88,
      deductions: [{ family: "policy_transparency", label: "Policy transparency", deductionPoints: 12,
        rules: [{ ruleId: "privacy_notice_availability", label: "Privacy policy not found", policyDeductionPoints: 12,
          decisionVerification: "not_applicable" }] }] };
    const historicalKey = createHash("sha256").update(JSON.stringify([
      historical.version, "site-priority-review.v19", "gdpr-eprivacy-posture.v17", globals.snapshotHash,
      crawl.configuration_hash, [home, failed].map(page => [page.id, page.status, undefined]),
    ])).digest("hex");
    const preserved = await loadFullSiteScore({ ...crawl, policy_json: { fullSiteScore: { sourceHash: historicalKey, score: historical } } }, [home, failed]);
    assert.deepEqual(preserved, historical, "source-bound historical scores keep their original twelve-point amount");
    assert.equal(globals.scoreWrites.length, 1, "historical read does not rewrite or recapture evidence");
    const previous={...historical,version:"full-site-distinct-findings.v11"};
    const previousKey=createHash("sha256").update(JSON.stringify([previous.version,"site-priority-review.v19","gdpr-eprivacy-posture.v21",globals.snapshotHash,
      crawl.configuration_hash,[home,failed].map(page=>[page.id,page.status,undefined])])).digest("hex");
    assert.deepEqual(await loadFullSiteScore({...crawl,policy_json:{fullSiteScore:{sourceHash:previousKey,score:previous}}},[home,failed]),previous,
      "the immediate previous version stays source-bound and is not silently repriced");
    assert.equal(globals.scoreWrites.length,1);
    const gpcPriority = { id: "gpc_response", rank: 1, title: "GPC response", summary: "Historical response", status: "Partial concern", evidence: [], evidenceJson: {}, correctionSteps: [], pages: [] };
    const neutralGpc = await loadFullSiteScore({ ...crawl, policy_json: { fullSiteScore: { sourceHash: historicalKey, score: { ...historical, priorityReview: [gpcPriority] } } } }, [home, failed]);
    assert.equal(neutralGpc.value, 88, "suppressing a neutral historical GPC result preserves unrelated scoring");
    assert.deepEqual(neutralGpc.priorityReview, []);
    const deductedGpc = await loadFullSiteScore({ ...crawl, policy_json: { fullSiteScore: { sourceHash: historicalKey, score: { ...historical, value: 85, deductions: [{ family: "gpc", label: "GPC", deductionPoints: 15, rules: [{ ruleId: "gpc_response", label: "GPC", policyDeductionPoints: 15, decisionVerification: "not_applicable" }] }] } } } }, [home, failed]);
    assert.equal(deductedGpc.value, 100, "historical GPC deductions must use the retained canonical recomputation");
    assert.deepEqual(deductedGpc.deductions, []);
    const mismatched = await loadFullSiteScore({ ...crawl, policy_json: { fullSiteScore: {
      sourceHash: historicalKey, score: { ...historical, version: first.version },
    } } }, [home, failed]);
    assert.deepEqual(mismatched, first, "a historical key cannot authenticate current-version deductions");
    globals.snapshotHash = "c".repeat(64);
    const missing = {...failed,status:"completed",observation:{status:"completed",httpStatus:200,attemptId:"attempt",parentScanId:"scan",pageJobId:"child",configurationHash:"config",sourceHash:"a".repeat(64),runtimeGraph:{sourceSizeBytes:100}}};
    let incomplete = 0;
    const options = {onIncompleteEvidence(){incomplete++;}};
    const limited = await loadFullSiteScore(crawl,[home,missing],options);
    assert.equal(limited.limitedPages,1);
    assert.equal(globals.scoreWrites.length,1,"temporary read failure must remain retryable, not durably cached");
    await loadFullSiteScore(crawl,[home,missing],options);
    assert.equal(incomplete,2,"both fresh and shared in-memory reads tell callers not to persist incomplete evidence");
  } finally { await rm(directory,{recursive:true,force:true}); }
});
