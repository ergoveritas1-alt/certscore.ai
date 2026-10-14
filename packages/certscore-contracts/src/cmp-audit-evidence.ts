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
export type ExtendedCmpCriterion = z.infer<typeof cmpAuditCriterionSchema> | "implementation" | "prominence";

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
  visit: z.enum(["Accept", "Reject", "Before choice"]), domain: z.string().min(1).max(255).optional(), path: z.string().min(1).max(1024).optional(), name: z.string().min(1).max(160),
  capturedAtEpochSeconds: z.number().finite().positive(), expiresAtEpochSeconds: z.number().finite().positive(),
  remainingSeconds: z.number().finite().nonnegative(),
}).strict().refine(row => row.expiresAtEpochSeconds >= row.capturedAtEpochSeconds &&
  Math.abs(row.remainingSeconds - (row.expiresAtEpochSeconds - row.capturedAtEpochSeconds)) <= 0.000001,
  "Remaining time must match the retained capture and expiry timestamps.");

/** Bounded, display-safe facts; never cookie values or a control test verdict. */
export const cmpInventoryTablesSchema = z.object({
  consentStorage: z.array(z.object({ visit: z.enum(["Accept", "Reject"]), name: z.string().min(1).max(160), change: z.enum(["stored", "updated"]) }).strict()).max(8).optional(),
  choiceActivity: z.array(z.object({ action: z.enum(["accept", "reject"]), windowMs: z.number().int().nonnegative().max(30000), requestCount: z.number().int().nonnegative(), nonEssentialRequestCount: z.number().int().nonnegative(),
    requests: z.array(z.object({ hostname: z.string().max(255), path: z.string().max(2048).refine(value => !/[?#]/.test(value), "Request paths omit query and fragment"), vendor: z.string().max(160), purpose: z.string().max(100), msAfterClick: z.number().int().nonnegative(), nonEssential: z.boolean() }).strict()).max(100),
  }).strict().refine(value => value.requests.length <= value.requestCount && value.nonEssentialRequestCount <= value.requestCount && value.requests.filter(row => row.nonEssential).length <= value.nonEssentialRequestCount, "Activity counts must agree with retained requests")).max(2).refine(values => new Set(values.map(value => value.action)).size === values.length, "One activity window per action").optional(),

  expiries: z.array(cmpCookieExpiryEvidenceSchema).max(4).optional(),
  categories: z.array(z.object({ name: z.string().min(1).max(240), checked: z.boolean().nullable() }).strict()).max(100).optional(),
  services: z.array(z.object({ name: z.string().min(1).max(240), source: z.enum(["cmp_api_inventory", "labelled_control"]) }).strict()).max(100).optional(),
  declarations: z.array(z.object({ name: z.string().min(1).max(160), purpose: z.string().max(240), duration: z.string().max(240), source: z.enum(["cmp_visible_inventory", "cmp_api_inventory"]), inferredPurpose: z.object({ category: z.string().min(1).max(80), basis: z.literal("canonical_cookie_registry.v1") }).strict().optional() }).strict()).max(100).optional(),
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
    revision: z.enum(["borlabs_preferences.v1", "cmp_preferences.v2", "cmp_preferences.v3"]), passiveDialogReveal: z.boolean().optional(), budgetMs: z.number().int().min(1).max(17_000),
    basicCaptureReserveMs: z.number().int().min(0).max(1000).optional(),
    configuration: z.object({ version: z.enum(["onetrust_loaded_configuration.v1", "onetrust_loaded_configuration.v2"]), status: z.enum(["available", "unavailable"]),
      groupCount: z.number().int().min(0).max(10000).optional(), retainedCookieCount: z.number().int().min(0).max(100).optional(), truncated: z.boolean().optional(),
    }).strict().optional(),
    phase: z.enum(["browser_start", "navigation", "cmp_readiness", "control_inventory", "surface_binding", "opening", "preference_inventory", "completed"]),
    surfaceBinding: z.object({
      version: z.literal("cmp_surface_binding.v1"),
      mode: z.enum(["aria_controls", "registered_existing", "registered_deferred", "borlabs"]),
      priorMatches: z.number().int().min(0).max(1000), priorVisible: z.boolean().optional(),
      outcome: z.enum(["checking", "ready", "opened", "missing", "ambiguous", "already_visible", "parent_unbound", "changed", "timed_out"]),
    }).strict().optional(),
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

/** Passive facts captured by the required consent-proof visit. This is not an
 * Options action, a complete preference inventory, or a product-capability test. */
export const cmpBasicEvidenceSchema = z.object({
  contractVersion: z.literal("certscore.cmp-basic-evidence.v1"),
  sourceLane: z.literal("consent_proof"),
  scanId: z.string().min(1).max(160), targetUrl: z.string().url().max(2000),
  documentUrl: z.string().url().max(2000), documentToken: z.string().min(1).max(160),
  capturedAtMs: z.number().finite().nonnegative(),
  provider: z.string().min(1).max(120),
  controls: cmpPreferencesEvidenceSchema.innerType().shape.controls,
  privacyLinks: cmpPreferencesEvidenceSchema.innerType().shape.privacyLinks,
  declarations: cmpPreferencesEvidenceSchema.innerType().shape.declarations,
  serviceNames: z.array(z.string().min(1).max(240)).max(100),
  limitations: z.array(z.string().min(1).max(120)).max(8),
}).strict();
export type CmpBasicEvidence = z.infer<typeof cmpBasicEvidenceSchema>;

export const cmpAuditRowSchema = z.object({
    id: z.union([cmpAuditCriterionSchema, z.literal("implementation"), z.literal("prominence")]),
    status: z.enum(["observed", "not_observed", "review", "not_assessed", "partially_assessed", "feature_not_supported", "incomplete", "not_applicable"]),
    limitation: z.object({ group: z.enum(["preferences", "actions", "visual"]), code: z.string().min(1).max(120) }).strict().optional(),
    detail: z.string().max(500),
    evidenceRefs: z.array(z.string().max(240)).max(12),
    inventory: cmpInventoryTablesSchema.optional(),
    cookieComparison: z.object({
      declarationPatternCount: z.number().int().nonnegative(),
      observedCookieNameCount: z.number().int().nonnegative(),
      unmatchedNameCount: z.number().int().nonnegative(),
      unmatchedNames: z.array(z.string().min(1).max(160)).max(100),
      allUnmatchedOnlyAfterAccept: z.boolean(),
      declarationInventoryComplete: z.boolean().optional(),
    }).optional(),
    // Capability absence needs an explicit, version-bound product source. No
    // current generic DOM inspector emits this; unknown stays not_assessed.
    capabilityProof: z.object({ provider: z.string().min(1).max(120), productVersion: z.string().min(1).max(120), sourceUrl: z.string().url(), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/) }).optional(),

}).superRefine((row, ctx) => {
  const inventory = row.inventory;
  if (inventory && ((inventory.categories && row.id !== "categories") || (inventory.services && row.id !== "services") || (inventory.declarations && row.id !== "cookie_information") ||
    (inventory.consentStorage && row.id !== "consent_record") || (inventory.choiceActivity && row.id !== "implementation") || (inventory.cookies && row.id !== "found_not_declared") || (inventory.expiries && row.id !== "duration") || ["not_assessed", "incomplete", "not_applicable"].includes(row.status) || row.evidenceRefs.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Inventory tables require the corresponding assessed criterion and retained evidence." });
  }
  const c = row.cookieComparison;
  if (c && (row.id !== "found_not_declared" ||
    (c.declarationInventoryComplete === undefined ? row.status !== "review" || c.unmatchedNameCount < 1 || c.unmatchedNames.length < 1
      : c.declarationInventoryComplete ? !["review", "not_observed"].includes(row.status) || (row.status === "review") !== (c.unmatchedNameCount > 0)
      : row.status !== "partially_assessed") ||
    c.unmatchedNameCount > c.observedCookieNameCount || c.unmatchedNames.length > c.unmatchedNameCount || c.unmatchedNames.join("").length > 500 ||
    new Set(c.unmatchedNames).size !== c.unmatchedNames.length)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Cookie comparison details require consistent bounded mismatch evidence." });
  }
});

export const cmpAuditAssessmentSchema = z.object({
  version: z.enum(["cmp_audit_assessment.v1", "cmp_audit_assessment.v2", "cmp_audit_assessment.v3", "cmp_audit_assessment.v4", "cmp_audit_assessment.v5", "cmp_audit_assessment.v6"]),
  scanId: z.string().min(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  support: cmpInspectionSupportSchema,
  rows: z.array(cmpAuditRowSchema).min(8).max(10),
}).superRefine((assessment, ctx) => {
  const expectedIds = [...cmpAuditCriterionSchema.options, ...(["cmp_audit_assessment.v4", "cmp_audit_assessment.v5", "cmp_audit_assessment.v6"].includes(assessment.version) ? ["implementation"] : []), ...(["cmp_audit_assessment.v5", "cmp_audit_assessment.v6"].includes(assessment.version) ? ["prominence"] : [])];
  if (assessment.rows.length !== expectedIds.length || new Set(assessment.rows.map(row => row.id)).size !== expectedIds.length || expectedIds.some(id => !assessment.rows.some(row => row.id === id))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CMP audit criteria must be unique." });
  for (const row of assessment.rows) {
    if (row.status === "partially_assessed" && !["cmp_audit_assessment.v4", "cmp_audit_assessment.v5", "cmp_audit_assessment.v6"].includes(assessment.version)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Partial assessment requires the v4 scope." });
    if (!["cmp_audit_assessment.v5", "cmp_audit_assessment.v6"].includes(assessment.version) && (row.limitation || ["incomplete", "not_applicable"].includes(row.status) ||
      row.cookieComparison?.declarationInventoryComplete !== undefined || row.inventory?.expiries?.some(item => item.visit === "Before choice")))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Narrowed evidence scope requires v5." });
    if (assessment.version !== "cmp_audit_assessment.v6" && (row.inventory?.consentStorage || row.inventory?.choiceActivity || row.inventory?.declarations?.some(item => item.inferredPurpose)))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "After-click facts and inferred purpose require v6 scope." });
    if (row.status === "incomplete" && !row.limitation) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Incomplete inspection requires its specific cause." });
    if (row.status === "not_applicable" && !row.capabilityProof) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Not applicable requires explicit applicability proof." });
    if (row.inventory?.expiries?.some(item => item.visit === "Before choice" && (!item.domain || !item.path?.startsWith("/")))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Baseline expiry requires retained cookie identity." });
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
