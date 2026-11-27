import { isReviewedWorkerNecessaryOnlyRejectProof, workerDiscoveredFrameMatchesTarget } from "./post-refusal-target-authorization.js";
import { verifyStarfieldConsentListener } from "./starfield-consent-listener.js";
import { verifyCaiaAcceptListeners } from "./caia-accept-control.js";
import { exactNativeConsentButtonSelector, hubSpotHrefLessConsentSelector, reviewedConsentAnchor, TOOM_ACCEPT_SELECTOR } from "./exact-native-consent-button-selector.js";
import { DRUPAL_ACCEPT_BANNER_SELECTOR, DRUPAL_ACCEPT_RECIPE, DRUPAL_ACCEPT_SELECTOR, DRUPAL_CMP } from "./drupal-consent-overflow-geometry.js";
import { COOKIE_SCRIPT_ACCEPT_ROLE_SELECTOR, COOKIE_SCRIPT_ACCEPT_IDS, COOKIE_SCRIPT_REJECT_ROLE_SELECTOR, COOKIE_SCRIPT_REJECT_IDS } from "./cookiescript-reject-selector.js";
import {
  CONSENT_ACTION_CONTROL_PROOF_VERSION,
  classifyConsentControlLabel,
  DRUPAL_NO_THANKS_REJECT_CONTROL,
  UNSW_NECESSARY_ONLY_REJECT,
  hasConsentControlSemanticVeto,
  isRegisteredContextualAcceptLabel,
  normalizeConsentControlText,
  REGISTERED_ONETRUST_ACCEPT_CONTROLS,
  REVIEWED_COOKIE_ACCEPT_CONTROLS, REVIEWED_COOKIE_REJECT_CONTROLS,
  classifyDafitiAdoptAcceptLabel, DAFITI_ADOPT_ACCEPT_CONTROL, CAIA_ACCEPT_CONTROL,
  type ConsentActionControlProof,
  type PostRefusalInteractionDiagnostics,
} from "@certscore/contracts";
import { getKnownCmpDefinitionByName } from "@website-signal-risk-scanner/shared";
import { createHash } from "node:crypto";
import { inspectLocatorActionability, inspectLocatorConsentReadiness, locatorActionabilitySupportsVerifiedDispatch, type ConsentActionControl } from "./cmp-control-actionability.js";
import type { ElementHandle, Frame, Locator, Page } from "playwright";
import { readConsentActionLabelFields, type ConsentActionLabelFields } from "./consent-action-label-fields.js";
import { inspectConsentScopeInteraction } from "./cmp-action-target.js";
import { readConsentActionSettlingSnapshot } from "./consent-action-settling-snapshot.js";
import { inspectCustomAcceptControl, sameCustomAcceptControlBinding } from "./custom-accept-control.js";
import type { CustomAcceptControlBinding } from "@certscore/contracts";
import {
  readClosedShadowAccessibleControlLabel,
  type CmpAccessibleActionResolution,
} from "./cmp-accessible-action.js";

type ControlLabelFields = ConsentActionLabelFields;

export type ConsentActionControlProofResolution =
  | { status: "verified"; proof: ConsentActionControlProof; boundElement?: ElementHandle<HTMLElement | SVGElement> }
  | { status: "label_mismatch" | "label_unverifiable"; reason: string; scopeExclusion?: "hidden" };

/** Proof-only hooks: no new browser commands and no late result reuse. */
export type ConsentProofReadGuard = {
  scope: Page | Frame;
  checkpoint(): void;
  read<T>(start: () => Promise<T>): Promise<T>;
  track<T>(pending: Promise<T>): Promise<T>;
};

type ProofBoundary = {page: Page; controlFrameUrl?: string; signal?: AbortSignal; deadlineAtMs?: number};
const pendingControlProofs = new WeakSet<object>();
class ControlProofStopped extends Error {}

async function boundedControlProof<T>(input: ProofBoundary, operation: (guard: ConsentProofReadGuard) => Promise<T>): Promise<T> {
  let stoppedReason: string | undefined;
  const checkpoint = () => {
    if (stoppedReason) throw new ControlProofStopped(stoppedReason);
    if (input.signal?.aborted) throw new ControlProofStopped("abort_requested_before_action");
    if (input.deadlineAtMs !== undefined && (!Number.isFinite(input.deadlineAtMs) || Date.now() >= input.deadlineAtMs)) {
      throw new ControlProofStopped("control_proof_deadline_exhausted");
    }
  };
  checkpoint();
  const scopes = input.controlFrameUrl
    ? input.page.frames().filter(frame => frame.url() === input.controlFrameUrl) : [input.page.mainFrame()];
  if (scopes.length !== 1) throw new ControlProofStopped("resolved_control_scope_ambiguous");
  const scope = scopes[0]!;
  if (pendingControlProofs.has(scope)) throw new ControlProofStopped("control_proof_read_pending");
  pendingControlProofs.add(scope);
  const actualReads = new Set<Promise<unknown>>();
  let finished = false;
  const release = () => { if (finished && actualReads.size === 0) pendingControlProofs.delete(scope); };
  const track = <V>(pending: Promise<V>) => {
    actualReads.add(pending);
    const settled = () => {actualReads.delete(pending); release();};
    void pending.then(settled, settled);
    return pending;
  };
  const guard: ConsentProofReadGuard = {scope, checkpoint, track,
    async read(start) {checkpoint(); const result = await track(start()); checkpoint(); return result;}};
  const work = Promise.resolve().then(() => {checkpoint(); return operation(guard);})
    .finally(() => {finished = true; release();});
  let timer: NodeJS.Timeout | undefined;
  let abort: (() => void) | undefined;
  try {
    const stopped = new Promise<never>((_resolve, reject) => {
      abort = () => {
        // A timer may precede the wall-clock deadline by a clock tick. Once
        // the caller stops, later browser replies must never resume this proof.
        stoppedReason = input.signal?.aborted ? "abort_requested_before_action" : "control_proof_deadline_exhausted";
        reject(new ControlProofStopped(stoppedReason));
      };
      input.signal?.addEventListener("abort", abort, {once: true});
      if (input.deadlineAtMs !== undefined) timer = setTimeout(abort, Math.max(0, input.deadlineAtMs - Date.now()));
      if (input.signal?.aborted) abort();
    });
    const result = await Promise.race([work, stopped]);
    checkpoint();
    return result;
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) input.signal?.removeEventListener("abort", abort);
  }
}

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
    if (scopes.length !== 1 ||
      !await input.control.isEnabled({timeout: remainingMs()}).catch(() => false)) return false;
    // evaluateAll does not auto-wait or enforce strict locator uniqueness. Read
    // all matches atomically and reject duplicates in the callback. Bound the
    // RPC by the original settling deadline, including a stalled browser.
    let clearSnapshotTimer = () => {};
    const snapshot = await Promise.race([
      scopes[0]!.locator(input.selectorHint).evaluateAll(readConsentActionSettlingSnapshot).catch(() => undefined),
      new Promise<undefined>(resolve => {
        const timer = setTimeout(resolve, remainingMs());
        clearSnapshotTimer = () => clearTimeout(timer);
      }),
    ]).finally(() => clearSnapshotTimer());
    if (!snapshot || Date.now() >= deadlineAtMs || input.signal?.aborted) return false;
    const labels = boundFields(snapshot.labels);
    const classified = classifyConsentControlLabel({usage: "action", classifierProfile: "multilingual_v1",
      label: preferredLabel(labels)?.value, hasConsentContext: true});
    if (sourceIntentConflict(labels) || classified.intent !== input.action || classified.confidence < 0.8 ||
      classified.matchedLocale === "mk" || classified.variant === "reject_with_subscription" ||
      classified.variant === "reject_with_payment") return false;
    const state = snapshot.state;
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
export function assertConsentActionDispatchAllowed(page: Page, signal?: AbortSignal, authorizedTargetSha256?: string, deadlineAtMs?: number) {
  if (signal?.aborted) throw new Error("abort_requested_before_action");
  if (deadlineAtMs !== undefined && (!Number.isFinite(deadlineAtMs) || Date.now() >= deadlineAtMs)) {
    throw new Error("consent_action_dispatch_budget_exhausted");
  }
  if (authorizedTargetSha256 && sha256(normalizedTarget(page.url())) !== authorizedTargetSha256) {
    throw new Error("redirect_target_not_authorized");
  }
}

/** Revalidate the reviewed necessary-only scope at the final dispatch boundary,
 * after any resolver, baseline, geometry or caller awaits. Never clicks. */
export async function assertReviewedRejectDispatchAllowed(input: {
  page: Page; control: ConsentActionControl; proof?: ConsentActionControlProof; controlFrameUrl?: string; signal?: AbortSignal; deadlineAtMs?: number;
}) {
  const proof = input.proof;
  if (!proof || (!proof.labelBoundNecessaryOnly &&
    !(proof.matchedLocale === "pt" && normalizeConsentControlText(proof.accessibleLabel) === "rejeitar"))) return;
  await boundedControlProof(input, async guard => {
    const definition = getKnownCmpDefinitionByName(proof.cmpId);
    if (!proof.authorizedTargetSha256 || (definition?.domSelectors?.[0] &&
      !await guard.read(() => verifyContextualApprovalScope(input.control, definition.domSelectors![0]!, true)))) {
      throw new Error("reviewed_reject_dispatch_binding_changed");
    }
    const current = await buildConsentActionControlProofWithinBoundary({action: "reject",page: input.page, control: input.control,
      cmpId: proof.cmpId, recipeId: proof.recipeId, selectorHint: proof.selectorHint,
      observedAtMs: proof.observedAtMs, authorizedTargetSha256: proof.authorizedTargetSha256,
      controlFrameUrl: input.controlFrameUrl, signal: input.signal, deadlineAtMs: input.deadlineAtMs}, guard);
    if (current.status !== "verified" ||
      current.proof.accessibleLabel !== proof.accessibleLabel ||
      current.proof.frameIdentitySha256 !== proof.frameIdentitySha256 ||
      current.proof.labelBoundNecessaryOnly?.contextText !== proof.labelBoundNecessaryOnly?.contextText) {
      throw new Error("reviewed_reject_dispatch_binding_changed");
    }
    assertConsentActionDispatchAllowed(input.page, input.signal, proof.authorizedTargetSha256);
  });
}

export type ConsentActionControlProofInput = {
  /** Retain the exact native element through proof and the one input command. */
  bindElement?: boolean;
  /** During the final recheck, the recipe must still select this node. */
  exactElement?: ElementHandle<HTMLElement | SVGElement>;
  retryDiscoveredElementRead?: boolean;
  requireUniqueSelector?: boolean;
  workerDiscovered?: boolean;
  /** The passive Reject selector must resolve only to the resolver's bound native button. */
  expectedNativeSelector?: string;
  requireDrupalBanner?: true;
  signal?: AbortSignal;
  deadlineAtMs?: number;
  onLabelInspection?: (snapshot: Omit<NonNullable<PostRefusalInteractionDiagnostics["resolver"]>["snapshots"][number], "attempt" | "elapsedMs">) => void;
  action: "accept" | "reject";
  authorizedTargetSha256?: string;
  canonicalNecessaryOnly?: { expectedNormalizedLabel: string };
  cmpId?: string;
  control: ConsentActionControl;
  controlFrameUrl?: string;
  expectedAccessibleControl?: CmpAccessibleActionResolution;
  expectedCustomControlBinding?: CustomAcceptControlBinding;
  observedAtMs: number;
  page: Page;
  recipeId: string;
  selectorHint: string;
};

export async function buildConsentActionControlProof(input: ConsentActionControlProofInput): Promise<ConsentActionControlProofResolution> {
  try { return await boundedControlProof(input, async guard => {
    if (!input.bindElement || input.expectedAccessibleControl?.kind === "closed_shadow_accessible_control" || !("elementHandle" in input.control)) {
      return buildConsentActionControlProofWithinBoundary(input, guard);
    }
    let element: ElementHandle<HTMLElement | SVGElement> | null = null;
    let retained = false;
    try {
      const readElement = () => guard.read(() => (input.control as Locator).elementHandle({timeout: Math.max(1,
        Math.min(100, (input.deadlineAtMs ?? Date.now() + 100) - Date.now()))})
        .then(value => {element = value; return true;}, () => false));
      let available = await readElement();
      if (input.retryDiscoveredElementRead && (!available || !element)) {
        // Re-read only the original scoped locator. The same deadline and
        // fresh exact-element validation still apply before any input.
        available = await readElement();
      }
      if (!available) return {status: "label_unverifiable", reason: "resolved_control_unavailable"};
      if (!element) return {status: "label_unverifiable", reason: "resolved_control_detached"};
      const result = await buildConsentActionControlProofWithinBoundary({
        ...input, control: element,
        ...(input.expectedNativeSelector || input.workerDiscovered && input.recipeId === DRUPAL_NO_THANKS_REJECT_CONTROL.recipeId
          ? {exactElement: element} : {}),
      }, guard);
      guard.checkpoint();
      if (result.status !== "verified") return result;
      retained = true;
      return {...result, boundElement: element};
    } finally {
      if (element && !retained) {
        const rejectedElement = element as ElementHandle;
        // Preserve read backpressure without withholding the known proof result.
        void guard.track(Promise.resolve().then(() => rejectedElement.dispose()).catch(() => undefined));
      }
    }
  }); }
  catch (error) {
    if (error instanceof ControlProofStopped) return {status: "label_unverifiable", reason: error.message};
    throw error;
  }
}

async function buildConsentActionControlProofWithinBoundary(input: ConsentActionControlProofInput, guard: ConsentProofReadGuard): Promise<ConsentActionControlProofResolution> {
  guard.checkpoint();
  if (input.expectedNativeSelector && (input.controlFrameUrl ||
      input.expectedAccessibleControl || !input.exactElement)) {
    return {status: "label_unverifiable", reason: `passive_${input.action}_button_binding_unverified`};
  }
  if (input.signal?.aborted) return { status: "label_unverifiable", reason: "abort_requested_before_action" };
  if (input.authorizedTargetSha256 && sha256(normalizedTarget(input.page.url())) !== input.authorizedTargetSha256) {
    return { status: "label_unverifiable", reason: "redirect_target_not_authorized" };
  }
  if (input.expectedAccessibleControl?.kind !== "closed_shadow_accessible_control") {
    const options = {
      deadlineAtMs: input.deadlineAtMs, signal: input.signal, scope: guard.scope, trackActualRead: guard.track,
    };
    let actionability;
    if (input.action === "reject" && input.cmpId === "Cookie Information" &&
        input.exactElement && (input.expectedNativeSelector ?? input.selectorHint) === "#declineButton") {
      // This still reads the same native element's composed scope and geometry.
      const readiness = await guard.read(() => inspectLocatorConsentReadiness(input.control, options));
      if (!readiness.scopeInteractive) return { status: "label_unverifiable", reason: "resolved_control_scope_not_interactive" };
      actionability = readiness.actionability;
    } else {
      const scope = await guard.read(() => inspectConsentScopeInteraction(input.control));
      if (scope.state !== "interactive") {
        return { status: "label_unverifiable", reason: "resolved_control_scope_not_interactive",
          ...(scope.exclusion?.reason === "hidden" ? { scopeExclusion: "hidden" } : {}) };
      }
      actionability = await guard.read(() => inspectLocatorActionability(input.control, options));
    }
    if (!locatorActionabilitySupportsVerifiedDispatch(actionability)) {
      return { status: "label_unverifiable", reason: "resolved_control_no_longer_actionable" };
    }
  }
  const fields = input.expectedAccessibleControl?.kind === "closed_shadow_accessible_control"
    ? {
        ariaLabel: await guard.read(() => readClosedShadowAccessibleControlLabel(
          input.page,
          input.expectedAccessibleControl!, guard,
        )),
      }
    : await guard.read(() => readControlLabelFields(input.control));
  const bounded = boundFields(fields);
  // Retain the exact bounded label sources read for proof, without another DOM
  // round trip. This is a candidate read, never dispatch or registration proof.
  const labelEntries = ([['aria_label', bounded.ariaLabel], ['visible_text', bounded.visibleText],
    ['value', bounded.value], ['title', bounded.title]] as const).filter((entry) => Boolean(entry[1]));
  guard.checkpoint();
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
  guard.checkpoint();
  const registeredOneTrustAccept = input.action === "accept" && !!input.exactElement &&
    !!input.authorizedTargetSha256 && !input.controlFrameUrl && !input.expectedAccessibleControl
    ? REGISTERED_ONETRUST_ACCEPT_CONTROLS.find(scope =>
        input.cmpId === scope.cmpId && input.recipeId === scope.recipeId &&
        input.selectorHint === scope.controlSelector && input.expectedNativeSelector === scope.controlSelector &&
        hasExactOneTrustAcceptLabel(bounded, scope.label) &&
        (!("documentUrl" in scope) || (input.page.url() === scope.documentUrl &&
          input.authorizedTargetSha256 === scope.documentSha256)))
    : undefined;
  const reviewedCookieAccept = input.workerDiscovered && input.action === "accept" &&
    !input.controlFrameUrl && !input.expectedAccessibleControl && preferredLabel(bounded)?.source === "visible_text"
    ? REVIEWED_COOKIE_ACCEPT_CONTROLS.find(scope =>
        input.page.url() === scope.documentUrl && input.authorizedTargetSha256 === scope.documentSha256 &&
        (!input.expectedNativeSelector || input.expectedNativeSelector === scope.controlSelector) &&
        bounded.visibleText === scope.label)
    : undefined;
  if (reviewedCookieAccept && !(await guard.read(() => readVisibleConsentBannerText(input.control,
    reviewedCookieAccept)))?.includes(reviewedCookieAccept.notice)) {
    return {status: "label_unverifiable", reason: "reviewed_cookie_accept_scope_unverified"};
  }
  const reviewedCookieReject = input.workerDiscovered && input.action === "reject" &&
    !input.controlFrameUrl && !input.expectedAccessibleControl
    ? REVIEWED_COOKIE_REJECT_CONTROLS.find(scope =>
        input.page.url() === scope.documentUrl && input.authorizedTargetSha256 === scope.documentSha256 &&
        (!input.expectedNativeSelector || input.expectedNativeSelector === scope.controlSelector) &&
        bounded.visibleText === scope.label && preferredLabel(bounded)?.value === scope.label &&
        preferredLabel(bounded)?.source === scope.labelSource)
    : undefined;
  if (reviewedCookieReject && !(await guard.read(() => readVisibleConsentBannerText(input.control,
    reviewedCookieReject)))?.includes(reviewedCookieReject.notice)) {
    return {status: "label_unverifiable", reason: "reviewed_cookie_reject_scope_unverified"};
  }
  const caia = CAIA_ACCEPT_CONTROL;
  const caiaAccept = input.recipeId === caia.recipeId && input.action === "accept" &&
    input.selectorHint === caia.controlSelector && input.expectedNativeSelector === caia.controlSelector &&
    !!input.exactElement && input.authorizedTargetSha256 === sha256(caia.targetUrl) && input.page.url() === caia.targetUrl &&
    !input.controlFrameUrl && !input.expectedAccessibleControl && bounded.visibleText === caia.label &&
    !bounded.ariaLabel && !bounded.title && !bounded.value;
  if (input.recipeId === caia.recipeId && (!caiaAccept || !await verifyCaiaAcceptListeners(input.page, guard))) {
    return {status:"label_unverifiable", reason:"registered_caia_accept_listener_unverified"};
  }
  const adopt = DAFITI_ADOPT_ACCEPT_CONTROL;
  const dafitiAdoptAccept = input.recipeId === adopt.recipeId && input.action === "accept" &&
    input.selectorHint === adopt.controlSelector && input.expectedNativeSelector === adopt.controlSelector &&
    !!input.exactElement && input.authorizedTargetSha256 === sha256(adopt.targetUrl) && input.page.url() === adopt.targetUrl &&
    !input.controlFrameUrl && !input.expectedAccessibleControl && !!classifyDafitiAdoptAcceptLabel(bounded.visibleText) &&
    !bounded.ariaLabel && !bounded.title && !bounded.value;
  if (input.recipeId === adopt.recipeId && (!dafitiAdoptAccept ||
      !await guard.read(() => verifyContextualApprovalScope(input.control, adopt.bannerSelector, true, true)))) {
    return {status: "label_unverifiable", reason: "registered_dafiti_adopt_accept_scope_unverified"};
  }
  const registeredDrupalReject = DRUPAL_NO_THANKS_REJECT_CONTROL;
  const workerDrupalReject = input.workerDiscovered && input.action === "reject" &&
    input.recipeId === registeredDrupalReject.recipeId && input.cmpId === registeredDrupalReject.cmpId &&
    bounded.visibleText === registeredDrupalReject.label;
  const expectedNativeSelector = workerDrupalReject ? registeredDrupalReject.controlSelector : input.expectedNativeSelector;
  const requireDrupalBanner = input.requireDrupalBanner || workerDrupalReject;
  const drupalReject = requireDrupalBanner && input.action === "reject";
  const drupalScope = requireDrupalBanner ? (drupalReject ? registeredDrupalReject : {
    cmpId: DRUPAL_CMP, recipeId: DRUPAL_ACCEPT_RECIPE, controlSelector: DRUPAL_ACCEPT_SELECTOR,
    bannerSelector: DRUPAL_ACCEPT_BANNER_SELECTOR, label: "Accept",
  }) : undefined;
  if (drupalScope && (input.cmpId !== drupalScope.cmpId ||
    input.recipeId !== drupalScope.recipeId || expectedNativeSelector !== drupalScope.controlSelector ||
    !input.exactElement || !input.authorizedTargetSha256 || input.controlFrameUrl || input.expectedAccessibleControl ||
    bounded.visibleText !== drupalScope.label || preferredLabel(bounded)?.source !== "visible_text" ||
    (drupalReject && (bounded.title || bounded.value)))) {
    return {status: "label_unverifiable", reason: "registered_drupal_control_binding_unverified"};
  }
  const definition = getKnownCmpDefinitionByName(input.cmpId);
  const contextualApproval = definition?.acceptContextualApproval &&
    input.recipeId === `canonical-cmp:${definition.canonicalName}:accept:${definition.recipeVersion ?? "v1"}` &&
    input.selectorHint === definition.acceptControlSelectors?.join(", ")
    ? definition.acceptContextualApproval : undefined;
  const contextualLabelVerified = contextualApproval &&
    isRegisteredContextualAcceptLabel(preferredLabel(bounded)?.value ?? "", contextualApproval.expectedNormalizedLabel);
  const unsw = UNSW_NECESSARY_ONLY_REJECT;
  const unswNecessaryOnly = input.page.url() === unsw.documentUrl && !input.controlFrameUrl &&
    input.authorizedTargetSha256 === unsw.documentSha256 && bounded.visibleText === unsw.label &&
    preferredLabel(bounded)?.source === "visible_text";
  const necessaryOnlyRecipe = input.action === "reject" && definition?.rejectLabelBoundNecessaryOnly &&
    input.recipeId === `canonical-cmp:${definition.canonicalName}:reject:v3` &&
    input.selectorHint === definition.rejectControlSelectors?.join(", ") &&
    input.authorizedTargetSha256 && !input.expectedAccessibleControl &&
    (unswNecessaryOnly || definition.rejectLabelBoundNecessaryOnly.expectedNormalizedLabels
      .includes(normalizeConsentControlText(preferredLabel(bounded)?.value)))
    ? definition.rejectLabelBoundNecessaryOnly : undefined;
  const necessaryOnlyContext = necessaryOnlyRecipe
    ? await guard.read(() => readVisibleConsentBannerText(input.control, necessaryOnlyRecipe)) : undefined;
  const labelBoundNecessaryOnly = necessaryOnlyRecipe && necessaryOnlyContext &&
    (!unswNecessaryOnly || necessaryOnlyContext.includes(unsw.instruction))
    ? { policyVersion: unswNecessaryOnly ? unsw.policyVersion : necessaryOnlyRecipe.policyVersion,
        bannerSelector: "#onetrust-banner-sdk" as const, controlSelector: "#onetrust-reject-all-handler" as const,
        contextText: necessaryOnlyContext } : undefined;
  // Reuse classifications for identical strings from independent DOM reads.
  // Discovery and both proof stages still use the same canonical locales.
  const classifications = new Map<string | undefined, ReturnType<typeof classifyConsentControlLabel>>();
  const classify = (label: string | undefined) => {
    const cached = classifications.get(label);
    if (cached) return cached;
    const result = classifyConsentControlLabel({
      usage: labelBoundNecessaryOnly || caiaAccept || (registeredOneTrustAccept && label === registeredOneTrustAccept.label) ||
        (reviewedCookieAccept && label === reviewedCookieAccept.label) ||
        (reviewedCookieReject && label === reviewedCookieReject.label) ? "observation" : "action",
      classifierProfile: "multilingual_v1", label,
      contextText: labelBoundNecessaryOnly?.contextText, hasConsentContext: true,
    });
    classifications.set(label, result);
    return result;
  };
  const classification = classify(preferredLabel(bounded)?.value);
  const conflictingIntent = sourceIntentConflict(bounded, classify);
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
  const necessaryOnlyLabelVerified = labelBoundNecessaryOnly || reviewedCookieReject
    ? classification.intent === "reject" && classification.variant === "necessary_only" &&
      (Boolean(reviewedCookieReject) || classification.confidence >= 0.8)
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
  if (!necessaryOnlyLabelVerified && classification.confidence < 0.8 && !contextualLabelVerified && !drupalReject && !dafitiAdoptAccept) {
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
    !await guard.read(() => verifyContextualApprovalScope(input.control, contextualApproval!.bannerSelector))
  )) {
    return { status: "label_unverifiable", reason: "registered_contextual_accept_scope_not_verified" };
  }
  if (!input.expectedAccessibleControl) {
    const frames = input.controlFrameUrl
      ? input.page.frames().filter((frame) => frame.url() === input.controlFrameUrl)
      : [input.page];
    if (frames.length !== 1) return { status: "label_unverifiable", reason: "resolved_control_scope_ambiguous" };
    const cookieScriptSelector = input.action === "accept" ? COOKIE_SCRIPT_ACCEPT_ROLE_SELECTOR : COOKIE_SCRIPT_REJECT_ROLE_SELECTOR;
    const roleButtonIds = input.cmpId === "CookieScript" && input.expectedNativeSelector === cookieScriptSelector
      ? (input.action === "accept" ? COOKIE_SCRIPT_ACCEPT_IDS : COOKIE_SCRIPT_REJECT_IDS) : undefined;
    const hubSpotAnchor = input.expectedNativeSelector === hubSpotHrefLessConsentSelector(input.action);
    const reviewedAnchor = reviewedConsentAnchor(input.action, input.expectedNativeSelector);
    if (reviewedAnchor?.starfield &&
        !await verifyStarfieldConsentListener(input.page, input.expectedNativeSelector!, input.action, guard)) {
      return { status: "label_unverifiable", reason: "starfield_click_handler_unverified" };
    }
    const toomShadow = input.action === "accept" && input.expectedNativeSelector === TOOM_ACCEPT_SELECTOR;
    const liveSnapshot = await guard.read(() => frames[0]!.locator(input.selectorHint).evaluateAll((elements, {exact, passiveSelector, roleButtonIds, hubSpotAnchor, reviewedAnchor, oneTrustAcceptScope, drupalBannerSelector, caiaBannerSelector, toomShadow, workerDiscovered}) => {
      if (elements.length > 32 || (exact && !elements.includes(exact))) return null;
      if (passiveSelector) {
        const document = exact?.ownerDocument;
        const view = document?.defaultView;
        const exactReviewedAnchor = reviewedAnchor && exact?.localName === "a" &&
          view?.location.href === reviewedAnchor.documentUrl && exact.matches(passiveSelector) &&
          (!reviewedAnchor.labels || reviewedAnchor.labels.includes((exact as HTMLElement).innerText.trim())) &&
          document?.querySelectorAll(reviewedAnchor.banner).length === 1 && !document.querySelector(reviewedAnchor.starfield ? "base[href],base[target]" : "base[target]") &&
          (!reviewedAnchor.id || document.querySelectorAll("#" + reviewedAnchor.id).length === 1) &&
          !exact.closest("form,button,label,[contenteditable]") && !exact.querySelector("a,button,input,[role=button]");
        if (reviewedAnchor && !exactReviewedAnchor) return null;
        const localRoot = exact?.getRootNode();
        const transcendId = exact?.id;
        const transcendLabel = transcendId === "AcceptAllAndClose" ? "Accept All Things" : "Reject All";
        const transcend = workerDiscovered && view?.location.href === "https://simpli.fi/" &&
          (transcendId === "AcceptAllAndClose" || transcendId === "RejectAllAndClose") &&
          passiveSelector === '#transcend-shadow-root #transcend-consent-ui dialog[open][data-layer="banner"] button[type="button"]#' + transcendId &&
          exact?.getAttribute("aria-label") === transcendLabel && (exact as HTMLElement).innerText.trim() === transcendLabel &&
          localRoot instanceof ShadowRoot && localRoot.mode === "open" && localRoot.host.shadowRoot === localRoot &&
          document?.querySelectorAll("#transcend-shadow-root").length === 1 && document.querySelector("#transcend-shadow-root") === localRoot.host;
        const selectorRoot = transcend ? localRoot : document;
        const framer = workerDiscovered && view?.location.href === "https://www.framer.com/" &&
          exact instanceof HTMLInputElement && exact.type === "button" && ["Accept", "Reject"].includes(exact.value) &&
          exact.id === "__framer-cookie-component-button-" + exact.value.toLowerCase() &&
          passiveSelector === 'div.--framer-cookie-banner-container input[type="button"]#' + exact.id &&
          document?.querySelectorAll("div.--framer-cookie-banner-container").length === 1 && !exact.form;
        if (workerDiscovered && (!exact || !document || exact.closest("form, label, [contenteditable], [inert]") ||
            exact.hasAttribute("form") || exact.hasAttribute("formaction") ||
            (exact.id && selectorRoot?.querySelectorAll("#" + CSS.escape(exact.id)).length !== 1) ||
            exact.querySelector("a, button, input, [role=button]"))) return null;
        const buttonLink = exactReviewedAnchor || exact?.localName === "a" && exact.getAttribute("role") === "button" &&
          !exact.hasAttribute("target") && !exact.hasAttribute("download") &&
          (hubSpotAnchor ? !exact.hasAttribute("href") &&
            document?.querySelectorAll("#hs-eu-cookie-confirmation").length === 1 &&
            document.querySelectorAll("#" + exact.id).length === 1 :
            exact.getAttribute("href") === "#" && !document?.querySelector("base[href], base[target]"));
        if (hubSpotAnchor && !buttonLink) return null;
        if (!exact?.isConnected || !(caiaBannerSelector ? exact.localName === "span" : roleButtonIds ? exact.localName === "div" : exact.localName === "button" || buttonLink || framer) ||
            !document || (!toomShadow && !transcend && exact.getRootNode() !== document) || !view || view !== view.top) return null;
        if (roleButtonIds && document.querySelectorAll(roleButtonIds).length !== 2) return null;
        const matches = toomShadow
          ? document.querySelector("#usercentrics-root")?.shadowRoot?.querySelectorAll('#uc-center-container button[data-testid="uc-accept-all-button"]')
          : transcend ? localRoot.querySelectorAll(passiveSelector.slice("#transcend-shadow-root ".length)) : document.querySelectorAll(passiveSelector);
        if (matches?.length !== 1 || matches[0] !== exact) return null;
        if (toomShadow) {
          const root = exact.getRootNode();
          if (view.location.href !== "https://toom.de/" || !(root instanceof ShadowRoot) ||
              root.mode !== "open" || !root.host.matches("div#usercentrics-root") ||
              root.host.getRootNode() !== document || root.host.shadowRoot !== root ||
              document.querySelectorAll("#usercentrics-root").length !== 1 ||
              root.querySelectorAll("#uc-center-container").length !== 1 ||
              root.querySelectorAll('button[data-testid="uc-accept-all-button"]').length !== 1 ||
              (exact as HTMLElement).innerText.trim() !== "Alle erlauben" || exact.closest("form") ||
              exact.hasAttribute("form") || exact.hasAttribute("formaction") || exact.hasAttribute("aria-label")) return null;
        }
        if (caiaBannerSelector && (document.querySelectorAll(caiaBannerSelector).length !== 1 ||
            !exact.closest(caiaBannerSelector) || exact.childElementCount ||
            exact.closest("form,a,button,label,[contenteditable],[inert],[aria-hidden='true'],[aria-disabled='true']") ||
            exact.hasAttribute("role") || exact.hasAttribute("onclick"))) return null;
        if (oneTrustAcceptScope) {
          const group = exact.closest(oneTrustAcceptScope.groupSelector);
          const banner = group?.closest(oneTrustAcceptScope.bannerSelector);
          if (!(exact instanceof HTMLButtonElement) || !banner || !group || exact.form || exact.closest("form") ||
              exact.hasAttribute("form") || exact.hasAttribute("formaction") ||
              (exact.type !== "button" && exact.hasAttribute("type")) || exact.querySelector("a[href]") ||
              document.querySelectorAll(oneTrustAcceptScope.bannerSelector).length !== 1 ||
              document.querySelectorAll(oneTrustAcceptScope.groupSelector).length !== 1) return null;
        }
        if (drupalBannerSelector && (!(exact instanceof HTMLButtonElement) || !exact.matches(drupalBannerSelector) ||
            document.querySelectorAll("#sliding-popup").length !== 1 || exact.form || exact.closest("form") ||
            exact.hasAttribute("form") || exact.hasAttribute("formaction") ||
            exact.querySelector("a[href]") || (exact.type !== "button" && exact.hasAttribute("type")))) return null;
      }
      const labels = elements.filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" &&
          style.display !== "none" && !element.matches(":disabled") && element.getAttribute("aria-disabled") !== "true";
      }).map((element) => ({ isBoundElement: element === exact, ariaLabel: element.getAttribute("aria-label") ?? undefined,
        visibleText: (element as HTMLElement).innerText || element.textContent || undefined,
        title: element.getAttribute("title") ?? undefined,
        value: element instanceof HTMLInputElement && ["button", "submit", "reset"].includes(element.type)
          ? element.value : undefined }));
      return { selectorMatchCount: elements.length, labels };
    }, {exact: input.exactElement, passiveSelector: expectedNativeSelector, roleButtonIds, hubSpotAnchor, reviewedAnchor, toomShadow, workerDiscovered: input.workerDiscovered,
      oneTrustAcceptScope: registeredOneTrustAccept,
      drupalBannerSelector: drupalScope?.bannerSelector,
      caiaBannerSelector: caiaAccept ? caia.bannerSelector : undefined}).catch(() => null));
    if (expectedNativeSelector && !liveSnapshot) {
      return {status: "label_unverifiable", reason: `passive_${input.action}_button_binding_unverified`};
    }
    // Independent discovery may start with a selector covering the full choice
    // group. The native selector above establishes exact element uniqueness.
    // Keep sweeping the original group for any second action of the same intent.
    const requireUniqueIntent = input.requireUniqueSelector && input.workerDiscovered && Boolean(expectedNativeSelector);
    if (input.requireUniqueSelector && !requireUniqueIntent && liveSnapshot?.selectorMatchCount !== 1) {
      return { status: "label_unverifiable", reason: "exact_selector_no_longer_unique" };
    }
    const matching = liveSnapshot?.labels.filter((fields) => {
      const labels = boundFields(fields);
      const liveLabel = preferredLabel(labels);
      if (input.exactElement && (!requireUniqueIntent || fields.isBoundElement) &&
          (liveLabel?.source !== selected.source || liveLabel.value !== selected.value)) return false;
      if (registeredOneTrustAccept && !hasExactOneTrustAcceptLabel(labels, registeredOneTrustAccept.label)) return false;
      if (dafitiAdoptAccept) return !!classifyDafitiAdoptAcceptLabel(labels.visibleText) &&
        !labels.ariaLabel && !labels.title && !labels.value;
      if (sourceIntentConflict(labels, classify)) return false;
      if (drupalReject) return liveLabel?.source === "visible_text" &&
        liveLabel.value === DRUPAL_NO_THANKS_REJECT_CONTROL.label && !labels.title && !labels.value;
      if (labelBoundNecessaryOnly) {
        const classified = classify(preferredLabel(labels)?.value);
        return (unswNecessaryOnly ? preferredLabel(labels)?.value === unsw.label :
          necessaryOnlyRecipe!.expectedNormalizedLabels.includes(normalizeConsentControlText(preferredLabel(labels)?.value))) &&
          classified.intent === "reject" && classified.variant === "necessary_only";
      }
      if (reviewedCookieReject) return liveLabel?.value === reviewedCookieReject.label &&
        liveLabel.source === reviewedCookieReject.labelSource && labels.visibleText === reviewedCookieReject.label;
      if (input.canonicalNecessaryOnly) return Object.values(labels).some((label) =>
        normalizeConsentControlText(label) === normalizeConsentControlText(input.canonicalNecessaryOnly?.expectedNormalizedLabel));
      if (contextualLabelVerified) return isRegisteredContextualAcceptLabel(
        preferredLabel(labels)?.value ?? "", contextualApproval!.expectedNormalizedLabel);
      const classified = classify(liveLabel?.value);
      return classified.intent === input.action && classified.confidence >= 0.8;
    });
    if (matching?.length !== 1 || (requireUniqueIntent && !matching[0]?.isBoundElement)) {
      return { status: "label_unverifiable", reason: "resolved_control_no_longer_unique" };
    }
  }
  // The named recipe retains its registered selector scope in the packet.
  // The worker checks the exact native button separately before clicking.
  const selectorHint = bound(labelBoundNecessaryOnly ? input.selectorHint :
    reviewedCookieAccept?.controlSelector ?? reviewedCookieReject?.controlSelector ?? expectedNativeSelector ?? input.selectorHint, 500);
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
      await guard.read(() => inspectCustomAcceptControl(input.control, input.expectedCustomControlBinding!.bannerSelector,
        Math.min(input.deadlineAtMs ?? Infinity, Date.now() + 100), selected.value.replace(/\s+/g, " ").trim().toLowerCase(), guard)),
      input.expectedCustomControlBinding,
    ))) return { status: "label_unverifiable", reason: "custom_control_binding_changed" };
  if (input.signal?.aborted) return { status: "label_unverifiable", reason: "abort_requested_before_action" };
  if (labelBoundNecessaryOnly && await guard.read(() => readVisibleConsentBannerText(input.control, necessaryOnlyRecipe!)) !== labelBoundNecessaryOnly.contextText) {
    return {status: "label_unverifiable", reason: "label_bound_necessary_only_context_changed"};
  }
  if (input.authorizedTargetSha256 && sha256(normalizedTarget(input.page.url())) !== input.authorizedTargetSha256) {
    return { status: "label_unverifiable", reason: "redirect_target_not_authorized" };
  }
  guard.checkpoint();
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
        ...(labelBoundNecessaryOnly ? [labelBoundNecessaryOnly.policyVersion] : []),
        ...(contextualLabelVerified ? ["registered_contextual_accept_scope_verified"] : []),
        ...(registeredOneTrustAccept ? [registeredOneTrustAccept.proofReason] : []),
        ...(reviewedCookieAccept ? [reviewedCookieAccept.proofReason] : []),
        ...(reviewedCookieReject ? [reviewedCookieReject.proofReason] : []),
        ...(caiaAccept ? [caia.proofReason] : []),
        ...(dafitiAdoptAccept ? [adopt.proofReason] : []),
        ...(drupalReject ? [DRUPAL_NO_THANKS_REJECT_CONTROL.proofReason] : []),
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
async function readVisibleConsentBannerText(control: ConsentActionControl, recipe: {
  bannerSelector: string; controlSelector: string;
}): Promise<string | undefined> {
  const read = (element: HTMLElement | SVGElement, selectors: {bannerSelector: string; controlSelector: string}) => {
    const root = element.getRootNode() as Document | ShadowRoot;
    const banner = element.closest(selectors.bannerSelector);
    if (!banner || root.querySelectorAll(selectors.bannerSelector).length !== 1 || root.querySelectorAll(selectors.controlSelector).length !== 1 ||
      !element.matches(selectors.controlSelector) || element.closest("form, label, [contenteditable]") ||
      !(element instanceof HTMLButtonElement) || element.form || element.hasAttribute("form") ||
      element.hasAttribute("formaction") || element.querySelector("a, button, input, [role=button]") ||
      !(element.type === "button" || element.getAttribute("type") === null)) return undefined;
    const ancestors: Element[] = [];
    for (let current: Element | null = banner; current; current = current.parentElement) ancestors.push(current);
    const descendants = banner.querySelectorAll("*");
    if (descendants.length > 256) return undefined;
    const unreadable = new Set([...ancestors, ...descendants].filter(node => {
      const style = getComputedStyle(node);
      return style.display === "none" || style.visibility !== "visible" || Number(style.opacity) === 0 ||
        node.matches('[hidden], [inert]');
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
  };
  return ("elementHandle" in control ? control.evaluate(read, recipe) : control.evaluate(read, recipe)).catch(() => undefined);
}

/** Contextual approval is not a blanket license to click “OK”. Verify the
 * reviewed vendor-owned scope, a native non-transactional control, and harmless
 * fragment links (the published plugin nests a link inside its button). */
async function verifyContextualApprovalScope(control: ConsentActionControl, bannerSelector: string, allowUnassociatedDefaultButton = false, requireCookieNotice = false) {
  const read = (element: HTMLElement | SVGElement, input: {bannerSelector: string; allowUnassociatedDefaultButton: boolean; requireCookieNotice: boolean}) => {
    const selector = input.bannerSelector;
    const root = element.getRootNode() as Document | ShadowRoot;
    const banners = root.querySelectorAll(selector);
    const banner = element.closest(selector);
    if (banners.length !== 1 || banners[0] !== banner || !banner || element.closest("form")) return false;
    if (input.requireCookieNotice && (!/\bcookies?\b/i.test((banner as HTMLElement).innerText.slice(0, 1_000)) ||
      element.hasAttribute("formaction") || element.querySelector("a[href]"))) return false;
    const rect = banner.getBoundingClientRect();
    const style = getComputedStyle(banner);
    if (rect.width <= 0 || rect.height <= 0 || style.display === "none" || style.visibility === "hidden" ||
      style.opacity === "0" || banner.closest('[hidden], [inert]')) return false;
    const nativeButton = element instanceof HTMLButtonElement && !element.form && !element.hasAttribute("form") &&
      (element.type === "button" || input.allowUnassociatedDefaultButton && element.getAttribute("type") === null);
    if (!nativeButton && !(element instanceof HTMLAnchorElement)) return false;
    const links = [element, ...element.querySelectorAll("a[href]")].filter((node) => node instanceof HTMLAnchorElement);
    return links.every((link) => (link.getAttribute("href") ?? "") === "#" &&
      !link.hasAttribute("download") && !link.getAttribute("target"));
  };
  const args = {bannerSelector,allowUnassociatedDefaultButton,requireCookieNotice};
  return ("elementHandle" in control ? control.evaluate(read, args) : control.evaluate(read, args)).catch(() => false);
}

async function readControlLabelFields(control: ConsentActionControl): Promise<ControlLabelFields> {
  return ("elementHandle" in control ? control.evaluate(readConsentActionLabelFields) : control.evaluate(readConsentActionLabelFields)).catch(() => ({}));
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

function hasExactOneTrustAcceptLabel(fields: ControlLabelFields, label: string): boolean {
  return fields.visibleText === label && [fields.ariaLabel, fields.value, fields.title].every(value => !value || value === label);
}

function sourceIntentConflict(
  fields: ControlLabelFields,
  classify = (label: string) => classifyConsentControlLabel({
    usage: "action", classifierProfile: "multilingual_v1", label, hasConsentContext: true,
  }),
) {
  const classifications = [fields.ariaLabel, fields.visibleText, fields.value, fields.title]
    .filter((value): value is string => Boolean(value))
    .map(classify);
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


/** Recheck the same element in the worker's bound document immediately before
 * its single input. This path has no coordinator-supplied selector. */
export async function dispatchWorkerDiscoveredConsentControl(input: {
  page: Page;
  requestedUrl: string;
  control?: ElementHandle<HTMLElement | SVGElement>;
  proof: ConsentActionControlProof;
  deadlineAtMs: number;
  signal?: AbortSignal;
  assertCurrent: () => void;
  commit: () => void;
}) {
  const { page, requestedUrl, control, proof, signal, deadlineAtMs } = input;
  const reviewedNecessaryOnly = isReviewedWorkerNecessaryOnlyRejectProof(requestedUrl, proof);
  if (!control || !workerDiscoveredFrameMatchesTarget(proof) || proof.frameIdentitySha256 !== sha256(page.url()) ||
      (proof.actionSemantics !== "direct_label" && !reviewedNecessaryOnly)) throw new Error("worker_consent_control_unbound");
  input.assertCurrent();
  const selector = await boundedControlProof({page, signal, deadlineAtMs}, guard =>
    guard.read(() => control.evaluate(exactNativeConsentButtonSelector)));
  if (!selector || (reviewedNecessaryOnly && selector !== (proof.labelBoundNecessaryOnly?.controlSelector ?? proof.selectorHint))) {
    throw new Error("worker_consent_exact_selector_unavailable");
  }
  input.assertCurrent();
  const verified = await buildConsentActionControlProof({
    page, control, exactElement: control, requireUniqueSelector: !reviewedNecessaryOnly, workerDiscovered: true,
    expectedNativeSelector: selector,
    action: proof.action, authorizedTargetSha256: proof.authorizedTargetSha256,
    selectorHint: proof.selectorHint, recipeId: proof.recipeId, cmpId: proof.cmpId,
    observedAtMs: proof.observedAtMs, signal, deadlineAtMs,
  });
  const current = verified.status === "verified" ? verified.proof : undefined;
  if (!current || current.accessibleLabel !== proof.accessibleLabel || current.labelSource !== proof.labelSource ||
      current.actionSemantics !== proof.actionSemantics || current.frameIdentitySha256 !== proof.frameIdentitySha256 ||
      REVIEWED_COOKIE_ACCEPT_CONTROLS.some(scope => proof.classifierReasonCodes.includes(scope.proofReason) &&
        !current.classifierReasonCodes.includes(scope.proofReason)) ||
      (reviewedNecessaryOnly && (!isReviewedWorkerNecessaryOnlyRejectProof(requestedUrl, current) ||
        current.labelBoundNecessaryOnly?.contextText !== proof.labelBoundNecessaryOnly?.contextText))) {
    throw new Error("worker_consent_control_changed_before_dispatch");
  }
  const recheckedAtMs = Date.now();
  input.assertCurrent();
  assertConsentActionDispatchAllowed(page, signal, proof.authorizedTargetSha256, deadlineAtMs);
  const timeout = deadlineAtMs - Date.now();
  if (timeout <= 0) throw new Error("worker_consent_dispatch_deadline_exceeded");
  input.commit();
  await control.click({ timeout });
  return { control: current, recheckedAtMs, completedAtMs: Date.now() };
}
