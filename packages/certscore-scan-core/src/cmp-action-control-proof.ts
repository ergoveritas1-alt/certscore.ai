import {
  CONSENT_ACTION_CONTROL_PROOF_VERSION,
  classifyConsentControlLabel,
  hasConsentControlSemanticVeto,
  isRegisteredContextualAcceptLabel,
  normalizeConsentControlText,
  type ConsentActionControlProof,
  type PostRefusalInteractionDiagnostics,
} from "@certscore/contracts";
import { getKnownCmpDefinitionByName } from "@website-signal-risk-scanner/shared";
import { createHash } from "node:crypto";
import { inspectLocatorActionability, locatorActionabilitySupportsVerifiedDispatch } from "./cmp-control-actionability.js";
import type { Locator, Page } from "playwright";
import { readConsentActionLabelFields, type ConsentActionLabelFields } from "./consent-action-label-fields.js";
import { consentScopePermitsInteraction, consentScopeInteractionState } from "./cmp-action-target.js";
import { inspectCustomAcceptControl, sameCustomAcceptControlBinding } from "./custom-accept-control.js";
import type { CustomAcceptControlBinding } from "@certscore/contracts";
import {
  readClosedShadowAccessibleControlLabel,
  type CmpAccessibleActionResolution,
} from "./cmp-accessible-action.js";

type ControlLabelFields = ConsentActionLabelFields;

export type ConsentActionControlProofResolution =
  | { status: "verified"; proof: ConsentActionControlProof }
  | { status: "label_mismatch" | "label_unverifiable"; reason: string };

/** Unreadable/weak labels may be rediscovered inside the original search budget.
 * Opposite decisions, semantic conflicts and transactional controls never qualify. */
export function consentActionLabelNeedsRediscovery(resolution: ConsentActionControlProofResolution): boolean {
  return resolution.status === "label_unverifiable" && (
    resolution.reason === "resolved_control_label_not_classified" ||
    resolution.reason === "resolved_control_label_below_confidence_threshold"
  );
}

/** Owner-approved opacity-only settling: one second inside the original search
 * deadline, for one directly classified choice. Always rebuild full proof and
 * refresh the pre-action baseline afterward; this helper never clicks. */
export async function waitForTransparentConsentControl(input: {
  action: "accept" | "reject"; control: Locator; page: Page;
  selectorHint: string; controlFrameUrl?: string;
  authorizedTargetSha256?: string; deadlineAtMs: number; signal?: AbortSignal;
}): Promise<boolean> {
  const deadlineAtMs = Math.min(input.deadlineAtMs, Date.now() + 1_000);
  const remainingMs = () => Math.max(1, deadlineAtMs - Date.now());
  while (Date.now() < deadlineAtMs) {
    if (input.signal?.aborted || input.page.isClosed()) return false;
    try { assertConsentActionDispatchAllowed(input.page, input.signal, input.authorizedTargetSha256); }
    catch { return false; }
    const scopes = input.controlFrameUrl
      ? input.page.frames().filter(frame => frame.url() === input.controlFrameUrl) : [input.page];
    if (scopes.length !== 1 || await scopes[0]!.locator(input.selectorHint).count().catch(() => 0) !== 1 ||
      !await input.control.isEnabled({timeout: remainingMs()}).catch(() => false)) return false;
    const labels = boundFields(await readControlLabelFields(input.control, remainingMs()));
    const classified = classifyConsentControlLabel({usage: "action", classifierProfile: "multilingual_v1",
      label: preferredLabel(labels)?.value, hasConsentContext: true});
    if (sourceIntentConflict(labels) || classified.intent !== input.action || classified.confidence < 0.8 ||
      classified.matchedLocale === "mk" || classified.variant === "reject_with_subscription" ||
      classified.variant === "reject_with_payment") return false;
    const state = await consentScopeInteractionState(input.control, remainingMs());
    if (Date.now() >= deadlineAtMs || input.signal?.aborted) return false;
    if (state === "interactive") return true;
    if (state !== "transparent") return false;
    await new Promise<void>(resolve => {
      const finish = () => {clearTimeout(timer);input.signal?.removeEventListener("abort",finish);resolve();};
      const timer = setTimeout(finish, Math.min(50, Math.max(0, deadlineAtMs - Date.now())));
      input.signal?.addEventListener("abort",finish,{once:true});
    });
  }
  return false;
}

/** Synchronous last-mile check, including after geometry/CDP awaits. */
export function assertConsentActionDispatchAllowed(page: Page, signal?: AbortSignal, authorizedTargetSha256?: string) {
  if (signal?.aborted) throw new Error("abort_requested_before_action");
  if (authorizedTargetSha256 && sha256(normalizedTarget(page.url())) !== authorizedTargetSha256) {
    throw new Error("redirect_target_not_authorized");
  }
}

/** Revalidate the reviewed necessary-only scope at the final dispatch boundary,
 * after any resolver, baseline, geometry or caller awaits. Never clicks. */
export async function assertReviewedRejectDispatchAllowed(input: {
  page: Page; control: Locator; proof?: ConsentActionControlProof; controlFrameUrl?: string; signal?: AbortSignal;
}) {
  const proof = input.proof;
  if (!proof || (!proof.labelBoundNecessaryOnly &&
    !(proof.matchedLocale === "pt" && normalizeConsentControlText(proof.accessibleLabel) === "rejeitar"))) return;
  const definition = getKnownCmpDefinitionByName(proof.cmpId);
  if (!proof.authorizedTargetSha256 || (definition?.domSelectors?.[0] &&
    !await verifyContextualApprovalScope(input.control, definition.domSelectors[0], true))) {
    throw new Error("reviewed_reject_dispatch_binding_changed");
  }
  const current = await buildConsentActionControlProof({action: "reject",page: input.page, control: input.control,
    cmpId: proof.cmpId, recipeId: proof.recipeId, selectorHint: proof.selectorHint,
    observedAtMs: proof.observedAtMs, authorizedTargetSha256: proof.authorizedTargetSha256,
    controlFrameUrl: input.controlFrameUrl, signal: input.signal});
  if (current.status !== "verified" ||
    current.proof.accessibleLabel !== proof.accessibleLabel ||
    current.proof.frameIdentitySha256 !== proof.frameIdentitySha256 ||
    current.proof.labelBoundNecessaryOnly?.contextText !== proof.labelBoundNecessaryOnly?.contextText) {
    throw new Error("reviewed_reject_dispatch_binding_changed");
  }
  assertConsentActionDispatchAllowed(input.page, input.signal, proof.authorizedTargetSha256);
}

export async function buildConsentActionControlProof(input: {
  signal?: AbortSignal;
  onLabelInspection?: (snapshot: Omit<NonNullable<PostRefusalInteractionDiagnostics["resolver"]>["snapshots"][number], "attempt" | "elapsedMs">) => void;
  action: "accept" | "reject";
  authorizedTargetSha256?: string;
  canonicalNecessaryOnly?: { expectedNormalizedLabel: string };
  cmpId?: string;
  control: Locator;
  controlFrameUrl?: string;
  expectedAccessibleControl?: CmpAccessibleActionResolution;
  expectedCustomControlBinding?: CustomAcceptControlBinding;
  observedAtMs: number;
  page: Page;
  recipeId: string;
  selectorHint: string;
}): Promise<ConsentActionControlProofResolution> {
  if (input.signal?.aborted) return { status: "label_unverifiable", reason: "abort_requested_before_action" };
  if (input.authorizedTargetSha256 && sha256(normalizedTarget(input.page.url())) !== input.authorizedTargetSha256) {
    return { status: "label_unverifiable", reason: "redirect_target_not_authorized" };
  }
  if (input.expectedAccessibleControl?.kind !== "closed_shadow_accessible_control") {
    if (!await consentScopePermitsInteraction(input.control)) {
      return { status: "label_unverifiable", reason: "resolved_control_scope_not_interactive" };
    }
    if (!locatorActionabilitySupportsVerifiedDispatch(await inspectLocatorActionability(input.control))) {
      return { status: "label_unverifiable", reason: "resolved_control_no_longer_actionable" };
    }
  }
  const fields = input.expectedAccessibleControl?.kind === "closed_shadow_accessible_control"
    ? {
        ariaLabel: await readClosedShadowAccessibleControlLabel(
          input.page,
          input.expectedAccessibleControl,
        ),
      }
    : await readControlLabelFields(input.control);
  const bounded = boundFields(fields);
  // Retain the exact bounded label sources read for proof, without another DOM
  // round trip. This is a candidate read, never dispatch or registration proof.
  const labelEntries = ([['aria_label', bounded.ariaLabel], ['visible_text', bounded.visibleText],
    ['value', bounded.value], ['title', bounded.title]] as const).filter((entry) => Boolean(entry[1]));
  input.onLabelInspection?.({
    source: "control_proof", state: "candidate_detected",
    selectorMatchCount: 1, visibleCount: 1, enabledCount: 1,
    labelMatchCount: 0, actionableCount: 0,
    cmpIds: input.cmpId ? [input.cmpId.slice(0, 120)] : [],
    controlLabels: labelEntries.map((entry) => entry[1]!.slice(0, 120)),
    binding: { selectorSha256: sha256(input.selectorHint),
      frameIdentitySha256: sha256(input.controlFrameUrl ?? input.page.url()),
      labelSources: labelEntries.map((entry) => entry[0]) },
  });
  const definition = getKnownCmpDefinitionByName(input.cmpId);
  const contextualApproval = definition?.acceptContextualApproval &&
    input.recipeId === `canonical-cmp:${definition.canonicalName}:accept:${definition.recipeVersion ?? "v1"}` &&
    input.selectorHint === definition.acceptControlSelectors?.join(", ")
    ? definition.acceptContextualApproval : undefined;
  const contextualLabelVerified = contextualApproval &&
    isRegisteredContextualAcceptLabel(preferredLabel(bounded)?.value ?? "", contextualApproval.expectedNormalizedLabel);
  const necessaryOnlyRecipe = input.action === "reject" && definition?.rejectLabelBoundNecessaryOnly &&
    input.recipeId === `canonical-cmp:${definition.canonicalName}:reject:v3` &&
    input.selectorHint === definition.rejectControlSelectors?.join(", ") &&
    input.authorizedTargetSha256 && !input.expectedAccessibleControl &&
    definition.rejectLabelBoundNecessaryOnly.expectedNormalizedLabels.includes(normalizeConsentControlText(preferredLabel(bounded)?.value))
    ? definition.rejectLabelBoundNecessaryOnly : undefined;
  const necessaryOnlyContext = necessaryOnlyRecipe
    ? await readLabelBoundNecessaryOnlyContext(input.control, necessaryOnlyRecipe) : undefined;
  const labelBoundNecessaryOnly = necessaryOnlyRecipe && necessaryOnlyContext
    ? { policyVersion: necessaryOnlyRecipe.policyVersion,
        bannerSelector: "#onetrust-banner-sdk" as const, controlSelector: "#onetrust-reject-all-handler" as const,
        contextText: necessaryOnlyContext } : undefined;
  const classification = classifyConsentControlLabel({
    // Discovery and every proof check must use the same canonical locale set.
    // In particular, do not lose Dutch intent or miss a cross-language conflict.
    usage: labelBoundNecessaryOnly ? "observation" : "action", classifierProfile: "multilingual_v1",
    label: preferredLabel(bounded)?.value,
    ...(labelBoundNecessaryOnly ? { contextText: labelBoundNecessaryOnly.contextText } : {}),
    hasConsentContext: true,
  });
  const conflictingIntent = sourceIntentConflict(bounded, labelBoundNecessaryOnly?.contextText);
  if (conflictingIntent) {
    return {
      status: "label_mismatch",
      reason: `resolved_control_label_conflict:${conflictingIntent}`,
    };
  }
  if (
    input.action === "reject" &&
    (classification.variant === "reject_with_subscription" ||
      classification.variant === "reject_with_payment")
  ) {
    return {
      status: "label_mismatch",
      reason: `resolved_control_transactional_variant:${classification.variant}`,
    };
  }
  if (classification.matchedLocale === "mk") {
    return { status: "label_unverifiable", reason: "observation_only_control_locale" };
  }
  const necessaryOnlyLabelVerified = labelBoundNecessaryOnly
    ? classification.intent === "reject" && classification.variant === "necessary_only" && classification.confidence >= 0.8
    : input.canonicalNecessaryOnly
    ? Object.values(bounded).some((label) =>
        normalizeConsentControlText(label) ===
          normalizeConsentControlText(input.canonicalNecessaryOnly?.expectedNormalizedLabel)
      )
    : false;
  if (input.canonicalNecessaryOnly && !necessaryOnlyLabelVerified) {
    return {
      status: "label_mismatch",
      reason: "resolved_control_label_did_not_match_canonical_necessary_only_recipe",
    };
  }
  if (!necessaryOnlyLabelVerified && classification.intent !== input.action) {
    return classification.intent === "unknown"
      ? {
          status: "label_unverifiable",
          reason: "resolved_control_label_not_classified",
        }
      : {
          status: "label_mismatch",
          reason: `resolved_control_intent_${classification.intent}`,
        };
  }
  if (!necessaryOnlyLabelVerified && classification.confidence < 0.8 && !contextualLabelVerified) {
    return {
      status: "label_unverifiable",
      reason: "resolved_control_label_below_confidence_threshold",
    };
  }
  const selected = preferredLabel(bounded);
  if (!selected) {
    return {
      status: "label_unverifiable",
      reason: "resolved_control_accessible_label_missing",
    };
  }
  if (contextualLabelVerified && (
    !input.authorizedTargetSha256 || input.expectedAccessibleControl ||
    !await verifyContextualApprovalScope(input.control, contextualApproval!.bannerSelector)
  )) {
    return { status: "label_unverifiable", reason: "registered_contextual_accept_scope_not_verified" };
  }
  if (!input.expectedAccessibleControl) {
    const frames = input.controlFrameUrl
      ? input.page.frames().filter((frame) => frame.url() === input.controlFrameUrl)
      : [input.page];
    if (frames.length !== 1) return { status: "label_unverifiable", reason: "resolved_control_scope_ambiguous" };
    const liveLabels = await frames[0]!.locator(input.selectorHint).evaluateAll((elements) => {
      if (elements.length > 32) return null;
      return elements.filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" &&
          style.display !== "none" && !element.matches(":disabled") && element.getAttribute("aria-disabled") !== "true";
      }).map((element) => ({ ariaLabel: element.getAttribute("aria-label") ?? undefined,
        visibleText: (element as HTMLElement).innerText || element.textContent || undefined,
        title: element.getAttribute("title") ?? undefined,
        value: element instanceof HTMLInputElement && ["button", "submit", "reset"].includes(element.type)
          ? element.value : undefined }));
    }).catch(() => null);
    const matching = liveLabels?.filter((fields) => {
      const labels = boundFields(fields);
      if (sourceIntentConflict(labels, labelBoundNecessaryOnly?.contextText)) return false;
      if (labelBoundNecessaryOnly) {
        const classified = classifyConsentControlLabel({usage: "observation", classifierProfile: "multilingual_v1",
          label: preferredLabel(labels)?.value, contextText: labelBoundNecessaryOnly.contextText, hasConsentContext: true});
        return necessaryOnlyRecipe!.expectedNormalizedLabels.includes(normalizeConsentControlText(preferredLabel(labels)?.value)) &&
          classified.intent === "reject" && classified.variant === "necessary_only";
      }
      if (input.canonicalNecessaryOnly) return Object.values(labels).some((label) =>
        normalizeConsentControlText(label) === normalizeConsentControlText(input.canonicalNecessaryOnly?.expectedNormalizedLabel));
      if (contextualLabelVerified) return isRegisteredContextualAcceptLabel(
        preferredLabel(labels)?.value ?? "", contextualApproval!.expectedNormalizedLabel);
      const classified = classifyConsentControlLabel({ usage: "action", classifierProfile: "multilingual_v1",
        label: preferredLabel(labels)?.value, hasConsentContext: true });
      return classified.intent === input.action && classified.confidence >= 0.8;
    });
    if (matching?.length !== 1) return { status: "label_unverifiable", reason: "resolved_control_no_longer_unique" };
  }
  const selectorHint = bound(input.selectorHint, 500);
  if (!selectorHint) {
    return {
      status: "label_unverifiable",
      reason: "resolved_control_selector_hint_missing",
    };
  }
  // Re-check after every asynchronous proof read, immediately before returning
  // to dispatch. Trial clicks and baseline capture can trigger document changes.
  if (input.expectedCustomControlBinding && (input.action !== "accept" || input.cmpId ||
    !input.authorizedTargetSha256 || !sameCustomAcceptControlBinding(
      await inspectCustomAcceptControl(input.control, input.expectedCustomControlBinding.bannerSelector, Date.now() + 100,
        selected.value.replace(/\s+/g, " ").trim().toLowerCase()),
      input.expectedCustomControlBinding,
    ))) return { status: "label_unverifiable", reason: "custom_control_binding_changed" };
  if (input.signal?.aborted) return { status: "label_unverifiable", reason: "abort_requested_before_action" };
  if (labelBoundNecessaryOnly && await readLabelBoundNecessaryOnlyContext(input.control, necessaryOnlyRecipe!) !== labelBoundNecessaryOnly.contextText) {
    return {status: "label_unverifiable", reason: "label_bound_necessary_only_context_changed"};
  }
  if (input.authorizedTargetSha256 && sha256(normalizedTarget(input.page.url())) !== input.authorizedTargetSha256) {
    return { status: "label_unverifiable", reason: "redirect_target_not_authorized" };
  }
  return {
    status: "verified",
    proof: {
      contractVersion: CONSENT_ACTION_CONTROL_PROOF_VERSION,
      action: input.action,
      ...(input.expectedCustomControlBinding ? { customControlBinding: input.expectedCustomControlBinding } : {}),
      observedAtMs: input.observedAtMs,
      accessibleLabel: selected.value,
      labelSource: input.expectedAccessibleControl?.kind === "closed_shadow_accessible_control"
        ? "accessibility_tree"
        : selected.source,
      actionSemantics: necessaryOnlyLabelVerified
        ? "canonical_necessary_only_recipe"
        : contextualLabelVerified
          ? "registered_contextual_accept"
          : "direct_label",
      ...(contextualLabelVerified ? { contextualApproval } : {}),
      ...(labelBoundNecessaryOnly ? { labelBoundNecessaryOnly } : {}),
      classifierIntent: classification.intent,
      classifierConfidence: classification.confidence,
      ...(classification.matchedLocale ? { matchedLocale: classification.matchedLocale } : {}),
      ...(classification.matchStrength ? { matchStrength: classification.matchStrength } : {}),
      classifierReasonCodes: [
        ...classification.reasonCodes,
        ...(necessaryOnlyLabelVerified ? ["canonical_necessary_only_recipe_verified"] : []),
        ...(labelBoundNecessaryOnly ? ["label_bound_necessary_only_reject.v1"] : []),
        ...(contextualLabelVerified ? ["registered_contextual_accept_scope_verified"] : []),
      ].slice(0, 16),
      ...(input.cmpId ? { cmpId: bound(input.cmpId, 120) } : {}),
      recipeId: bound(input.recipeId, 160),
      selectorHint,
      frameIdentitySha256: sha256(input.controlFrameUrl ?? input.page.url()),
      ...(input.authorizedTargetSha256
        ? { authorizedTargetSha256: input.authorizedTargetSha256 }
        : {}),
      visible: true,
      enabled: true,
      uniquelyActionable: true,
    },
  };
}

/** Read only visible instructions in the registered first-layer banner. A
 * category heading, hidden copy, another dialog or a form cannot authorize it. */
async function readLabelBoundNecessaryOnlyContext(control: Locator, recipe: {
  bannerSelector: string; controlSelector: string;
}): Promise<string | undefined> {
  return control.evaluate((element, selectors) => {
    const root = element.getRootNode() as Document | ShadowRoot;
    const banner = element.closest(selectors.bannerSelector);
    if (!banner || root.querySelectorAll(selectors.bannerSelector).length !== 1 ||
      !element.matches(selectors.controlSelector) || element.closest("form") ||
      !(element instanceof HTMLButtonElement) || element.form || element.hasAttribute("form") ||
      !(element.type === "button" || element.getAttribute("type") === null)) return undefined;
    const ancestors: Element[] = [];
    for (let current: Element | null = banner; current; current = current.parentElement) ancestors.push(current);
    const descendants = banner.querySelectorAll("*");
    if (descendants.length > 256) return undefined;
    const unreadable = new Set([...ancestors, ...descendants].filter(node => {
      const style = getComputedStyle(node);
      return style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0 ||
        node.matches('[hidden], [inert], [aria-hidden="true"]');
    }));
    const rect = banner.getBoundingClientRect();
    if (ancestors.some(node => unreadable.has(node)) || rect.width <= 0 || rect.height <= 0) return undefined;
    const walker = document.createTreeWalker(banner, NodeFilter.SHOW_TEXT);
    let text = "", count = 0;
    while (walker.nextNode()) {
      if (++count > 256) return undefined;
      let readable = true;
      for (let parent = walker.currentNode.parentElement; parent && parent !== banner.parentElement; parent = parent.parentElement) {
        if (unreadable.has(parent)) {readable = false;break;}
      }
      if (readable) text += ` ${walker.currentNode.textContent ?? ""}`;
      if (text.length > 4096) return undefined;
    }
    return text.replace(/\s+/g, " ").trim();
  }, recipe).catch(() => undefined);
}

/** Contextual approval is not a blanket license to click “OK”. Verify the
 * reviewed vendor-owned scope, a native non-transactional control, and harmless
 * fragment links (the published plugin nests a link inside its button). */
async function verifyContextualApprovalScope(control: Locator, bannerSelector: string, allowUnassociatedDefaultButton = false) {
  return control.evaluate((element, input) => {
    const selector = input.bannerSelector;
    const root = element.getRootNode() as Document | ShadowRoot;
    const banners = root.querySelectorAll(selector);
    const banner = element.closest(selector);
    if (banners.length !== 1 || banners[0] !== banner || !banner || element.closest("form")) return false;
    const rect = banner.getBoundingClientRect();
    const style = getComputedStyle(banner);
    if (rect.width <= 0 || rect.height <= 0 || style.display === "none" || style.visibility === "hidden" ||
      style.opacity === "0" || banner.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    const nativeButton = element instanceof HTMLButtonElement && !element.form && !element.hasAttribute("form") &&
      (element.type === "button" || input.allowUnassociatedDefaultButton && element.getAttribute("type") === null);
    if (!nativeButton && !(element instanceof HTMLAnchorElement)) return false;
    const links = [element, ...element.querySelectorAll("a[href]")].filter((node) => node instanceof HTMLAnchorElement);
    return links.every((link) => (link.getAttribute("href") ?? "") === "#" &&
      !link.hasAttribute("download") && !link.getAttribute("target"));
  }, {bannerSelector,allowUnassociatedDefaultButton}).catch(() => false);
}

async function readControlLabelFields(control: Locator, timeoutMs?: number): Promise<ControlLabelFields> {
  return control.evaluate(readConsentActionLabelFields, undefined, timeoutMs === undefined ? undefined : {timeout: timeoutMs}).catch(() => ({}));
}

function boundFields(fields: ControlLabelFields): ControlLabelFields {
  return {
    ...(bound(fields.ariaLabel, 160) ? { ariaLabel: bound(fields.ariaLabel, 160) } : {}),
    ...(bound(fields.title, 160) ? { title: bound(fields.title, 160) } : {}),
    ...(bound(fields.value, 160) ? { value: bound(fields.value, 160) } : {}),
    ...(bound(fields.visibleText, 160) ? { visibleText: bound(fields.visibleText, 160) } : {}),
  };
}

function preferredLabel(fields: ControlLabelFields): {
  source: "aria_label" | "visible_text" | "value" | "title";
  value: string;
} | undefined {
  if (fields.ariaLabel) return { source: "aria_label", value: fields.ariaLabel };
  if (fields.visibleText) return { source: "visible_text", value: fields.visibleText };
  if (fields.value) return { source: "value", value: fields.value };
  if (fields.title) return { source: "title", value: fields.title };
  return undefined;
}

function sourceIntentConflict(fields: ControlLabelFields, necessaryOnlyContext?: string) {
  const classifications = [fields.ariaLabel, fields.visibleText, fields.value, fields.title]
    .filter((value): value is string => Boolean(value))
    .map((label) => classifyConsentControlLabel({ usage: necessaryOnlyContext ? "observation" : "action",
      classifierProfile: "multilingual_v1", label, hasConsentContext: true, contextText: necessaryOnlyContext }));
  // An unproven acknowledgment is not actionable, but it can become a valid
  // decision label during the remaining original discovery window. Keep mixed
  // sources vetoed, since an affirmative accessible label cannot override an
  // ambiguous visible label on the same control.
  if (classifications.length > 0 && classifications.every((classification) =>
    classification.reasonCodes.includes("unproven_acknowledgment_consent")
  )) return undefined;
  if (classifications.some(classification => hasConsentControlSemanticVeto(classification) ||
    classification.variant === "reject_with_payment" || classification.variant === "reject_with_subscription")) return "semantic_veto";
  const intents = new Set(classifications.map((classification) => classification.intent)
    .filter((intent) => intent !== "unknown"));
  return intents.size > 1 ? [...intents].sort().join("_") : undefined;
}

function bound(value: string | undefined, maxLength: number) {
  return value?.replace(/\s+/g, " ").trim().slice(0, maxLength) ?? "";
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedTarget(value: string) {
  try { const url = new URL(value); url.hash = ""; return url.toString(); } catch { return value; }
}
