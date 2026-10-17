import { z } from "zod";

export const LEGACY_CONTROL_INSPECTION_POLICY = "control_specific_inspection.v1" as const;
export const CONTROL_INSPECTION_POLICY = "control_specific_inspection.v3" as const;
type InspectionPolicy = typeof CONTROL_INSPECTION_POLICY | typeof LEGACY_CONTROL_INSPECTION_POLICY | "control_specific_inspection.v2";
const intents = ["accept", "reject", "options", "privacy_opt_out"] as const;
export type InspectedConsentIntent = typeof intents[number];
export const consentControlInspectionSchema = z.object({
  version: z.enum([LEGACY_CONTROL_INSPECTION_POLICY, "control_specific_inspection.v2", CONTROL_INSPECTION_POLICY]),
  structuralCoverage: z.enum(["complete", "limited"]),
  retainedCandidateCount: z.number().int().min(0).max(160),
  captureCoverage: z.object({
    inventoryTruncated: z.boolean(), documentReadyState: z.enum(["loading", "interactive", "complete"]),
    mainFrameAvailable: z.boolean(), documentAndFramesStable: z.boolean(),
    frameCount: z.number().int().min(0).max(10_000), capturedFrameCount: z.number().int().min(0).max(12),
  }),
  reasonCodes: z.array(z.string().max(120)).max(16),
  candidates: z.array(z.object({
    candidateId: z.string().min(1).max(160),
    role: z.enum(["decision", "category", "information", "vendor_list", "dismiss", "selection_submit", "unknown"]),
    unresolvedIntents: z.array(z.enum(intents)).max(4),
  })).max(160),
}).superRefine((inspection, context) => {
  const c = inspection.captureCoverage;
  if (inspection.structuralCoverage === "complete" && (c.inventoryTruncated || c.documentReadyState !== "complete" ||
    !c.mainFrameAvailable || !c.documentAndFramesStable || c.frameCount === 0 || c.frameCount !== c.capturedFrameCount)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Complete inspection requires an untruncated, stable, completed capture of every frame." });
  }
  if (new Set(inspection.candidates.map(c => c.candidateId)).size !== inspection.candidates.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Inspection candidate identities must be unique." });
  }
  if (inspection.candidates.some(c => new Set(c.unresolvedIntents).size !== c.unresolvedIntents.length)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Unresolved intents must be unique." });
  }
});
export type ConsentControlInspection = z.infer<typeof consentControlInspectionSchema>;

const inspectionCandidateSchema = z.object({
  candidateId: z.string().min(1).max(160), layer: z.string(), enabled: z.boolean(),
  intersectsViewport: z.boolean(), boundingBox: z.object({ width: z.number().nonnegative(), height: z.number().nonnegative() }),
  decisionStatus: z.string(), actionType: z.string().optional(), label: z.string().optional(),
  selectorHint: z.string().optional(), containerSelectorHint: z.string().optional(), ariaLabel: z.string().optional(),
  classifierReasonCodes: z.array(z.string()).optional(), inputType: z.string().optional(), role: z.string().optional(),
  linkDestination: z.string().optional(), tagName: z.string().optional(), consentContextConfirmed: z.boolean().optional(),
  initialSelection: z.unknown().optional(),
});
export function isRelevantConsentInspectionCandidate(c: z.infer<typeof inspectionCandidateSchema>, policy: InspectionPolicy = CONTROL_INSPECTION_POLICY): boolean {
  return (policy === LEGACY_CONTROL_INSPECTION_POLICY || c.consentContextConfirmed === true) && c.layer === "first_layer" && c.intersectsViewport && c.enabled && c.boundingBox.width > 0 &&
    c.boundingBox.height > 0 && !["hidden", "dom_present_not_visible", ...(policy !== LEGACY_CONTROL_INSPECTION_POLICY ? ["covered"] : [])].includes(c.decisionStatus);
}

/** Validate the producer's roles against the exact retained inventory. Missing,
 * duplicated or changed candidate rows cannot support negative observations.
 * A complete zero-candidate inspection is valid only with the explicit retained
 * count of zero; an absent or malformed inventory is not an empty inspection. */
export function verifyConsentControlInspection(value: unknown, candidates: unknown): ConsentControlInspection | null {
  const proof = consentControlInspectionSchema.safeParse(value);
  const inventory = z.array(inspectionCandidateSchema).max(160).safeParse(candidates);
  if (!proof.success || !inventory.success || proof.data.retainedCandidateCount !== inventory.data.length ||
    new Set(inventory.data.map(c => c.candidateId)).size !== inventory.data.length) return null;
  const relevant = inventory.data.filter(c => isRelevantConsentInspectionCandidate(c, proof.data.version));
  if (relevant.length !== proof.data.candidates.length) return null;
  for (const candidate of relevant) {
    const row = proof.data.candidates.find(c => c.candidateId === candidate.candidateId);
    const expected = classifyConsentInspectionRole(candidate, proof.data.version);
    if (!row || row.role !== expected.role || row.unresolvedIntents.length !== expected.unresolvedIntents.length ||
      !row.unresolvedIntents.every(intent => expected.unresolvedIntents.includes(intent))) return null;
  }
  return proof.data;
}

/** Producer-side classification of structural roles, separate from decision intent.
 * No domain exceptions. Vendor roles require a canonical CMP structure as well
 * as the label. Information navigation may limit Options without limiting Reject. */
export function classifyConsentInspectionRole(c: {
  actionType?: string; label?: string; selectorHint?: string; containerSelectorHint?: string; ariaLabel?: string;
  classifierReasonCodes?: string[]; inputType?: string; role?: string;
  linkDestination?: string; tagName?: string; consentContextConfirmed?: boolean;
  initialSelection?: unknown;
}, policy: InspectionPolicy = CONTROL_INSPECTION_POLICY): Pick<ConsentControlInspection["candidates"][number], "role" | "unresolvedIntents"> {
  if (c.consentContextConfirmed !== true) return { role: "unknown", unresolvedIntents: [...intents] };
  if (c.classifierReasonCodes?.some(r => ["conflicting_consent_decisions", "visible_accessible_intent_conflict", "negated_consent_choice"].includes(r))) {
    return { role: "unknown", unresolvedIntents: [...intents] };
  }
  if (c.classifierReasonCodes?.includes("initial_necessary_only_selection_observed") &&
    (c.tagName !== "button" || !isInitialSelectionSubmit(c.label, c.classifierReasonCodes, c.initialSelection) || !isInitialNecessaryOnlySelection(c.initialSelection))) {
    return { role: "selection_submit", unresolvedIntents: ["reject"] };
  }
  if (c.classifierReasonCodes?.includes("matched_dismiss")) return { role: "dismiss", unresolvedIntents: [] };
  if (c.classifierReasonCodes?.includes("notice_acknowledgment_only") && c.label?.trim().toLowerCase()==="continue" &&
    c.selectorHint==="#onetrust-accept-btn-handler" && ["#onetrust-button-group","#onetrust-banner-sdk"].includes(c.containerSelectorHint??""))
    return {role:"information",unresolvedIntents:[]};
  if (c.classifierReasonCodes?.some(r => r === "variant_reject_with_payment" || r === "variant_reject_with_subscription")) {
    return { role: "decision", unresolvedIntents: [] };
  }
  if (["accept_all", "reject_all", "manage_preferences", "do_not_sell_share"].includes(c.actionType ?? "")) return { role: "decision", unresolvedIntents: [] };
  if (c.actionType === "save_preferences") return { role: "selection_submit", unresolvedIntents: ["reject"] };
  if (["checkbox", "radio"].includes(c.inputType ?? "") || ["checkbox", "switch", "radio"].includes(c.role ?? "")) return { role: "category", unresolvedIntents: [] };
  const label = (c.label ?? "").trim().toLocaleLowerCase().replace(/[.!…]+$/u, "").trim();
  const scope = `${c.selectorHint ?? ""} ${c.containerSelectorHint ?? ""}`;
  if (policy !== LEGACY_CONTROL_INSPECTION_POLICY) {
    if (c.classifierReasonCodes?.includes("unverified_preferences_navigation")) return { role: "information", unresolvedIntents: ["options"] };
    if (c.tagName === "div" && !["button", "link"].includes(c.role ?? "") &&
        c.selectorHint === "#onetrust-banner-sdk" && c.containerSelectorHint === "#onetrust-banner-sdk" &&
        (c.ariaLabel === "You must interact with the banner to dismiss it." || c.role==="region" && c.ariaLabel==="Cookie banner")) {
      return { role: "information", unresolvedIntents: [] };
    }
    if (c.tagName === "a" && c.containerSelectorHint === "#onetrust-policy" &&
        c.selectorHint === "p.ot-dpd-desc a" && label === "list of partners (vendors)") {
      return { role: "vendor_list", unresolvedIntents: [] };
    }
  }
  if (policy === CONTROL_INSPECTION_POLICY && c.tagName === "a" &&
      c.selectorHint === "div.didomi-popup-notice-text a" &&
      /^our [1-9][0-9]{0,3} partners$/.test(label)) return {role: "vendor_list", unresolvedIntents: []};
  if ((/didomi-popup-notice-text/.test(scope) && /^nasi partnerzy(?: \(\d+\))?$/.test(label)) ||
      (/qc-cmp2-summary-info/.test(scope) && label === "partners")) return { role: "vendor_list", unresolvedIntents: [] };
  if (c.actionType === "policy_link" || (c.tagName === "a" && c.linkDestination === "other_document")) {
    return { role: "information", unresolvedIntents: [] };
  }
  if (["learn more", "more information", "mehr informationen", "più informazioni", "meer informatie", "詳細"].includes(label)) {
    return { role: "information", unresolvedIntents: ["options"] };
  }
  if (["accept selected", "accept selections", "save selection", "save preferences", "accetta solo i selezionati"].includes(label)) {
    return { role: "selection_submit", unresolvedIntents: ["reject"] };
  }
  return { role: "unknown", unresolvedIntents: [...intents] };
}

export function isControlInspectionComplete(inspection: ConsentControlInspection, intent: InspectedConsentIntent): boolean {
  return inspection.structuralCoverage === "complete" && !inspection.candidates.some(c => c.unresolvedIntents.includes(intent));
}

const drupalInitialConsentSelectionSchema = z.object({
  recipe: z.literal("drupal_eu_cookie_compliance.initial_selection.v1"),
  scopeSelector: z.literal("#sliding-popup .eu-cookie-compliance-banner"),
  submitSelector: z.literal(".eu-cookie-compliance-categories-buttons .eu-cookie-compliance-save-preferences-button"),
  complete: z.boolean(),
  categories: z.array(z.object({
    id: z.string().min(1).max(80), checked: z.boolean(), disabled: z.boolean(), inputType: z.literal("checkbox"),
  })).min(1).max(24),
});
const axeptioInitialConsentSelectionSchema = z.object({
  recipe: z.literal("axeptio.initial_optional_off_close.v1"),
  scopeSelector: z.literal("open_shadow_root:axeptio"),
  submitSelector: z.literal('#axeptio_btn_close[aria-label="Close cookie settings"]'),
  complete: z.boolean(),
  categories: z.array(z.object({
    id: z.string().min(1).max(80), checked: z.boolean(), disabled: z.boolean(), inputType: z.literal("checkbox"),
  })).min(2).max(24),
}).strict();
export const initialConsentSelectionSchema = z.union([drupalInitialConsentSelectionSchema, axeptioInitialConsentSelectionSchema]);
export type InitialConsentSelection = z.infer<typeof initialConsentSelectionSchema>;
/** The registered submit must describe saving the current selection, not a
 * conflicting decision. This is an observation recipe, never an action recipe. */
export function isInitialSelectionSubmit(label: string | undefined, reasons: readonly string[] = [], selection?: unknown): boolean {
  if (reasons.some(r => ["conflicting_consent_decisions", "visible_accessible_intent_conflict", "negated_consent_choice"].includes(r))) return false;
  if ((label ?? "").trim().toLowerCase() === "close") {
    const parsed = axeptioInitialConsentSelectionSchema.safeParse(selection);
    return parsed.success && isInitialNecessaryOnlySelection(parsed.data);
  }
  return ["accept selected", "accept selections", "save selection", "save preferences", "accetta solo i selezionati"].includes((label ?? "").trim().toLocaleLowerCase());
}
export function isInitialNecessaryOnlySelection(value: unknown): value is InitialConsentSelection {
  const p = initialConsentSelectionSchema.safeParse(value);
  if (!p.success || !p.data.complete) return false;
  const categories = p.data.categories;
  if (p.data.recipe === "axeptio.initial_optional_off_close.v1") {
    return new Set(categories.map(c => c.id)).size === categories.length && categories.every(c => !c.checked && !c.disabled);
  }
  return new Set(categories.map(c => c.id)).size === categories.length &&
    categories.some(c => c.id === "mandatory" && c.checked && c.disabled) &&
    categories.some(c => c.id !== "mandatory") &&
    categories.every(c => c.id === "mandatory" ? c.checked && c.disabled : !c.checked && !c.disabled);
}
