import type { Page } from "playwright";
import {
  classifyConsentControlLabel,
  consentControlTerms,
  isSupportedPrivacyEvidenceLocale,
  PRIVACY_EVIDENCE_LOCALE_REGISTRY,
  type ConsentControlClassifierProfile,
  type ConsentControlLabelClassification,
  type SupportedPrivacyEvidenceLocale,
} from "@certscore/contracts";
import {
  KNOWN_CMP_REGISTRY,
  detectKnownCmps,
  type KnownCmpDetection,
  type KnownCmpSignal,
} from "@website-signal-risk-scanner/shared";

export type ConsentControlGeometryActionType =
  | "accept_all"
  | "reject_all"
  | "manage_preferences"
  | "save_preferences"
  | "do_not_sell_share"
  | "policy_link"
  | "other";

export type ConsentControlGeometryLayer =
  | "first_layer"
  | "preference_center"
  | "footer"
  | "page_body"
  | "unknown";

export type ConsentControlPresentationType =
  | "dedicated_button"
  | "inline_link"
  | "persistent_link"
  | "unknown";

export type ConsentControlDecisionStatus =
  | "confirmed_visible"
  | "dom_present_not_visible"
  | "hidden"
  | "disabled"
  | "clipped"
  | "covered"
  | "deeper_layer"
  | "footer_or_policy_link"
  | "ambiguous";

export interface ConsentControlRect {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ConsentControlGeometryStyle {
  display: string;
  visibility: string;
  opacity: string;
  pointerEvents: string;
  position: string;
  zIndex: string;
}

export interface ConsentControlOcclusionCheck {
  center: boolean;
  topLeft: boolean;
  topRight: boolean;
  bottomLeft: boolean;
  bottomRight: boolean;
  checkedPoints: number;
  hitSelectorHints: string[];
}

export interface ConsentControlContainerEvidence {
  containerId: string;
  selectorHint: string;
  role?: string;
  ariaLabel?: string;
  id?: string;
  classes?: string;
  layer: ConsentControlGeometryLayer;
  textExcerpt: string;
  htmlExcerpt: string;
  boundingBox: ConsentControlRect;
  intersectsViewport: boolean;
}

export interface ConsentControlCandidateEvidence {
  candidateId: string;
  label: string;
  normalizedLabel: string;
  actionType: ConsentControlGeometryActionType;
  presentationType: ConsentControlPresentationType;
  tagName: string;
  role?: string;
  ariaLabel?: string;
  title?: string;
  value?: string;
  selectorHint: string;
  containerSelectorHint?: string;
  containerId?: string;
  layer: ConsentControlGeometryLayer;
  frameContext: {
    frameKind: "main_frame" | "child_frame";
    frameUrl: string;
  };
  enabled: boolean;
  computedStyle: ConsentControlGeometryStyle;
  boundingBox: ConsentControlRect;
  viewport: {
    width: number;
    height: number;
  };
  intersectsViewport: boolean;
  clippedByScrollableAncestor: boolean;
  scrollableAncestor?: {
    selectorHint: string;
    boundingBox: ConsentControlRect;
  };
  occlusion: ConsentControlOcclusionCheck;
  screenshotArtifactRef?: string;
  matchedTerm?: string;
  matchedLocale?: string;
  matchStrength?: string;
  classifierReasonCodes: string[];
  classifierConfidence: number;
  diagnosticClassifications?: ConsentControlDiagnosticClassification[];
  decisionStatus: ConsentControlDecisionStatus;
  reasons: string[];
}

export interface ConsentControlDiagnosticClassification {
  classifierProfile: ConsentControlClassifierProfile;
  intent: ConsentControlLabelClassification["intent"];
  actionType: ConsentControlGeometryActionType;
  matchedTerm?: string;
  matchedLocale?: string;
  matchStrength?: string;
  classifierReasonCodes: string[];
  classifierConfidence: number;
  classifierVariant?: string;
  productionCredit: false;
}

export interface ConsentControlCmpEvidence {
  detected: boolean;
  name?: string;
  confidence: number;
  reasonCodes: string[];
  matchedSignals: KnownCmpSignal[];
  detections: KnownCmpDetection[];
}

export interface ConsentControlGeometryArtifact {
  artifactVersion: "consent_control_geometry.v1";
  sourceScanner: "consent_control_geometry_diagnostic";
  pageUrl: string;
  capturedAt: string;
  viewport: {
    width: number;
    height: number;
  };
  screenshotArtifactRef?: string;
  cmp: ConsentControlCmpEvidence;
  containers: ConsentControlContainerEvidence[];
  candidates: ConsentControlCandidateEvidence[];
  summary: {
    firstLayerAccept: boolean;
    firstLayerReject: boolean;
    firstLayerOptions: boolean;
    cmpDetected: boolean;
    cmpName?: string;
    confidence: number;
    limitations: string[];
  };
}

interface CaptureConsentControlGeometryOptions {
  screenshotArtifactRef?: string;
  candidateLimit?: number;
  containerLimit?: number;
  timeoutMs?: number;
}

interface RawGeometryContainer {
  selectorHint: string;
  role?: string;
  ariaLabel?: string;
  id?: string;
  classes?: string;
  layer: ConsentControlGeometryLayer;
  textExcerpt: string;
  htmlExcerpt: string;
  boundingBox: ConsentControlRect;
  intersectsViewport: boolean;
}

interface RawGeometryCandidate {
  frameUrl: string;
  localeHint?: string;
  label: string;
  tagName: string;
  role?: string;
  ariaLabel?: string;
  title?: string;
  value?: string;
  selectorHint: string;
  containerSelectorHint?: string;
  containerIndex?: number;
  layer: ConsentControlGeometryLayer;
  enabled: boolean;
  computedStyle: ConsentControlGeometryStyle;
  boundingBox: ConsentControlRect;
  viewport: {
    width: number;
    height: number;
  };
  intersectsViewport: boolean;
  clippedByScrollableAncestor: boolean;
  scrollableAncestor?: {
    selectorHint: string;
    boundingBox: ConsentControlRect;
  };
  occlusion: ConsentControlOcclusionCheck;
  contextText: string;
}

interface RawGeometryCapture {
  pageUrl: string;
  viewport: {
    width: number;
    height: number;
  };
  scripts: string[];
  cookieNames: string[];
  globals: string[];
  domSelectors: string[];
  textSnippets: string[];
  containers: RawGeometryContainer[];
  candidates: RawGeometryCandidate[];
}

const DEFAULT_CANDIDATE_LIMIT = 48;
const DEFAULT_CONTAINER_LIMIT = 12;
// Browser-side patterns only broaden candidate/context capture; canonical intent
// classification and production credit still flow through the contracts classifier.
const CONSENT_CONTEXT_PATTERN = canonicalPhrasePattern([
  "cookie", "cookies", "consent", "privacy", "tracking", "advertising", "marketing",
  "optanon", "onetrust", "cmp", "trustarc", "didomi", "usercentrics", "cookiebot", "consentmanager",
  "drupal", "eu cookie compliance", "sliding popup",
  ...PRIVACY_EVIDENCE_LOCALE_REGISTRY.flatMap((entry) => entry.contextHints),
]);
const MULTILINGUAL_DIAGNOSTIC_CONSENT_CONTEXT_PATTERN = CONSENT_CONTEXT_PATTERN;
const MULTILINGUAL_PREFERENCE_CONTEXT_PATTERN = canonicalPhrasePattern([
  ...consentControlTerms
    .filter((term) => term.intent === "options")
    .map((term) => term.phrase),
  ...PRIVACY_EVIDENCE_LOCALE_REGISTRY.flatMap((entry) => entry.contextHints),
]);
const POLICY_LINK_PATTERN = canonicalPhrasePattern(
  PRIVACY_EVIDENCE_LOCALE_REGISTRY.flatMap((entry) => [
    ...entry.privacyPolicyLabels,
    ...entry.cookiePolicyLabels,
  ]),
);
const CANDIDATE_ACTION_PRIORITY_PATTERN = canonicalPhrasePattern([
  "accept", "agree", "allow", "continue", "reject", "decline", "deny", "settings", "preferences", "options", "choices", "manage", "necessary", "essential", "required",
  ...PRIVACY_EVIDENCE_LOCALE_REGISTRY.flatMap((entry) => [
    ...entry.consentControls.accept,
    ...entry.consentControls.reject,
    ...entry.consentControls.options,
    ...entry.consentControls.necessaryOnly,
  ]),
]);
const STATIC_TEXT_TAG_NAMES = new Set(["p", "span", "strong", "em", "small", "li", "h1", "h2", "h3", "h4", "h5", "h6"]);
const INTERACTIVE_TAG_NAMES = new Set(["a", "button", "input", "select", "textarea"]);
const INTERACTIVE_ROLE_PATTERN = /^(button|link|checkbox|radio|switch|tab|menuitem)$/i;

function canonicalPhrasePattern(phrases: readonly string[]): RegExp {
  const source = [...new Set(phrases)]
    .filter((phrase) => phrase.length >= 2)
    .sort((left, right) => right.length - left.length)
    .map((phrase) => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(source || "$a", "iu");
}

export async function captureConsentControlGeometry(
  page: Page,
  options: CaptureConsentControlGeometryOptions = {},
): Promise<ConsentControlGeometryArtifact> {
  const registrySelectors = KNOWN_CMP_REGISTRY.flatMap((entry) => entry.domSelectors ?? []);
  const frameInput = {
    candidateLimit: options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT,
    containerLimit: options.containerLimit ?? DEFAULT_CONTAINER_LIMIT,
    consentPatternSource: CONSENT_CONTEXT_PATTERN.source,
    controlLabelPatternSource: CANDIDATE_ACTION_PRIORITY_PATTERN.source,
    registrySelectors,
  };
  const mainFrame = page.mainFrame();
  const frames = [
    mainFrame,
    ...page.frames().filter((frame) => frame !== mainFrame),
  ]
    .sort((left, right) => {
      if (left === mainFrame) return -1;
      if (right === mainFrame) return 1;
      return cmpFramePriority(right.url()) - cmpFramePriority(left.url());
    })
    .slice(0, 12);
  const frameTimeoutMs = options.timeoutMs
    ? Math.max(250, Math.floor(options.timeoutMs / Math.max(frames.length, 1)))
    : undefined;
  const cookieNamesPromise = page.context().cookies(page.url())
    .then((cookies) => cookies.map((cookie) => cookie.name))
    .catch(() => undefined);
  const captureResults = await Promise.all(frames.map(async (frame, frameIndex) => {
    try {
      const capture = frame.evaluate<RawGeometryCapture, typeof frameInput>(collectConsentGeometryInPage, frameInput);
      const result = frameTimeoutMs
        ? await promiseWithTimeout(capture, frameTimeoutMs)
        : await capture;
      return result ? { capture: result, frameIndex } : undefined;
    } catch {
      return undefined;
    }
  }));
  const successfulCaptures = captureResults.filter(
    (result): result is { capture: RawGeometryCapture; frameIndex: number } => Boolean(result),
  );
  const mainFrameCapture = successfulCaptures.find((result) => result.frameIndex === 0)?.capture;
  const captures = successfulCaptures.map((result) => result.capture);
  const raw = mergeRawGeometryCaptures(captures, page.url(), frameInput);
  const cookieNames = await cookieNamesPromise ?? raw.cookieNames;
  const cmp = buildCmpEvidence({ ...raw, cookieNames });
  const containers = raw.containers.map((container, index): ConsentControlContainerEvidence => ({
    containerId: `container_${index}`,
    ...container,
  }));
  const candidates = raw.candidates.map((candidate, index) =>
    buildCandidateEvidence(candidate, index, raw.pageUrl, options.screenshotArtifactRef, containers)
  );
  reconcileConfirmedConsentModalClusters(candidates, containers);
  const summary = summarizeConsentControlGeometry(candidates, cmp);
  const expectedPageUrl = page.url();
  const mainFrameUnavailable = !mainFrameCapture ||
    mainFrameCapture.pageUrl === "about:blank" ||
    mainFrameCapture.viewport.width <= 0 ||
    mainFrameCapture.viewport.height <= 0;
  if (mainFrameUnavailable) {
    summary.confidence = 0;
    summary.limitations = [
      "Main-frame consent geometry was unavailable; child-frame or blank-document geometry cannot establish control absence.",
      ...summary.limitations,
    ].slice(0, 12);
  }

  return {
    artifactVersion: "consent_control_geometry.v1",
    sourceScanner: "consent_control_geometry_diagnostic",
    pageUrl: raw.pageUrl === "about:blank" ? expectedPageUrl : raw.pageUrl,
    capturedAt: new Date().toISOString(),
    viewport: raw.viewport,
    screenshotArtifactRef: options.screenshotArtifactRef,
    cmp,
    containers,
    candidates,
    summary,
  };
}

function reconcileConfirmedConsentModalClusters(
  candidates: ConsentControlCandidateEvidence[],
  containers: ConsentControlContainerEvidence[],
): void {
  const containersById = new Map(containers.map((container) => [container.containerId, container]));
  const candidatesByContainer = new Map<string, ConsentControlCandidateEvidence[]>();
  for (const candidate of candidates) {
    if (!candidate.containerId || candidate.layer !== "page_body" || candidate.decisionStatus !== "confirmed_visible") {
      continue;
    }
    if (
      candidate.actionType !== "accept_all" &&
      candidate.actionType !== "reject_all" &&
      candidate.actionType !== "manage_preferences"
    ) {
      continue;
    }
    const grouped = candidatesByContainer.get(candidate.containerId) ?? [];
    grouped.push(candidate);
    candidatesByContainer.set(candidate.containerId, grouped);
  }

  for (const [containerId, grouped] of candidatesByContainer) {
    const container = containersById.get(containerId);
    if (!container || !hasStrongConsentModalContainerEvidence(container)) {
      continue;
    }
    const actions = new Set(grouped.map((candidate) => candidate.actionType));
    const hasComplementaryControls = actions.has("accept_all") &&
      (actions.has("reject_all") || actions.has("manage_preferences"));
    if (!hasComplementaryControls) {
      continue;
    }
    container.layer = "first_layer";
    for (const candidate of candidates) {
      if (candidate.containerId !== containerId || candidate.layer !== "page_body") {
        continue;
      }
      candidate.layer = "first_layer";
      candidate.reasons = [
        ...candidate.reasons,
        "first_layer_reconciled_from_confirmed_modal_control_cluster",
      ];
    }
  }
}

function hasStrongConsentModalContainerEvidence(container: ConsentControlContainerEvidence): boolean {
  const context = [
    container.selectorHint,
    container.id ?? "",
    container.classes ?? "",
    container.role ?? "",
    container.ariaLabel ?? "",
    container.textExcerpt,
    container.htmlExcerpt,
  ].join(" ");
  const hasConsentContext = CONSENT_CONTEXT_PATTERN.test(context);
  const hasModalSemantics = /\b(?:alert)?dialog\b|aria-modal\s*=\s*["']?true|data-borlabs-cookie-consent-required/i.test(context);
  const hasOverlayStyling = /(?:position\s*:\s*fixed|\bfixed\b|w-screen|h-screen|inset-0|z-max|dialog-backdrop|cookiebox)/i.test(context);
  return hasConsentContext && (hasModalSemantics || hasOverlayStyling);
}

function cmpFramePriority(frameUrl: string): number {
  if (!frameUrl) return 0;
  try {
    const parsed = new URL(frameUrl);
    const hostname = parsed.hostname.toLowerCase();
    const matchesKnownCmpDomain = KNOWN_CMP_REGISTRY.some((definition) =>
      definition.domains.some((domain) => {
        const normalizedDomain = domain.toLowerCase().replace(/^\*\./, "");
        return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
      }),
    );
    const matchesKnownCmpUrl = KNOWN_CMP_REGISTRY.some((definition) =>
      definition.urlPatterns?.some((pattern) => pattern.test(frameUrl)) === true,
    );
    return matchesKnownCmpDomain || matchesKnownCmpUrl ? 100 : 0;
  } catch {
    return 0;
  }
}

function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function mergeRawGeometryCaptures(
  captures: RawGeometryCapture[],
  fallbackPageUrl: string,
  limits: {
    candidateLimit: number;
    containerLimit: number;
  },
): RawGeometryCapture {
  const main = captures[0];
  const merged: RawGeometryCapture = {
    pageUrl: main?.pageUrl ?? fallbackPageUrl,
    viewport: main?.viewport ?? { width: 0, height: 0 },
    scripts: unique(captures.flatMap((capture) => capture.scripts)).slice(0, 120),
    cookieNames: unique(captures.flatMap((capture) => capture.cookieNames)).slice(0, 120),
    globals: unique(captures.flatMap((capture) => capture.globals)).slice(0, 120),
    domSelectors: unique(captures.flatMap((capture) => capture.domSelectors)).slice(0, 120),
    textSnippets: captures.flatMap((capture) => capture.textSnippets).slice(0, 24),
    containers: [],
    candidates: [],
  };
  for (const capture of captures) {
    const containerOffset = merged.containers.length;
    merged.containers.push(...capture.containers);
    merged.candidates.push(...capture.candidates.map((candidate) => ({
      ...candidate,
      containerIndex: typeof candidate.containerIndex === "number"
        ? candidate.containerIndex + containerOffset
        : undefined,
    })));
  }
  merged.containers = merged.containers.slice(0, limits.containerLimit * Math.max(1, captures.length));
  merged.candidates = merged.candidates
    .sort((left, right) => candidateEvidencePriority(right) - candidateEvidencePriority(left))
    .slice(0, limits.candidateLimit);
  return merged;
}

function candidateEvidencePriority(candidate: RawGeometryCandidate): number {
  return (
    (candidate.containerSelectorHint ? 200 : 0) +
    (candidate.layer === "first_layer" ? 120 : 0) +
    (candidate.layer === "footer" ? -120 : 0) +
    candidateVisibilityPriority(candidate) +
    (CANDIDATE_ACTION_PRIORITY_PATTERN.test(candidate.label) ? 120 : 0)
  );
}

function candidateVisibilityPriority(candidate: RawGeometryCandidate): number {
  const opacity = Number.parseFloat(candidate.computedStyle.opacity || "1");
  const styleHidden =
    candidate.computedStyle.display === "none" ||
    candidate.computedStyle.visibility === "hidden" ||
    opacity <= 0.05;
  const hasBox = candidate.boundingBox.width > 0 && candidate.boundingBox.height > 0;
  return (
    (styleHidden ? -260 : 60) +
    (candidate.intersectsViewport ? 140 : -140) +
    (hasBox ? 100 : -180) +
    (candidate.enabled ? 0 : -40)
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildCmpEvidence(input: RawGeometryCapture): ConsentControlCmpEvidence {
  const rawDetections = detectKnownCmps({
    cookieNames: input.cookieNames,
    domSelectors: input.domSelectors,
    jsGlobals: input.globals,
    textSnippets: input.textSnippets,
    urls: unique([...input.scripts, input.pageUrl]),
  });
  const detections = rawDetections.map((detection) => ({
    ...detection,
    matchedSignals: detection.matchedSignals.map(sanitizeCmpSignal),
  }));
  const top = detections[0];
  const matchedSignals = top?.matchedSignals ?? [];
  return {
    detected: Boolean(top),
    name: top?.canonicalName,
    confidence: top?.confidence ?? 0,
    reasonCodes: matchedSignals.map((signal) => `${signal.source}:${signal.value}`),
    matchedSignals,
    detections,
  };
}

function sanitizeCmpSignal(signal: KnownCmpSignal): KnownCmpSignal {
  return {
    source: signal.source,
    value: sanitizeSignalValue(signal.source, signal.value),
  };
}

function sanitizeSignalValue(source: KnownCmpSignal["source"], value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim().slice(0, 500);
  if (source === "url" || source === "script" || source === "iframe") {
    try {
      const url = new URL(trimmed);
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return trimmed.replace(/[?#].*$/, "").slice(0, 240);
    }
  }
  if (source === "text") {
    return trimmed.slice(0, 240);
  }
  return trimmed.slice(0, 240);
}

function buildCandidateEvidence(
  candidate: RawGeometryCandidate,
  index: number,
  pageUrl: string,
  screenshotArtifactRef: string | undefined,
  containers: ConsentControlContainerEvidence[],
): ConsentControlCandidateEvidence {
  const classification = classifyCandidate(candidate);
  const actionType = actionTypeForClassification(classification, candidate);
  const diagnosticClassifications = diagnosticClassificationsForCandidate(candidate);
  const reasons: string[] = [];
  const decisionStatus = decisionStatusForCandidate(candidate, actionType, reasons);
  return {
    candidateId: `candidate_${index}`,
    label: candidate.label,
    normalizedLabel: normalizeLabel(candidate.label),
    actionType,
    presentationType: presentationTypeForCandidate(candidate),
    tagName: candidate.tagName,
    role: candidate.role,
    ariaLabel: candidate.ariaLabel,
    title: candidate.title,
    value: candidate.value,
    selectorHint: candidate.selectorHint,
    containerSelectorHint: candidate.containerSelectorHint,
    containerId: typeof candidate.containerIndex === "number" ? containers[candidate.containerIndex]?.containerId : undefined,
    layer: candidate.layer,
    frameContext: {
      frameKind: candidate.frameUrl === pageUrl ? "main_frame" : "child_frame",
      frameUrl: candidate.frameUrl,
    },
    enabled: candidate.enabled,
    computedStyle: candidate.computedStyle,
    boundingBox: candidate.boundingBox,
    viewport: candidate.viewport,
    intersectsViewport: candidate.intersectsViewport,
    clippedByScrollableAncestor: candidate.clippedByScrollableAncestor,
    scrollableAncestor: candidate.scrollableAncestor,
    occlusion: candidate.occlusion,
    screenshotArtifactRef,
    matchedTerm: classification.matchedTerm,
    matchedLocale: classification.matchedLocale,
    matchStrength: classification.matchStrength,
    classifierReasonCodes: classification.reasonCodes,
    classifierConfidence: classification.confidence,
    diagnosticClassifications,
    decisionStatus,
    reasons,
  };
}

function presentationTypeForCandidate(
  candidate: Pick<RawGeometryCandidate, "layer" | "role" | "tagName">,
): ConsentControlPresentationType {
  const role = candidate.role?.toLowerCase();
  if (
    candidate.tagName === "button" ||
    candidate.tagName === "input" ||
    role === "button"
  ) {
    return "dedicated_button";
  }
  if (candidate.tagName === "a" || role === "link") {
    return candidate.layer === "first_layer" ? "inline_link" : "persistent_link";
  }
  return "unknown";
}

function classifyCandidate(candidate: RawGeometryCandidate): ConsentControlLabelClassification {
  return classifyConsentControlLabel({
    label: candidate.label,
    ariaLabel: candidate.ariaLabel,
    title: candidate.title,
    value: candidate.value,
    contextText: candidate.contextText,
    hasConsentContext: CONSENT_CONTEXT_PATTERN.test(candidate.contextText),
    hasPreferenceContext:
      candidate.layer === "preference_center" ||
      MULTILINGUAL_PREFERENCE_CONTEXT_PATTERN.test(candidate.contextText),
    localeHints: localeHintsForCandidate(candidate),
  });
}

function diagnosticClassificationsForCandidate(candidate: RawGeometryCandidate): ConsentControlDiagnosticClassification[] | undefined {
  const hasConsentContext = MULTILINGUAL_DIAGNOSTIC_CONSENT_CONTEXT_PATTERN.test(candidate.contextText);
  const hasPreferenceContext = hasConsentContext &&
    (candidate.layer === "preference_center" || MULTILINGUAL_PREFERENCE_CONTEXT_PATTERN.test(candidate.contextText));
  const classifierContextText = hasConsentContext || hasPreferenceContext ? candidate.contextText : "";
  const classification = classifyConsentControlLabel({
    label: candidate.label,
    ariaLabel: candidate.ariaLabel,
    title: candidate.title,
    value: candidate.value,
    contextText: classifierContextText,
    classifierProfile: "multilingual_v1",
    hasConsentContext,
    hasPreferenceContext,
    localeHints: localeHintsForCandidate(candidate),
  });
  if (classification.intent === "unknown") {
    return undefined;
  }
  if (isLoosePageChromeDiagnostic(candidate, classification)) {
    return undefined;
  }
  return [{
    classifierProfile: "multilingual_v1",
    intent: classification.intent,
    actionType: actionTypeForClassification(classification, candidate),
    matchedTerm: classification.matchedTerm,
    matchedLocale: classification.matchedLocale,
    matchStrength: classification.matchStrength,
    classifierReasonCodes: classification.reasonCodes,
    classifierConfidence: classification.confidence,
    classifierVariant: classification.variant,
    productionCredit: false,
  }];
}

function localeHintsForCandidate(candidate: RawGeometryCandidate): SupportedPrivacyEvidenceLocale[] | undefined {
  const normalized = candidate.localeHint?.trim().toLowerCase().replace(/_/g, "-");
  if (!normalized) return undefined;
  const baseLocale = normalized.split("-", 1)[0];
  return baseLocale && isSupportedPrivacyEvidenceLocale(baseLocale) ? [baseLocale] : undefined;
}

function isLoosePageChromeDiagnostic(
  candidate: RawGeometryCandidate,
  classification: ConsentControlLabelClassification,
) {
  const matchedTerm = normalizeLabel(classification.matchedTerm ?? "");
  const label = normalizeLabel(candidate.label);
  const genericContextualTerms = new Set([
    "instellingen",
    "voorkeuren",
    "keuzes",
    "ustawienia",
    "preferencje",
    "opcje",
  ]);
  return classification.matchStrength === "contextual" &&
    (classification.matchedLocale === "nl" || classification.matchedLocale === "pl") &&
    genericContextualTerms.has(matchedTerm) &&
    label === matchedTerm &&
    !candidate.containerSelectorHint;
}

function actionTypeForClassification(
  classification: ConsentControlLabelClassification,
  candidate: RawGeometryCandidate,
): ConsentControlGeometryActionType {
  if (
    classification.intent === "options" &&
    classification.matchStrength === "direct" &&
    ["cookie consent tool", "consent choices"].includes(
      classification.matchedTerm?.trim().toLocaleLowerCase() ?? ""
    )
  ) {
    return classification.variant === "save_preferences" ? "save_preferences" : "manage_preferences";
  }
  if (candidate.tagName === "a" && POLICY_LINK_PATTERN.test(candidate.label)) {
    return "policy_link";
  }
  if (classification.intent === "accept") {
    return "accept_all";
  }
  if (classification.intent === "reject") {
    if (
      classification.variant === "reject_with_subscription" ||
      classification.variant === "reject_with_payment"
    ) {
      return "other";
    }
    return "reject_all";
  }
  if (classification.intent === "privacy_opt_out") {
    return "do_not_sell_share";
  }
  if (classification.intent === "options") {
    if (
      classification.matchStrength === "contextual" &&
      isStaticTextContextualOptionsCandidate(candidate)
    ) {
      return "other";
    }
    return classification.variant === "save_preferences" ? "save_preferences" : "manage_preferences";
  }
  return "other";
}

function isStaticTextContextualOptionsCandidate(candidate: RawGeometryCandidate): boolean {
  if (INTERACTIVE_TAG_NAMES.has(candidate.tagName) || INTERACTIVE_ROLE_PATTERN.test(candidate.role ?? "")) {
    return false;
  }
  return STATIC_TEXT_TAG_NAMES.has(candidate.tagName);
}

function decisionStatusForCandidate(
  candidate: RawGeometryCandidate,
  actionType: ConsentControlGeometryActionType,
  reasons: string[],
): ConsentControlDecisionStatus {
  const opacity = Number.parseFloat(candidate.computedStyle.opacity || "1");
  if (!candidate.enabled) {
    reasons.push("control_disabled");
    return "disabled";
  }
  if (
    candidate.computedStyle.display === "none" ||
    candidate.computedStyle.visibility === "hidden" ||
    opacity <= 0.05 ||
    candidate.boundingBox.width <= 0 ||
    candidate.boundingBox.height <= 0
  ) {
    reasons.push("hidden_or_zero_area");
    return "hidden";
  }
  if (candidate.layer === "footer" || actionType === "policy_link") {
    reasons.push("footer_or_policy_link");
    return "footer_or_policy_link";
  }
  if (candidate.clippedByScrollableAncestor) {
    reasons.push("clipped_by_scrollable_ancestor");
    return "clipped";
  }
  if (candidate.layer === "preference_center" && actionType !== "accept_all" && actionType !== "reject_all") {
    reasons.push("preference_center_or_deeper_layer");
    return "deeper_layer";
  }
  if (!candidate.intersectsViewport) {
    reasons.push("outside_viewport");
    return "dom_present_not_visible";
  }
  if (!candidate.occlusion.center && candidate.occlusion.checkedPoints > 0) {
    reasons.push("covered_at_center_point");
    return "covered";
  }
  if (actionType === "other") {
    reasons.push("unclassified_control");
    return "ambiguous";
  }
  reasons.push("visible_first_layer_candidate");
  return "confirmed_visible";
}

function summarizeConsentControlGeometry(
  candidates: ConsentControlCandidateEvidence[],
  cmp: ConsentControlCmpEvidence,
): ConsentControlGeometryArtifact["summary"] {
  const confirmedFirstLayer = candidates.filter((candidate) =>
    candidate.decisionStatus === "confirmed_visible" && candidate.layer === "first_layer"
  );
  const firstLayerAccept = confirmedFirstLayer.some((candidate) => candidate.actionType === "accept_all");
  const firstLayerReject = confirmedFirstLayer.some((candidate) => candidate.actionType === "reject_all");
  const firstLayerOptions = confirmedFirstLayer.some((candidate) => candidate.actionType === "manage_preferences");
  const limitations = candidates
    .filter((candidate) =>
      candidate.actionType === "accept_all" ||
      candidate.actionType === "reject_all" ||
      candidate.actionType === "manage_preferences"
    )
    .filter((candidate) => candidate.decisionStatus !== "confirmed_visible")
    .map((candidate) => `${candidate.actionType}:${candidate.label}:${candidate.decisionStatus}`)
    .slice(0, 12);
  const observedCount = [firstLayerAccept, firstLayerReject, firstLayerOptions].filter(Boolean).length;
  if (cmp.detected && observedCount === 0) {
    limitations.unshift("cmp_detected_without_visible_first_layer_controls");
  }
  return {
    firstLayerAccept,
    firstLayerReject,
    firstLayerOptions,
    cmpDetected: cmp.detected,
    cmpName: cmp.name,
    confidence: Math.min(0.98, 0.55 + observedCount * 0.12 + (cmp.detected ? 0.1 : 0)),
    limitations,
  };
}

function normalizeLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().toLowerCase();
}

function collectConsentGeometryInPage(input: {
  candidateLimit: number;
  containerLimit: number;
  consentPatternSource: string;
  controlLabelPatternSource: string;
  registrySelectors: string[];
}): RawGeometryCapture {
  const globalWithNameHelper = globalThis as typeof globalThis & { __name?: <T>(target: T) => T };
  globalWithNameHelper.__name ??= function(target) {
    return target;
  };
  const maxText = 1_200;
  const maxHtml = 2_000;
  const deepRootCache = new WeakMap<ParentNode, ParentNode[]>();
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };
  const consentPattern = new RegExp(input.consentPatternSource, "iu");
  const controlLabelPattern = new RegExp(input.controlLabelPatternSource, "iu");
  const containerSelector = [
    "[role='dialog']",
    "[aria-modal='true']",
    "[id*='cookie' i]",
    "[class*='cookie' i]",
    "[id*='banner' i]",
    "[class*='banner' i]",
    "[id*='consent' i]",
    "[class*='consent' i]",
    "[id*='onetrust' i]",
    "[class*='onetrust' i]",
    "[id*='optanon' i]",
    "[class*='cmp' i]",
    "[id*='cmp' i]",
    "[id*='privacy' i]",
    "[class*='privacy' i]",
    ...input.registrySelectors,
  ].join(",");
  const controlSelector = [
    "button",
    "[role='button']",
    "a",
    "[onclick]",
    "[tabindex]",
    "[class*='btn' i]",
    "[class*='button' i]",
    "[class*='action' i]",
    "[class*='didomi-components-button' i]",
    "[class*='didomi-button' i]",
    "[id*='didomi' i][class*='accept' i]",
    "[id*='didomi' i][class*='reject' i]",
    "[data-testid*='button' i]",
    "[data-testid*='accept' i]",
    "[data-testid*='reject' i]",
    "input[type='button']",
    "input[type='submit']",
    "input[type='checkbox']",
    "input[type='radio']",
  ].join(",");

  const containers = deepQuerySelectorAll(containerSelector)
    .filter((element) => {
      const tagName = element.tagName.toLowerCase();
      const role = (element.getAttribute("role") || "").toLowerCase();
      return (
        tagName !== "html" &&
        tagName !== "body" &&
        tagName !== "head" &&
        tagName !== "style" &&
        tagName !== "script" &&
        tagName !== "button" &&
        tagName !== "a" &&
        tagName !== "input" &&
        tagName !== "select" &&
        tagName !== "textarea" &&
        role !== "button" &&
        role !== "link"
      );
    })
    .filter((element) => consentPattern.test(compactText([
      deepText(element),
      element.getAttribute("aria-label") || "",
      element.getAttribute("id") || "",
      element.getAttribute("class") || "",
    ].join(" "))))
    .map((element) => {
      const box = rectFor(element);
      return {
        element,
        evidence: {
          selectorHint: selectorHintFor(element),
          role: attr(element, "role"),
          ariaLabel: attr(element, "aria-label"),
          id: attr(element, "id"),
          classes: attr(element, "class")?.slice(0, 240),
          layer: layerFor(element, box),
          textExcerpt: deepText(element).slice(0, maxText),
          htmlExcerpt: sanitizeHtmlExcerpt(element, maxHtml),
          boundingBox: box,
          intersectsViewport: intersects(box, viewportRect()),
        } satisfies RawGeometryContainer,
      };
    })
    .filter((item, index, list) =>
      item.evidence.boundingBox.width > 0 ||
      item.evidence.boundingBox.height > 0 ||
      index < Math.min(4, list.length)
    )
    .slice(0, input.containerLimit);

  const containerControls = containers.flatMap((container) =>
    deepQuerySelectorAll(controlSelector, container.element).slice(0, 80)
  );
  const documentControls = deepQuerySelectorAll(controlSelector)
    .filter((element) => {
      const label = labelFor(element);
      const attrs = compactText([
        label,
        element.getAttribute("id") || "",
        element.getAttribute("class") || "",
        element.getAttribute("aria-label") || "",
        element.getAttribute("title") || "",
      ].join(" "));
      return controlLabelPattern.test(attrs) || consentPattern.test(attrs);
    })
    .slice(0, 800);
  const seenControlElements = new Set<Element>();
  const controlElements = [...containerControls, ...documentControls].filter((element) => {
    if (seenControlElements.has(element)) {
      return false;
    }
    seenControlElements.add(element);
    return true;
  });

  const candidates = controlElements
    .map((element) => candidateFor(element, containers, viewport, consentPattern))
    .filter((candidate): candidate is RawGeometryCandidate => Boolean(candidate))
    .sort((left, right) => candidatePriority(right) - candidatePriority(left))
    .slice(0, input.candidateLimit);

  const domSelectors = input.registrySelectors.filter((selector) => {
    try {
      return Boolean(document.querySelector(selector));
    } catch {
      return false;
    }
  });

  return {
    pageUrl: window.location.href,
    viewport,
    scripts: Array.from(document.scripts).map((script) => script.src).filter(Boolean).slice(0, 80),
    cookieNames: safeCookieNames(),
    globals: [
      "OneTrust",
      "Optanon",
      "OptanonWrapper",
      "__tcfapi",
      "__cmp",
      "__cmpapi",
      "Cookiebot",
      "Didomi",
      "UC_UI",
      "TrustArc",
    ].filter((name) => name in window).concat(
      (() => {
        const settings = (window as typeof window & {
          drupalSettings?: Record<string, unknown>;
        }).drupalSettings;
        return settings && typeof settings.eu_cookie_compliance === "object"
          ? ["drupalSettings.eu_cookie_compliance"]
          : [];
      })(),
    ),
    domSelectors,
    textSnippets: [
      compactText(document.body?.innerText || "").slice(0, 2_000),
      ...containers.map((container) => container.evidence.textExcerpt.slice(0, 500)),
    ],
    containers: containers.map((container) => container.evidence),
    candidates,
  };

  function candidateFor(
    element: Element,
    containerItems: Array<{ element: Element; evidence: RawGeometryContainer }>,
    viewportValue: { width: number; height: number },
    contextPattern: RegExp,
  ): RawGeometryCandidate | null {
    if (isStaticTextOnlyControlCandidate(element)) {
      return null;
    }
    // Some CMPs add a class such as `button-row` to a wrapper that contains
    // the real actionable controls. Retaining that wrapper creates a composite
    // label (for example, "Manage settingsReject Accept") and can consume the
    // candidate budget before its child buttons are considered. Keep the
    // actual interactive descendants and omit only non-interactive wrappers.
    if (!isSemanticallyInteractive(element) && hasInteractiveDescendant(element)) {
      return null;
    }
    const label = labelFor(element);
    const containerIndex = nearestContainerIndex(element, containerItems);
    const contextRoot = typeof containerIndex === "number" ? containerItems[containerIndex]?.element : nearestContextRoot(element, contextPattern);
    const consentfulContextRoot = nearestTextContextRoot(element, contextPattern, label);
    const contextText = compactText(
      (consentfulContextRoot ? deepText(consentfulContextRoot) : "") ||
      (contextRoot ? deepText(contextRoot) : "") ||
      (element.parentElement ? deepText(element.parentElement) : ""),
    );
    const attrs = compactText([
      label,
      element.getAttribute("id") || "",
      element.getAttribute("class") || "",
      element.getAttribute("aria-label") || "",
      element.getAttribute("title") || "",
      contextText,
    ].join(" "));
    if (!label || (!controlLabelPattern.test(attrs) && !contextPattern.test(attrs) && !contextRoot)) {
      return null;
    }
    const box = rectFor(element);
    const style = window.getComputedStyle(element);
    const scrollableAncestor = nearestScrollableAncestor(element);
    const scrollableAncestorBox = scrollableAncestor ? rectFor(scrollableAncestor) : undefined;
    const clippedByScrollableAncestor = Boolean(scrollableAncestorBox && !containsRect(scrollableAncestorBox, box));
    const container = typeof containerIndex === "number" ? containerItems[containerIndex] : undefined;
    return {
      frameUrl: window.location.href,
      localeHint: document.documentElement.lang || undefined,
      label: label.slice(0, 160),
      tagName: element.tagName.toLowerCase(),
      role: attr(element, "role"),
      ariaLabel: attr(element, "aria-label"),
      title: attr(element, "title"),
      value: element instanceof HTMLInputElement ? element.value.slice(0, 160) : undefined,
      selectorHint: selectorHintFor(element),
      containerSelectorHint: container?.evidence.selectorHint,
      containerIndex,
      layer: container?.evidence.layer ?? layerFor(element, box),
      enabled: !(element instanceof HTMLButtonElement || element instanceof HTMLInputElement) || !element.disabled,
      computedStyle: {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        position: style.position,
        zIndex: style.zIndex,
      },
      boundingBox: box,
      viewport: viewportValue,
      intersectsViewport: intersects(box, viewportRect()),
      clippedByScrollableAncestor,
      scrollableAncestor: scrollableAncestor && scrollableAncestorBox
        ? {
          selectorHint: selectorHintFor(scrollableAncestor),
          boundingBox: scrollableAncestorBox,
        }
        : undefined,
      occlusion: occlusionFor(element, box),
      contextText: contextText.slice(0, 1_000),
    };
  }

  function isStaticTextOnlyControlCandidate(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();
    if (!/^(?:p|span|strong|em|small|h[1-6]|li|dt|dd)$/.test(tagName)) {
      return false;
    }
    const role = (element.getAttribute("role") || "").toLowerCase();
    if (role === "button" || role === "link") {
      return false;
    }
    const className = element.getAttribute("class") || "";
    const id = element.getAttribute("id") || "";
    return !(
      element.hasAttribute("onclick") ||
      /\b(?:btn|button|choice|option|preference|purpose)\b/i.test(className) ||
      /(?:btn|button|choice|option|preference|purpose)/i.test(id)
    );
  }

  function isSemanticallyInteractive(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();
    if (/^(?:a|button|input|select|textarea|summary)$/.test(tagName)) {
      return true;
    }
    const role = (element.getAttribute("role") || "").toLowerCase();
    if (/^(?:button|link|checkbox|radio|switch|tab|menuitem|option)$/i.test(role)) {
      return true;
    }
    if (element.hasAttribute("onclick")) {
      return true;
    }
    const tabindex = element.getAttribute("tabindex");
    return tabindex !== null && Number.isFinite(Number(tabindex)) && Number(tabindex) >= 0;
  }

  function hasInteractiveDescendant(element: Element): boolean {
    return deepQuerySelectorAll(
      "button,a,input,select,textarea,summary,[role='button'],[role='link'],[role='checkbox'],[role='radio'],[role='switch'],[role='tab'],[role='menuitem'],[role='option'],[onclick],[tabindex]",
      element,
    ).some((descendant) => descendant !== element && isSemanticallyInteractive(descendant));
  }

  function nearestContextRoot(element: Element, pattern: RegExp): Element | undefined {
    let current: Element | null = element;
    for (let depth = 0; current && depth < 8; depth += 1) {
      if (current === document.body || current === document.documentElement) {
        return undefined;
      }
      if (pattern.test(compactText([
        deepText(current),
        current.getAttribute("id") || "",
        current.getAttribute("class") || "",
        current.getAttribute("aria-label") || "",
      ].join(" ")))) {
        return current;
      }
      current = parentElementOrHost(current);
    }
    return undefined;
  }

  function nearestTextContextRoot(element: Element, pattern: RegExp, label: string): Element | undefined {
    let current: Element | null = element;
    for (let depth = 0; current && depth < 8; depth += 1) {
      if (current === document.body || current === document.documentElement) {
        return undefined;
      }
      const text = deepText(current);
      if (text.length > Math.max(label.length + 24, 48) && pattern.test(text)) {
        return current;
      }
      current = parentElementOrHost(current);
    }
    return undefined;
  }

  function candidatePriority(candidate: RawGeometryCandidate): number {
    return (
      (candidate.containerSelectorHint ? 200 : 0) +
      (candidate.layer === "first_layer" ? 120 : 0) +
      (candidate.layer === "footer" ? -120 : 0) +
      candidateVisibilityPriority(candidate) +
      (controlLabelPattern.test(candidate.label) ? 120 : 0)
    );
  }

  function candidateVisibilityPriority(candidate: RawGeometryCandidate): number {
    const opacity = Number.parseFloat(candidate.computedStyle.opacity || "1");
    const styleHidden =
      candidate.computedStyle.display === "none" ||
      candidate.computedStyle.visibility === "hidden" ||
      opacity <= 0.05;
    const hasBox = candidate.boundingBox.width > 0 && candidate.boundingBox.height > 0;
    return (
      (styleHidden ? -260 : 60) +
      (candidate.intersectsViewport ? 140 : -140) +
      (hasBox ? 100 : -180) +
      (candidate.enabled ? 0 : -40)
    );
  }

  function nearestContainerIndex(
    element: Element,
    containerItems: Array<{ element: Element; evidence: RawGeometryContainer }>,
  ): number | undefined {
    let best: {
      index: number;
      area: number;
      positiveArea: boolean;
      intersectsViewport: boolean;
      firstLayer: boolean;
    } | undefined;
    containerItems.forEach((item, index) => {
      if (!composedContains(item.element, element)) {
        return;
      }
      const box = item.evidence.boundingBox;
      const area = box.width * box.height;
      const candidate = {
        index,
        area,
        positiveArea: area > 0,
        intersectsViewport: item.evidence.intersectsViewport,
        firstLayer: item.evidence.layer === "first_layer",
      };
      if (!best || isBetterContainerMatch(candidate, best)) {
        best = candidate;
      }
    });
    return best?.index;
  }

  function isBetterContainerMatch(
    candidate: {
      area: number;
      positiveArea: boolean;
      intersectsViewport: boolean;
      firstLayer: boolean;
    },
    current: {
      area: number;
      positiveArea: boolean;
      intersectsViewport: boolean;
      firstLayer: boolean;
    },
  ): boolean {
    if (candidate.positiveArea !== current.positiveArea) {
      return candidate.positiveArea;
    }
    if (candidate.intersectsViewport !== current.intersectsViewport) {
      return candidate.intersectsViewport;
    }
    if (candidate.firstLayer !== current.firstLayer) {
      return candidate.firstLayer;
    }
    if (candidate.area > 0 && current.area > 0) {
      return candidate.area < current.area;
    }
    return false;
  }

  function labelFor(element: Element): string {
    const aria = element.getAttribute("aria-label");
    const labelRoot = element.getRootNode();
    const labelledBy = (element.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => {
        if (labelRoot instanceof Document) {
          return labelRoot.getElementById(id);
        }
        if (labelRoot instanceof ShadowRoot) {
          return labelRoot.querySelector(`#${cssEscape(id)}`);
        }
        return document.getElementById(id);
      })
      .filter((labelElement): labelElement is HTMLElement => Boolean(labelElement))
      .map((labelElement) => compactText(labelElement.innerText || labelElement.textContent || ""))
      .filter(Boolean)
      .join(" ");
    const title = element.getAttribute("title");
    const value = element instanceof HTMLInputElement ? element.value : "";
    const visibleText = element instanceof HTMLElement ? compactText(element.innerText || "") : "";
    const text = visibleText || deepText(element);
    // Tokenized aria labels are implementation keys, not user-facing control
    // names (for example `BUTTONS.REJECT`). Prefer the rendered label while
    // retaining the token separately in ariaLabel for diagnostics.
    for (const candidate of [aria, labelledBy, title, value, text]) {
      const normalized = compactText(candidate || "");
      if (normalized && !isLocalizationToken(normalized)) {
        return normalized;
      }
    }
    return compactText(aria || labelledBy || title || value || text);
  }

  function isLocalizationToken(value: string): boolean {
    return /^[A-Za-z][A-Za-z0-9]*(?:[._:-][A-Za-z0-9_-]+)+$/.test(value) && !/\s/.test(value);
  }

  function selectorHintFor(element: Element): string {
    const id = element.getAttribute("id");
    const testId = element.getAttribute("data-testid");
    const aria = element.getAttribute("aria-label");
    if (id) return `#${cssEscape(id)}`;
    if (testId) return `[data-testid="${testId.slice(0, 80).replace(/"/g, '\\"')}"]`;
    if (aria) return `${element.tagName.toLowerCase()}[aria-label="${aria.slice(0, 80).replace(/"/g, '\\"')}"]`;
    const classes = (element.getAttribute("class") || "").split(/\s+/).filter(Boolean).slice(0, 2);
    return `${element.tagName.toLowerCase()}${classes.map((item) => `.${cssEscape(item)}`).join("")}`;
  }

  function layerFor(element: Element, box: ConsentControlRect): ConsentControlGeometryLayer {
    const text = compactText([
      element.getAttribute("id") || "",
      element.getAttribute("class") || "",
      element.getAttribute("aria-label") || "",
      deepText(element),
    ].join(" ")).toLowerCase();
    const style = window.getComputedStyle(element);
    if (
      element.getAttribute("role") === "dialog" ||
      element.getAttribute("aria-modal") === "true" ||
      ((style.position === "fixed" || style.position === "sticky") && consentPattern.test(text))
    ) {
      return "first_layer";
    }
    if (hasFirstLayerAncestor(element)) {
      return "first_layer";
    }
    if (element.closest("footer") || /\bfooter\b|legal-footer|functional-footer/.test(text)) {
      return "footer";
    }
    if (/preference center|privacy choices|manage preferences|ot-pc|pc-sdk|settings-form|change-settings|paramètres des cookies/i.test(text)) {
      return "preference_center";
    }
    if (
      element.getAttribute("role") === "dialog" ||
      element.getAttribute("aria-modal") === "true" ||
      style.position === "fixed" ||
      style.position === "sticky" ||
      box.top < viewport.height * 0.95
    ) {
      return "first_layer";
    }
    return "page_body";
  }

  function hasFirstLayerAncestor(element: Element): boolean {
    let current = parentElementOrHost(element);
    for (let depth = 0; current && depth < 24; depth += 1) {
      if (current === document.body || current === document.documentElement) {
        return false;
      }
      const style = window.getComputedStyle(current);
      if (
        current.getAttribute("role") === "dialog" ||
        current.getAttribute("role") === "alertdialog" ||
        current.getAttribute("aria-modal") === "true" ||
        style.position === "fixed" ||
        style.position === "sticky"
      ) {
        return true;
      }
      current = parentElementOrHost(current);
    }
    return false;
  }

  function rectFor(element: Element): ConsentControlRect {
    const rect = element.getBoundingClientRect();
    return {
      x: round(rect.x),
      y: round(rect.y),
      width: round(rect.width),
      height: round(rect.height),
      top: round(rect.top),
      right: round(rect.right),
      bottom: round(rect.bottom),
      left: round(rect.left),
    };
  }

  function viewportRect(): ConsentControlRect {
    return {
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
      top: 0,
      right: viewport.width,
      bottom: viewport.height,
      left: 0,
    };
  }

  function intersects(a: ConsentControlRect, b: ConsentControlRect): boolean {
    return a.width > 0 && a.height > 0 && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function containsRect(outer: ConsentControlRect, inner: ConsentControlRect): boolean {
    return inner.left >= outer.left && inner.right <= outer.right && inner.top >= outer.top && inner.bottom <= outer.bottom;
  }

  function nearestScrollableAncestor(element: Element): Element | undefined {
    let current = parentElementOrHost(element);
    while (current && current !== document.body && current !== document.documentElement) {
      const style = window.getComputedStyle(current);
      const overflow = `${style.overflow} ${style.overflowX} ${style.overflowY}`;
      if (/(auto|scroll|hidden|clip)/.test(overflow) && (current.scrollHeight > current.clientHeight || current.scrollWidth > current.clientWidth)) {
        return current;
      }
      current = parentElementOrHost(current);
    }
    return undefined;
  }

  function occlusionFor(element: Element, box: ConsentControlRect): ConsentControlOcclusionCheck {
    const points = [
      ["center", box.left + box.width / 2, box.top + box.height / 2],
      ["topLeft", box.left + 2, box.top + 2],
      ["topRight", box.right - 2, box.top + 2],
      ["bottomLeft", box.left + 2, box.bottom - 2],
      ["bottomRight", box.right - 2, box.bottom - 2],
    ] as const;
    const result = {
      center: false,
      topLeft: false,
      topRight: false,
      bottomLeft: false,
      bottomRight: false,
      checkedPoints: 0,
      hitSelectorHints: [] as string[],
    };
    for (const [key, x, y] of points) {
      if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) {
        continue;
      }
      result.checkedPoints += 1;
      const hit = document.elementFromPoint(x, y);
      const matches = Boolean(hit && (hit === element || composedContains(element, hit) || composedContains(hit, element)));
      result[key] = matches;
      if (hit && !matches) {
        result.hitSelectorHints.push(selectorHintFor(hit));
      }
    }
    result.hitSelectorHints = Array.from(new Set(result.hitSelectorHints)).slice(0, 5);
    return result;
  }

  function sanitizeHtmlExcerpt(element: Element, maxLength: number): string {
    const clone = element.cloneNode(true) as Element;
    clone.querySelectorAll("script,style,noscript,svg,path,img,video,canvas").forEach((child) => child.remove());
    clone.querySelectorAll("*").forEach((child) => {
      for (const attribute of Array.from(child.attributes)) {
        if (/^(href|src|srcset|poster|action)$/i.test(attribute.name)) {
          child.setAttribute(attribute.name, redactUrl(attribute.value));
        } else if (/value/i.test(attribute.name)) {
          child.setAttribute(attribute.name, "[redacted]");
        }
      }
    });
    return compactText(clone.outerHTML).slice(0, maxLength);
  }

  function deepQuerySelectorAll(selector: string, root: ParentNode = document): Element[] {
    const results: Element[] = [];
    const seen = new Set<Element>();
    for (const node of deepRootsFor(root)) {
      for (const element of Array.from(node.querySelectorAll(selector))) {
        if (!seen.has(element)) {
          seen.add(element);
          results.push(element);
        }
      }
    }
    return results;
  }

  function deepRootsFor(root: ParentNode): ParentNode[] {
    const cached = deepRootCache.get(root);
    if (cached) {
      return cached;
    }
    const roots: ParentNode[] = [];
    const seenRoots = new Set<ParentNode>();
    function visit(node: ParentNode, depth: number) {
      if (depth > 4) {
        return;
      }
      if (seenRoots.has(node)) {
        return;
      }
      seenRoots.add(node);
      roots.push(node);
      for (const element of Array.from(node.querySelectorAll("*"))) {
        if (element.shadowRoot) {
          visit(element.shadowRoot, depth + 1);
        }
      }
    }
    visit(root, 0);
    deepRootCache.set(root, roots);
    return roots;
  }

  function deepText(element: Element): string {
    const textParts: string[] = [element.textContent || ""];
    for (const root of deepRootsFor(element).slice(1)) {
      textParts.push(root.textContent || "");
    }
    return compactText(textParts.join(" "));
  }

  function parentElementOrHost(element: Element): Element | null {
    if (element.parentElement) {
      return element.parentElement;
    }
    const root = element.getRootNode();
    return root instanceof ShadowRoot && root.host instanceof Element ? root.host : null;
  }

  function composedContains(container: Element, element: Element): boolean {
    let current: Element | null = element;
    while (current) {
      if (current === container) {
        return true;
      }
      current = parentElementOrHost(current);
    }
    return false;
  }

  function redactUrl(value: string): string {
    try {
      const url = new URL(value, window.location.href);
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return "[redacted-url]";
    }
  }

  function compactText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  function attr(element: Element, name: string): string | undefined {
    return element.getAttribute(name)?.slice(0, 240) || undefined;
  }

  function safeCookieNames(): string[] {
    try {
      return document.cookie.split(";").flatMap((item) => {
        const name = item.trim().split("=")[0];
        return name ? [name] : [];
      }).slice(0, 80);
    } catch {
      return [];
    }
  }

  function round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  function cssEscape(value: string): string {
    return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
  }
}
