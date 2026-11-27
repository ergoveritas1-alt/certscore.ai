import { z } from "zod";
import { SUPPORTED_PRIVACY_EVIDENCE_LOCALES } from "./supported-languages";
import { classifyConsentControlLabel, hasConsentControlSemanticVeto, normalizeConsentControlText, ONETRUST_ITALIAN_ACCEPT_LABEL } from "./consent-control-label-classifier";

const consentActionControlLocaleSchema = z.enum(SUPPORTED_PRIVACY_EVIDENCE_LOCALES);
const consentActionControlMatchStrengthSchema = z.enum([
  "direct",
  "equivalent",
  "contextual",
  "weak",
]);

export const CONSENT_ACTION_CONTROL_PROOF_VERSION =
  "certscore.consent_action_control_proof.v2" as const;

export const REGISTERED_CONTEXTUAL_ACCEPT_POLICY = "registered_contextual_accept.v1" as const;

export const ONETRUST_ITALIAN_ACCEPT_CONTROL = {
  label: ONETRUST_ITALIAN_ACCEPT_LABEL,
  bannerSelector: "#onetrust-banner-sdk",
  groupSelector: "#onetrust-button-group",
  controlSelector: "#onetrust-accept-btn-handler",
  cmpId: "OneTrust",
  recipeId: "canonical-cmp:OneTrust:accept:v1",
  proofReason: "registered_onetrust_italian_accept.v1",
  locale: "it",
} as const;

const ONETRUST_BABYCENTER_ACCEPT_CONTROL = {
  ...ONETRUST_ITALIAN_ACCEPT_CONTROL,
  label: "I Consent",
  locale: "en",
  requestedUrl: "https://babycenter.com/",
  documentUrl: "https://www.babycenter.com/",
  documentSha256: "a818c6649076e5929c044534bc9a7d87181fde63828d07050ae044a59f0f21ae",
  proofReason: "registered_babycenter_onetrust_accept.v1",
} as const;
const ONETRUST_WHAT_TO_EXPECT_ACCEPT_CONTROL = {
  ...ONETRUST_BABYCENTER_ACCEPT_CONTROL,
  requestedUrl: "https://whattoexpect.com/",
  documentUrl: "https://www.whattoexpect.com/",
  documentSha256: "7bd9047d5b76c6c133991f6e51e692c70f2301c9a8e94401dd68f2da63a85eac",
  proofReason: "registered_what_to_expect_onetrust_accept.v1",
} as const;
export const REGISTERED_ONETRUST_ACCEPT_CONTROLS = [
  ONETRUST_ITALIAN_ACCEPT_CONTROL,
  ONETRUST_BABYCENTER_ACCEPT_CONTROL,
  ONETRUST_WHAT_TO_EXPECT_ACCEPT_CONTROL,
] as const;

export const REVIEWED_COOKIE_ACCEPT_CONTROLS = [
  {
    requestedUrl: "https://helpdeskeddy.com/",
    documentUrl: "https://helpdeskeddy.ru/",
    documentSha256: "f6d28adc624ef2c976b3492f4053e7151be1c8132f45cdf61ece5cf9e47f7a30",
    label: "Принять", locale: "ru", controlSelector: "#cookie-accept", bannerSelector: "#cookie-popup",
    notice: "Сайт использует cookie. Вы можете отказаться от использования cookie, изменив настройки в браузере.",
    proofReason: "reviewed_helpdeskeddy_cookie_accept.v1",
  },
  {
    requestedUrl: "https://moevideo.net/",
    documentUrl: "https://moe.video/",
    documentSha256: "af8ff4b882adce871ed86e0de720a8ded8d34267655c23185d4a83f7578ed080",
    label: "Принять", locale: "ru", controlSelector: "#accept-cookies", bannerSelector: "#cookie-consent",
    notice: "Мы используем cookies для улучшения вашего опыта. Продолжая, вы соглашаетесь с нашей политикой Cookies и политикой конфиденциальности",
    proofReason: "reviewed_moe_video_cookie_accept.v1",
  },
  {
    documentUrl: "https://cpj.org/",
    documentSha256: "d9304fd2d4560fbee06fc3a38b056252f9b9b2d59834c503ae8be4481fdebfa1",
    label: "Aceitar cookies", locale: "pt", controlSelector: "#onetrust-accept-btn-handler",
    bannerSelector: "#onetrust-banner-sdk",
    notice: "Este website utiliza cookies para melhorar a experiência do utilizador e para analisar o desempenho e o tráfego no nosso website.",
    proofReason: "reviewed_cpj_cookie_accept.v1",
  },
  {
    documentUrl: "https://banco.bradesco/html/classic/index.shtm",
    documentSha256: "87d54043c43b0fee99b3e765396afd9f5a79bec96208c2db75b969f78682c461",
    label: "Aceitar cookies", locale: "pt", controlSelector: "#aceitarCookies", bannerSelector: "#cookies",
    notice: "Usamos cookies pra oferecer a melhor experiência, analisar o uso de nosso site e direcionar conteúdos e anúncios personalizados.",
    proofReason: "reviewed_bradesco_cookie_accept.v1",
  },
  {
    documentUrl: "https://www.flashscore.gr/",
    documentSha256: "8d4d870bc92456410b4b018ee3eef8c6b626f7273058c6599fe8240f3c422ab2",
    label: "Αποδοχή", locale: "el", controlSelector: "#onetrust-accept-btn-handler", bannerSelector: "#onetrust-banner-sdk",
    notice: "Η επιλογή Αποδοχή επιτρέπει στις τεχνολογίες παρακολούθησης",
    proofReason: "reviewed_flashscore_gr_cookie_accept.v1",
  },
] as const;

export const REVIEWED_COOKIE_REJECT_CONTROLS = [
  {
    requestedUrl: "https://helpdeskeddy.com/",
    documentUrl: "https://helpdeskeddy.ru/",
    documentSha256: "f6d28adc624ef2c976b3492f4053e7151be1c8132f45cdf61ece5cf9e47f7a30",
    label: "Отказаться", labelSource: "visible_text", locale: "ru",
    controlSelector: "#cookie-decline", bannerSelector: "#cookie-popup",
    notice: "Сайт использует cookie. Вы можете отказаться от использования cookie, изменив настройки в браузере.",
    actionSemantics: "direct_label",
    proofReason: "reviewed_helpdeskeddy_cookie_reject.v1",
  },
  {
    requestedUrl: "https://vizor-games.com/",
    documentUrl: "https://vizor-games.com/",
    documentSha256: "053dd59f9f0e6c78190cfbf9b740d294d17f680fbd2263d278b2a85082e527cc",
    label: "Accept only necessary", labelSource: "visible_text", locale: "en",
    controlSelector: "#acceptNecessaryButton", bannerSelector: ".cookies-content",
    notice: "We and our partners use tracking technologies like cookies to provide you with personalised functionalities of the Website, to perform analytics to monitor how users use our website and help us improve it.",
    actionSemantics: "canonical_necessary_only_recipe",
    proofReason: "reviewed_vizor_cookie_reject.v1",
  },
  {
    requestedUrl: "https://virginmediao2.co.uk/",
    documentUrl: "https://www.virginmediao2.co.uk/",
    documentSha256: "b0b285fdba10a77e65999b119a716f42b3f0b019c09c487f9da9afd088bc9ae6",
    label: "Accept essential cookies only", labelSource: "aria_label", locale: "en",
    controlSelector: "#privacy_pref_optout", bannerSelector: "#cookiePrompt",
    notice: "To change your settings and manage any non-essential cookies please open the cookie jar.",
    actionSemantics: "canonical_necessary_only_recipe",
    proofReason: "reviewed_virginmediao2_cookie_reject.v1",
  },
  {
    requestedUrl: "https://telekom.de/",
    documentUrl: "https://www.telekom.de/start",
    documentSha256: "1cec6ea080fc32ecf297c86e02a3ade23fab9850a97b4dc3b985b305f670d2f5",
    label: "Only required", labelSource: "visible_text", locale: "en",
    controlSelector: "#rejectAll", bannerSelector: "#promptLayerContent",
    notice: "By selecting “Only Required”, you only accept cookies that make our website function properly.",
    actionSemantics: "canonical_necessary_only_recipe",
    proofReason: "reviewed_telekom_cookie_reject.v1",
  },
] as const;

export const ALMA_AXEPTIO_ACCEPT_CONTROL = {
  requestedUrl: "https://getalma.eu/",
  documentUrl: "https://almapay.com/",
  documentSha256: "2bcef1352c4827581d36facfce6c6d810e38ba584651ba838753969ba24f4b7f",
  label: "Accept all cookies",
  visibleLabel: "OK!",
  controlSelector: "#axeptio_btn_acceptAll",
  bannerSelector: '[data-testid="widget-container"]',
  notice: "Do you agree to be accompanied during your visit?",
  recipeId: "canonical-control:accept:alma-axeptio:v1",
  proofReason: "reviewed_alma_axeptio_accept.v1",
} as const;

export const CAIA_ACCEPT_CONTROL = {
  targetUrl: "https://caiacosmetics.se/",
  label: "JAG GODKÄNNER",
  controlSelector: "#cookie_consent_manage_rec",
  bannerSelector: "#cookie_consent_manager_wrapper > #cookie_consent",
  recipeId: "canonical-control:caia:accept:v1",
  proofReason: "registered_caia_accept_listener.v1",
  cookieName: "air_cookie_consent",
  grantedValue: '{"1":true,"2":true,"3":true,"4":true}',
} as const;

export const DAFITI_ADOPT_ACCEPT_CONTROL = {
  targetUrl: "https://www.dafiti.com.br/",
  label: "Aceitar",
  bannerSelector: "#cookie-banner",
  controlSelector: "#adopt-accept-all-button",
  recipeId: "canonical-control:adopt:dafiti:accept:v1",
  proofReason: "registered_dafiti_adopt_accept.v1",
} as const;

export function classifyDafitiAdoptAcceptLabel(label: string | undefined) {
  if (label !== DAFITI_ADOPT_ACCEPT_CONTROL.label) return;
  const result = classifyConsentControlLabel({label, usage: "action", classifierProfile: "multilingual_v1", hasConsentContext: true});
  if (result.intent === "accept" && result.matchedLocale === "pt" &&
      result.matchStrength === "contextual" && result.contextSatisfied && !hasConsentControlSemanticVeto(result)) return result;
}

export const DRUPAL_NO_THANKS_REJECT_CONTROL = {
  label: "No, thanks",
  cmpId: "Drupal EU Cookie Compliance module, non-TCF",
  recipeId: "canonical-cmp:Drupal EU Cookie Compliance module, non-TCF:reject:v2",
  controlSelector: "button.decline-button",
  bannerSelector: "#sliding-popup .eu-cookie-compliance-banner #popup-buttons button.decline-button",
  proofReason: "registered_drupal_no_thanks_reject.v1",
} as const;

export const UNSW_NECESSARY_ONLY_REJECT = {
  requestedUrl: "https://unsw.edu.au/",
  documentUrl: "https://www.unsw.edu.au/",
  documentSha256: "a954fd521a1a80ed1328dcbb8a5d49eb243e8b96bd33eea8c985175ba10bbc37",
  label: "Accept only essential",
  normalizedLabel: "accept only essential",
  policyVersion: "label_bound_necessary_only_reject.unsw.v1",
  instruction: "You can reject all non-essential processing by accepting only necessary cookies.",
} as const;

/** Versioned activation vocabulary. Generic observation terms remain separate;
 * the named adapter must still prove the exact live banner/control binding. */
export const NAMED_NECESSARY_ONLY_REJECT_LABELS = {
  "label_bound_necessary_only_reject.v1": ["strictly necessary", "essential cookies"],
  "label_bound_necessary_only_reject.v2": ["strictly necessary", "essential cookies", "accept only necessary"],
  [UNSW_NECESSARY_ONLY_REJECT.policyVersion]: [UNSW_NECESSARY_ONLY_REJECT.normalizedLabel],
} as const;

export const customAcceptControlBindingSchema = z.object({
  policyVersion: z.literal("custom_accept_control.v1"),
  kind: z.literal("direct_onclick"),
  tagName: z.string().max(64).regex(/^(?:span|div|[a-z][a-z0-9]*-[a-z0-9-]+)$/),
  bannerSelector: z.string().min(1).max(500),
  handlerSha256: z.string().regex(/^[a-f0-9]{64}$/),
  nonTransactional: z.literal(true),
}).strict();
export type CustomAcceptControlBinding = z.infer<typeof customAcceptControlBindingSchema>;

/** Does not lower the ordinary direct-label action threshold. A reviewed named
 * recipe must separately prove the exact label and its live first-layer scope. */
export function isRegisteredContextualAcceptLabel(label: string, expectedNormalizedLabel: string) {
  const classification = classifyConsentControlLabel({ label, hasConsentContext: true });
  return normalizeConsentControlText(label) === expectedNormalizedLabel &&
    classification.intent === "accept" && classification.matchStrength === "contextual" &&
    classification.variant === "approval_acknowledgment" && classification.contextSatisfied;
}

export const consentActionControlProofSchema = z.object({
  contractVersion: z.enum(["certscore.consent_action_control_proof.v1", CONSENT_ACTION_CONTROL_PROOF_VERSION]),
  action: z.enum(["accept", "reject"]),
  observedAtMs: z.number().int().nonnegative(),
  accessibleLabel: z.string().min(1).max(160),
  labelSource: z.enum([
    "aria_label",
    "visible_text",
    "value",
    "title",
    "accessibility_tree",
  ]),
  actionSemantics: z.enum(["direct_label", "canonical_necessary_only_recipe", "registered_contextual_accept"]),
  contextualApproval: z.object({
    policyVersion: z.literal(REGISTERED_CONTEXTUAL_ACCEPT_POLICY),
    bannerSelector: z.string().min(1).max(500),
    expectedNormalizedLabel: z.string().min(1).max(160),
  }).strict().optional(),
  customControlBinding: customAcceptControlBindingSchema.optional(),
  labelBoundNecessaryOnly: z.object({
    policyVersion: z.enum(["label_bound_necessary_only_reject.v1", "label_bound_necessary_only_reject.v2", UNSW_NECESSARY_ONLY_REJECT.policyVersion]),
    bannerSelector: z.literal("#onetrust-banner-sdk"),
    controlSelector: z.literal("#onetrust-reject-all-handler"),
    contextText: z.string().min(1).max(4096),
  }).strict().optional(),
  classifierIntent: z.enum(["accept", "reject", "options", "privacy_opt_out", "unknown"]),
  classifierConfidence: z.number().min(0).max(1),
  matchedLocale: consentActionControlLocaleSchema.optional(),
  matchStrength: consentActionControlMatchStrengthSchema.optional(),
  classifierReasonCodes: z.array(z.string().min(1).max(80)).max(16).default([]),
  cmpId: z.string().min(1).max(120).optional(),
  recipeId: z.string().min(1).max(160),
  selectorHint: z.string().min(1).max(500),
  frameIdentitySha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  authorizedTargetSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  visible: z.literal(true),
  enabled: z.literal(true),
  uniquelyActionable: z.literal(true),
}).strict().superRefine((proof, context) => {
  const drupal = DRUPAL_NO_THANKS_REJECT_CONTROL;
  const drupalScope = proof.classifierReasonCodes.includes(drupal.proofReason);
  if (drupalScope || (proof.contractVersion === CONSENT_ACTION_CONTROL_PROOF_VERSION &&
    proof.action === "reject" && proof.accessibleLabel === drupal.label)) {
    const classification = classifyConsentControlLabel({label: drupal.label, usage: "action", classifierProfile: "multilingual_v1", hasConsentContext: true});
    if (!drupalScope || proof.contractVersion !== CONSENT_ACTION_CONTROL_PROOF_VERSION ||
      proof.action !== "reject" || proof.actionSemantics !== "direct_label" || proof.accessibleLabel !== drupal.label ||
      proof.labelSource !== "visible_text" || proof.cmpId !== drupal.cmpId || proof.recipeId !== drupal.recipeId ||
      proof.selectorHint !== drupal.controlSelector || proof.matchStrength !== "weak" || proof.matchedLocale !== "en" ||
      proof.classifierConfidence !== classification.confidence || !proof.authorizedTargetSha256 ||
      proof.frameIdentitySha256 !== proof.authorizedTargetSha256) {
      context.addIssue({code: z.ZodIssueCode.custom, path: ["classifierReasonCodes"],
        message: "The registered Drupal refusal label requires exact decline-button and document proof."});
    }
  }
  const oneTrustAccept = REGISTERED_ONETRUST_ACCEPT_CONTROLS.find(scope =>
    proof.classifierReasonCodes.includes(scope.proofReason));
  const requiresOneTrustScope = proof.contractVersion === CONSENT_ACTION_CONTROL_PROOF_VERSION &&
    proof.action === "accept" && REGISTERED_ONETRUST_ACCEPT_CONTROLS.some(scope => proof.accessibleLabel === scope.label);
  if ((oneTrustAccept || requiresOneTrustScope) && (!oneTrustAccept ||
    proof.contractVersion !== CONSENT_ACTION_CONTROL_PROOF_VERSION || proof.action !== "accept" ||
    proof.actionSemantics !== "direct_label" || proof.accessibleLabel !== oneTrustAccept.label ||
    (proof.labelSource !== "visible_text" && proof.labelSource !== "aria_label") ||
    proof.cmpId !== oneTrustAccept.cmpId || proof.recipeId !== oneTrustAccept.recipeId ||
    proof.selectorHint !== oneTrustAccept.controlSelector || proof.matchedLocale !== oneTrustAccept.locale ||
    proof.matchStrength !== "direct" || !proof.authorizedTargetSha256 ||
    proof.frameIdentitySha256 !== proof.authorizedTargetSha256 ||
    ("documentSha256" in oneTrustAccept && proof.authorizedTargetSha256 !== oneTrustAccept.documentSha256))) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ["classifierReasonCodes"],
      message: "Registered OneTrust Accept labels require exact control and document proof."});
  }
  const reviewedCookieAccept = REVIEWED_COOKIE_ACCEPT_CONTROLS.find(scope => proof.classifierReasonCodes.includes(scope.proofReason));
  if (reviewedCookieAccept && (proof.contractVersion !== CONSENT_ACTION_CONTROL_PROOF_VERSION || proof.action !== "accept" ||
    proof.actionSemantics !== "direct_label" || proof.labelSource !== "visible_text" ||
    proof.accessibleLabel !== reviewedCookieAccept.label || proof.matchStrength !== "direct" ||
    proof.matchedLocale !== reviewedCookieAccept.locale || proof.selectorHint !== reviewedCookieAccept.controlSelector ||
    proof.authorizedTargetSha256 !== reviewedCookieAccept.documentSha256 || proof.frameIdentitySha256 !== reviewedCookieAccept.documentSha256)) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ["classifierReasonCodes"],
      message: "The reviewed cookie Accept control requires its exact visible label, selector, and document."});
  }
  const reviewedCookieReject = REVIEWED_COOKIE_REJECT_CONTROLS.find(scope => proof.classifierReasonCodes.includes(scope.proofReason));
  if (reviewedCookieReject && (proof.contractVersion !== CONSENT_ACTION_CONTROL_PROOF_VERSION ||
    !matchesReviewedCookieReject(proof, reviewedCookieReject))) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ["classifierReasonCodes"],
      message: "The reviewed cookie Reject control requires its exact label, selector, and document."});
  }
  const alma = ALMA_AXEPTIO_ACCEPT_CONTROL;
  if (proof.recipeId === alma.recipeId || proof.classifierReasonCodes.includes(alma.proofReason)) {
    if (proof.contractVersion !== CONSENT_ACTION_CONTROL_PROOF_VERSION || proof.action !== "accept" ||
      proof.actionSemantics !== "direct_label" || proof.classifierIntent !== "accept" ||
      proof.accessibleLabel !== alma.label || proof.labelSource !== "aria_label" || proof.matchStrength !== "direct" ||
      proof.selectorHint !== alma.controlSelector || proof.recipeId !== alma.recipeId ||
      !proof.classifierReasonCodes.includes(alma.proofReason) ||
      proof.authorizedTargetSha256 !== alma.documentSha256 || proof.frameIdentitySha256 !== alma.documentSha256) {
      context.addIssue({code: z.ZodIssueCode.custom, path: ["classifierReasonCodes"],
        message: "Alma Accept requires its exact accessible label, selector, and document."});
    }
  }
  const caia = CAIA_ACCEPT_CONTROL;
  if (proof.recipeId === caia.recipeId || proof.classifierReasonCodes.includes(caia.proofReason)) {
    if (proof.contractVersion !== CONSENT_ACTION_CONTROL_PROOF_VERSION ||
      proof.action !== "accept" || proof.actionSemantics !== "direct_label" || proof.labelSource !== "visible_text" ||
      proof.accessibleLabel !== caia.label || proof.recipeId !== caia.recipeId ||
      !proof.classifierReasonCodes.includes(caia.proofReason) || proof.selectorHint !== caia.controlSelector ||
      proof.matchedLocale !== "sv" || proof.matchStrength !== "direct" || !proof.authorizedTargetSha256 ||
      proof.frameIdentitySha256 !== proof.authorizedTargetSha256) {
      context.addIssue({code: z.ZodIssueCode.custom, path: ["classifierReasonCodes"],
        message: "CAIA Accept requires the reviewed listener and exact first-layer document proof."});
    }
  }
  const adopt = DAFITI_ADOPT_ACCEPT_CONTROL;
  const adoptScope = proof.classifierReasonCodes.includes(adopt.proofReason);
  if (proof.recipeId === adopt.recipeId || adoptScope) {
    const classification = classifyDafitiAdoptAcceptLabel(proof.accessibleLabel);
    if (proof.contractVersion !== CONSENT_ACTION_CONTROL_PROOF_VERSION || !classification ||
      proof.action !== "accept" || proof.actionSemantics !== "direct_label" || proof.labelSource !== "visible_text" ||
      proof.recipeId !== adopt.recipeId || !adoptScope ||
      proof.selectorHint !== adopt.controlSelector || proof.matchedLocale !== "pt" || proof.matchStrength !== "contextual" ||
      proof.classifierConfidence !== classification.confidence || !proof.authorizedTargetSha256 ||
      proof.frameIdentitySha256 !== proof.authorizedTargetSha256) {
      context.addIssue({code: z.ZodIssueCode.custom, path: ["classifierReasonCodes"],
        message: "The registered Dafiti Accept label requires exact button and document proof."});
    }
  }
  if (!proof.labelBoundNecessaryOnly && proof.classifierReasonCodes.some(code => Object.hasOwn(NAMED_NECESSARY_ONLY_REJECT_LABELS, code))) {
    context.addIssue({code: z.ZodIssueCode.custom, path: ["labelBoundNecessaryOnly"],
      message: "Reviewed necessary-only labels must retain their scoped instruction proof."});
  }
  if (proof.labelBoundNecessaryOnly) {
    const classification = classifyConsentControlLabel({ usage: "observation", classifierProfile: "multilingual_v1",
      label: proof.accessibleLabel, contextText: proof.labelBoundNecessaryOnly.contextText, hasConsentContext: true });
    if (proof.contractVersion !== CONSENT_ACTION_CONTROL_PROOF_VERSION || proof.action !== "reject" ||
      proof.actionSemantics !== "canonical_necessary_only_recipe" || proof.cmpId !== "OneTrust" ||
      proof.recipeId !== "canonical-cmp:OneTrust:reject:v3" || !proof.frameIdentitySha256 || !proof.authorizedTargetSha256 ||
      proof.selectorHint !== "#onetrust-reject-all-handler, #onetrust-banner-sdk.ot-close-btn-link button.onetrust-close-btn-handler.banner-close-button" ||
      !(NAMED_NECESSARY_ONLY_REJECT_LABELS[proof.labelBoundNecessaryOnly.policyVersion] as readonly string[]).includes(normalizeConsentControlText(proof.accessibleLabel)) ||
      (proof.labelBoundNecessaryOnly.policyVersion === UNSW_NECESSARY_ONLY_REJECT.policyVersion && !isUnswNecessaryOnlyRejectProof(proof)) ||
      classification.intent !== "reject" || classification.variant !== "necessary_only" ||
      proof.classifierIntent !== classification.intent || proof.classifierConfidence !== classification.confidence ||
      proof.matchStrength !== classification.matchStrength || proof.matchedLocale !== classification.matchedLocale) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["labelBoundNecessaryOnly"],
        message: "Necessary-only activation requires authorized named-CMP proof and exact label-bound refusal instructions." });
    }
  }
  if (proof.recipeId.startsWith("canonical-control:accept:custom-v1:") && !proof.customControlBinding) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["customControlBinding"], message: "Custom recipe proof must retain its binding." });
  }
  if (proof.customControlBinding && (proof.contractVersion !== CONSENT_ACTION_CONTROL_PROOF_VERSION ||
    proof.action !== "accept" || proof.actionSemantics !== "direct_label" || proof.cmpId ||
    !proof.frameIdentitySha256 || !proof.authorizedTargetSha256 ||
    !proof.recipeId.startsWith("canonical-control:accept:custom-v1:"))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["customControlBinding"],
      message: "Custom Accept binding requires authorized, frame-bound, canonical direct-label proof." });
  }
  if (proof.actionSemantics === "registered_contextual_accept") {
    const classification = classifyConsentControlLabel({ label: proof.accessibleLabel, hasConsentContext: true });
    if (proof.contractVersion !== CONSENT_ACTION_CONTROL_PROOF_VERSION || proof.action !== "accept" ||
      proof.classifierIntent !== "accept" || proof.matchStrength !== "contextual" ||
      proof.classifierConfidence !== classification.confidence || !proof.contextualApproval ||
      !proof.cmpId || !proof.frameIdentitySha256 || !proof.authorizedTargetSha256 ||
      !isRegisteredContextualAcceptLabel(proof.accessibleLabel, proof.contextualApproval.expectedNormalizedLabel)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["contextualApproval"],
        message: "Contextual activation requires v2 named, scope-bound canonical approval proof; it is not a consent decision." });
    }
  } else if (proof.contextualApproval) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["contextualApproval"],
      message: "Contextual approval metadata belongs only to contextual activation proof." });
  }
  if (
    proof.actionSemantics === "direct_label" &&
    (proof.classifierIntent !== proof.action || (!drupalScope && !adoptScope && proof.classifierConfidence < 0.8))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Direct action-control proof must classify to the dispatched action.",
      path: ["classifierIntent"],
    });
  }
  if (proof.actionSemantics === "canonical_necessary_only_recipe" && proof.action !== "reject") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A canonical necessary-only action may verify only a Reject-equivalent action.",
      path: ["actionSemantics"],
    });
  }
});

export type ConsentActionControlProof = z.infer<typeof consentActionControlProofSchema>;

function matchesReviewedCookieReject(proof: ConsentActionControlProof, scope: typeof REVIEWED_COOKIE_REJECT_CONTROLS[number]) {
  return proof.action === "reject" && proof.actionSemantics === scope.actionSemantics &&
    proof.classifierIntent === "reject" && proof.accessibleLabel === scope.label && proof.labelSource === scope.labelSource &&
    proof.matchedLocale === scope.locale && proof.selectorHint === scope.controlSelector &&
    proof.authorizedTargetSha256 === scope.documentSha256 && proof.frameIdentitySha256 === scope.documentSha256;
}

export function reviewedConsentProofMatchesRequestedUrl(requestedUrl: string, proof: ConsentActionControlProof): boolean {
  const scope = [ALMA_AXEPTIO_ACCEPT_CONTROL, ...REVIEWED_COOKIE_ACCEPT_CONTROLS, ...REVIEWED_COOKIE_REJECT_CONTROLS]
    .find(control => proof.classifierReasonCodes.includes(control.proofReason));
  return !scope || !("requestedUrl" in scope) || scope.requestedUrl === requestedUrl;
}

export function isReviewedCookieRejectProof(requestedUrl: string, proof: ConsentActionControlProof): boolean {
  return REVIEWED_COOKIE_REJECT_CONTROLS.some(scope => requestedUrl === scope.requestedUrl &&
    proof.classifierReasonCodes.includes(scope.proofReason) && matchesReviewedCookieReject(proof, scope));
}

export function isUnswNecessaryOnlyRejectProof(proof: ConsentActionControlProof): boolean {
  const scope = UNSW_NECESSARY_ONLY_REJECT;
  return proof.labelBoundNecessaryOnly?.policyVersion === scope.policyVersion &&
    proof.accessibleLabel === scope.label && proof.labelSource === "visible_text" &&
    proof.authorizedTargetSha256 === scope.documentSha256 && proof.frameIdentitySha256 === scope.documentSha256 &&
    proof.labelBoundNecessaryOnly.contextText.includes(scope.instruction);
}
