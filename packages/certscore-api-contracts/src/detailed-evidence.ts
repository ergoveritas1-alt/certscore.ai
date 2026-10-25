import { z } from "zod";

const text = z.string().max(4000);
const ref = z.string().max(2048);
const count = z.number().int().nonnegative();
export const detailedEvidenceCountsSchema = z.object({
  checks: count, review: count, limited: count, observed: count, unsupported: count,
}).strict();
export const detailedEvidenceRowSchema = z.object({
  id: ref, title: text, summary: text.nullable(), status: z.string().max(80), displayStatus: z.string().max(80),
  description: text.optional(),
  afterRejectObservations: z.array(z.object({entity:text.nullable(),vendor:text.nullable(),kind:z.enum(["cookie_snapshot","service_request"]),
    name:ref,hostname:ref.nullable(),purpose:z.string().max(80),msAfterClick:count,evidenceRef:ref}).strict()).max(288).optional(),
  // Retained checklist references can include policy excerpt text. Keep these
  // intact; the page serializer chunks long strings without shortening them.
  correctionSteps: z.array(text).max(30), evidenceRefs: z.array(z.string().max(8192)).max(200),
  evidenceTarget: ref,
  source: z.object({ field: ref, rowId: ref }).strict(),
  sharedEvidence: z.object({ targetId: ref, label: text, showLink: z.boolean().optional() }).strict().optional(),
}).strict();
export const detailedEvidenceSectionSchema = z.object({
  id: z.enum(["cmp", "consent", "tracking", "policy", "runtime", "transport", "accessibility", "cms", "gpc", "privacy"]),
  title: text, recap: text, displayStatus: z.enum(["Review", "Limited"]).nullable(),
  counts: detailedEvidenceCountsSchema, rows: z.array(detailedEvidenceRowSchema).max(200),
}).strict();
export const detailedEvidenceReportSchema = z.object({
  version: z.literal("certscore.detailed-evidence.v1"), scanId: z.string(),
  sections: z.array(detailedEvidenceSectionSchema).max(10),
  interpretation: z.string(),
}).strict();

export const consentControlMeasurementSchema = z.object({
  candidateId: z.string().max(160), bounds: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  fillContrast: z.number().min(1).max(21), outerEmphasisFraction: z.number().min(0).max(1),
  backgroundUniformity: z.number().min(0).max(1), interiorUniformity: z.number().min(0).max(1),
}).strict();
const observedCookieExpirySchema = z.object({ visit: z.enum(["Accept", "Reject", "Before choice"]), domain: z.string().min(1).max(255).optional(), path: z.string().min(1).max(1024).optional(), name: z.string().min(1).max(160),
          capturedAtEpochSeconds: z.number().finite().positive(), expiresAtEpochSeconds: z.number().finite().positive(), remainingSeconds: z.number().finite().nonnegative(),
        }).strict().refine(row => row.expiresAtEpochSeconds >= row.capturedAtEpochSeconds && Math.abs(row.remainingSeconds - (row.expiresAtEpochSeconds - row.capturedAtEpochSeconds)) <= 0.000001,
          "Remaining time must match the retained capture and expiry timestamps.");

export const publicCmpAuditSchema = z.object({
  version: z.enum(["cmp_audit_report.v1", "cmp_audit_report.v2", "cmp_audit_report.v3"]), scanId: z.string(), scope: z.literal("starting_page"),
  assessmentSourceHash: z.string().nullable(),
  // Presentation only. Rows, counts, findings and scores remain authoritative.
  experience: z.object({
    version: z.literal("cmp_details_experience.v1"),
    mode: z.enum(["cmp_details", "consent_controls", "consent_signals", "capture_limited"]),
    title: text, summary: text, provider: z.string().max(120).nullable(),
    controls: z.object({ accept: z.enum(["observed", "not_observed"]), reject: z.enum(["observed", "not_observed"]),
      options: z.enum(["observed", "not_observed"]) }).strict().nullable(),
    defaultCriterionIds: z.array(z.enum(["banner", "reject", "prominence", "categories", "services", "privacy_link", "privacy_access", "consent_record", "implementation", "duration", "declared_not_found", "found_not_declared", "cookie_information"])).max(13)
      .refine(ids => new Set(ids).size === ids.length, "Default criteria must be unique"),
  }).strict().optional(),
  limitationGroups: z.array(z.object({ id: z.enum(["preferences", "actions", "visual"]), code: ref, title: text,
    criterionIds: z.array(z.enum(["banner", "reject", "prominence", "categories", "services", "privacy_link", "privacy_access", "consent_record", "implementation", "duration", "declared_not_found", "found_not_declared", "cookie_information"])).min(1).max(13) }).strict()).max(3).optional(),
  inspectionSupport: z.object({ state: z.enum(["supported", "partial", "unsupported", "unknown"]),
    provider: z.string().max(120).nullable(), recipeVersion: z.string().max(100).nullable(), reason: z.string().max(240) }).strict().optional(),
  rows: z.array(z.object({
    id: z.enum(["banner", "reject", "prominence", "categories", "services", "privacy_link", "privacy_access", "consent_record", "implementation", "duration", "declared_not_found", "found_not_declared", "cookie_information"]), label: text, status: z.enum(["Observed", "Not observed", "Review recommended", "Not assessed", "Partially assessed", "Feature not supported", "Informational", "Incomplete", "Not applicable"]),
    limitation: z.object({ group: z.enum(["preferences", "actions", "visual"]), code: ref }).strict().optional(),
    detail: text.optional(), sourceIds: z.array(ref).max(30), evidenceAnchor: ref.optional(),
    supportingEvidence: z.object({
      prominence: z.object({ accept: consentControlMeasurementSchema, reject: consentControlMeasurementSchema, captureSkewMs: count }).strict().optional(),
      requests: z.array(z.object({ hostname: ref, path: ref.refine(value => !/[?#]/.test(value), "Request evidence must omit query and fragment values"), vendor: text, category: text, msAfterReject: count }).strict()).max(100).optional(),
      inventory: z.object({
  consentStorage: z.array(z.object({ visit: z.enum(["Accept", "Reject"]), name: z.string().min(1).max(160), change: z.enum(["stored", "updated"]) }).strict()).max(8).optional(),
  choiceActivity: z.array(z.object({ action: z.enum(["accept", "reject"]), windowMs: z.number().int().nonnegative().max(30000), requestCount: z.number().int().nonnegative(), nonEssentialRequestCount: z.number().int().nonnegative(),
    requests: z.array(z.object({ hostname: z.string().max(255), path: z.string().max(2048).refine(value => !/[?#]/.test(value), "Request paths omit query and fragment"), vendor: z.string().max(160), purpose: z.string().max(100), msAfterClick: z.number().int().nonnegative(), nonEssential: z.boolean() }).strict()).max(100),
  }).strict().refine(value => value.requests.length <= value.requestCount && value.nonEssentialRequestCount <= value.requestCount && value.requests.filter(row => row.nonEssential).length <= value.nonEssentialRequestCount, "Activity counts must agree with retained requests")).max(2).refine(values => new Set(values.map(value => value.action)).size === values.length, "One activity window per action").optional(),

        expiries: z.array(observedCookieExpirySchema).max(4).optional(),
        privacyChoices: z.array(z.object({label:z.string().min(1).max(240),enabled:z.boolean(),checked:z.boolean().nullable()}).strict()).min(1).max(100).optional(),
        categories: z.array(z.object({ name: z.string().min(1).max(240), checked: z.boolean().nullable() }).strict()).max(100).optional(),
        services: z.array(z.object({ name: z.string().min(1).max(240), source: z.enum(["cmp_api_inventory", "labelled_control", "cmp_named_disclosure", "cmp_visible_inventory", "cmp_loaded_inventory"]), sourceRef: z.string().max(120).optional() }).strict()).max(100).optional(),
        serviceDisclosures: z.array(z.object({ version: z.literal("cmp_named_partner_disclosure.v1"), excerpt: z.string().min(1).max(600), names: z.array(z.string().min(1).max(80)).min(1).max(20) }).strict()).max(1).optional(),
        declarations: z.array(z.object({ name: z.string().min(1).max(160), purpose: z.string().max(240), duration: z.string().max(240), source: z.enum(["cmp_visible_inventory", "cmp_api_inventory", "cmp_loaded_inventory"]), inferredPurpose: z.object({ category: z.string().min(1).max(80), basis: z.literal("canonical_cookie_registry.v1") }).strict().optional(), observedExpiry: observedCookieExpirySchema.optional() }).strict().refine(row => !row.observedExpiry || (row.observedExpiry.name === row.name && row.observedExpiry.visit === "Accept"), "Observed expiry requires an exact cookie-name and capture match")).max(100).optional(),
        cookies: z.array(z.object({ name: z.string().min(1).max(160), matchedPattern: z.string().min(1).max(160).nullable(), observedIn: z.array(z.enum(["before_choice", "after_accept"])).min(1).max(2),
          possibleTemplateMatch: z.object({ pattern: z.string().min(1).max(160), basis: z.literal("ga4_placeholder.v1") }).strict().optional(), observedExpiry: observedCookieExpirySchema.optional(),
        }).strict().refine(row => (!row.possibleTemplateMatch || row.matchedPattern === null) && (!row.observedExpiry || (row.observedExpiry.name === row.name && row.observedExpiry.visit === "Accept" && row.observedIn.includes("after_accept"))), "Cookie details require consistent match and capture provenance")).max(100).optional(),
      }).strict().optional(),
      cookieComparison: z.object({ declarationPatternCount: count, observedCookieNameCount: count, unmatchedNameCount: count, possibleTemplateNameCount: count.optional(), omittedAfterAcceptCookieCount: z.number().int().positive().optional(),
        unmatchedNames: z.array(z.string().max(160)).max(100), unnamedCookieRefs: z.array(z.string().min(1).max(240)).max(100).optional(), allUnmatchedOnlyAfterAccept: z.boolean(), declarationInventoryComplete: z.boolean().optional() }).strict().optional(),
    }).strict().optional(),
  }).strict()).length(13),
}).strict().superRefine((audit, context) => {
  for (const row of audit.rows) {
    const inventory = row.supportingEvidence?.inventory;
    const comparison = row.supportingEvidence?.cookieComparison;
    if (comparison && (comparison.possibleTemplateNameCount ?? 0) > comparison.unmatchedNameCount)
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Possible template candidates are a subset of unverified matches." });
    if (inventory?.privacyChoices && (row.id !== "categories" || row.status !== "Partially assessed"))
      context.addIssue({code:z.ZodIssueCode.custom,message:"Linked privacy choices retain their separate partial scope."});
    if ((inventory?.consentStorage && row.id !== "consent_record") || (inventory?.choiceActivity && row.id !== "implementation") ||
      (audit.version !== "cmp_audit_report.v3" && (comparison?.possibleTemplateNameCount !== undefined || comparison?.omittedAfterAcceptCookieCount !== undefined || inventory?.consentStorage || inventory?.choiceActivity || inventory?.declarations?.some(item => item.inferredPurpose || item.observedExpiry) || inventory?.cookies?.some(item => item.possibleTemplateMatch || item.observedExpiry))))
      context.addIssue({ code: z.ZodIssueCode.custom, message: "After-click facts and inferred purpose require their v3 criteria." });
    if ((row.status === "Incomplete") !== Boolean(row.limitation)) context.addIssue({ code: z.ZodIssueCode.custom, message: "Incomplete criteria require a specific limitation; other statuses must not carry one." });
    if (row.supportingEvidence?.inventory?.expiries?.some(item => item.visit === "Before choice" && (!item.domain || !item.path?.startsWith("/"))))
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Baseline expiry requires retained cookie identity." });
  }
  for (const row of audit.rows) if (row.supportingEvidence?.cookieComparison?.declarationInventoryComplete === false && row.status !== "Partially assessed")
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Partial declaration comparison must remain partially assessed." });
  if (audit.version === "cmp_audit_report.v1" && (audit.limitationGroups?.length || audit.rows.some(row => row.limitation || ["Incomplete", "Not applicable"].includes(row.status) || row.supportingEvidence?.cookieComparison?.declarationInventoryComplete !== undefined || row.supportingEvidence?.inventory?.expiries?.some(item => item.visit === "Before choice"))))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Narrowed CMP presentation requires report v2." });
  for (const group of audit.limitationGroups ?? []) if (group.criterionIds.some(id => !audit.rows.some(row => row.id === id && row.status === "Incomplete" && row.limitation?.group === group.id)))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Limitation groups must reference matching incomplete criteria." });
  if (new Set(audit.limitationGroups?.map(group => group.id)).size !== (audit.limitationGroups?.length ?? 0) ||
    audit.limitationGroups?.some(group => new Set(group.criterionIds).size !== group.criterionIds.length))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Limitation groups and their criteria must be unique." });
  if (new Set(audit.rows.map(row => row.id)).size !== 13) context.addIssue({ code: z.ZodIssueCode.custom, message: "CMP criteria must be unique." });
});

const publicTechnologyInventorySchema = z.object({
  ruleset: z.literal("certscore.technology-rules.v1"), documentUrl: z.string().url(), truncated: z.boolean(),
  detections: z.array(z.object({
    id: z.string().max(40), name: z.string().max(80),
    category: z.enum(["cms", "commerce", "framework", "server", "runtime", "cdn"]),
    scope: z.enum(["page_platform", "page_component", "external_asset", "delivery"]),
    confidence: z.enum(["high", "tentative"]), version: z.string().max(40).nullable(),
    versionStatus: z.enum(["declared", "not_detected", "conflicting"]), observedVersions: z.array(z.string().max(40)).max(8),
    ruleIds: z.array(z.string().max(80)).max(8), evidenceRefs: z.array(z.string().max(80)).max(16),
  }).strict()).max(18),
  signals: z.array(z.object({
    kind: z.enum(["generator", "asset", "marker", "header"]), value: z.string().max(256),
    evidenceRef: z.string().max(80), sourceRef: z.string().max(256), sourceUrl: z.string().url().max(512),
  }).strict()).max(16),
}).strict();
export const publicCmsSecuritySchema = z.object({
  version: z.literal("certscore.cms-report.v1"), scanId: z.string(),
  assessmentContractVersion: z.string(), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  capturedAt: z.string(), documentUrl: z.string().url(), evidenceRef: ref,
  catalogueVersion: z.string(), catalogueReviewedAt: z.string(),
  detections: z.array(z.object({
    evidenceRef: ref, product: z.string(), name: text, version: z.string().nullable(),
    versionLabel: text, versionStatus: z.string(), versionBasis: z.string(), confidence: z.string(),
    observedVersions: z.array(z.string()).max(30), informationalOnly: z.boolean(), evidenceRefs: z.array(ref).max(30),
    branchVersion: z.string().optional(), versionGranularity: z.string().optional(), runtimeVersionConfirmed: z.literal(false),
  }).strict()).max(22),
  advisories: z.array(z.object({
    evidenceRef: ref, detectionRef: ref, observedVersion: z.string(), confidence: z.string(),
    advisoryId: z.string(), kind: z.enum(["lifecycle", "vulnerability"]), title: text, sourceUrl: z.string().url(),
    qualification: text, severity: z.enum(["medium", "high"]),
    fixedVersions: z.array(z.string()).max(30), matchedRange: text,
  }).strict()).max(100),
  plugins: z.array(z.object({
    evidenceRef: ref, id: z.string(), name: text, version: z.string().nullable(),
    observedVersions: z.array(z.string()).max(8), versionStatus: z.string(), evidenceRefs: z.array(ref).max(30),
  }).strict()).max(22),
  identification: z.array(z.object({ evidenceRef: ref, kind: z.string(), value: z.string().max(512), sourceUrl: z.string().url(), artifactRef: ref }).strict()).max(22),
  technologyInventory: publicTechnologyInventorySchema.optional(),
}).strict();

export type DetailedEvidenceCounts = z.infer<typeof detailedEvidenceCountsSchema>;
export type DetailedEvidenceRow = z.infer<typeof detailedEvidenceRowSchema>;
export type DetailedEvidenceSection = z.infer<typeof detailedEvidenceSectionSchema>;
export type DetailedEvidenceReport = z.infer<typeof detailedEvidenceReportSchema>;
export type PublicCmpAudit = z.infer<typeof publicCmpAuditSchema>;
export type PublicCmsSecurity = z.infer<typeof publicCmsSecuritySchema>;
