import { californiaPrivacyReviewSchema, gpcResponseAssessmentSchema, gpcGuidanceSchema } from "@certscore/contracts";
import type { ShadowReportData } from "../../components/scans/report-lab/shadow-report-data";
import { sanitizePublicReportEvidenceText } from "./compact-evidence-json";

export type PrivacyChoiceExperienceInput = Pick<ShadowReportData, "scan" | "gpcResponse" | "californiaOptOutPresence" | "californiaPrivacyReview">;
const clean = (s: string) => sanitizePublicReportEvidenceText(s).replace(/[\r\n\t]+/g, " ").trim();
const safeId = (s: string) => /^[A-Za-z0-9_.:-]{1,160}$/.test(s) ? s : "unavailable";
const recipientLabel = (s: string) => /^[A-Za-z][A-Za-z0-9 .,&()'-]{0,99}$/.test(s) ? s : "Retained recipient";
function publicTarget(value: string) {
  try { const u = new URL(value); if (!["http:", "https:"].includes(u.protocol)) return "See the original scan target in this report";
    const omitted = Boolean(u.search || u.hash || u.username || u.password);
    u.username = u.password = u.search = u.hash = "";
    return `${clean(u.href)}${omitted ? " (credentials, query and fragment omitted; use the original scan target when reproducing)" : ""}`;
  } catch { return "See the original scan target in this report"; }
}

/** Presentation of canonical report projections only. No finding, policy or score is created here. */
export function buildPrivacyChoiceExperience(input: PrivacyChoiceExperienceInput) {
  const parsed = gpcResponseAssessmentSchema.safeParse(input.gpcResponse?.assessment);
  const assessment = parsed.success && parsed.data.contractVersion === "certscore.gpc-response-assessment.v3" &&
    parsed.data.observation.scanId === input.scan.id && parsed.data.observation.sourceSha256 &&
    parsed.data.observation.sourceSha256 === parsed.data.comparison.gpcArtifact?.sha256 &&
    parsed.data.observation.sessionSha256 && parsed.data.observation.documentUrlSha256 ? parsed.data : undefined;
  const o = assessment?.observation;
  const delivered = Boolean(o && o.status !== "unavailable" && o.delivery.httpHeaderRetained && o.delivery.mainNavigatorReadbackRetained);
  const guidance = gpcGuidanceSchema.safeParse(assessment ? input.gpcResponse?.guidance : undefined);
  const issues = guidance.success ? guidance.data.items.filter(item => item.kind === "adverse") : [];
  const reviewParsed = californiaPrivacyReviewSchema.safeParse(input.californiaPrivacyReview);
  const review = reviewParsed.success && reviewParsed.data.scanId === input.scan.id && reviewParsed.data.documentUrl === input.scan.url ? reviewParsed.data : undefined;
  const action = review?.optOutObservation?.evidence;
  const choice = input.californiaOptOutPresence?.signal && input.californiaOptOutPresence.signal.scanId !== input.scan.id ? undefined : input.californiaOptOutPresence;
  const facts = [
    {label:"GPC delivery", value:delivered ? "Verified on this page" : "Not verified in this result",
      detail:delivered ? "Signal retained on the page request and in the browser." : "A missing or limited result is not an opt-out failure."},
    {label:"Site-recorded opt-out", value:o?.semanticProbe === "observed" ? `Sale: ${setting(o.registration.sale)} · Sharing: ${setting(o.registration.sharing)}` : "Not observable in this result",
      detail:o?.acknowledgment.observed ? "A visible GPC acknowledgment was also observed. Acknowledgment and enforcement are separate." : "A readable preference interface is optional evidence; it is not required to evaluate retained activity."},
    {label:"Opt-out method", value:choice?.state === "observed" ? "Method or instructions observed" : choice?.state === "not_observed" ? "Not observed in inspected evidence" : "Not determined",
      detail:choice?.state === "not_observed" ? clean(choice.absenceScope ?? "Only the retained inspection scope is assessed.") : "Finding a method does not establish that it was used or worked."},
    {label:"Explicit opt-out test", value:action?.status === "complete" && review?.optOutEffectiveness === "bounded_observation" ? "Choice recorded; bounded activity captured"
      : action?.registration === "confirmed" ? "Choice recorded; follow-up capture limited"
      : action?.submitted ? "Action submitted; choice unconfirmed"
      : action?.registration === "not_attempted" ? "Not attempted in the retained test" : "No verified action result",
      detail:action?.status === "complete" ? `${action.requests.length} advertising-classified responses retained during ${action.observationWindowMs} ms of observation; this is not proof of overall enforcement.`
        : "GPC delivery, a visible link and a cookie Reject click do not establish a completed sale/sharing opt-out."},
  ];
  const allowedIds = new Set(o?.requests.advertisingCollectionEvidenceIds ?? []);
  const recipients = delivered ? (o?.requests.advertisingCollectionRecipients?.rows ?? [])
    .filter(r => allowedIds.has(r.evidenceId) && safeId(r.evidenceId) !== "unavailable").map(r => ({
      label:recipientLabel(r.label), evidenceId:r.evidenceId, observedAtMs:r.observedAtMs,
      processing:o?.requests.advertisingCollectionQualification?.rows.find(q => q.evidenceId === r.evidenceId)?.processingSignals ?? [],
    })) : [];
  const activity = delivered && o ? (o.requests.advertisingCollectionCount ?? 0) > 0
    ? `${o.requests.advertisingCollectionCount} successful advertising collection request${o.requests.advertisingCollectionCount === 1 ? "" : "s"} retained with GPC enabled.`
    : o.requests.advertisingCollectionCount === 0 && o.status === "complete" && o.requests.complete ? "No successful advertising collection was identified in the retained GPC sample."
    : "The retained GPC capture is limited; absence of collection is not established."
    : "No verified GPC activity result is available.";
  const coverage = o ? `GPC capture: ${o.status}; request coverage: ${o.requests.complete ? "complete within the retained scope" : "limited"}${o.requests.throughMs == null ? "" : `; retained through +${o.requests.throughMs} ms from visit start`}.`
    : "GPC coverage was not verified in this result.";
  const nextSteps = issues.length ? issues.map(item => ({title:item.observation,owner:item.responsibleRole,steps:item.whatToCheck,evidence:item.evidence,retest:item.retest})) : [{
    title:"Review the retained activity and coverage",owner:"Developer + privacy owner",
    steps:["Review the retained activity and its purpose before deciding whether a change is needed."],
    evidence:[],retest:"Use fresh sessions on the same target and region. Compare equal observation windows, verify GPC delivery and inspect recipient activity. Record explicit opt-out interaction, choice confirmation and post-choice activity separately. No observed activity in a bounded sample does not establish overall enforcement.",
  }];
  const optOutRetest = action?.status === "complete"
    ? "Reproduce the explicit sale/sharing choice in a fresh session. Record the control used, before/after settings and confirmation. Inspect the retained recipients below and their request purpose; trace unexpected activity to its initiating integration and review its effective privacy settings. Retest the same path and interval after any verified correction."
    : "A completed explicit sale/sharing test is not established. In a fresh test session, locate the site's method, record the control or instructions used, whether submission completes, and the confirmed choice. Inspect subsequent activity separately. If a step fails, fix that specific control or integration and repeat the same path; do not infer a defect from missing capture alone.";
  const title = issues.length ? "Review the verified GPC findings" : "GPC and opt-out: what was observed";
  const lines = ["CertScore.ai — developer fix and retest package",`Scan: ${safeId(input.scan.id)}`,`Target: ${publicTarget(input.scan.url)}`,
    `Scan region: ${clean(input.scan.origin || "Not retained")}`,`Scan date: ${clean(input.scan.createdAtIso ?? input.scan.createdAt)}`,
    "", "OBSERVED RESULTS",...facts.map(f=>`${f.label}: ${f.value}. ${f.detail}`),activity,coverage,
    "", "RETAINED REQUEST REFERENCES",...recipients.map(r=>`${r.label} — ${r.evidenceId}${r.observedAtMs === undefined ? "" : `; +${r.observedAtMs} ms from GPC visit start`}${r.processing.length ? `; processing declarations: ${r.processing.join(", ")}` : ""}`),
    ...(recipients.length ? [] : ["No bound recipient-level collection references supplied in this result."]),
    "Open these request references in the report's GPC evidence. The initiating tag or code location is not established by this package; inspect the request's Initiator when reproducing.",
    "", issues.length ? "FIX INVESTIGATION — EXISTING VERIFIED FINDINGS" : "VERIFICATION FOLLOW-UP — NOT A NEW FAILURE FINDING",
    ...nextSteps.flatMap((step,i)=>[`${i+1}. ${clean(step.title)}`,`Owner: ${clean(step.owner)}`,...step.evidence.map(e=>`Evidence: ${recipientLabel(e.recipient)} — ${safeId(e.evidenceId)}${e.observedAtMs === undefined ? "" : `; +${e.observedAtMs} ms from GPC visit start`}`),...step.steps.map((s,n)=>`  ${n+1}. ${clean(s)}`),`Retest: ${clean(step.retest)}`,""]),
    "EXPLICIT OPT-OUT — SEPARATE PATH", "Owner: developer + CMP/integration owner; privacy owner confirms intended scope.", optOutRetest,
    ...(action ? [`Retained action: ${action.registration}; ${action.actionCount} action(s); capture ${action.status}.`,
      ...action.requests.map(r => `${recipientLabel(r.vendor)} — ${r.hostname}; HTTP ${r.httpStatus}; +${r.msAfterConfirmation} ms after confirmation; ${r.collectionEvidence ? "collection endpoint evidence retained" : "classified response; collection not established"}.`)] : []),
    "Cookie Reject and GPC acknowledgment do not substitute for this explicit opt-out test.", "",
    "RETEST ACCEPTANCE", "Retain the same target, region, choice path and comparable observation windows. Confirm the intended configuration change and inspect the cited recipient requests and processing declarations. Record remaining activity and incomplete coverage; neither an acknowledgment nor an empty sample is a compliance verdict.",
    "This package contains report context and request references. Use the retained report for full evidence and coverage limits."];
  return {title,facts,activity,coverage,recipients,nextSteps,hasFindings:issues.length>0,packageText:lines.join("\n")};
}
function setting(value: string) { return value === "opted_out" ? "On" : value === "not_opted_out" ? "Off" : "Unknown"; }
