import { z } from "zod";

/** Reviewed WordPress 2.1.2 writer protocol; this is not a claim that the
 * currently loaded script's bytes were captured or that all services consent. */
export const COOKIEYES_LEGACY_PROTOCOL_SHA256 = "6c52384c7b0641dd1ead85d079c22d39bcc6dc5f2537afb1e6396bb619771a3f" as const;
export const cookieYesLegacyCategorySchema = z.enum([
  "necessary", "functional", "analytics", "performance", "advertisement", "other", "non-necessary",
]);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const time = z.number().int().nonnegative();
export const cookieYesLegacyConfigurationSchema = z.object({
  cookieName: z.literal("CookieLawInfoConsent"), flagName: z.literal("viewed_cookie_policy"),
  consentVersion: z.union([z.number().int().min(1).max(999999), z.string().regex(/^[1-9][0-9]{0,5}$/)]),
  categories: z.array(cookieYesLegacyCategorySchema).min(1).max(7),
  requiredCategories: z.array(cookieYesLegacyCategorySchema).min(1).max(7),
}).strict().superRefine((config, ctx) => {
  if (new Set(config.categories).size !== config.categories.length ||
    new Set(config.requiredCategories).size !== config.requiredCategories.length ||
    !config.requiredCategories.includes("necessary") ||
    config.requiredCategories.some(category => !config.categories.includes(category)) ||
    !config.categories.some(category => !config.requiredCategories.includes(category))) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "A complete distinct current checkbox universe and required/optional split are necessary."});
  }
});
export type CookieYesLegacyConfiguration = z.infer<typeof cookieYesLegacyConfigurationSchema>;
export const cookieYesLegacyReceiptEvidenceSchema = z.object({
  policyVersion: z.literal("cookieyes_legacy_current_categories.v1"),
  protocolSourceSha256: z.literal(COOKIEYES_LEGACY_PROTOCOL_SHA256),
  writeBinding: z.literal("exact_document_cookie_assignment"),
  controlAncestry: z.literal("#cookie-law-info-bar"),
  configuration: cookieYesLegacyConfigurationSchema,
  configurationCapturedAtEpochMs: time, documentSha256: hash,
  cookieIdentitySha256: hash, stateSha256: hash,
  baselineWriteSequence: time, writeSequence: time,
  writtenAtEpochMs: time, readAtEpochMs: time,
  categories: z.array(z.object({category: cookieYesLegacyCategorySchema, consent: z.boolean()}).strict()).min(1).max(7),
}).strict().superRefine((proof, ctx) => {
  const config = proof.configuration;
  if (proof.writeSequence <= proof.baselineWriteSequence || proof.configurationCapturedAtEpochMs > proof.writtenAtEpochMs || proof.writtenAtEpochMs > proof.readAtEpochMs ||
    new Set(proof.categories.map(row => row.category)).size !== proof.categories.length ||
    proof.categories.length !== config.categories.length ||
    proof.categories.some(row => !config.categories.includes(row.category) ||
      (config.requiredCategories.includes(row.category) && !row.consent))) {
    ctx.addIssue({code: z.ZodIssueCode.custom, message: "Legacy CookieYes requires a complete current receipt and ordered bound reads."});
  }
});
export type CookieYesLegacyReceiptEvidence = z.infer<typeof cookieYesLegacyReceiptEvidenceSchema>;
export function cookieYesLegacyReceiptDecision(proof: CookieYesLegacyReceiptEvidence) {
  const optional = proof.categories.filter(row => !proof.configuration.requiredCategories.includes(row.category));
  return optional.every(row => row.consent) ? "granted" as const
    : optional.every(row => !row.consent) ? "denied" as const : "mixed" as const;
}
export function validateCookieYesLegacyReceiptEnvelope(proof: CookieYesLegacyReceiptEvidence | undefined,
  envelope: {startedAt: string; completedAt: string; dispatchedAtMs?: number; observedAtMs?: number; frameIdentitySha256?: string; cmpId?: string}, ctx: z.RefinementCtx) {
  if (!proof) return;
  const start = Date.parse(envelope.startedAt), click = start + (envelope.dispatchedAtMs ?? NaN);
  if (envelope.cmpId !== "CookieYes" || proof.documentSha256 !== envelope.frameIdentitySha256 || !Number.isFinite(click) ||
    proof.configurationCapturedAtEpochMs < start || proof.configurationCapturedAtEpochMs > click || proof.writtenAtEpochMs < click ||
    proof.readAtEpochMs > Date.parse(envelope.completedAt) || envelope.observedAtMs === undefined ||
    start + envelope.observedAtMs !== proof.writtenAtEpochMs) {
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ["decisionEvidence"],
      message: "Legacy CookieYes proof must bind the live registered control, document, dispatch and exact fresh write."});
  }
}

/** A projected proof keeps its verified packet/document/control binding. The
 * original packet validator supplies the absolute action/read clock checks. */
export function validateCookieYesLegacyProjectionProof(proof: CookieYesLegacyReceiptEvidence | undefined,
  binding: {packetSha256?: string; actionControlProof?: {cmpId?: string; frameIdentitySha256?: string}}, ctx: z.RefinementCtx) {
  if (proof && (!binding.packetSha256 || binding.actionControlProof?.cmpId !== "CookieYes" ||
    binding.actionControlProof.frameIdentitySha256 !== proof.documentSha256)) {
    ctx.addIssue({code: z.ZodIssueCode.custom, path: ["decisionEvidence"],
      message: "Projected legacy CookieYes proof requires its verified packet, document and registered control."});
  }
}
