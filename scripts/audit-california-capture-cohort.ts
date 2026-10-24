import { readFile } from "node:fs/promises";
import { summarizeOptOutFunnel } from "./lib/sale-sharing-opt-out-funnel";
import * as prodDbNamespace from "./lib/prod-db-psql-oneoff.ts";

const prodDb = (prodDbNamespace as typeof prodDbNamespace & { default?: typeof prodDbNamespace }).default ?? prodDbNamespace;

type CohortRow = {
  scanId: string;
  hostname: string;
  createdAt: string;
  scanStatus: string;
  reportStatus: string | null;
  optOutConfigured: boolean | null;
  california: Record<string, unknown> | null;
  workpaper: Record<string, unknown> | null;
  optOutLaneOutcome?:unknown;
  canonicalFindingIds?:string[]|null;
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const number = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? value : 0;
const countBy = (rows: Array<string | null>) => Object.fromEntries([...new Set(rows)].sort().map(key => [key ?? "missing", rows.filter(row => row === key).length]));
const p95 = (values: number[]) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] : null;

/** Read-only operational funnel. Counts are capture coverage, not detector recall. */
export function summarizeCaliforniaCapture(rows: CohortRow[]) {
  const details = rows.map(row => {
    const california = record(row.california);
    const inspection = record(california.inspection);
    const workpaper = record(row.workpaper);
    const controlCount = number(california.controlCount);
    const workpaperCandidateCount = number(workpaper.candidateCount);
    const named = number(inspection.namedChoiceCandidateCount);
    const namedInFrames = number(inspection.namedFrameChoiceCandidateCount);
    const reviewCoverage = record(california.reviewCoverage);
    return {
      scanId: row.scanId,
      hostname: row.hostname,
      createdAt: row.createdAt,
      scanStatus: row.scanStatus,
      reportStatus: row.reportStatus,
      optOutConfigured: row.optOutConfigured === true,
      assessmentPresent: row.california !== null,
      assessmentVersion: typeof california.contractVersion === "string" ? california.contractVersion : null,
      californiaScoreReady: reviewCoverage.scoreReady === true,
      coverageFamilies: array(reviewCoverage.families).map(record).map(row=>({id:row.id,status:row.status})),
      inspectionVersion: typeof inspection.contractVersion === "string" ? inspection.contractVersion : null,
      inspectionCoverage: typeof inspection.coverage === "string" ? inspection.coverage : null,
      choiceSurface: typeof california.choiceSurface === "string" ? california.choiceSurface : null,
      namedChoiceCandidates: named,
      namedFrameChoiceCandidates: namedInFrames,
      verifiedChoiceControls: controlCount,
      workpaperUnverifiedCandidates: workpaperCandidateCount,
      topLevelCandidateNeedsTrace: Math.max(0, named - namedInFrames - controlCount - workpaperCandidateCount),
      frameCount: number(inspection.frameCount),
      inspectedSameOriginFrames: number(inspection.inspectedSameOriginFrameCount),
      uninspectedFrames: number(inspection.uninspectedFrameCount),
      hiddenFrames: number(inspection.hiddenUninspectedFrameCount),
      inaccessibleFrames: number(inspection.inaccessibleFrameCount),
      unreadyFrames: number(inspection.unreadyFrameCount),
      unprojectableFrames: number(inspection.unprojectableFrameCount),
      frameBudgetLimited: number(inspection.frameBudgetLimitedCount),
      frameWorkMs: number(inspection.frameInspectionWorkMs) + number(inspection.frameProofWorkMs),
      optOutStatus: typeof california.optOutStatus === "string" ? california.optOutStatus : null,
      optOutLimitations: array(california.optOutLimitations).filter((value): value is string => typeof value === "string"),
      optOutEffectiveness: typeof california.optOutEffectiveness === "string" ? california.optOutEffectiveness : null,
    };
  });
  return {
    scans: rows.length,
    optOutFunnel: summarizeOptOutFunnel(rows.map(row=>{
      const ca=record(row.california),observation=record(ca.optOutObservation);
      return {scanId:row.scanId,configured:row.optOutConfigured,evidence:observation.evidence,
        evidenceVerified:observation.verificationStatus==="verified",laneOutcome:row.optOutLaneOutcome,
        findingIds:row.canonicalFindingIds};
    })),
    scanStatuses: countBy(details.map(row => row.scanStatus)),
    reportStatuses: countBy(details.map(row => row.reportStatus)),
    assessments: details.filter(row => row.assessmentPresent).length,
    assessmentVersions: countBy(details.map(row=>row.assessmentVersion)),
    scoreReadyAssessments: details.filter(row=>row.californiaScoreReady).length,
    inspectionVersions: countBy(details.map(row => row.inspectionVersion)),
    inspectionCoverage: countBy(details.map(row => row.inspectionCoverage)),
    choiceSurfaces: countBy(details.map(row => row.choiceSurface)),
    scansWithUninspectedFrames: details.filter(row => row.uninspectedFrames > 0).length,
    scansWithCandidatesNeedingTrace: details.filter(row => row.topLevelCandidateNeedsTrace > 0).length,
    frameWorkP95Ms: p95(details.filter(row => ["certscore.privacy-choice-inspection.v3","certscore.privacy-choice-inspection.v4","certscore.privacy-choice-inspection.v5"].includes(row.inspectionVersion ?? "")).map(row => row.frameWorkMs)),
    verifiedChoiceControls: details.reduce((sum, row) => sum + row.verifiedChoiceControls, 0),
    optOutStatuses: countBy(details.map(row => row.optOutStatus)),
    configuredWithoutVerifiedOptOutEvidence: details.filter(row => row.optOutConfigured && row.optOutStatus === null).length,
    optOutLimitationCounts: countBy(details.flatMap(row => row.optOutLimitations)),
    details,
  };
}

async function main() {
  if(process.argv[2]==="--input"){
    if(!process.argv[3])throw new Error("Pass a local cohort JSON file after --input.");
    const rows=JSON.parse(await readFile(process.argv[3],"utf8"));
    if(!Array.isArray(rows))throw new Error("Local cohort must be an array.");
    console.log(JSON.stringify(summarizeCaliforniaCapture(rows),null,2));return;
  }
  const requested = Number(process.argv[2] ?? "100");
  if (!Number.isInteger(requested) || requested < 1 || requested > 300) throw new Error("Pass a cohort size from 1 to 300.");
  const sql = `with cohort as (
    select s.id, d.hostname, s.created_at, s.status, ss.report_projection_status,
      (s.scan_config_json #>> '{execution,v2DagLambda,saleSharingOptOutEnabled}') = 'true' as opt_out_configured,
      case when ss.consent_control_assessment #> '{californiaPrivacyReview}' is not null then jsonb_build_object(
        'contractVersion', ss.consent_control_assessment #>> '{californiaPrivacyReview,contractVersion}',
        'reviewCoverage', jsonb_build_object(
          'scoreReady', ss.consent_control_assessment #> '{californiaPrivacyReview,reviewCoverage,scoreReady}',
          'families', (select coalesce(jsonb_agg(jsonb_build_object('id', family->'id', 'status', family->'status')), '[]'::jsonb)
            from jsonb_array_elements(coalesce(ss.consent_control_assessment #> '{californiaPrivacyReview,reviewCoverage,families}', '[]'::jsonb)) family)
        ),
        'choiceSurface', ss.consent_control_assessment #>> '{californiaPrivacyReview,choiceSurface}',
        'controlCount', jsonb_array_length(coalesce(ss.consent_control_assessment #> '{californiaPrivacyReview,controls}', '[]'::jsonb)),
        'optOutObservation', ss.consent_control_assessment #> '{californiaPrivacyReview,optOutObservation}',
        'optOutEffectiveness', ss.consent_control_assessment #>> '{californiaPrivacyReview,optOutEffectiveness}',
        'optOutStatus', ss.consent_control_assessment #>> '{californiaPrivacyReview,optOutObservation,evidence,status}',
        'optOutLimitations', coalesce(ss.consent_control_assessment #> '{californiaPrivacyReview,optOutObservation,evidence,limitations}', '[]'::jsonb),
        'inspection', jsonb_build_object(
          'contractVersion', ss.consent_control_assessment #>> '{californiaPrivacyReview,inspection,contractVersion}',
          'coverage', ss.consent_control_assessment #>> '{californiaPrivacyReview,inspection,coverage}',
          'namedChoiceCandidateCount', ss.consent_control_assessment #> '{californiaPrivacyReview,inspection,namedChoiceCandidateCount}',
          'namedFrameChoiceCandidateCount', ss.consent_control_assessment #> '{californiaPrivacyReview,inspection,namedFrameChoiceCandidateCount}',
          'frameCount', ss.consent_control_assessment #> '{californiaPrivacyReview,inspection,frameCount}',
          'inspectedSameOriginFrameCount', ss.consent_control_assessment #> '{californiaPrivacyReview,inspection,inspectedSameOriginFrameCount}',
          'uninspectedFrameCount', ss.consent_control_assessment #> '{californiaPrivacyReview,inspection,uninspectedFrameCount}',
          'hiddenUninspectedFrameCount', ss.consent_control_assessment #> '{californiaPrivacyReview,inspection,hiddenUninspectedFrameCount}',
          'inaccessibleFrameCount', ss.consent_control_assessment #> '{californiaPrivacyReview,inspection,inaccessibleFrameCount}',
          'unreadyFrameCount', ss.consent_control_assessment #> '{californiaPrivacyReview,inspection,unreadyFrameCount}',
          'unprojectableFrameCount', ss.consent_control_assessment #> '{californiaPrivacyReview,inspection,unprojectableFrameCount}',
          'frameBudgetLimitedCount', ss.consent_control_assessment #> '{californiaPrivacyReview,inspection,frameBudgetLimitedCount}',
          'frameInspectionWorkMs', ss.consent_control_assessment #> '{californiaPrivacyReview,inspection,frameInspectionWorkMs}',
          'frameProofWorkMs', ss.consent_control_assessment #> '{californiaPrivacyReview,inspection,frameProofWorkMs}'
        )
      ) else null end as california,
      case when ss.report_projection_payload #> '{runtimeArtifacts,privacyAuditEvidence}' is not null then jsonb_build_object(
        'candidateCount', jsonb_array_length(coalesce(ss.report_projection_payload #> '{runtimeArtifacts,privacyAuditEvidence,controlCandidates}', '[]'::jsonb))
      ) else null end as workpaper
    from public.scans s
    join public.domains d on d.id = s.domain_id
    left join public.scan_snapshots ss on ss.scan_id = s.id
    where s.created_at >= now() - interval '14 days'
      and s.scan_config_json->>'source' = 'sdk'
      and s.scan_config_json#>>'{execution,v2DagLambda,awsRegion}' = 'us-west-1'
    order by s.created_at desc limit ${requested}
  )
  select coalesce(jsonb_agg(jsonb_build_object('scanId', id, 'hostname', hostname,
    'createdAt', created_at, 'scanStatus', status, 'reportStatus', report_projection_status,
    'optOutConfigured', opt_out_configured,
    'california', california, 'workpaper', workpaper) order by created_at desc), '[]'::jsonb)
  from cohort;`;
  const result = await prodDb.runProdDbSqlOneoff({marker: "CA_CAPTURE_COHORT", readOnly: true, sql});
  const rows = prodDb.parseSingleJsonOutput<CohortRow[]>(result);
  console.log(JSON.stringify({generatedAt: new Date().toISOString(), region: "us-west-1", source: "sdk",
    warning: "Operational funnel only. Human evidence labels are required for precision or recall.",
    ...summarizeCaliforniaCapture(rows)}, null, 2));
}

if (process.argv[1]?.endsWith("audit-california-capture-cohort.ts")) {
  void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
