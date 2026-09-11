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
import { consentScopePermitsInteraction } from "./cmp-action-target.js";
import {
  readClosedShadowAccessibleControlLabel,
  type CmpAccessibleActionResolution,
} from "./cmp-accessible-action.js";

type ControlLabelFields = {
  ariaLabel?: string;
  title?: string;
  value?: string;
  visibleText?: string;
};

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

/** Synchronous last-mile check, including after geometry/CDP awaits. */
export function assertConsentActionDispatchAllowed(page: Page, signal?: AbortSignal, authorizedTargetSha256?: string) {
  if (signal?.aborted) throw new Error("abort_requested_before_action");
  if (authorizedTargetSha256 && sha256(normalizedTarget(page.url())) !== authorizedTargetSha256) {
    throw new Error("redirect_target_not_authorized");
  }
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
  const definition = input.action === "accept" ? getKnownCmpDefinitionByName(input.cmpId) : undefined;
  const contextualApproval = definition?.acceptContextualApproval &&
    input.recipeId === `canonical-cmp:${definition.canonicalName}:accept:${definition.recipeVersion ?? "v1"}` &&
    input.selectorHint === definition.acceptControlSelectors?.join(", ")
    ? definition.acceptContextualApproval : undefined;
  const contextualLabelVerified = contextualApproval &&
    isRegisteredContextualAcceptLabel(preferredLabel(bounded)?.value ?? "", contextualApproval.expectedNormalizedLabel);
  const classification = classifyConsentControlLabel({
    // Discovery and every proof check must use the same canonical locale set.
    // In particular, do not lose Dutch intent or miss a cross-language conflict.
    usage: "action", classifierProfile: "multilingual_v1",
    label: preferredLabel(bounded)?.value,
    hasConsentContext: true,
  });
  const conflictingIntent = sourceIntentConflict(bounded);
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
  const necessaryOnlyLabelVerified = input.canonicalNecessaryOnly
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
      if (sourceIntentConflict(labels)) return false;
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
  if (input.signal?.aborted) return { status: "label_unverifiable", reason: "abort_requested_before_action" };
  if (input.authorizedTargetSha256 && sha256(normalizedTarget(input.page.url())) !== input.authorizedTargetSha256) {
    return { status: "label_unverifiable", reason: "redirect_target_not_authorized" };
  }
  return {
    status: "verified",
    proof: {
      contractVersion: CONSENT_ACTION_CONTROL_PROOF_VERSION,
      action: input.action,
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
      classifierIntent: classification.intent,
      classifierConfidence: classification.confidence,
      ...(classification.matchedLocale ? { matchedLocale: classification.matchedLocale } : {}),
      ...(classification.matchStrength ? { matchStrength: classification.matchStrength } : {}),
      classifierReasonCodes: [
        ...classification.reasonCodes,
        ...(necessaryOnlyLabelVerified ? ["canonical_necessary_only_recipe_verified"] : []),
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

/** Contextual approval is not a blanket license to click “OK”. Verify the
 * reviewed vendor-owned scope, a native non-transactional control, and harmless
 * fragment links (the published plugin nests a link inside its button). */
async function verifyContextualApprovalScope(control: Locator, bannerSelector: string) {
  return control.evaluate((element, selector) => {
    const root = element.getRootNode() as Document | ShadowRoot;
    const banners = root.querySelectorAll(selector);
    const banner = element.closest(selector);
    if (banners.length !== 1 || banners[0] !== banner || !banner || element.closest("form")) return false;
    const rect = banner.getBoundingClientRect();
    const style = getComputedStyle(banner);
    if (rect.width <= 0 || rect.height <= 0 || style.display === "none" || style.visibility === "hidden" ||
      style.opacity === "0" || banner.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    if (!(element instanceof HTMLButtonElement && element.type === "button") && !(element instanceof HTMLAnchorElement)) return false;
    const links = [element, ...element.querySelectorAll("a[href]")].filter((node) => node instanceof HTMLAnchorElement);
    return links.every((link) => (link.getAttribute("href") ?? "") === "#" &&
      !link.hasAttribute("download") && !link.getAttribute("target"));
  }, bannerSelector).catch(() => false);
}

async function readControlLabelFields(control: Locator): Promise<ControlLabelFields> {
  return control.evaluate((element) => {
    const html = element as HTMLElement;
    return {
      ariaLabel: element.getAttribute("aria-label") ?? undefined,
      title: element.getAttribute("title") ?? undefined,
      // A button's value is a submission payload, not its accessible label.
      // Only these input types render their value as the control label.
      value: element instanceof HTMLInputElement && ["button", "submit", "reset"].includes(element.type)
        ? element.value : undefined,
      visibleText: html.innerText || element.textContent || undefined,
    };
  }).catch(() => ({}));
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

function sourceIntentConflict(fields: ControlLabelFields) {
  const classifications = [fields.ariaLabel, fields.visibleText, fields.value, fields.title]
    .filter((value): value is string => Boolean(value))
    .map((label) => classifyConsentControlLabel({ usage: "action", classifierProfile: "multilingual_v1", label, hasConsentContext: true }));
  if (classifications.some(hasConsentControlSemanticVeto)) return "semantic_veto";
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
