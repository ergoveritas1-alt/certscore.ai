import { z } from "zod";

export const CMP_PREFERENCE_POLICY_VERSION = "bounded_cmp_preferences.v1" as const;
export const CMP_PREFERENCE_BUDGET_MS = 17_000;
export const CMP_PREFERENCE_JOIN_MS = CMP_PREFERENCE_BUDGET_MS + 2_000;
/** Reserve two seconds for worker setup/retention within 56 GB-seconds.
 * Unknown deployed memory fails conservatively to the maximum Lambda size. */
export function cmpPreferenceBudgetMs(memoryMb: number = 3008): number {
  const memory = Number.isFinite(memoryMb) && memoryMb >= 512 && memoryMb <= 10240 ? memoryMb : 10240;
  return Math.min(CMP_PREFERENCE_BUDGET_MS, Math.floor(56_000 * 1024 / memory) - 2_000);
}
export const cmpAuditCriterionSchema = z.enum(["categories", "services", "privacy_access", "consent_record", "duration", "declared_not_found", "found_not_declared", "cookie_information"]);
export type ExtendedCmpCriterion = z.infer<typeof cmpAuditCriterionSchema> | "implementation";

/** Scanner integration coverage is independent of a CMP's product capabilities.
 * Registry recognition, a missing adapter, and an absent control cannot prove
 * that a product does not support a feature. */
export const cmpInspectionSupportSchema = z.object({
  state: z.enum(["supported", "partial", "unsupported", "unknown"]),
  provider: z.string().max(120).nullable(),
  recipeVersion: z.string().max(100).nullable(),
  reason: z.string().max(240),
});
export const cmpPreferenceDispatchSchema = z.object({
  policyVersion: z.literal(CMP_PREFERENCE_POLICY_VERSION),
  enabled: z.literal(true),
  scanId: z.string().min(1).max(160),
  exactTargetUrl: z.string().url().max(2000).refine(value => { const url = new URL(value); return !url.username && !url.password && (url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))); }, "Preference inspection requires HTTPS or a loopback fixture."),
});
export type CmpPreferenceDispatch = z.infer<typeof cmpPreferenceDispatchSchema>;

export const cmpCookieExpiryEvidenceSchema = z.object({
  visit: z.enum(["Accept", "Reject"]), name: z.string().min(1).max(160),
  capturedAtEpochSeconds: z.number().finite().positive(), expiresAtEpochSeconds: z.number().finite().positive(),
  remainingSeconds: z.number().finite().nonnegative(),
}).strict().refine(row => row.expiresAtEpochSeconds >= row.capturedAtEpochSeconds &&
  Math.abs(row.remainingSeconds - (row.expiresAtEpochSeconds - row.capturedAtEpochSeconds)) <= 0.000001,
  "Remaining time must match the retained capture and expiry timestamps.");

/** Bounded, display-safe facts; never cookie values or a control test verdict. */
export const cmpInventoryTablesSchema = z.object({
  expiries: z.array(cmpCookieExpiryEvidenceSchema).max(4).optional(),
  categories: z.array(z.object({ name: z.string().min(1).max(240), checked: z.boolean().nullable() }).strict()).max(100).optional(),
  services: z.array(z.object({ name: z.string().min(1).max(240), source: z.enum(["cmp_api_inventory", "labelled_control"]) }).strict()).max(100).optional(),
  declarations: z.array(z.object({ name: z.string().min(1).max(160), purpose: z.string().max(240), duration: z.string().max(240), source: z.enum(["cmp_visible_inventory", "cmp_api_inventory"]) }).strict()).max(100).optional(),
  cookies: z.array(z.object({ name: z.string().min(1).max(160), matchedPattern: z.string().min(1).max(160).nullable(), observedIn: z.array(z.enum(["before_choice", "after_accept"])).min(1).max(2) }).strict()).max(100).optional(),
}).strict();

export const cmpPreferencesEvidenceSchema = z.object({
  contractVersion: z.literal("certscore.cmp-preferences-evidence.v1"),
  policyVersion: z.literal(CMP_PREFERENCE_POLICY_VERSION),
  scanId: z.string().min(1).max(160),
  parentDispatchSha256: z.string().regex(/^[a-f0-9]{64}$/),
  targetUrl: z.string().url().max(2000),
  finalUrl: z.string().url().max(2000).nullable(),
  documentToken: z.string().max(160).nullable(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  status: z.enum(["completed", "limited", "unsupported", "failed"]),
  support: cmpInspectionSupportSchema,
  action: z.object({ count: z.number().int().min(0).max(1), intent: z.literal("options"), label: z.string().max(160).nullable(), opened: z.boolean() }),
  controls: z.array(z.object({ label: z.string().max(240), kind: z.enum(["category", "service", "unclassified"]), enabled: z.boolean(), checked: z.boolean().nullable() })).max(100),
  controlInventoryComplete: z.boolean(),
  privacyLinks: z.array(z.object({ url: z.string().url().max(2000), hitTargetBeforeAction: z.boolean() })).max(16),
  declarations: z.array(z.object({ name: z.string().min(1).max(160), purpose: z.string().max(240), duration: z.string().max(240), source: z.enum(["cmp_visible_inventory", "cmp_api_inventory"]) })).max(100),
  declarationInventoryComplete: z.boolean(),
  serviceNames: z.array(z.string().min(1).max(240)).max(100).optional(),
  limitations: z.array(z.string().max(120)).max(24),
  // Completed, document-bound sub-observations survive unrelated later timeouts.
  // Optional for historical v1 packets; absence must not upgrade old limited captures.
  checkpoints: z.object({
    version: z.literal("cmp_partial_capture.v1"),
    documentToken: z.string().min(1).max(160),
    privacyLinks: z.boolean(), declarations: z.boolean(), controls: z.boolean(),
    controlsSurface: z.enum(["first_layer", "preferences"]),
  }).optional(),
  declarationCoverage: z.object({
    scope: z.literal("configured_services"),
    configured: z.number().int().min(0).max(10000),
    resolved: z.number().int().min(0).max(100),
    unresolved: z.number().int().min(0).max(10000),
    truncated: z.boolean(),
  }).optional(),
  inspectionDiagnostic: z.object({
    revision: z.literal("borlabs_preferences.v1"), passiveDialogReveal: z.boolean().optional(), budgetMs: z.number().int().min(1).max(17_000),
    phase: z.enum(["browser_start", "navigation", "cmp_readiness", "control_inventory", "opening", "preference_inventory", "completed"]),
  }).optional(),
}).superRefine((packet, ctx) => {
  if (packet.status === "completed" && (!packet.documentToken || packet.finalUrl !== packet.targetUrl)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Completed preference evidence requires exact document binding." });
  if (packet.action.opened && packet.action.count !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Opening proof requires the single authorized Options action." });
  if ((packet.controls.length || packet.controlInventoryComplete) && !packet.action.opened && !(packet.checkpoints?.controls && packet.checkpoints.controlsSurface === "first_layer")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Preference controls require a verified opened surface." });
  if (packet.checkpoints && (!packet.documentToken || packet.checkpoints.documentToken !== packet.documentToken || packet.finalUrl !== packet.targetUrl)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Partial checkpoints require exact document binding." });
  if (packet.declarationCoverage && packet.declarationInventoryComplete && (packet.declarationCoverage.truncated || packet.declarationCoverage.unresolved || packet.declarationCoverage.configured !== packet.declarationCoverage.resolved || !packet.checkpoints?.declarations)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Complete configured inventory requires verified source accounting." });
  if (Date.parse(packet.completedAt) < Date.parse(packet.startedAt)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid preference observation window." });
});
export type CmpPreferencesEvidence = z.infer<typeof cmpPreferencesEvidenceSchema>;

export const cmpAuditRowSchema = z.object({
    id: z.union([cmpAuditCriterionSchema, z.literal("implementation")]),
    status: z.enum(["observed", "not_observed", "review", "not_assessed", "partially_assessed", "feature_not_supported"]),
    detail: z.string().max(500),
    evidenceRefs: z.array(z.string().max(240)).max(12),
    inventory: cmpInventoryTablesSchema.optional(),
    cookieComparison: z.object({
      declarationPatternCount: z.number().int().nonnegative(),
      observedCookieNameCount: z.number().int().nonnegative(),
      unmatchedNameCount: z.number().int().nonnegative(),
      unmatchedNames: z.array(z.string().min(1).max(160)).max(100),
      allUnmatchedOnlyAfterAccept: z.boolean(),
    }).optional(),
    // Capability absence needs an explicit, version-bound product source. No
    // current generic DOM inspector emits this; unknown stays not_assessed.
    capabilityProof: z.object({ provider: z.string().min(1).max(120), productVersion: z.string().min(1).max(120), sourceUrl: z.string().url(), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/) }).optional(),

}).superRefine((row, ctx) => {
  const inventory = row.inventory;
  if (inventory && ((inventory.categories && row.id !== "categories") || (inventory.services && row.id !== "services") || (inventory.declarations && row.id !== "cookie_information") ||
    (inventory.cookies && row.id !== "found_not_declared") || (inventory.expiries && row.id !== "duration") || row.status === "not_assessed" || row.evidenceRefs.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inventory tables require the corresponding assessed criterion and retained evidence." });
  }
  const c = row.cookieComparison;
  if (c && (row.id !== "found_not_declared" || row.status !== "review" || c.unmatchedNameCount < 1 ||
    c.unmatchedNameCount > c.observedCookieNameCount || c.unmatchedNames.length < 1 || c.unmatchedNames.length > c.unmatchedNameCount || c.unmatchedNames.join("").length > 500 ||
    new Set(c.unmatchedNames).size !== c.unmatchedNames.length)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cookie comparison details require consistent bounded mismatch evidence." });
  }
});

export const cmpAuditAssessmentSchema = z.object({
  version: z.enum(["cmp_audit_assessment.v1", "cmp_audit_assessment.v2", "cmp_audit_assessment.v3", "cmp_audit_assessment.v4"]),
  scanId: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  support: cmpInspectionSupportSchema,
  rows: z.array(cmpAuditRowSchema).min(8).max(9),
}).superRefine((assessment, ctx) => {
  const expectedIds = [...cmpAuditCriterionSchema.options, ...(assessment.version === "cmp_audit_assessment.v4" ? ["implementation"] : [])];
  if (assessment.rows.length !== expectedIds.length || new Set(assessment.rows.map(row => row.id)).size !== expectedIds.length || expectedIds.some(id => !assessment.rows.some(row => row.id === id))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CMP audit criteria must be unique." });
  for (const row of assessment.rows) {
    if (row.status === "partially_assessed" && assessment.version !== "cmp_audit_assessment.v4") ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Partial assessment requires the v4 scope." });
    if (row.status !== "not_assessed" && row.evidenceRefs.length === 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Assessed CMP criteria require retained evidence." });
    if (row.status === "feature_not_supported" && (!row.capabilityProof || row.capabilityProof.provider !== assessment.support.provider)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Feature absence requires version-bound capability proof for this CMP." });
  }
});
export type CmpAuditAssessment = z.infer<typeof cmpAuditAssessmentSchema>;

/** JSONB may reorder object keys. Parse both rows into the same typed shape
 * before comparing; evidence content and array order must still match. */
export function cmpAuditRowsEqual(left: unknown, right: unknown): boolean {
  const a = cmpAuditRowSchema.safeParse(left), b = cmpAuditRowSchema.safeParse(right);
  return a.success && b.success && JSON.stringify(a.data) === JSON.stringify(b.data);
}
