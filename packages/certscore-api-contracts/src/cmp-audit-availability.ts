import {z} from "zod";

export const cmpAuditAvailabilityReasonSchema=z.enum([
  "assessment_missing","assessment_invalid","scan_mismatch","scan_no_go",
  "document_unverified","visit_unusable","coverage_unavailable",
]);
export const cmpAuditRecordedLimitationSchema=z.enum([
  "blank_or_unusable_page","loading_or_stalled","navigation_transport_failure","navigation_error",
  "consent_session_access_limited","access_denied_or_forbidden_page","captcha_or_challenge",
  "document_identity_mismatch","document_identity_unverified","geometry_document_mismatch",
  "geometry_capture_incomplete","consent_surface_inspection_document_still_loading",
]);
type Reason=z.infer<typeof cmpAuditAvailabilityReasonSchema>;
type Recorded=z.infer<typeof cmpAuditRecordedLimitationSchema>;
const observations:Record<Reason,string>={
  assessment_missing:"A retained consent-control assessment was unavailable.",
  assessment_invalid:"The retained consent-control assessment could not be validated.",
  scan_mismatch:"The retained consent-control assessment did not match this scan.",
  scan_no_go:"The consent-control assessment did not retain a usable visit.",
  document_unverified:"Consent-control evidence could not be bound to this visit's document.",
  visit_unusable:"The consent-control visit was not usable for detailed checks.",
  coverage_unavailable:"Detailed consent-control checks were unavailable for this visit.",
};
const limitations:Record<Recorded,string>={
  blank_or_unusable_page:"Blank or unusable page evidence was recorded.",
  loading_or_stalled:"Loading or stalled page evidence was recorded.",
  navigation_transport_failure:"A navigation or transport failure was recorded.",
  navigation_error:"A navigation error was recorded.",
  consent_session_access_limited:"Consent-session access was limited.",
  access_denied_or_forbidden_page:"Access-denied page evidence was recorded.",
  captcha_or_challenge:"Challenge-page evidence was recorded.",
  document_identity_mismatch:"Document identities did not match.",
  document_identity_unverified:"Document identity was not verified.",
  geometry_document_mismatch:"Geometry belonged to a different document.",
  geometry_capture_incomplete:"Geometry capture was incomplete.",
  consent_surface_inspection_document_still_loading:"The inspected consent document was still loading.",
};
/** Shared fixed wording. Recorded limitations describe the assessment; they do
 * not establish an underlying browser cause or a defect in the identified CMP. */
export function cmpAuditAvailabilityWording(reason:Reason,codes:readonly Recorded[]) {
  const whatToCheck=reason==="assessment_missing" || reason==="assessment_invalid"
    ? "Trace the retained consent assessment through materialization and persisted report hydration. Validate its schema, scan ID and source references. Provider detection cannot replace control evidence."
    : reason==="scan_mismatch" || reason==="document_unverified"
      ? "Check that DOM, geometry and control observations refer to the same original consent document and loader. Inspect redirect or replacement-document timing. Keep independent runtime and consent visits separate."
      : reason==="scan_no_go" || reason==="visit_unusable"
        ? "Inspect the consent visit's retained access outcome, navigation and screenshot diagnostics. Reproduce the recorded failure locally and correct a verified capture or lifecycle issue within the existing budget."
        : "Inspect retained inspection channels and incompleteness codes. Keep unsupported and missing checks unknown. Identifying a CMP does not verify its controls or settings.";
  return {observation:observations[reason],recordedLimitations:codes.map(code=>limitations[code]).join(" "),whatToCheck,
    retest:"After correcting a verified issue, repeat the same URL and region in a fresh visit. Verify usable, document-bound consent evidence and the retained criterion results. GPC readiness and paired settings require their own proof."};
}
export const cmpAuditAvailabilitySchema=z.object({
  contractVersion:z.literal("certscore.cmp-audit-availability.v1"),
  reason:cmpAuditAvailabilityReasonSchema,
  // Preserve the assessment's existing reference; this is not a worker-byte receipt.
  sourceAssessmentHash:z.string().regex(/^fnv1a-[a-f0-9]{8}$/).nullable(),
  reasonCodes:z.array(cmpAuditRecordedLimitationSchema).max(8),
  observation:z.string().min(1).max(240),recordedLimitations:z.string().max(600),
  whatToCheck:z.string().min(1).max(600),retest:z.string().min(1).max(400),
  scoreEffect:z.literal("none"),findingEffect:z.literal("none"),
}).strict().superRefine((packet,ctx)=>{
  const wording=cmpAuditAvailabilityWording(packet.reason,packet.reasonCodes);
  if(new Set(packet.reasonCodes).size!==packet.reasonCodes.length ||
    (!packet.sourceAssessmentHash && packet.reasonCodes.length>0) ||
    (["assessment_missing","assessment_invalid","scan_mismatch"].includes(packet.reason) && (packet.sourceAssessmentHash!==null || packet.reasonCodes.length>0)) ||
    (Object.keys(wording) as Array<keyof typeof wording>).some(key=>packet[key]!==wording[key]))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"CMP availability requires bounded, source-scoped facts and shared wording."});
});
export type CmpAuditAvailability=z.infer<typeof cmpAuditAvailabilitySchema>;
export function describeCmpAuditAvailability(packet:CmpAuditAvailability) {
  return [packet.observation,packet.recordedLimitations,`What to check: ${packet.whatToCheck}`,`Retest: ${packet.retest}`].filter(Boolean).join(" ");
}
