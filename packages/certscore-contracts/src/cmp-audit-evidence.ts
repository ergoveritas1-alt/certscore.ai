import { z } from "zod";
import {cmpInventoryManifestSchema,cmpCaptureProgressSchema} from "./cmp-inventory-manifest";
import { cmpVisibleInventorySchema, projectVisibleCmpInventory } from "./cmp-visible-inventory";
import { cmpLoadedInventorySchema, projectLoadedCmpInventory } from "./cmp-loaded-inventory";
import { parseNamedCmpPartnerDisclosure } from "./cmp-named-disclosure";
import { possibleCmpCookieTemplate } from "./cmp-cookie-template";
export { possibleCmpCookieTemplate } from "./cmp-cookie-template";
export { parseNamedCmpPartnerDisclosure } from "./cmp-named-disclosure";

const cmpNamedDisclosureSchema = z.object({
  version: z.literal("cmp_named_partner_disclosure.v1"), excerpt: z.string().min(1).max(600),
  names: z.array(z.string().min(1).max(80)).min(1).max(20),
}).strict().refine(value => {
  const parsed = parseNamedCmpPartnerDisclosure(value.excerpt);
  return parsed && JSON.stringify(parsed.names) === JSON.stringify(value.names);
}, "Named partners must match the retained literal disclosure.");

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

export const cmpPrivacyLinkSchema = z.object({
  url: z.string().url().max(2000), hitTargetBeforeAction: z.boolean(),
  access: z.object({ version: z.enum(["privacy_link_access.v1", "privacy_link_access.v2"]),
    outcome: z.enum(["reachable", "outside_viewport", "not_rendered", "hidden", "transparent", "inactive", "pointer_disabled", "hit_target_missed", "inspection_incomplete"]),
    scroll: z.object({ version: z.literal("privacy_link_scroll.v1"), initialOutcome: z.literal("outside_viewport"),
      beforeY: z.number().finite(), inspectedY: z.number().finite(), restored: z.boolean() }).strict().optional(),
  }).strict().refine(access => access.version === "privacy_link_access.v1" ? !access.scroll :
    Boolean(access.scroll && (access.scroll.restored || access.outcome === "inspection_incomplete")),
    "Scrolled link evidence requires a restoration witness; legacy reads cannot claim a scroll.").optional(),
}).refine(link => !link.access || link.hitTargetBeforeAction === (link.access.outcome === "reachable"),
  "Link accessibility diagnostics must agree with the retained click-target result.");

const configuredConsentCookiesSchema = z.array(z.object({
  version: z.literal("cmp_configured_cookie_identity.v1"),
  configurationPath: z.string().min(1).max(160),
  name: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/),
}).strict()).max(4);

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
  services: z.array(z.object({ name: z.string().min(1).max(240), source: z.enum(["cmp_api_inventory", "labelled_control", "cmp_named_disclosure", "cmp_visible_inventory", "cmp_loaded_inventory"]), sourceRef: z.string().max(120).optional() }).strict()).max(100).optional(),
  serviceDisclosures: z.array(cmpNamedDisclosureSchema).max(1).optional(),
  declarations: z.array(z.object({ name: z.string().min(1).max(160), purpose: z.string().max(240), duration: z.string().max(240), source: z.enum(["cmp_visible_inventory", "cmp_api_inventory", "cmp_loaded_inventory"]), inferredPurpose: z.object({ category: z.string().min(1).max(80), basis: z.literal("canonical_cookie_registry.v1") }).strict().optional(),
    observedExpiry: cmpCookieExpiryEvidenceSchema.optional(),
  }).strict().refine(row => !row.observedExpiry || (row.observedExpiry.name === row.name && row.observedExpiry.visit === "Accept"), "Observed expiry requires an exact cookie-name and capture match")).max(100).optional(),
  cookies: z.array(z.object({ name: z.string().min(1).max(160), matchedPattern: z.string().min(1).max(160).nullable(), observedIn: z.array(z.enum(["before_choice", "after_accept"])).min(1).max(2),
    possibleTemplateMatch: z.object({ pattern: z.string().min(1).max(160), basis: z.literal("ga4_placeholder.v1") }).strict().optional(),
    observedExpiry: cmpCookieExpiryEvidenceSchema.optional(),
  }).strict().superRefine((row, ctx) => {
    if (row.possibleTemplateMatch && (row.matchedPattern !== null || !possibleCmpCookieTemplate(row.possibleTemplateMatch.pattern, row.name)))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Possible templates must remain separate from verified matches" });
    if (row.observedExpiry && (row.observedExpiry.name !== row.name || row.observedExpiry.visit !== "Accept" || !row.observedIn.includes("after_accept")))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Observed expiry requires matching capture provenance" });
  })).max(100).optional(),
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
  privacyLinks: z.array(cmpPrivacyLinkSchema).max(16),
  declarations: z.array(z.object({ name: z.string().min(1).max(160), purpose: z.string().max(240), duration: z.string().max(240), source: z.enum(["cmp_visible_inventory", "cmp_api_inventory", "cmp_loaded_inventory"]) })).max(100),
  declarationInventoryComplete: z.boolean(),
  visibleInventory: cmpVisibleInventorySchema.optional(),
  loadedInventory: cmpLoadedInventorySchema.optional(),
  inventoryManifest: cmpInventoryManifestSchema.optional(),
  captureProgress: cmpCaptureProgressSchema.optional(),
  serviceNames: z.array(z.string().min(1).max(240)).max(100).optional(),
  configuredConsentCookies: configuredConsentCookiesSchema.optional(),
  serviceDisclosures: z.array(cmpNamedDisclosureSchema).max(1).optional(),
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
    revision: z.enum(["borlabs_preferences.v1", "cmp_preferences.v2", "cmp_preferences.v3", "cmp_preferences.v4", "cmp_preferences.v5", "cmp_preferences.v6", "cmp_preferences.v7", "cmp_preferences.v8", "cmp_preferences.v9", "cmp_preferences.v10", "cmp_preferences.v11", "cmp_preferences.v12"]), passiveDialogReveal: z.boolean().optional(), budgetMs: z.number().int().min(1).max(17_000),
    identityScopes: z.object({ version: z.literal("cmp_scope_activity.v1"),
      providers: z.array(z.object({ provider: z.string().min(1).max(120), state: z.enum(["visible", "inactive", "unverified"]) }).strict()).max(40),
    }).strict().optional(),
    navigationHttpStatus: z.number().int().min(100).max(599).optional(),
    basicCaptureReserveMs: z.number().int().min(0).max(1000).optional(),
    configuration: z.object({ version: z.enum(["onetrust_loaded_configuration.v1", "onetrust_loaded_configuration.v2", "onetrust_loaded_configuration.v3", "cookieyes_loaded_configuration.v1"]), status: z.enum(["available", "unavailable"]),
      groupCount: z.number().int().min(0).max(10000).optional(), retainedCookieCount: z.number().int().min(0).max(100).optional(), truncated: z.boolean().optional(),
    }).strict().optional(),
    openingStage: z.enum(["dispatch", "panel_visibility", "content_ready", "binding_verification", "completed"]).optional(),
    openingTiming: z.object({startedAtMs:z.number().int().nonnegative(), dispatchedAtMs:z.number().int().nonnegative().optional(),
      clickCompletedAtMs:z.number().int().nonnegative().optional(), panelVisibleAtMs:z.number().int().nonnegative().optional(), contentReadyAtMs:z.number().int().nonnegative().optional()}).strict().optional(),
    phase: z.enum(["browser_start", "navigation", "cmp_readiness", "control_inventory", "surface_binding", "opening", "preference_inventory", "completed"]),
    optionsResolution: z.object({
      version: z.literal("cmp_options_resolution.v1"),
      counts: z.object({ actionable: z.number().int().min(0).max(100), hidden: z.number().int().min(0).max(100), disabled: z.number().int().min(0).max(100), outside_viewport: z.number().int().min(0).max(100), covered: z.number().int().min(0).max(100), unavailable: z.number().int().min(0).max(100) }).strict()
        .refine(counts => Object.values(counts).reduce((sum, n) => sum + n, 0) <= 100, "Options diagnostics exceed the bounded candidate inventory."),
      overflow: z.boolean(),
    }).strict().optional(),
    surfaceBinding: z.object({
      version: z.literal("cmp_surface_binding.v1"),
      mode: z.enum(["aria_controls", "registered_existing", "registered_deferred", "registered_layer", "registered_portal", "borlabs"]),
      priorMatches: z.number().int().min(0).max(1000), priorVisible: z.boolean().optional(),
      outcome: z.enum(["checking", "ready", "opened", "missing", "ambiguous", "already_visible", "parent_unbound", "changed", "timed_out"]),
      verification: z.object({ version: z.literal("cmp_panel_verification.v1"),
        result: z.enum(["verified", "parent_missing_or_replaced", "parent_ambiguous", "panel_ambiguous", "panel_replaced", "outside_parent", "role_not_ready", "name_not_ready"]),
        role: z.string().max(32).nullable(),
      }).strict().optional(),
    }).strict().optional(),
  }).optional(),
}).superRefine((packet, ctx) => {
  if (packet.captureProgress && (!packet.documentToken || packet.captureProgress.documentToken!==packet.documentToken ||
      packet.finalUrl!==packet.targetUrl || packet.inspectionDiagnostic?.revision!=="cmp_preferences.v12" ||
      [packet.captureProgress.controlsAtMs,packet.captureProgress.declarationsAtMs,packet.captureProgress.privacyLinksAtMs].some(at=>at!==undefined && at>Date.parse(packet.completedAt)-Date.parse(packet.startedAt))))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Capture progress must bind the current versioned document."});
  if (packet.inventoryManifest && (!packet.checkpoints?.declarations || packet.captureProgress?.declarationsAtMs===undefined ||
      packet.inspectionDiagnostic?.revision!=="cmp_preferences.v12" ||
      packet.inventoryManifest.source.startsWith("cookieyes_") && packet.support.provider!=="CookieYes" ||
      packet.inventoryManifest.source.startsWith("onetrust_") && packet.support.provider!=="OneTrust" ||
      packet.inventoryManifest.source.startsWith("cookiebot_") && (packet.support.provider!=="Cookiebot" || !packet.loadedInventory || JSON.stringify(packet.inventoryManifest)!==JSON.stringify(packet.loadedInventory.inventoryManifest))))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Compact inventory requires its provider-bound declaration checkpoint."});
  const loadedDeclarations = packet.declarations.filter(row => row.source === "cmp_loaded_inventory");
  if (packet.loadedInventory || loadedDeclarations.length) {
    const projected = packet.loadedInventory ? projectLoadedCmpInventory(packet.loadedInventory).declarations : [];
    if (!packet.loadedInventory || !["cmp_preferences.v11","cmp_preferences.v12"].includes(packet.inspectionDiagnostic?.revision ?? "") ||
        packet.support.provider !== "Cookiebot" || !packet.action.opened || !packet.checkpoints?.declarations ||
        packet.inspectionDiagnostic?.surfaceBinding?.verification?.result !== "verified" ||
        packet.declarationInventoryComplete || loadedDeclarations.length !== projected.length ||
        projected.some(row => !loadedDeclarations.some(declared => declared.name === row.name && declared.purpose === row.purpose && declared.duration === row.duration)))
      ctx.addIssue({code: z.ZodIssueCode.custom, message: "Loaded declarations require exact versioned, bound, partial source projection."});
  }
  if (packet.visibleInventory) {
    const projected = projectVisibleCmpInventory(packet.visibleInventory);
    if (!["cmp_preferences.v9", "cmp_preferences.v10", "cmp_preferences.v11", "cmp_preferences.v12"].includes(packet.inspectionDiagnostic?.revision ?? "") || !packet.action.opened || !packet.checkpoints?.declarations || projected.declarations.some(row =>
        !packet.declarations.some(declared => declared.name === row.name && declared.purpose === row.purpose && declared.duration === row.duration && declared.source === row.source)))
      ctx.addIssue({code: z.ZodIssueCode.custom, message: "Visible inventory requires versioned exact declaration projection"});
  }
  if (packet.status === "completed" && (!packet.documentToken || packet.finalUrl !== packet.targetUrl)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Completed preference evidence requires exact document binding." });
  if (packet.inspectionDiagnostic?.surfaceBinding?.mode === "registered_portal" &&
      (!["cmp_preferences.v8", "cmp_preferences.v9", "cmp_preferences.v10", "cmp_preferences.v11", "cmp_preferences.v12"].includes(packet.inspectionDiagnostic.revision) || packet.action.opened &&
       packet.inspectionDiagnostic.surfaceBinding.verification?.result !== "verified"))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Registered portal opening requires versioned verified binding." });
  if (packet.action.opened && packet.action.count !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Opening proof requires the single authorized Options action." });
  if (packet.action.opened && packet.inspectionDiagnostic?.optionsResolution && (packet.inspectionDiagnostic.optionsResolution.overflow || packet.inspectionDiagnostic.optionsResolution.counts.actionable !== 1))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Options diagnostics must agree with unique opening proof." });
  if ((packet.controls.length || packet.controlInventoryComplete) && !packet.action.opened && !(packet.checkpoints?.controls && packet.checkpoints.controlsSurface === "first_layer")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Preference controls require a verified opened surface." });
  if (packet.checkpoints && (!packet.documentToken || packet.checkpoints.documentToken !== packet.documentToken || packet.finalUrl !== packet.targetUrl)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Partial checkpoints require exact document binding." });
  if (packet.configuredConsentCookies?.length && (!packet.checkpoints || !packet.support.provider)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Configured cookie identity requires a provider-bound document checkpoint." });
  if (packet.declarationCoverage && packet.declarationInventoryComplete && (packet.declarationCoverage.truncated || packet.declarationCoverage.unresolved || packet.declarationCoverage.configured !== packet.declarationCoverage.resolved || !packet.checkpoints?.declarations)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Complete configured inventory requires verified source accounting." });
  if (Date.parse(packet.completedAt) < Date.parse(packet.startedAt)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid preference observation window." });
});
export type CmpPreferencesEvidence = z.infer<typeof cmpPreferencesEvidenceSchema>;

/** Passive facts captured by the required consent-proof visit. This is not an
 * Options action, a complete preference inventory, or a product-capability test. */
export const cmpBasicEvidenceSchema = z.object({
  contractVersion: z.enum(["certscore.cmp-basic-evidence.v1", "certscore.cmp-basic-evidence.v2"]),
  sourceLane: z.literal("consent_proof"),
  scanId: z.string().min(1).max(160), targetUrl: z.string().url().max(2000),
  documentUrl: z.string().url().max(2000), documentToken: z.string().min(1).max(160),
  capturedAtMs: z.number().finite().nonnegative(),
  provider: z.string().min(1).max(120),
  controls: cmpPreferencesEvidenceSchema.innerType().shape.controls,
  privacyLinks: cmpPreferencesEvidenceSchema.innerType().shape.privacyLinks,
  declarations: cmpPreferencesEvidenceSchema.innerType().shape.declarations,
  serviceNames: z.array(z.string().min(1).max(240)).max(100),
  configuredConsentCookies: configuredConsentCookiesSchema.optional(),
  inventoryManifest: cmpInventoryManifestSchema.optional(),
  captureProgress: cmpCaptureProgressSchema.optional(),
  loadedInventory: cmpLoadedInventorySchema.optional(),
  loadedInventoryBinding: z.object({
    version: z.literal("cookiebot_passive_loaded_inventory.v1"),
    rootSelector: z.literal("#CybotCookiebotDialog"),
    panelSelector: z.literal("#CybotCookiebotDialogTabContentDetails"),
    documentToken: z.string().min(1).max(160),
  }).strict().optional(),
  serviceDisclosures: z.array(cmpNamedDisclosureSchema).max(1).optional(),
  limitations: z.array(z.string().min(1).max(120)).max(8),
}).strict().superRefine((packet,ctx)=>{
  const progress=packet.captureProgress;
  if (progress && (progress.documentToken!==packet.documentToken || packet.documentUrl!==packet.targetUrl ||
      [progress.controlsAtMs,progress.declarationsAtMs,progress.privacyLinksAtMs].some(at=>at!==undefined && at>packet.capturedAtMs) ||
      packet.controls.length>0 && progress.controlsAtMs===undefined ||
      (packet.declarations.length>0 || packet.serviceNames.length>0 || packet.inventoryManifest) && progress.declarationsAtMs===undefined ||
      packet.privacyLinks.length>0 && progress.privacyLinksAtMs===undefined))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Passive facts require exact completed document checkpoints."});
  if (packet.inventoryManifest && (!progress ||
      packet.inventoryManifest.source.startsWith("cookieyes_") && packet.provider!=="CookieYes" ||
      packet.inventoryManifest.source.startsWith("onetrust_") && packet.provider!=="OneTrust" ||
      packet.inventoryManifest.source.startsWith("cookiebot_") && (!packet.loadedInventory ||
        JSON.stringify(packet.inventoryManifest)!==JSON.stringify(packet.loadedInventory.inventoryManifest))))
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"Passive compact inventory requires its canonical configured source."});
  const loadedDeclarations=packet.declarations.filter(row=>row.source==="cmp_loaded_inventory");
  const hasLoaded=Boolean(packet.loadedInventory || packet.loadedInventoryBinding || loadedDeclarations.length);
  if (packet.contractVersion==="certscore.cmp-basic-evidence.v2" || hasLoaded) {
    const projected=packet.loadedInventory ? projectLoadedCmpInventory(packet.loadedInventory).declarations : [];
    if (packet.contractVersion!=="certscore.cmp-basic-evidence.v2" || packet.provider!=="Cookiebot" ||
        !packet.loadedInventory || !packet.loadedInventoryBinding || !progress || progress.declarationsAtMs===undefined ||
        packet.loadedInventoryBinding.documentToken!==packet.documentToken || packet.serviceNames.length>0 ||
        !packet.limitations.includes("loaded_declarations_not_visibility_proof") ||
        !packet.limitations.includes("declaration_inventory_not_complete") ||
        packet.declarations.length!==projected.length || loadedDeclarations.length!==projected.length ||
        projected.some(row=>!loadedDeclarations.some(declared=>declared.name===row.name && declared.purpose===row.purpose && declared.duration===row.duration)))
      ctx.addIssue({code:z.ZodIssueCode.custom,message:"Passive loaded inventory requires exact v2 provider, document, source and partial declaration projection."});
  }
});
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
      // Subset of names without a verified match; never subtracts from them.
      possibleTemplateNameCount: z.number().int().nonnegative().optional(),
      omittedAfterAcceptCookieCount: z.number().int().positive().optional(),
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
    (c.possibleTemplateNameCount ?? 0) > c.unmatchedNameCount || c.unmatchedNameCount > c.observedCookieNameCount || c.unmatchedNames.length > c.unmatchedNameCount || c.unmatchedNames.join("").length > 500 ||
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
    if (assessment.version !== "cmp_audit_assessment.v6" && (row.cookieComparison?.possibleTemplateNameCount !== undefined || row.cookieComparison?.omittedAfterAcceptCookieCount !== undefined || row.inventory?.consentStorage || row.inventory?.choiceActivity || row.inventory?.declarations?.some(item => item.inferredPurpose || item.observedExpiry) || row.inventory?.cookies?.some(item => item.possibleTemplateMatch || item.observedExpiry)))
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
