import { saleSharingOptOutEvidenceSchema, saleSharingOptOutLaneOutcomeSchema } from "../../packages/certscore-contracts/src/sale-sharing-opt-out";

export const OPT_OUT_FUNNEL_STAGES = ["eligible","dispatched","usable_document","recipe_selected","control_actionable","submitted","confirmed","observation_completed","evidence_persisted","finding_persisted"] as const;
type Stage = typeof OPT_OUT_FUNNEL_STAGES[number];
type State = "observed" | "not_reached" | "unknown" | "not_applicable";
export type OptOutFunnelInput = {
  scanId:string;
  configured?:boolean|null;
  eligible?:boolean|null;
  evidence?:unknown;
  evidenceVerified?:boolean;
  laneOutcome?:unknown;
  /** Only IDs from an independently retained canonical report projection. */
  findingIds?:string[]|null;
};
const record=(v:unknown):Record<string,unknown>=>v && typeof v==="object" && !Array.isArray(v)?v as Record<string,unknown>:{};

/** Internal operational coverage only. Never creates findings or repairs proof. */
export function optOutFunnelRow(input:OptOutFunnelInput) {
  const parsed=saleSharingOptOutEvidenceSchema.safeParse(input.evidence);
  const packet=parsed.success && parsed.data.scanId===input.scanId && input.evidenceVerified===true?parsed.data:null;
  const parsedLane=saleSharingOptOutLaneOutcomeSchema.safeParse(input.laneOutcome);
  const lane=parsedLane.success?record(parsedLane.data):{};
  const laneRetained=parsedLane.success;
  const attempted=Boolean(packet)||laneRetained;
  const marks=new Map(packet?.executionDiagnostics?.milestones.map(m=>[m.stage,m.elapsedMs])??[]);
  const progress=packet?.executionDiagnostics?.milestones.at(-1)?.stage;
  const stages=Object.fromEntries(OPT_OUT_FUNNEL_STAGES.map(stage=>[stage,"unknown"])) as Record<Stage,State>;
  stages.eligible=input.eligible===true||attempted?"observed":input.eligible===false?"not_applicable":"unknown";
  stages.dispatched=attempted?"observed":input.eligible===false?"not_applicable":"unknown";
  if(packet){
    const submitted=packet.submitted;
    stages.usable_document=marks.has("usable_document")||Boolean(packet.documentToken)?"observed":packet.executionDiagnostics?"not_reached":"unknown";
    stages.recipe_selected=Boolean(packet.provider&&packet.recipeVersion)?"observed":"not_reached";
    stages.control_actionable=marks.has("control_actionable")||submitted?"observed":packet.executionDiagnostics||stages.recipe_selected==="not_reached"?"not_reached":"unknown";
    stages.submitted=submitted?"observed":"not_reached";
    stages.confirmed=packet.registration==="confirmed"?"observed":"not_reached";
    stages.observation_completed=packet.status==="complete"&&packet.captureComplete?"observed":"not_reached";
    stages.evidence_persisted="observed"; // Includes verified limited/unsupported packets.
  }
  if(input.findingIds)stages.finding_persisted=input.findingIds.includes("california_sale_sharing_opt_out_activity")?"observed":"not_reached";
  const reasons=packet?.limitations??(typeof lane.limitationCode==="string"?[lane.limitationCode]:[]);
  const invalid=input.evidence!==undefined && input.evidence!==null && !packet;
  const outcome=invalid?"unverified_or_invalid_packet":packet?.status==="complete"?(packet.requests.length?"complete_with_activity":"complete_without_observed_activity"):
    reasons[0]??(packet?`${packet.status}_without_reason`:laneRetained?"worker_limited_without_packet":input.configured===true?"configured_without_dispatch_proof":"no_dispatch_proof");
  return {scanId:input.scanId,configured:input.configured??null,stages,outcome,
    provider:packet?.provider??null,recipeVersion:packet?.recipeVersion??null,
    lastCheckpoint:progress??null,milestones:packet?.executionDiagnostics?.milestones??[],
    decisionReads:packet?.executionDiagnostics?.decisionReads??[],limitations:reasons,
    navigation:packet?.executionDiagnostics?.navigation??null,
    diagnostic:packet?.executionDiagnostic??lane.diagnostic??null,
    durationMs:packet?Date.parse(packet.completedAt)-Date.parse(packet.startedAt):null};
}

export function summarizeOptOutFunnel(inputs:OptOutFunnelInput[]) {
  const rows=inputs.map(optOutFunnelRow);
  const counts=(values:string[])=>Object.fromEntries([...new Set(values)].sort().map(v=>[v,values.filter(x=>x===v).length]));
  return {scans:rows.length,stages:Object.fromEntries(OPT_OUT_FUNNEL_STAGES.map(stage=>[stage,
    counts(rows.map(row=>row.stages[stage]))])) as Record<Stage,Partial<Record<State,number>>>,outcomes:counts(rows.map(r=>r.outcome)),
    providers:counts(rows.map(r=>r.provider??"unknown")),recipes:counts(rows.map(r=>r.recipeVersion??"unknown")),
    limitations:counts(rows.flatMap(r=>r.limitations)),rows};
}
