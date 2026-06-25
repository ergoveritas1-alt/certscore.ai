import "server-only";

import { GetObjectCommand, S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
import { resolveVendorDisplayCategory, resolveVendorObservations, type VendorResolverInput } from "@certscore/vendor-resolver";
import type { ScanDetailResponse } from "./get-scan-by-id";
import {
  LOCAL_V2_DAG_LAMBDA_AWS_REGION,
  isLocalV2DagLambdaAwsRegion,
  LOCAL_V2_DAG_SCAN_PROCESSOR,
  shouldUseLocalV2DagScanTool,
  type LocalV2DagScanProfile
} from "./local-v2-dag-scan-config";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getRecord(value: unknown, key: string) {
  return isRecord(value) && isRecord(value[key]) ? value[key] as Record<string, unknown> : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type LocalV2DagLambdaPollResult = {
  handled: number;
};

function getLocalV2DagLambdaScanArtifactUri(scanRecord: ScanDetailResponse) {
  return scanRecord.events
    .filter((event) => event.eventType === "v2_lambda_result.received")
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .map((event) => {
      const metadata = isRecord(event.metadataJson) ? event.metadataJson : null;
      if (
        metadata?.artifactOnly !== true ||
        metadata?.productionFindingIntegration !== false ||
        metadata?.processor !== LOCAL_V2_DAG_SCAN_PROCESSOR
      ) {
        return null;
      }
      return getString(getRecord(metadata, "artifactPointers")?.scanArtifactUri);
    })
    .find((uri): uri is string => Boolean(uri)) ?? null;
}

export function getLocalV2DagReportInput(scanRecord: ScanDetailResponse) {
  const config = scanRecord.scan.scanConfigJson;
  if (!isRecord(config) || config.processor !== LOCAL_V2_DAG_SCAN_PROCESSOR) {
    return null;
  }

  const execution = getRecord(config, "execution");
  const v2DagParallel = getRecord(execution, "v2DagParallel");
  if (v2DagParallel?.localOnly !== true || v2DagParallel?.artifactOnly !== true) {
    return null;
  }

  const localV2Dag = getRecord(execution, "localV2Dag");
  const v2DagLambda = getRecord(execution, "v2DagLambda");
  const outDir = getString(localV2Dag?.outDir);
  const scanArtifactUri = getLocalV2DagLambdaScanArtifactUri(scanRecord);
  const lambdaResultQueueUrl = getString(v2DagLambda?.resultQueueUrl);
  const normalizedUrl = getString(config.normalizedUrl);
  const hostname = getString(config.hostname) ?? scanRecord.scan.domainHostname;
  const profile = getString(v2DagParallel.profile) ?? getString(config.profile) ?? "standard";

  return {
    lambdaResultQueueUrl,
    outDir,
    profile: profile === "tiny" ? "tiny" as LocalV2DagScanProfile : "standard" as LocalV2DagScanProfile,
    scanArtifactUri,
    url: normalizedUrl ?? hostname ?? null
  };
}

export function isLocalV2DagReport(scanRecord: ScanDetailResponse) {
  return Boolean(getLocalV2DagReportInput(scanRecord));
}

export function shouldAttemptLocalV2DagLambdaResultRefresh(scanRecord: ScanDetailResponse, nowMs = Date.now()) {
  // Lambda result ingestion is owned by the validation worker. Report pages must
  // not consume SQS messages, or they can hide results until visibility timeout.
  void scanRecord;
  void nowMs;
  return false;
}

export function resetLocalV2DagLambdaResultRefreshStateForTest() {
  return;
}

export async function tryRefreshLocalV2DagLambdaResult(
  scanRecord: ScanDetailResponse,
  options: {
    nowMs?: number;
    pollResultQueue?: () => Promise<LocalV2DagLambdaPollResult>;
  } = {}
) {
  // Kept as a compatibility no-op for older callers/tests; the web tier should
  // only read already-recorded scan state.
  void scanRecord;
  void options;
  return false;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function isPreConsentScreenshotArtifact(screenshot: NonNullable<CanonicalEvidenceBundle["screenshots"]>[number] | null | undefined) {
  return screenshot?.artifactId === "screenshot_pre_consent" ||
    screenshot?.artifactId === "screenshot_pre_consent_full_page";
}

function preConsentScreenshotRank(screenshot: NonNullable<CanonicalEvidenceBundle["screenshots"]>[number]) {
  return screenshot.artifactId === "screenshot_pre_consent_full_page" ? 0 : 1;
}

function isPreConsentErrorShellScreenshot(bundle: CanonicalEvidenceBundle, screenshot: NonNullable<CanonicalEvidenceBundle["screenshots"]>[number]) {
  if (!isPreConsentScreenshotArtifact(screenshot)) {
    return false;
  }

  return (bundle.consentUiObservations ?? []).some((observation) => {
    const textExcerpt = getString(observation.textExcerpt)?.toLowerCase() ?? "";
    const basis = getStringArray(observation.basis);
    return (
      observation.likelyPresent === false &&
      /^(?:unknown error|access denied|forbidden|internal server error|service unavailable)$/i.test(textExcerpt) &&
      (
        basis.includes("bounded_capture_timeout_or_failure") ||
        basis.includes("dom_text_fallback_after_consent_ui_timeout")
      )
    );
  });
}

function readPngDimensions(filePath: string): { height: number; width: number } | null {
  try {
    const header = readFileSync(filePath, { encoding: null, flag: "r" }).subarray(0, 24);
    const pngSignature = "89504e470d0a1a0a";
    if (header.length < 24 || header.subarray(0, 8).toString("hex") !== pngSignature) {
      return null;
    }
    return {
      width: header.readUInt32BE(16),
      height: header.readUInt32BE(20)
    };
  } catch {
    return null;
  }
}

function isLikelyRetainedVisualErrorShell(input: {
  bundle: CanonicalEvidenceBundle;
  lowRuntimeActivity: boolean;
  localOutDir?: string | null;
  screenshot: NonNullable<CanonicalEvidenceBundle["screenshots"]>[number] | null;
}) {
  const screenshotPath = getString(input.screenshot?.path);
  if (!screenshotPath || !isPreConsentScreenshotArtifact(input.screenshot)) {
    return false;
  }
  if (!input.lowRuntimeActivity) {
    return false;
  }

  const runtimeCounts = input.bundle.runtimeCoverage?.observationCounts;
  const noMeaningfulRuntime =
    (runtimeCounts?.thirdPartyRequests ?? 0) === 0 &&
    (runtimeCounts?.normalizedVendors ?? 0) === 0 &&
    (input.bundle.normalizedVendorObservations ?? []).length === 0;
  const noConsentSurface = !(input.bundle.consentUiObservations ?? []).some((observation) =>
    observation.likelyPresent === true ||
    (observation.visibleChoiceLabels ?? []).length > 0 ||
    (observation.controls ?? []).length > 0
  );
  if (!noMeaningfulRuntime || !noConsentSurface) {
    return false;
  }

  const errorShellTextObserved = (input.bundle.consentUiObservations ?? []).some((observation) => {
    const textExcerpt = getString(observation.textExcerpt)?.toLowerCase() ?? "";
    return observation.likelyPresent === false &&
      /^(?:unknown error|internal server error|service unavailable)$/i.test(textExcerpt);
  });
  const candidatePaths = uniqueStrings([
    screenshotPath,
    input.localOutDir ? path.join(input.localOutDir, path.basename(screenshotPath)) : null
  ]);

  for (const candidatePath of candidatePaths) {
    try {
      const fileSize = statSync(candidatePath).size;
      const dimensions = readPngDimensions(candidatePath);
      if (
        dimensions &&
        dimensions.width >= 900 &&
        dimensions.height >= 600 &&
        fileSize > 256 &&
        fileSize <= 25_000
      ) {
        return true;
      }
    } catch {
      // Try the next candidate path.
    }
  }

  if (errorShellTextObserved) {
    return Boolean(
      input.bundle.screenshots?.some((screenshot) => screenshot.artifactId === "screenshot_pre_consent") &&
      input.lowRuntimeActivity
    );
  }

  return false;
}

function hostnameFromUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  try {
    return new URL(value).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/.*$/g, "").replace(/^www\./i, "").toLowerCase() || null;
  }
}

function registrableDomain(hostname: string | null | undefined) {
  if (!hostname) {
    return null;
  }
  const parts = hostname.split(".").filter(Boolean);
  return parts.length <= 2 ? hostname : parts.slice(-2).join(".");
}

function sameSite(hostname: string | null | undefined, rootDomain: string | null | undefined) {
  if (!hostname || !rootDomain) {
    return false;
  }
  const normalizedHost = hostname.replace(/^www\./i, "").toLowerCase();
  const normalizedRoot = rootDomain.replace(/^www\./i, "").toLowerCase();
  return normalizedHost === normalizedRoot || normalizedHost.endsWith(`.${normalizedRoot}`);
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function durationMsFromTimestamps(startedAt: string | null | undefined, completedAt: string | null | undefined) {
  if (!startedAt || !completedAt) {
    return null;
  }

  const startedAtMs = Date.parse(startedAt);
  const completedAtMs = Date.parse(completedAt);

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(completedAtMs) || completedAtMs < startedAtMs) {
    return null;
  }

  return completedAtMs - startedAtMs;
}

function purposeToCategory(value: string | null | undefined) {
  switch (value) {
    case "advertising":
    case "analytics":
    case "session_replay":
    case "tracking":
      return value;
    case "tag_manager":
    case "tag_management":
      return "tag_manager";
    case "consent_management":
      return "cmp";
    case "customer_data_platform":
      return "analytics";
    default:
      return value ?? "unknown";
  }
}

function policySurfaceLabel(surfaceType: string) {
  return surfaceType
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizePolicyPageType(surfaceType: string) {
  return surfaceType === "terms" ? "terms_of_service" : surfaceType;
}

type LocalV2PolicySurface = NonNullable<CanonicalEvidenceBundle["policySurfaceObservations"]>[number];
const MIN_PRIVACY_POLICY_TEXT_CHARS_FOR_ARTICLE13 = 2_500;

function canonicalPolicySurfaceUrl(surface: LocalV2PolicySurface, fallbackBaseUrl: string | null) {
  const rawUrl = firstString(surface.normalizedUrl, surface.url);
  if (!rawUrl) {
    return null;
  }

  try {
    const parsed = fallbackBaseUrl ? new URL(rawUrl, fallbackBaseUrl) : new URL(rawUrl);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/g, "") || "/";
    return parsed.toString();
  } catch {
    return rawUrl.replace(/^https?:\/\/www\./i, "https://").replace(/\/+$/g, "");
  }
}

function policySurfaceDeduplicationKey(surface: LocalV2PolicySurface, fallbackBaseUrl: string | null) {
  const pageType = normalizePolicyPageType(surface.surfaceType);
  const canonicalUrl = canonicalPolicySurfaceUrl(surface, fallbackBaseUrl);
  return canonicalUrl ? `${pageType}:${canonicalUrl.toLowerCase()}` : `${pageType}:${surface.observationId ?? ""}`;
}

function hasSubstantivePolicySurfaceEvidence(surface: LocalV2PolicySurface) {
  return Boolean(
    firstString(surface.textExcerpt) ||
    (surface.observedTopics ?? []).length > 0 ||
    (surface.article13DisclosureSignals ?? []).length > 0 ||
    (surface.mentionedControls ?? []).length > 0 ||
    (surface.boundedTextExcerptIds ?? []).length > 0 ||
    (surface.evidenceRefs ?? []).length > 0 ||
    (surface.artifactRefs ?? []).length > 0
  );
}

function isReportablePolicySurface(surface: LocalV2PolicySurface) {
  if (surface.status === "failed" || surface.status === "skipped_budget" || surface.status === "not_observed") {
    return false;
  }

  if (surface.status === "fetched") {
    return true;
  }

  if (surface.surfaceType === "privacy_policy" || surface.surfaceType === "cookie_policy" || surface.surfaceType === "terms") {
    return hasSubstantivePolicySurfaceEvidence(surface);
  }

  return surface.status === "observed" || hasSubstantivePolicySurfaceEvidence(surface);
}

function policySurfaceEvidenceWeight(surface: LocalV2PolicySurface, pageUrl: string | null) {
  return [
    surface.status === "fetched" ? 100_000 : 0,
    hasSubstantivePolicySurfaceEvidence(surface) ? 10_000 : 0,
    pageUrl && !pageUrl.startsWith("/") ? 10 : 0,
    typeof surface.confidence === "number" ? surface.confidence : 0,
    firstString(surface.textExcerpt)?.length ?? 0,
    (surface.observedTopics ?? []).length,
    (surface.mentionedControls ?? []).length
  ].reduce((sum, value) => sum + value, 0);
}

export function dedupePolicySurfaces(surfaces: readonly LocalV2PolicySurface[], fallbackBaseUrl: string | null) {
  const retained = new Map<string, { pageUrl: string | null; surface: LocalV2PolicySurface }>();

  for (const surface of surfaces) {
    if (!isReportablePolicySurface(surface)) {
      continue;
    }

    const pageUrl = canonicalPolicySurfaceUrl(surface, fallbackBaseUrl);
    const key = policySurfaceDeduplicationKey(surface, fallbackBaseUrl);
    const existing = retained.get(key);
    if (!existing || policySurfaceEvidenceWeight(surface, pageUrl) > policySurfaceEvidenceWeight(existing.surface, existing.pageUrl)) {
      retained.set(key, { pageUrl, surface });
    }
  }

  return [...retained.values()];
}

function requestUrl(row: Record<string, unknown>) {
  return firstString(row.normalizedUrl, row.requestUrl, row.url);
}

function cookieName(row: Record<string, unknown>) {
  return firstString(row.cookieName, row.name);
}

function v2ArtifactRoots() {
  return [
    path.resolve(process.cwd(), "artifacts/local-v2-dag-scans"),
    path.resolve(process.cwd(), "../..", "artifacts/local-v2-dag-scans")
  ];
}

function v2PolicyTextArtifactRoots() {
  return [
    ...v2ArtifactRoots(),
    path.resolve(process.cwd(), "artifacts/local-v2-dag-lambda-simulated"),
    path.resolve(process.cwd(), "../..", "artifacts/local-v2-dag-lambda-simulated")
  ];
}

function resolveLocalV2OutDir(outDir: string) {
  const resolved = path.resolve(outDir);
  const roots = v2ArtifactRoots();
  const inAllowedRoot = roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
  if (!inAllowedRoot) {
    throw new Error("Local v2 DAG artifact path is outside artifacts/local-v2-dag-scans.");
  }
  return resolved;
}

function resolvePolicyTextArtifactPath(rawPath: string) {
  const resolved = path.resolve(rawPath);
  const roots = v2PolicyTextArtifactRoots();
  const inAllowedRoot = roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
  if (!inAllowedRoot) {
    return null;
  }

  try {
    const stats = statSync(resolved);
    if (!stats.isFile() || stats.size <= 0 || stats.size > 1_000_000 || path.extname(resolved).toLowerCase() !== ".txt") {
      return null;
    }
    return resolved;
  } catch {
    return null;
  }
}

function readPolicySurfaceTextArtifact(surface: LocalV2PolicySurface) {
  const artifactRefs = Array.isArray(surface.artifactRefs) ? surface.artifactRefs : [];
  for (const ref of artifactRefs) {
    if (!isRecord(ref)) {
      continue;
    }
    const looseRef = ref as Record<string, unknown>;
    const artifactId = firstString(looseRef.artifactId, looseRef.id);
    const label = firstString(looseRef.label, looseRef.kind, looseRef.type);
    const artifactPath = firstString(looseRef.path, looseRef.filePath);
    if (!artifactPath || !/policy_surface_text/i.test(`${artifactId ?? ""} ${label ?? ""} ${path.basename(artifactPath)}`)) {
      continue;
    }
    const resolved = resolvePolicyTextArtifactPath(artifactPath);
    if (!resolved) {
      continue;
    }
    try {
      return readFileSync(resolved, "utf8").replace(/\s+/g, " ").trim();
    } catch {
      return null;
    }
  }
  return null;
}

function findCaseInsensitiveTextIndex(source: string, needle: string) {
  return source.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
}

function alignPolicyEvidenceTextToCompleteSentence(evidenceText: string) {
  const normalized = evidenceText.replace(/\s+/g, " ").trim();
  const sentenceStart = normalized.search(/[.!?]\s+(?=[A-Z0-9"“])/);
  if (
    sentenceStart >= 0 &&
    sentenceStart < 120 &&
    /^[a-z][a-z\s-]{0,80}$/i.test(normalized.slice(0, sentenceStart).replace(/[^a-z\s-]/gi, "")) &&
    normalized.slice(sentenceStart + 2).trim().length >= 48
  ) {
    return normalized.slice(sentenceStart + 2).trim();
  }
  return normalized;
}

function policySentenceBoundaries(text: string) {
  const boundaries = [0];
  const boundaryPattern = /[.!?]\s+(?=[A-Z0-9"“])/g;
  let match: RegExpExecArray | null;
  while ((match = boundaryPattern.exec(text)) !== null) {
    boundaries.push(match.index + match[0].length);
  }
  if (boundaries.at(-1) !== text.length) {
    boundaries.push(text.length);
  }
  return boundaries;
}

function buildPolicyEvidenceContextExcerpt(source: string, evidenceText: string) {
  const normalizedSource = source.replace(/\s+/g, " ").trim();
  const normalizedEvidence = alignPolicyEvidenceTextToCompleteSentence(evidenceText);
  if (!normalizedSource || normalizedEvidence.length < 24) {
    return null;
  }

  const exactIndex = findCaseInsensitiveTextIndex(normalizedSource, normalizedEvidence);
  const fallbackNeedles = normalizedEvidence
    .split(/(?<=[.!?;:])\s+|,\s+(?=(?:to|or|and|you|we|including|such as|however)\b)/i)
    .map((piece) => piece.replace(/^[.;:,]+|[.;:,]+$/g, "").trim())
    .filter((piece) => piece.length >= 48)
    .sort((left, right) => right.length - left.length);
  const fallbackMatch = exactIndex >= 0
    ? null
    : fallbackNeedles
        .map((needle) => ({ index: findCaseInsensitiveTextIndex(normalizedSource, needle), needle }))
        .find((candidate) => candidate.index >= 0);
  const matchStart = exactIndex >= 0 ? exactIndex : fallbackMatch?.index ?? -1;
  const matchEnd = matchStart >= 0
    ? matchStart + (exactIndex >= 0 ? normalizedEvidence.length : fallbackMatch?.needle.length ?? 0)
    : -1;
  if (matchStart < 0 || matchEnd <= matchStart) {
    return null;
  }

  const boundaries = policySentenceBoundaries(normalizedSource);
  let startBoundaryIndex = 0;
  for (let index = boundaries.length - 1; index >= 0; index -= 1) {
    if ((boundaries[index] ?? 0) <= matchStart) {
      startBoundaryIndex = index;
      break;
    }
  }
  const nextBoundaryIndex = boundaries.findIndex((boundary) => boundary >= matchEnd);
  const endBoundaryIndex = nextBoundaryIndex >= 0 ? nextBoundaryIndex : boundaries.length - 1;
  const start = boundaries[Math.max(0, startBoundaryIndex - 7)] ?? 0;
  const end = boundaries[Math.min(boundaries.length - 1, endBoundaryIndex + 8)] ?? normalizedSource.length;
  let excerpt = normalizedSource.slice(start, end).trim();
  const nextSectionIndex = excerpt.search(/\s(?:Cookies|Cookie Policy|Terms of Service|Children'?s Privacy Policy|California|US State Supplement|Contact Us)\s+(?:What are|Last updated|Overview|Your|How|If|This|We)\b/);
  if (nextSectionIndex > 120 && nextSectionIndex > matchEnd - start) {
    excerpt = excerpt.slice(0, nextSectionIndex).trim();
  }
  const maxContextChars = 5_000;
  if (excerpt.length > maxContextChars) {
    const localStart = Math.max(0, matchStart - start - 2_000);
    const localEnd = Math.min(excerpt.length, matchEnd - start + 2_000);
    excerpt = excerpt.slice(localStart, localEnd).trim();
  }
  return `${start > 0 ? "... " : ""}${excerpt}${end < normalizedSource.length ? " ..." : ""}`;
}

function normalizePolicyExcerptForDedupe(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function policyExcerptsOverlap(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizePolicyExcerptForDedupe(left);
  const normalizedRight = normalizePolicyExcerptForDedupe(right);
  if (normalizedLeft.length < 24 || normalizedRight.length < 24) {
    return normalizedLeft.length > 0 && normalizedLeft === normalizedRight;
  }
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return true;
  }
  const leftTokens = policyExcerptContentTokens(normalizedLeft);
  const rightTokens = policyExcerptContentTokens(normalizedRight);
  if (leftTokens.length < 4 || rightTokens.length < 4) {
    return false;
  }
  const smaller = leftTokens.length <= rightTokens.length ? leftTokens : rightTokens;
  const larger = new Set(leftTokens.length <= rightTokens.length ? rightTokens : leftTokens);
  const shared = smaller.filter((token) => larger.has(token)).length;
  return shared / smaller.length >= 0.75;
}

function policyExcerptContentTokens(normalizedExcerpt: string) {
  const stopwords = new Set([
    "a",
    "an",
    "and",
    "of",
    "or",
    "the",
    "to",
    "we",
    "you",
    "your"
  ]);
  return uniqueStrings(normalizedExcerpt
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stopwords.has(token)));
}

function article13EvidenceStrengthScore(value: string | null | undefined) {
  switch (value) {
    case "strong":
      return 30;
    case "moderate":
      return 20;
    case "limited":
      return 5;
    default:
      return 0;
  }
}

function article13StatusScore(value: string | null | undefined) {
  switch (value) {
    case "observed":
      return 100;
    case "partial":
      return 50;
    case "not_confirmed":
      return 10;
    default:
      return 0;
  }
}

function policyDisclosureRowScore(row: Record<string, unknown>) {
  const status = firstString(row.status, row.signalObserved);
  const strength = firstString(row.selectedEvidenceStrength);
  const confidence = typeof row.confidence === "number" && Number.isFinite(row.confidence)
    ? row.confidence
    : 0;
  const excerpt = firstString(row.selectedPolicySectionExcerpt, row.evidenceText) ?? "";
  return article13StatusScore(status) +
    article13EvidenceStrengthScore(strength) +
    confidence +
    Math.min(excerpt.length / 1_000, 5);
}

function dedupePolicyDisclosureRows<T extends Record<string, unknown>>(
  rows: T[],
  options: {
    excerptKeys: string[];
    typeKeys: string[];
  }
) {
  const retained: T[] = [];
  for (const row of rows) {
    const rowType = firstString(...options.typeKeys.map((key) => row[key]));
    const rowExcerpt = firstString(...options.excerptKeys.map((key) => row[key]));
    const duplicateIndex = retained.findIndex((candidate) => {
      const candidateType = firstString(...options.typeKeys.map((key) => candidate[key]));
      const candidateExcerpt = firstString(...options.excerptKeys.map((key) => candidate[key]));
      return rowType === candidateType && policyExcerptsOverlap(rowExcerpt, candidateExcerpt);
    });
    if (duplicateIndex < 0) {
      retained.push(row);
      continue;
    }
    const existing = retained[duplicateIndex];
    if (existing && policyDisclosureRowScore(row) > policyDisclosureRowScore(existing)) {
      retained[duplicateIndex] = row;
    }
  }
  return retained;
}

function extractSupervisoryAuthoritySupportingContactContext(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (
    !/\b(?:supervisory authority|data protection authorit(?:y|ies)|privacy regulator|regulatory authority|lodge a complaint|right to complain|right to contact)\b/i.test(text) ||
    !/\b(?:further details|more information|help|contact(?:ing)? us|privacy center|contact form|privacy team|data protection officer|dpo)\b/i.test(text)
  ) {
    return null;
  }
  const emailMatch = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  if (emailMatch?.[0]) {
    return emailMatch[0];
  }
  const contactMatch = text.match(/\b(?:privacy center|privacy team|data protection officer|dpo|contact form|contacting us by email|contact us)\b.{0,180}/i);
  return contactMatch?.[0] ? contactMatch[0].trim() : null;
}

async function readLocalV2DagBundle(outDir: string): Promise<CanonicalEvidenceBundle | null> {
  try {
    const raw = await readFile(path.join(resolveLocalV2OutDir(outDir), "CanonicalEvidenceBundle.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      (parsed.schemaVersion !== "certscore.v2.canonical-evidence-bundle.v1" &&
        parsed.schemaVersion !== "certscore.v2.alpha.1")
    ) {
      return null;
    }
    return parsed as CanonicalEvidenceBundle;
  } catch {
    return null;
  }
}

function parseS3Uri(uri: string) {
  if (!uri.startsWith("s3://")) {
    throw new Error("Local v2 DAG Lambda scan artifact URI must be s3://.");
  }
  const withoutScheme = uri.slice("s3://".length);
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex <= 0 || slashIndex === withoutScheme.length - 1) {
    throw new Error("Local v2 DAG Lambda scan artifact URI is missing bucket or key.");
  }
  return {
    bucket: withoutScheme.slice(0, slashIndex),
    key: withoutScheme.slice(slashIndex + 1)
  };
}

function localV2ScreenshotStoragePointer(input: {
  scanArtifactUri?: string | null;
  scanId: string;
  screenshotPath: string;
}): { bucket: string | null; key: string } {
  const screenshotPath = input.screenshotPath.trim();
  if (screenshotPath.startsWith("s3://")) {
    const { bucket, key } = parseS3Uri(screenshotPath);
    return { bucket, key };
  }

  const normalizedPath = screenshotPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const localV2Index = normalizedPath.indexOf("local-v2-dag-scans/");
  if (localV2Index >= 0) {
    return { bucket: null, key: normalizedPath.slice(localV2Index) };
  }

  if (input.scanArtifactUri) {
    try {
      const { bucket, key } = parseS3Uri(input.scanArtifactUri);
      const fileName = path.posix.basename(normalizedPath);
      if (fileName && fileName !== "." && fileName !== "/") {
        return {
          bucket,
          key: `${path.posix.dirname(key)}/auxiliary/${fileName}`
        };
      }
    } catch {
      // Fall through to the legacy local artifact key below.
    }
  }

  const fileName = path.posix.basename(normalizedPath) || "screenshot-pre-consent.png";
  return {
    bucket: null,
    key: `local-v2-dag-scans/${input.scanId}/${fileName}`
  };
}

export function inferS3ArtifactRegion(bucket: string) {
  const match = bucket.match(/(?:^|-)(eu-central-1|eu-west-1|us-west-2)(?:-|$)/);
  const region = match?.[1] ?? null;
  return isLocalV2DagLambdaAwsRegion(region) ? region : LOCAL_V2_DAG_LAMBDA_AWS_REGION;
}

async function streamToBuffer(body: GetObjectCommandOutput["Body"]) {
  if (!body) {
    throw new Error("Local v2 DAG Lambda scan artifact did not include a body.");
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }
  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (typeof body === "object" && "transformToByteArray" in body && typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  throw new Error("Unsupported local v2 DAG Lambda scan artifact response body.");
}

async function readLocalV2DagBundleFromS3(scanArtifactUri: string): Promise<CanonicalEvidenceBundle | null> {
  try {
    const { bucket, key } = parseS3Uri(scanArtifactUri);
    const response = await new S3Client({ region: inferS3ArtifactRegion(bucket) }).send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    const parsed: unknown = JSON.parse((await streamToBuffer(response.Body)).toString("utf8"));
    if (
      !isRecord(parsed) ||
      (parsed.schemaVersion !== "certscore.v2.canonical-evidence-bundle.v1" &&
        parsed.schemaVersion !== "certscore.v2.alpha.1")
    ) {
      return null;
    }
    return parsed as CanonicalEvidenceBundle;
  } catch {
    return null;
  }
}

function buildVendorResolverInputs(bundle: CanonicalEvidenceBundle): VendorResolverInput[] {
  return [
    ...(bundle.networkEvents ?? []).map((event) => ({
      consentStateAtTime: event.consentStateAtTime,
      evidenceId: event.eventId,
      evidenceRef: {
        refId: `ref_${event.eventId}`,
        eventId: event.eventId,
        eventType: event.eventType,
        url: requestUrl(event as Record<string, unknown>) ?? undefined
      },
      hostname: event.hostname ?? hostnameFromUrl(requestUrl(event as Record<string, unknown>)) ?? undefined,
      matchSource: "network_request" as const,
      scenario: event.scenario,
      sourceEventType: event.eventType,
      sourceScanner: event.sourceScanner,
      type: "request" as const,
      url: requestUrl(event as Record<string, unknown>) ?? undefined
    })),
    ...(bundle.scriptEvents ?? []).map((event) => ({
      consentStateAtTime: event.consentStateAtTime,
      evidenceId: event.eventId,
      evidenceRef: {
        refId: `ref_${event.eventId}`,
        eventId: event.eventId,
        eventType: event.eventType,
        url: firstString(event.scriptUrl, event.url) ?? undefined
      },
      hostname: event.hostname ?? hostnameFromUrl(firstString(event.scriptUrl, event.url)) ?? undefined,
      matchSource: "script_url" as const,
      scenario: event.scenario,
      sourceEventType: event.eventType,
      sourceScanner: event.sourceScanner,
      type: "script" as const,
      url: firstString(event.scriptUrl, event.url) ?? undefined
    })),
    ...(bundle.iframeEvents ?? []).map((event) => ({
      consentStateAtTime: event.consentStateAtTime,
      evidenceId: event.eventId,
      evidenceRef: {
        refId: `ref_${event.eventId}`,
        eventId: event.eventId,
        eventType: event.eventType,
        url: firstString(event.frameUrl, event.url) ?? undefined
      },
      hostname: event.hostname ?? hostnameFromUrl(firstString(event.frameUrl, event.url)) ?? undefined,
      matchSource: "iframe_url" as const,
      scenario: event.scenario,
      sourceEventType: event.eventType,
      sourceScanner: event.sourceScanner,
      type: "iframe" as const,
      url: firstString(event.frameUrl, event.url) ?? undefined
    })),
    ...(bundle.cookieEvents ?? []).map((event) => ({
      consentStateAtTime: event.consentStateAtTime,
      cookieName: event.cookieName,
      evidenceId: event.eventId,
      evidenceRef: {
        refId: `ref_${event.eventId}`,
        eventId: event.eventId,
        eventType: event.eventType,
        url: event.url
      },
      hostname: event.cookieDomain ?? event.hostname,
      matchSource: "cookie_name" as const,
      scenario: event.scenario,
      sourceEventType: event.eventType,
      sourceScanner: event.sourceScanner,
      type: "cookie" as const,
      url: event.url
    }))
  ];
}

function buildVendorEvidence(bundle: CanonicalEvidenceBundle) {
  const vendors = [
    ...(bundle.normalizedVendorObservations ?? []),
    ...resolveVendorObservations(buildVendorResolverInputs(bundle))
  ];
  return vendors.map((vendor) => {
    const vendorName = firstString(vendor.product, vendor.vendor, vendor.entity) ?? "Unknown vendor";
    const category = purposeToCategory(firstString(vendor.purpose));
    const displayCategory = resolveVendorDisplayCategory({
      product: vendor.product,
      purpose: vendor.purpose,
      regulatoryRelevance: vendor.regulatoryRelevance,
      vendor: vendor.vendor
    });
    const evidenceHost = uniqueStrings((vendor.matchedEvidenceRefs ?? []).map((ref) => hostnameFromUrl(ref.url ?? ref.label))).find(Boolean) ?? null;
    const relatedJourneyFirstSeenMs = firstNumber(
      ...(bundle.observedJourneys ?? [])
        .filter((journey) =>
          journey.relatedVendorObservationIds?.includes(vendor.observationId) ||
          journey.relatedVendors?.some((value) => value === vendor.vendor || value === vendor.product || value === vendorName) ||
          journey.vendor === vendor.vendor ||
          journey.displayName === vendor.product ||
          journey.displayName === vendorName
        )
        .map((journey) => journey.firstObservedAtMs)
    );
    const matchedEventIds = new Set([
      ...(vendor.matchedEvidenceIds ?? []),
      ...(vendor.matchedEvidenceRefs ?? []).map((ref) => ref.eventId)
    ].filter((value): value is string => typeof value === "string" && value.length > 0));
    const relatedEventFirstSeenMs = firstNumber(
      ...[
        ...(bundle.networkEvents ?? []),
        ...(bundle.scriptEvents ?? []),
        ...(bundle.iframeEvents ?? [])
      ]
        .filter((event) => matchedEventIds.has(event.eventId))
        .map((event) => event.timestampMs)
    );
    const observedVia = uniqueStrings((vendor.matchSources ?? []).map((source) => {
      const matchSource = firstString(source.source, source.sourceEventType)?.toLowerCase();
      if (!matchSource) {
        return null;
      }
      if (/cookie/.test(matchSource)) {
        return "cookie";
      }
      if (/script/.test(matchSource)) {
        return "script";
      }
      if (/iframe|frame/.test(matchSource)) {
        return "iframe";
      }
      if (/storage/.test(matchSource)) {
        return "storage";
      }
      if (/request|response|url|host/.test(matchSource)) {
        return "request";
      }
      if (/cmp|dom|global/.test(matchSource)) {
        return "runtime probe";
      }
      return matchSource.replace(/_/g, " ");
    }));
    return {
      beforeConsent: true,
      collectionEndpointType: "direct_third_party",
      confidence: typeof vendor.confidence === "number" ? vendor.confidence : 0.85,
      detectionSource: "local_v2_dag_runtime",
      firstSeenMs: firstNumber(relatedJourneyFirstSeenMs, relatedEventFirstSeenMs),
      firstPartyOrThirdParty: "third_party",
      matchedSignatureId: vendor.observationId ?? null,
      observedVia,
      regulatoryRelevance: vendor.regulatoryRelevance ?? [],
      scriptHost: evidenceHost,
      vendorDisplayCategory: displayCategory,
      vendorCategory: category,
      vendorName
    };
  });
}

function vendorRowsForCategories(
  vendors: ReturnType<typeof buildVendorEvidence>,
  categories: string[]
) {
  const categorySet = new Set(categories);
  return vendors.filter((vendor) => categorySet.has(vendor.vendorCategory));
}

function uniqueVendorRows(vendors: ReturnType<typeof buildVendorEvidence>) {
  const selected = new Map<string, ReturnType<typeof buildVendorEvidence>[number]>();
  for (const vendor of vendors) {
    selected.set(`${vendor.vendorName}:${vendor.scriptHost ?? ""}:${vendor.vendorCategory}`, vendor);
  }
  return [...selected.values()];
}

function vendorRowsForBehavioralAdvertising(vendors: ReturnType<typeof buildVendorEvidence>) {
  return vendors.filter((vendor) => {
    const relevance = vendor.regulatoryRelevance.join(" ").toLowerCase();
    const label = `${vendor.vendorCategory} ${vendor.vendorName} ${vendor.scriptHost ?? ""}`.toLowerCase();
    return vendor.vendorCategory === "retargeting" ||
      /cross_site_tracking|identity_resolution|audience_management|audience_segmentation|audience_matching|profile_activation/.test(relevance) ||
      /\b(retarget|remarket|audience|identity sync|idsync|pixel|meta pixel|facebook pixel|linkedin insight|tiktok pixel|pinterest tag)\b/.test(label);
  });
}

function vendorRowsForAdvertisingInfrastructure(vendors: ReturnType<typeof buildVendorEvidence>) {
  return vendors.filter((vendor) => {
    const relevance = vendor.regulatoryRelevance.join(" ").toLowerCase();
    return vendor.vendorCategory === "advertising" ||
      /advertising|ad_measurement|ad_verification|brand_safety|programmatic_ads|content_recommendation|video_ad_measurement|audience_measurement|attribution|tv_attribution/.test(relevance);
  });
}

function sanitizeIframeEvents(bundle: CanonicalEvidenceBundle, rootDomain: string | null) {
  return (bundle.iframeEvents ?? []).slice(0, 75).map((event) => {
    const frameUrl = firstString(event.frameUrl);
    const hostname = hostnameFromUrl(frameUrl);
    return {
      consentStateAtTime: event.consentStateAtTime,
      frameName: firstString(event.frameName),
      frameUrl,
      hostname,
      preConsent: event.consentStateAtTime === "pre_consent",
      thirdParty: hostname ? !sameSite(hostname, rootDomain) : false,
      timestampMs: event.timestampMs
    };
  });
}

const EMBEDDED_CONTENT_HOST_PATTERNS = [
  /(^|\.)youtube(?:-nocookie)?\.com$/i,
  /(^|\.)youtu\.be$/i,
  /(^|\.)vimeo\.com$/i,
  /(^|\.)google\.[a-z.]+$/i,
  /(^|\.)googleapis\.com$/i,
  /(^|\.)openstreetmap\.org$/i,
  /(^|\.)spotify\.com$/i,
  /(^|\.)soundcloud\.com$/i,
  /(^|\.)twitter\.com$/i,
  /(^|\.)x\.com$/i,
  /(^|\.)instagram\.com$/i,
  /(^|\.)facebook\.com$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)linkedin\.com$/i,
  /(^|\.)typeform\.com$/i,
  /(^|\.)calendly\.com$/i,
  /(^|\.)hubspot(?:usercontent)?\.com$/i
];

const EMBEDDED_CONTENT_PATH_PATTERN = /\/embed\/|\/plugins\/|\/maps\/embed|\/widgets?\//i;
const SESSION_REPLAY_URL_PATTERN =
  /clarity\.ms|hotjar\.com|hotjar\.io|fullstory\.com|logrocket\.com|mouseflow\.com|contentsquare\.(?:com|net)|smartlook\.com|inspectlet\.com|luckyorange\.com|quantummetric\.com|sessioncam\.com/i;
const SESSION_REPLAY_VENDOR_PATTERN =
  /microsoft clarity|clarity|hotjar|fullstory|logrocket|mouseflow|contentsquare|smartlook|inspectlet|lucky orange|quantum metric|sessioncam/i;

function classifyEmbeddedContentPurpose(hostname: string | null | undefined, url?: string | null) {
  const text = `${hostname ?? ""} ${url ?? ""}`.toLowerCase();
  if (/imasdk\.googleapis\.com|ima3\.js|googletagservices\.com|gampad|doubleclick\.net|googleads\.g\.doubleclick\.net|brightline\.tv|freewheel|ad[-.]tech|video.*ad|ad.*video/.test(text)) {
    return "videoAdSdk";
  }
  if (/fonts\.googleapis\.com|fonts\.gstatic\.com|typekit\.net|use\.typekit\.net/.test(text)) {
    return "fontStaticResource";
  }
  if (/youtube(?:-nocookie)?\.com|youtu\.be|vimeo\.com|spotify\.com|soundcloud\.com/.test(text)) {
    return "mediaEmbed";
  }
  if (/maps\/embed|google\.[a-z.]+\/maps|openstreetmap\.org/.test(text)) {
    return "mapEmbed";
  }
  if (/facebook\.com|instagram\.com|tiktok\.com|linkedin\.com|twitter\.com|x\.com/.test(text)) {
    return "socialEmbed";
  }
  if (/typeform\.com|calendly\.com|hubspot(?:usercontent)?\.com|chat|widget/.test(text)) {
    return "formOrChatWidget";
  }
  return "otherEmbeddedContent";
}

function buildEmbeddedContentPurposeBuckets(observations: Array<{ hostname: string | null; frameUrl?: string | null; requestUrl?: string | null }>) {
  const buckets: Record<string, string[]> = {
    fontStaticResource: [],
    formOrChatWidget: [],
    mapEmbed: [],
    mediaEmbed: [],
    otherEmbeddedContent: [],
    socialEmbed: [],
    videoAdSdk: []
  };
  for (const observation of observations) {
    const host = observation.hostname;
    if (!host) {
      continue;
    }
    const bucket = classifyEmbeddedContentPurpose(host, observation.frameUrl ?? observation.requestUrl ?? null);
    buckets[bucket] = uniqueStrings([...(buckets[bucket] ?? []), host]);
  }
  return buckets;
}

function isKnownEmbeddedContentUrl(url: string | null | undefined, hostnameFallback?: string | null) {
  const hostname = hostnameFromUrl(url) ?? hostnameFallback ?? null;
  if (!hostname || !EMBEDDED_CONTENT_HOST_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return false;
  }
  return EMBEDDED_CONTENT_PATH_PATTERN.test(url ?? "") || !/(^|\.)google\.[a-z.]+$/i.test(hostname);
}

function summarizeEmbeddedContentEvidence(
  preconsentIframeEvents: ReturnType<typeof sanitizeIframeEvents>,
  preconsentRequests: CanonicalEvidenceBundle["networkEvents"],
) {
  const iframeObservations = preconsentIframeEvents
    .filter((event) => event.thirdParty && isKnownEmbeddedContentUrl(event.frameUrl, event.hostname))
    .map((event) => ({
      evidenceType: "iframe",
      frameUrl: event.frameUrl,
      hostname: event.hostname,
      timestampMs: event.timestampMs
    }));
  const networkObservations = (preconsentRequests ?? [])
    .filter((event) => event.thirdParty === true || event.isThirdParty === true)
    .filter((event) => isKnownEmbeddedContentUrl(requestUrl(event), event.hostname ?? null))
    .map((event) => ({
      evidenceType: "network_request",
      hostname: event.hostname ?? hostnameFromUrl(requestUrl(event)),
      requestUrl: requestUrl(event),
      timestampMs: event.timestampMs
    }));
  const observations = [...iframeObservations, ...networkObservations].slice(0, 25);
  const embeddedContentPurposeBuckets = buildEmbeddedContentPurposeBuckets(observations);

  return {
    coverageRetained: true,
    embeddedContentHosts: uniqueStrings(observations.map((event) => event.hostname)),
    embeddedContentObservationCount: observations.length,
    embeddedContentObserved: observations.length > 0,
    embeddedContentPurposeBuckets,
    embedded_content_purpose_buckets: embeddedContentPurposeBuckets,
    iframeObservationCount: iframeObservations.length,
    networkObservationCount: networkObservations.length,
    observations
  };
}

function browserApiAccessRows(bundle: CanonicalEvidenceBundle) {
  return (bundle.runtimeTimeline ?? [])
    .filter((event) => event.eventType === "browser_api_access")
    .map((event) => {
      const ref = event.evidenceRefs?.[0];
      const apiName = firstString(ref?.label)?.replace(/^Browser API access:\s*/i, "") ?? "browser_api_access";
      const category = firstString(ref?.excerpt) ?? "browser_api";
      return {
        apiName,
        category,
        consentStateAtTime: event.consentStateAtTime,
        fingerprintAttributeCategories: [category],
        highEntropySignals: [apiName],
        host: event.hostname ?? hostnameFromUrl(event.url),
        preConsent: event.consentStateAtTime === "pre_consent",
        timestampMs: event.timestampMs
      };
    });
}

function browserApiProbeInstalled(bundle: CanonicalEvidenceBundle) {
  return (bundle.modulesRun ?? []).some((moduleRun) =>
    (moduleRun.timingBreakdown ?? []).some((timing) =>
      timing.label === "browser api probe install"
    )
  );
}

function summarizeFingerprintingEvidence(bundle: CanonicalEvidenceBundle) {
  const rows = browserApiAccessRows(bundle);
  const apiProbeRetained = browserApiProbeInstalled(bundle) || rows.length > 0;
  return {
    apiProbeRetained,
    artifactCount: rows.length,
    coverageRetained: apiProbeRetained,
    fingerprintAttributeCategories: uniqueStrings(rows.flatMap((row) => row.fingerprintAttributeCategories)),
    fingerprintingObserved: rows.length > 0,
    highEntropySignals: uniqueStrings(rows.flatMap((row) => row.highEntropySignals)).slice(0, 12),
    hosts: uniqueStrings(rows.map((row) => row.host)),
    preConsentObserved: rows.some((row) => row.preConsent)
  };
}

function isSessionReplayRequestRow(row: Record<string, unknown>) {
  const vendor = firstString(row.vendorName, row.vendor);
  const url = requestUrl(row);
  const category = firstString(row.category, row.vendorCategory);
  return (
    category === "session_replay" ||
    SESSION_REPLAY_VENDOR_PATTERN.test(vendor ?? "") ||
    SESSION_REPLAY_URL_PATTERN.test(url ?? "")
  );
}

function summarizeSessionReplayEvidence(
  vendorRows: ReturnType<typeof buildVendorEvidence>,
  preconsentRequests: CanonicalEvidenceBundle["networkEvents"],
  requestPurposeRows: Array<Record<string, unknown>>,
) {
  const sessionReplayVendors = vendorRowsForCategories(vendorRows, ["session_replay"])
    .filter((vendor) => SESSION_REPLAY_VENDOR_PATTERN.test(vendor.vendorName) || vendor.vendorCategory === "session_replay");
  const requestRows = [
    ...(preconsentRequests ?? []).filter(isSessionReplayRequestRow),
    ...requestPurposeRows.filter(isSessionReplayRequestRow)
  ] as Array<Record<string, unknown>>;
  const requestUrls = uniqueStrings(requestRows.map((row) => requestUrl(row)));
  const vendors = uniqueStrings([
    ...sessionReplayVendors.map((vendor) => vendor.vendorName),
    ...requestRows.map((row) => firstString(row.vendorName, row.vendor))
  ]).filter((vendor) => SESSION_REPLAY_VENDOR_PATTERN.test(vendor));
  const firstSeenMs = firstNumber(...requestRows.map((row) => firstNumber(row.timestampMs, row.tsMs)));
  const observed = vendors.length > 0 || requestUrls.length > 0;

  return {
    artifactCount: Math.max(vendors.length, requestUrls.length),
    collectionEndpointObserved: requestUrls.some((url) => /\/collect|\/events?|\/track|\/ingest|clarity\.ms\/collect/i.test(url)),
    consentStates: observed ? ["pre_consent"] : [],
    coverageRetained: true,
    firstSeenMs,
    libraryOnly: observed && requestUrls.every((url) => /(?:script|tag|recorder|hotjar|fullstory|logrocket|clarity\.ms\/tag)/i.test(url)),
    preConsentObserved: observed,
    requestUrls: requestUrls.slice(0, 10),
    vendors: vendors.slice(0, 10)
  };
}

export function summarizePolicySurfaces(
  policySurfaces: ReturnType<typeof dedupePolicySurfaces>,
  rootDomain: string | null
) {
  const privacySurfaces = policySurfaces.filter((row) => row.surface.surfaceType === "privacy_policy");
  const article13Surfaces = privacySurfaces.filter((row) => !isGenericThirdPartyPrivacySurface(row, rootDomain));
  const text = article13Surfaces.map((row) => firstString(row.surface.textExcerpt)).filter(Boolean).join("\n");
  const policyTextQuality = assessRetainedPolicyTextQuality(text);
  const observedPolicyTopicHints = uniqueStrings(article13Surfaces.flatMap((row) => row.surface.observedTopics ?? []));
  const article13SignalCandidates = article13Surfaces.flatMap((row) => {
    const fullPolicyText = readPolicySurfaceTextArtifact(row.surface);
    return (row.surface.article13DisclosureSignals ?? []).map((signal) => {
      const evidenceText = firstString(signal.evidenceText);
      const retainedPolicyContext = evidenceText && fullPolicyText
        ? buildPolicyEvidenceContextExcerpt(fullPolicyText, evidenceText)
        : null;
      const supportingContactContext = signal.disclosureType === "supervisory_authority"
        ? extractSupervisoryAuthoritySupportingContactContext(retainedPolicyContext ?? evidenceText ?? "")
        : null;
      return {
        confidence: signal.confidence,
        disclosureType: signal.disclosureType,
        evidenceText,
        evidenceSource: signal.evidenceSource,
        source: signal.source,
        status: signal.status,
        selectedEvidenceStrength: retainedPolicyContext ? "strong" : signal.selectedEvidenceStrength,
        selectedPolicySectionExcerpt: retainedPolicyContext ?? firstString(signal.selectedPolicySectionExcerpt),
        selectedPolicySectionHeading: retainedPolicyContext ? "Policy text context" : firstString(signal.selectedPolicySectionHeading),
        selectedPolicySectionUrl: firstString(signal.selectedPolicySectionUrl) ?? row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url,
        supportingContactContext,
        surfaceUrl: row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url
      };
    });
  });
  const validatedArticle13DisclosureSignals = policyTextQuality.usable
    ? article13SignalCandidates.filter((signal) => retainedArticle13SignalRejectReason(signal.evidenceText ?? "", signal.disclosureType) === null)
    : [];
  const dedupedArticle13DisclosureSignals = dedupePolicyDisclosureRows(validatedArticle13DisclosureSignals, {
    excerptKeys: ["selectedPolicySectionExcerpt", "evidenceText"],
    typeKeys: ["disclosureType"]
  });
  const discardedArticle13DisclosureSignals = [
    ...article13Surfaces.flatMap((row) =>
      (row.surface.discardedArticle13DisclosureSignals ?? []).map((signal) => ({
        confidence: signal.confidence,
        disclosureType: signal.disclosureType,
        evidenceText: firstString(signal.evidenceText),
        rejectReason: signal.rejectReason,
        source: signal.source,
        surfaceUrl: row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url
      }))
    ),
    ...article13SignalCandidates.flatMap((signal) => {
      const rejectReason = policyTextQuality.usable
        ? retainedArticle13SignalRejectReason(signal.evidenceText ?? "", signal.disclosureType)
        : "code_or_non_policy_excerpt" as const;
      return rejectReason
        ? [{
            confidence: signal.confidence,
            disclosureType: signal.disclosureType,
            evidenceText: signal.evidenceText,
            rejectReason,
            source: signal.source,
            surfaceUrl: signal.surfaceUrl
          }]
        : [];
    })
  ].slice(0, 40);
  const mentionedControls = uniqueStrings(policySurfaces.flatMap((row) => row.surface.mentionedControls ?? []));
  const processingErrorObserved = /processing error|privacy center.*error/i.test(text);
  const policyTextExtractionHealth = buildPolicyTextExtractionHealth(article13Surfaces, text, processingErrorObserved);
  const retainedPolicySections = article13Surfaces.flatMap((row) =>
    (row.surface.retainedPolicySections ?? []).map((section) => ({
      charEnd: section.charEnd,
      charStart: section.charStart,
      heading: section.heading,
      quality: section.quality,
      sourceUrl: section.sourceUrl,
      textExcerpt: section.textExcerpt,
    }))
  ).slice(0, 80);
  const retainedArticle13SectionEvidence = dedupePolicyDisclosureRows(article13Surfaces.flatMap((row) =>
    (row.surface.retainedArticle13SectionEvidence ?? []).map((evidence) => ({
      coverageArea: evidence.coverageArea,
      evidenceSource: evidence.evidenceSource,
      extractionLimitation: evidence.extractionLimitation,
      selectedEvidenceStrength: evidence.selectedEvidenceStrength,
      selectedPolicySectionExcerpt: evidence.selectedPolicySectionExcerpt,
      selectedPolicySectionHeading: evidence.selectedPolicySectionHeading,
      selectedPolicySectionUrl: evidence.selectedPolicySectionUrl,
      signalObserved: evidence.signalObserved,
      surfaceUrl: row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url
    }))
  ), {
    excerptKeys: ["selectedPolicySectionExcerpt"],
    typeKeys: ["coverageArea"]
  }).slice(0, 40);
  const retainedPolicySectionHeadings = uniqueStrings(retainedPolicySections.map((section) => firstString(section.heading)).filter(Boolean));
  const expectedPolicySectionHeadings = [
    "Your privacy controls",
    "Exporting and deleting your information",
    "Retaining your information",
    "Compliance and cooperation with regulators",
    "European requirements",
    "Data transfers"
  ];
  const missingExpectedPolicySections = expectedPolicySectionHeadings.filter((heading) =>
    !retainedPolicySectionHeadings.some((retainedHeading) => retainedHeading.toLowerCase().includes(heading.toLowerCase()))
  );
  return {
    article13DisclosureSignals: dedupedArticle13DisclosureSignals,
    article13DisclosureTypesObserved: uniqueStrings(dedupedArticle13DisclosureSignals
      .filter((signal) => signal.status === "observed")
      .map((signal) => signal.disclosureType)),
    article13DisclosureTypesPartial: uniqueStrings(dedupedArticle13DisclosureSignals
      .filter((signal) => signal.status === "partial")
      .map((signal) => signal.disclosureType)),
    discardedArticle13DisclosureSignals,
    retainedArticle13SectionEvidence,
    retainedPolicySections,
    mentionedControls,
    observedPolicyTopicHints,
    observedTopics: observedPolicyTopicHints,
    missingExpectedPolicySections,
    policySectionCount: retainedPolicySections.length,
    policyTextCoverageMode: retainedPolicySections.length > 1 ? "section_targeted" : text.length > 0 ? "front_loaded" : "none",
    retainedPolicySectionHeadings,
    policySurfaceCount: policySurfaces.length,
    policyTextExtractionHealth,
    policy_text_extraction_health: policyTextExtractionHealth,
    privacyPolicyPresent: article13Surfaces.length > 0,
    privacyPolicyTextCharacterCount: text.length,
    privacyPolicyUrls: uniqueStrings(article13Surfaces.map((row) => row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url)),
    processingErrorObserved,
    retainedPrivacyPolicyTextExcerpt: buildRetainedPolicyDisclosureText(text),
    validatedDisclosureTypesObserved: uniqueStrings(dedupedArticle13DisclosureSignals
      .filter((signal) => signal.status === "observed")
      .map((signal) => signal.disclosureType)),
    validatedDisclosureTypesPartial: uniqueStrings(dedupedArticle13DisclosureSignals
      .filter((signal) => signal.status === "partial")
      .map((signal) => signal.disclosureType))
  };
}

const MAX_RETAINED_POLICY_DISCLOSURE_TEXT_CHARS = 40_000;

function buildRetainedPolicyDisclosureText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_RETAINED_POLICY_DISCLOSURE_TEXT_CHARS) {
    return normalized;
  }
  return normalized.slice(0, MAX_RETAINED_POLICY_DISCLOSURE_TEXT_CHARS).trimEnd();
}

function buildPolicyTextExtractionHealth(
  article13Surfaces: ReturnType<typeof dedupePolicySurfaces>,
  text: string,
  processingErrorObserved: boolean
) {
  const policySurfaceObserved = article13Surfaces.length > 0;
  const policyUrls = uniqueStrings(article13Surfaces.map((row) => row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url));
  const extractedTextLength = text.length;
  const statusValues = article13Surfaces.map((row) => row.surface.status);
  const nanoInvoked = article13Surfaces.some((row) =>
    (row.surface.assistMetadata ?? []).some((metadata) => metadata.modelAssistProvider === "nano")
  );
  const hasFailedSurface = statusValues.some((status) => status === "failed");
  const hasBlockedSurface = article13Surfaces.some((row) =>
    row.surface.fetchable === false || row.surface.httpStatus === 401 || row.surface.httpStatus === 403 || row.surface.httpStatus === 429
  );
  const textQuality = assessRetainedPolicyTextQuality(text);
  const policyTextExtractionStatus =
    !policySurfaceObserved
      ? "not_attempted"
      : processingErrorObserved || hasFailedSurface
        ? "errored"
        : hasBlockedSurface
          ? "blocked"
          : !textQuality.usable
            ? "low_quality_extracted_code_or_config"
          : extractedTextLength >= MIN_PRIVACY_POLICY_TEXT_CHARS_FOR_ARTICLE13
            ? "ok"
            : "thin";
  const extractionFailureReason =
    policyTextExtractionStatus === "ok"
      ? undefined
      : policyTextExtractionStatus === "not_attempted"
        ? "privacy_policy_surface_not_observed"
        : policyTextExtractionStatus === "blocked"
          ? "privacy_policy_fetch_blocked"
          : policyTextExtractionStatus === "errored"
            ? "privacy_policy_text_processing_error"
            : policyTextExtractionStatus === "low_quality_extracted_code_or_config"
              ? "privacy_policy_text_low_quality_or_non_policy_content"
              : "privacy_policy_text_below_minimum_length";

  return {
    extractedTextLength,
    extractionFailureReason,
    minimumTextLengthRequired: MIN_PRIVACY_POLICY_TEXT_CHARS_FOR_ARTICLE13,
    nanoInvoked,
    nanoSkipReason: policyTextExtractionStatus === "ok" || nanoInvoked ? undefined : "policy_text_input_limited",
    policySurfaceObserved,
    policyTextQuality: textQuality,
    policyTextExtractionStatus,
    policyUrlRetained: policyUrls.length > 0,
    policyUrls
  };
}

function assessRetainedPolicyTextQuality(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) {
    return {
      alphabeticWordRatio: 0,
      codeSignalCount: 0,
      codeSymbolRatio: 0,
      naturalLanguageSentenceCount: 0,
      policyTermCount: 0,
      reason: "empty_policy_text",
      usable: false
    };
  }
  const lower = text.toLowerCase();
  const codeSignals = [
    /this\.gbar_/i,
    /\bCONFIG:\s*\[\[\[/,
    /Copyright The Closure Library/i,
    /SPDX-License-Identifier/i,
    /\b(?:var|const|let)\s+[A-Za-z_$][\w$]*\s*=/,
    /function\s*\(/,
    /=>/,
    /_\.[A-Za-z_$][\w$]*\s*=/,
    /Object\.definePropert(?:y|ies)/
  ].reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
  const codeSymbolRatio = (text.match(/[{}[\];=<>]/g) ?? []).length / Math.max(text.length, 1);
  const totalTokens = text.split(/\s+/).filter(Boolean).length;
  const alphabeticWords = text.match(/\b[A-Za-z][A-Za-z'-]{2,}\b/g) ?? [];
  const alphabeticWordRatio = alphabeticWords.length / Math.max(totalTokens, 1);
  const naturalLanguageSentenceCount = (text.match(/\b(?:we|you|your|our|users?|individuals?|customers?|visitors?|people)\b[^.!?]{20,}[.!?]/gi) ?? []).length;
  const policyTermCount = uniqueStrings((lower.match(/\b(?:privacy|collect|use|information|personal data|personal information|data|retain|delete|share|rights|contact|transfer|consent|controller|processor|legal basis|lawful basis)\b/g) ?? [])).length;
  const escapedUrlCount = (text.match(/\\x2f|\\u003c|\\u003e|https?:\\\/\\\//gi) ?? []).length;
  const minifiedTokenCount = (text.match(/[A-Za-z_$][\w$]{0,8}\s*[=:]\s*\S{40,}/g) ?? []).length;
  const reason =
    /\bthis\.gbar_|\bCONFIG:\s*\[\[\[|Copyright The Closure Library|SPDX-License-Identifier/i.test(text) ||
    (codeSignals >= 2 && naturalLanguageSentenceCount < 3) ||
    (codeSymbolRatio > 0.12 && naturalLanguageSentenceCount < 4) ||
    (escapedUrlCount >= 8 && naturalLanguageSentenceCount < 3) ||
    (minifiedTokenCount >= 2 && naturalLanguageSentenceCount < 4) ||
    (text.length >= 500 && alphabeticWordRatio < 0.42)
      ? "low_quality_extracted_code_or_config"
      : text.length >= 500 && policyTermCount < 2 && naturalLanguageSentenceCount < 2
        ? "low_quality_non_policy_text"
        : undefined;
  return {
    alphabeticWordRatio,
    codeSignalCount: codeSignals,
    codeSymbolRatio,
    naturalLanguageSentenceCount,
    policyTermCount,
    reason,
    usable: !reason
  };
}

function retainedArticle13SignalIsUsable(value: string, disclosureType: string | undefined) {
  return retainedArticle13SignalRejectReason(value, disclosureType) === null;
}

function retainedArticle13SignalRejectReason(value: string, disclosureType: string | undefined) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length < 35) {
    return "low_confidence_or_ambiguous" as const;
  }
  if (!assessRetainedPolicyTextQuality(text).usable) {
    return "code_or_non_policy_excerpt" as const;
  }
  if (looksLikeRetainedArticle13PageChrome(text)) {
    return "page_chrome_or_navigation" as const;
  }
  if (looksLikeRetainedArticle13TableOfContents(text)) {
    return "table_of_contents_only" as const;
  }
  if (disclosureType === "data_retention" && isGenericRetainedStorageNotRetentionEvidence(text)) {
    return "generic_storage_not_retention" as const;
  }
  if (!retainedArticle13SignalHasRowSpecificTerms(text, disclosureType)) {
    return "insufficient_row_specific_terms" as const;
  }
  return null;
}

function looksLikeRetainedArticle13PageChrome(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (/skip to main content|privacy policy\s+[-–]\s+privacy\s*&\s*terms|overview privacy policy terms of service technologies faq/i.test(text)) {
    return true;
  }
  const navTokens = (text.match(/\b(?:overview|privacy policy|terms of service|technologies|faq|introduction|privacy|terms|skip to main content)\b/gi) ?? []).length;
  const sentenceCount = (text.match(/[.!?]/g) ?? []).length;
  return navTokens >= 5 && sentenceCount < 2;
}

function looksLikeRetainedArticle13TableOfContents(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  const tocTokens = (text.match(/\b(?:introduction|information (?:we|google) collects?|why (?:we|google) collects?|your privacy controls|sharing your information|keeping your information|exporting|deleting|retaining|terms|faq)\b/gi) ?? []).length;
  const hasDisclosureVerb = /\b(?:we|you|our)\s+(?:use|process|collect|retain|keep|store|share|transfer|disclose|provide|may|can|have|request|exercise)\b/i.test(text);
  return tocTokens >= 4 && !hasDisclosureVerb;
}

function isGenericRetainedStorageNotRetentionEvidence(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  const hasStorageMechanics = /\b(?:collect|store|storage|cookies?|local storage|databases?|server logs?)\b/i.test(text);
  const hasRetentionLifecycle = /\b(?:retain|retention|how long|kept for|stored for|delete|deletion|anonymi[sz]e|remove|expires?|as long as necessary|no longer needed|required by law|legal purposes|fraud|abuse)\b/i.test(text);
  return hasStorageMechanics && !hasRetentionLifecycle;
}

function retainedArticle13SignalHasRowSpecificTerms(value: string, disclosureType: string | undefined) {
  const text = value.replace(/\s+/g, " ").trim();
  switch (disclosureType) {
    case "controller_contact":
      return /\b(?:data controller|controller|google llc|google ireland limited|contact (?:us|our privacy team|google)|questions about (?:this )?(?:policy|privacy)|privacy office|privacy questions?|privacy@|data protection office|data protection officer|\bdpo\b)\b/i.test(text) &&
        !looksLikeRetainedArticle13PageChrome(text);
    case "processing_purposes":
      return /\b(?:purpose(?:s)?|why we (?:process|collect|use)|we (?:use|process|collect) (?:your )?(?:personal )?(?:data|information) (?:to|for)|provide (?:our )?services|personalize)\b/i.test(text);
    case "legal_basis":
      return /\b(?:legal basis|lawful basis|legitimate interests?|performance of (?:a )?contract|contractual necessity|legal obligation|public task|public interest|vital interests?|with your consent|consent to)\b/i.test(text);
    case "recipients_or_vendor_categories":
      return /\b(?:recipients|service providers|processors|vendors?|partners|affiliates|third parties|third-party|advertising partners?|analytics providers?)\b/i.test(text);
    case "data_retention":
      return /\b(?:retaining your information|retention period|retention criteria|storage period|retain|retention|kept for|stored for|as long as necessary|deleted or anonymi[sz]ed|expires?|no longer needed|required by law|legal purposes|fraud|abuse)\b/i.test(text) &&
        !isGenericRetainedStorageNotRetentionEvidence(text);
    case "data_subject_rights":
      return /\b(?:your rights|data subject rights|right to (?:access|delete|erasure|rectification|object|restrict|portability)|rights? to (?:access|delete|erasure|rectification|object|restrict|portability)|exercise (?:your )?rights|privacy controls|download a copy|export (?:your )?(?:data|information)|request to (?:remove|delete|access|correct))\b/i.test(text);
    case "international_transfers":
      return /\b(?:data transfers?.{0,320}(?:servers around the world|outside (?:of )?the country|legal frameworks?|data privacy frameworks?|safeguards)|international transfer|cross-border transfer|standard contractual clauses|adequacy decision|servers around the world|processed? (?:on servers )?outside (?:your )?country|outside (?:of )?the country where you live|legal frameworks? relating to the transfer of data|data protection laws vary|outside (?:the )?(?:eea|european economic area|uk|united kingdom|eu|european union)|third countr(?:y|ies)|data privacy framework|\bdpf\b|privacy shield|transfer (?:your )?(?:personal )?(?:data|information).{0,80}outside (?:your )?country)\b/i.test(text);
    case "dpo_contact":
      return /\b(?:data protection officer|\bdpo\b|data protection contact)\b/i.test(text);
    case "supervisory_authority":
      return /\b(?:supervisory authority|data protection authority|local data protection authorit(?:y|ies)|lodge a complaint|complain to (?:a )?(?:regulator|authority)|compliance (?:and|&) cooperation with regulators.{0,320}(?:complaints?|regulatory authorities|local data protection authorities|resolve)|formal written complaints?|regulatory authorities|unresolved complaints?|regulators?.{0,120}(?:complaints?|authorities|resolve)|\bico\b|\bcnil\b|\bdpc\b)\b/i.test(text);
    case "automated_decision_making_or_profiling":
      return /\b(?:automated decision|solely automated|profiling|meaningful information about the logic|automated systems?|algorithms?|recognize patterns|personalized ads|personalized advertising|customi[sz]ed search results|tailored search results|tailored|personalization)\b/i.test(text);
    default:
      return false;
  }
}

function isGenericThirdPartyPrivacySurface(
  row: ReturnType<typeof dedupePolicySurfaces>[number],
  rootDomain: string | null
) {
  const hostname = hostnameFromUrl(row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url);
  if (!hostname || sameSite(hostname, rootDomain)) {
    return false;
  }

  return [
    "policies.google.com",
    "privacy.google.com",
    "privacy.truste.com",
    "trustarc.com",
    "privacy.trustarc.com",
    "www.trustarc.com"
  ].includes(hostname);
}

function summarizeCollectionSurfaces(bundle: CanonicalEvidenceBundle) {
  const inventoryRetained = Array.isArray(bundle.collectionSurfaceObservations);
  const observations = (bundle.collectionSurfaceObservations ?? []).slice(0, 25);
  const surfaceTypes = uniqueStrings(observations.map((row) => row.surfaceType));
  return {
    collectionSurfaceCount: observations.length,
    collectionSurfacesObserved: observations.length > 0,
    fieldTypes: uniqueStrings(observations.flatMap((row) => row.fieldTypes ?? [])),
    hasEmailField: observations.some((row) => row.hasEmailField),
    hasSensitiveFieldHint: observations.some((row) => row.hasSensitiveFieldHint),
    inventoryRetained,
    labels: uniqueStrings(observations.flatMap((row) => row.labels ?? [])).slice(0, 12),
    surfaceTypes
  };
}

function summarizeFirstLayerConsentChoices(bundle: CanonicalEvidenceBundle) {
  const observation = (bundle.consentUiObservations ?? []).find((row) => row.likelyPresent) ??
    (bundle.consentUiObservations ?? [])[0] ??
    null;
  const controls = (observation?.controls ?? []).filter((control) => control.visible !== false);
  const visibleChoiceLabels = uniqueStrings([
    ...(observation?.visibleChoiceLabels ?? []),
    ...controls.map((control) => control.label)
  ]).slice(0, 12);
  const acceptLabels = uniqueStrings(controls
    .filter((control) => control.actionType === "accept_all")
    .map((control) => control.label));
  const rejectLabels = uniqueStrings(controls
    .filter((control) => control.actionType === "reject_all")
    .map((control) => control.label));
  const preferenceLabels = uniqueStrings(controls
    .filter((control) => control.actionType === "manage_preferences")
    .map((control) => control.label));

  if (!observation) {
    return null;
  }

  return {
    acceptControlObserved: observation.acceptControlObserved === true || acceptLabels.length > 0,
    acceptLabels,
    actionableControlInventoryRetained: controls.length > 0 || visibleChoiceLabels.length > 0,
    capturedBeforeInteraction: true,
    controls: controls.slice(0, 12).map((control) => ({
      actionType: control.actionType,
      label: control.label,
      role: control.role,
      selectorHint: control.selectorHint,
      tagName: control.tagName
    })),
    layerInspected: observation.layerInspected ?? (visibleChoiceLabels.length > 0 ? "first_layer" : "unknown"),
    managePreferencesControlObserved: observation.managePreferencesControlObserved === true || preferenceLabels.length > 0,
    preferenceLabels,
    rejectControlObserved: observation.rejectControlObserved === true || rejectLabels.length > 0,
    rejectLabels,
    visibleChoiceLabels
  };
}

function hasRetainedFirstLayerConsentControlInventory(choices: ReturnType<typeof summarizeFirstLayerConsentChoices>) {
  if (!choices) {
    return false;
  }
  return (
    choices.layerInspected === "first_layer" &&
    (
      choices.actionableControlInventoryRetained === true ||
      choices.acceptControlObserved === true ||
      choices.rejectControlObserved === true ||
      choices.managePreferencesControlObserved === true ||
      choices.visibleChoiceLabels.length > 0
    )
  );
}

const LOCAL_V2_HARD_NO_GO_TEXT_PATTERN =
  /access to this site has been denied|access denied|forbidden|http\s*403|403\s*-\s*forbidden|unable to give you access to (?:our|this) site|unable to access (?:www\.)?[a-z0-9.-]+|security issue was automatically identified|security service to protect itself from online attacks|request blocked|bot protection|you(?:'|’)?ve been blocked|you have been blocked|cloudflare ray id|vercel security checkpoint|vercel sicherheitskontrollpunkt|checking your browser|wir überprüfen ihren browser/i;
const LOCAL_V2_VERCEL_SECURITY_CHALLENGE_PATTERN =
  /(?:^|\/)\.well-known\/vercel\/security\/|\/request-challenge(?:$|[?#])|challenge\.v2\.(?:min\.js|wasm)(?:$|[?#])/i;
const LOCAL_V2_SCREENSHOT_PLACEHOLDER_PATTERN =
  /1x1 screenshot placeholder used|screenshot placeholder/i;
const LOCAL_V2_PAGE_CONTEXT_CLOSED_PATTERN =
  /page\/context closed|target page, context or browser has been closed|page\.screenshot: target page/i;

function boundedTextExcerpt(value: string | null | undefined) {
  return value ? value.replace(/\s+/g, " ").trim().slice(0, 240) : null;
}

function collectLocalV2NoGoTextCandidates(bundle: CanonicalEvidenceBundle) {
  return uniqueStrings([
    ...(bundle.consentUiObservations ?? []).map((observation) => boundedTextExcerpt(observation.textExcerpt)),
    ...(bundle.policySurfaceObservations ?? []).map((observation) => boundedTextExcerpt(observation.textExcerpt)),
    ...(bundle.screenshots ?? []).map((screenshot) => boundedTextExcerpt(screenshot.url))
  ]);
}

function collectLocalV2ModuleErrors(bundle: CanonicalEvidenceBundle) {
  return uniqueStrings((bundle.modulesRun ?? []).flatMap((moduleRun) => moduleRun.errors ?? []));
}

function getNetworkEventUrl(event: NonNullable<CanonicalEvidenceBundle["networkEvents"]>[number]) {
  return getString((event as { requestUrl?: unknown }).requestUrl) ?? getString(event.url);
}

function isLocalV2SecurityChallengeRequest(event: NonNullable<CanonicalEvidenceBundle["networkEvents"]>[number]) {
  const url = getNetworkEventUrl(event);
  return Boolean(url && LOCAL_V2_VERCEL_SECURITY_CHALLENGE_PATTERN.test(url));
}

function localV2VisualCapture(bundle: CanonicalEvidenceBundle) {
  const visualCapture = isRecord((bundle as { visualCapture?: unknown }).visualCapture)
    ? (bundle as { visualCapture?: Record<string, unknown> }).visualCapture
    : null;
  const status = getString(visualCapture?.status);
  const failureReason = getString(visualCapture?.failureReason);
  const captureMethod = getString(visualCapture?.captureMethod);
  const notes = Array.isArray(visualCapture?.notes)
    ? uniqueStrings(visualCapture.notes.map((note) => getString(note)).filter((note): note is string => Boolean(note)))
    : [];
  return {
    captureMethod,
    failureReason,
    notes,
    status
  };
}

function buildLocalV2ScanNoGoAssessment(input: {
  bundle: CanonicalEvidenceBundle;
  consentSurfaceLikelyPresent: boolean;
  localOutDir?: string | null;
  runtimeActivityObserved: boolean;
  lowRuntimeActivity: boolean;
}) {
  const textCandidates = collectLocalV2NoGoTextCandidates(input.bundle);
  const matchedText = textCandidates.find((text) => LOCAL_V2_HARD_NO_GO_TEXT_PATTERN.test(text));
  const moduleErrors = collectLocalV2ModuleErrors(input.bundle);
  const visualCapture = localV2VisualCapture(input.bundle);
  const screenshot = (input.bundle.screenshots ?? [])
    .filter(isPreConsentScreenshotArtifact)
    .sort((left, right) => preConsentScreenshotRank(left) - preConsentScreenshotRank(right))[0] ?? null;
  const screenshotPlaceholderUsed = visualCapture.status === "placeholder" ||
    visualCapture.failureReason === "placeholder_used" ||
    moduleErrors.some((error) => LOCAL_V2_SCREENSHOT_PLACEHOLDER_PATTERN.test(error));
  const pageContextClosed = moduleErrors.some((error) => LOCAL_V2_PAGE_CONTEXT_CLOSED_PATTERN.test(error));
  const visualCaptureFailed = screenshotPlaceholderUsed && (pageContextClosed || visualCapture.failureReason === "placeholder_used");
  const retainedVisualErrorShell = isLikelyRetainedVisualErrorShell({
    bundle: input.bundle,
    localOutDir: input.localOutDir,
    lowRuntimeActivity: input.lowRuntimeActivity,
    screenshot
  });
  if (!matchedText && !visualCaptureFailed && !retainedVisualErrorShell) {
    return null;
  }

  const primaryReasonCode = matchedText
    ? "access_denied_or_forbidden_page"
    : retainedVisualErrorShell
      ? "retained_visual_error_shell"
      : "visual_capture_failed_or_placeholder";
  const visualPageState = matchedText ? "access_blocked" : retainedVisualErrorShell ? "visual_error_shell" : "capture_failed";
  const evidenceText = matchedText ??
    (retainedVisualErrorShell
      ? "The retained pre-consent screenshot appears to be a full-viewport visual error shell with negligible runtime evidence, not the normal public site."
      : "The pre-consent runtime scanner retained only a 1x1 screenshot placeholder after page/context closure and screenshot capture failures.");
  const evidenceRefs = [
    "scan_runtime_artifacts.scan_no_go_assessment",
    "scan_runtime_artifacts.visual_access_review",
    screenshot ? "scan_runtime_artifacts.visual_evidence_artifacts" : null
  ].filter((value): value is string => Boolean(value));
  const shortExplanation = matchedText
    ? `The retained initial-load evidence showed an access-denied or forbidden page instead of the normal public site: "${matchedText}"`
    : evidenceText;
  const visualAccessReview = {
    artifact_ref: screenshot ? "local_v2:screenshot_pre_consent" : null,
    confidence: 0.95,
    go_no_go: "NO_GO",
    key_visual_evidence: [evidenceText],
    page_state: visualPageState,
    reason_code: primaryReasonCode,
    short_explanation: shortExplanation,
    status: "available",
    version: "visual-access-review-v1"
  };
  const scanNoGoAssessment = {
    status: "available",
    version: "scan-no-go-assessment-v1",
    decision: "no_go",
    scanNoGoConfidence: 0.95,
    visualScreenshotNoGoConfidence: 0.95,
    reasonCodes: [primaryReasonCode, "scan_no_go_corroborated"],
    corroboratorCodes: [
      matchedText ? "access_block_text_observed" : null,
      visualCaptureFailed ? "visual_capture_failed" : null,
      screenshotPlaceholderUsed ? "screenshot_placeholder_used" : null,
      pageContextClosed ? "page_context_closed" : null,
      input.lowRuntimeActivity ? "low_runtime_activity" : null,
      input.runtimeActivityObserved && !input.lowRuntimeActivity ? "runtime_activity_observed_on_block_page" : null,
      screenshot ? "retained_visual_artifact_available" : null
    ].filter((value): value is string => Boolean(value)),
    contradictorCodes: [],
    supportingSignals: {
      challengeSignalsDetected: true,
      consentOrTrackerEvidenceObserved: input.consentSurfaceLikelyPresent,
      documentStatusBlocked: Boolean(matchedText),
      domContentLow: true,
      expectedOriginReached: false,
      firstPartyIdentityObserved: false,
      lowRuntimeActivity: input.lowRuntimeActivity,
      pageContextClosed,
      retainedVisualErrorShell,
      runtimeActivityObserved: input.runtimeActivityObserved,
      retainedVisualArtifactAvailable: Boolean(screenshot),
      screenshotPlaceholderUsed,
      visualCaptureFailed,
      visualCaptureFailureReason: visualCapture.failureReason,
      visualCaptureStatus: visualCapture.status,
      visualHardNoGoPageState: true,
      visualNoGo: true,
      visualPageState
    },
    evidenceRefs
  };

  return {
    matchedText: evidenceText,
    pageState: visualPageState,
    primaryReasonCode,
    scanNoGoAssessment,
    visualAccessReview
  };
}

function buildMaterializedLocalV2Detail(
  scanRecord: ScanDetailResponse,
  bundle: CanonicalEvidenceBundle,
  options: { localOutDir?: string | null; scanArtifactUri?: string | null } = {}
): ScanDetailResponse {
  const requestedHost = scanRecord.scan.domainHostname ?? hostnameFromUrl(bundle.normalizedUrl ?? bundle.url);
  const rootDomain = registrableDomain(requestedHost);
  const networkEvents = bundle.networkEvents ?? [];
  const nonChallengeNetworkEvents = networkEvents.filter((event) => !isLocalV2SecurityChallengeRequest(event));
  const cookieEvents = bundle.cookieEvents ?? [];
  const allVendorRows = buildVendorEvidence(bundle);
  const vendorRows = allVendorRows.filter((vendor) => vendor.vendorCategory !== "cmp");
  const thirdPartyRequests = networkEvents.filter((event) => event.thirdParty === true || event.isThirdParty === true);
  const thirdPartyDomains = uniqueStrings(thirdPartyRequests.map((event) => event.hostname ?? hostnameFromUrl(event.url)));
  const preconsentRequests = thirdPartyRequests.filter((event) => event.consentStateAtTime === "pre_consent");
  const preconsentRequestUrls = uniqueStrings(preconsentRequests.map((event) => requestUrl(event)));
  const preconsentCookies = cookieEvents.filter((event) => event.consentStateAtTime === "pre_consent");
  const cookieNames = uniqueStrings(cookieEvents.map((event) => cookieName(event)));
  const preconsentCookieNames = uniqueStrings(preconsentCookies.map((event) => cookieName(event)));
  const iframeEvents = sanitizeIframeEvents(bundle, rootDomain);
  const preconsentIframeEvents = iframeEvents.filter((event) => event.preConsent);
  const cmp = bundle.cmpRuntimeObservations?.[0] ?? null;
  const cmpVendorName = firstString(cmp?.product, cmp?.vendor, cmp?.entity);
  const cmpSignalLabels = uniqueStrings((cmp?.signals ?? []).map((signal) =>
    firstString(signal.matchedValueRedacted, signal.matchedField, signal.signalType)
  ));
  const consentSurfaceLikelyPresent = Boolean(cmpVendorName ?? bundle.derivedRuntimeSignals?.consentBannerLikelyPresent);
  const firstLayerConsentChoices = summarizeFirstLayerConsentChoices(bundle);
  const runtimeCoverageStatus = bundle.runtimeCoverage?.coverageStatus ?? null;
  const runtimeLimitationKeys = bundle.runtimeCoverage?.limitationKeys ?? [];
  const runtimeObservationCounts = bundle.runtimeCoverage?.observationCounts;
  const preConsentRuntimeFailed = runtimeLimitationKeys.includes("pre_consent_runtime_failed");
  const meaningfulRuntimeSignalsRetained =
    (runtimeObservationCounts?.thirdPartyRequests ?? 0) > 0 ||
    (runtimeObservationCounts?.cookiesBeforeConsent ?? 0) > 0 ||
    preconsentCookies.length > 0 ||
    (runtimeObservationCounts?.normalizedVendors ?? 0) > 0 ||
    (runtimeCoverageStatus === null && (preconsentRequests.length > 0 || vendorRows.length > 0));
  const visualCapture = localV2VisualCapture(bundle);
  const retainedPreConsentScreenshot = (bundle.screenshots ?? []).some(isPreConsentScreenshotArtifact);
  const preConsentRuntimeReliable = !preConsentRuntimeFailed || retainedPreConsentScreenshot || visualCapture.status === "available";
  const runtimeCountsRetained =
    !preConsentRuntimeFailed &&
    preConsentRuntimeReliable &&
    (runtimeCoverageStatus === "usable" || meaningfulRuntimeSignalsRetained);
  const localV2NoGo = buildLocalV2ScanNoGoAssessment({
    bundle,
    consentSurfaceLikelyPresent,
    localOutDir: options.localOutDir,
    runtimeActivityObserved: preconsentCookies.length > 0 || vendorRows.length > 0 || nonChallengeNetworkEvents.length > 3 || cookieEvents.length > 0,
    lowRuntimeActivity: nonChallengeNetworkEvents.length <= 3 && thirdPartyRequests.length === 0 && vendorRows.length === 0
  });
  const visualCaptureUnavailable = !localV2NoGo &&
    (visualCapture.status === "failed" || visualCapture.status === "unavailable") &&
    (bundle.screenshots ?? []).length === 0;
  const effectiveRuntimeCoverageStatus = localV2NoGo ? "limited_none" : runtimeCoverageStatus;
  const effectiveRuntimeCountsRetained = localV2NoGo ? false : runtimeCountsRetained;
  const effectiveRuntimeLimitationKeys = localV2NoGo
    ? uniqueStrings([...runtimeLimitationKeys, "access_denied_or_forbidden_page"])
    : visualCaptureUnavailable || !preConsentRuntimeReliable
      ? uniqueStrings([...runtimeLimitationKeys, "visual_capture_unavailable"])
      : runtimeLimitationKeys;
  const consentRuntimeEvidenceReportable = !localV2NoGo && preConsentRuntimeReliable;
  const runtimeEvidenceReportable = !localV2NoGo && effectiveRuntimeCountsRetained;
  const vendorEvidenceReportable = runtimeEvidenceReportable ||
    (!localV2NoGo && preConsentRuntimeReliable && runtimeCoverageStatus === null && meaningfulRuntimeSignalsRetained);
  const reportableVendorRows = vendorEvidenceReportable ? vendorRows : [];
  const inventoryVendorRows = vendorEvidenceReportable ? allVendorRows : [];
  const advertisingVendors = vendorRowsForAdvertisingInfrastructure(reportableVendorRows);
  const retargetingBehavioralAdvertisingVendors = vendorRowsForBehavioralAdvertising(reportableVendorRows);
  const advertisingRetargetingVendors = uniqueVendorRows([
    ...advertisingVendors,
    ...retargetingBehavioralAdvertisingVendors,
    ...vendorRowsForCategories(reportableVendorRows, ["adtech", "marketing"])
  ]);
  const analyticsVendors = vendorRowsForCategories(reportableVendorRows, ["analytics", "measurement"]);
  const retainedFirstLayerConsentChoices = firstLayerConsentChoices ?? {
    acceptControlObserved: false,
    acceptLabels: [],
    actionableControlInventoryRetained: false,
    capturedBeforeInteraction: true,
    layerInspected: "unknown",
    managePreferencesControlObserved: false,
    preferenceLabels: [],
    rejectControlObserved: false,
    rejectLabels: [],
    visibleChoiceLabels: []
  };
  const firstLayerConsentControlInventoryRetained = hasRetainedFirstLayerConsentControlInventory(firstLayerConsentChoices);
  const policySurfaces = dedupePolicySurfaces(
    bundle.policySurfaceObservations ?? [],
    bundle.normalizedUrl ?? bundle.url ?? (requestedHost ? `https://${requestedHost}/` : null)
  );
  const policySurfaceSummary = summarizePolicySurfaces(policySurfaces, rootDomain);
  const collectionSurfaceSummary = summarizeCollectionSurfaces(bundle);
  const privacySurface = policySurfaces.find((row) => row.surface.surfaceType === "privacy_policy");
  const termsSurface = policySurfaces.find((row) => row.surface.surfaceType === "terms");
  const cookieSurface = policySurfaces.find((row) =>
    row.surface.surfaceType === "cookie_policy" ||
    row.surface.surfaceType === "cookie_settings"
  );
  const thirdPartyRequestCount = Math.max(
    bundle.runtimeCoverage?.observationCounts.thirdPartyRequests ?? 0,
    thirdPartyRequests.length
  );
  const cookiesBeforeConsentCount = Math.max(
    bundle.runtimeCoverage?.observationCounts.cookiesBeforeConsent ?? 0,
    preconsentCookies.length
  );
  const vendorCategoryCounts = reportableVendorRows.reduce<Record<string, number>>((counts, vendor) => {
    counts[vendor.vendorCategory] = (counts[vendor.vendorCategory] ?? 0) + 1;
    return counts;
  }, {});
  const score =
    !runtimeCountsRetained
      ? 55
      :
    thirdPartyRequestCount > 0 || cookiesBeforeConsentCount > 0
      ? Math.max(35, Math.min(72, 82 - Math.min(24, Math.round(thirdPartyRequestCount / 8)) - Math.min(18, cookiesBeforeConsentCount)))
      : 88;
  const requestPurposeRows = (preconsentRequests
    .map((event) => {
      const matchedVendor = reportableVendorRows.find((vendor) => {
        const host = hostnameFromUrl(event.hostname ?? event.url);
        return Boolean(host && vendor.scriptHost && (host === vendor.scriptHost || host.endsWith(`.${vendor.scriptHost}`)));
      }) ?? reportableVendorRows[0] ?? null;
      const url = requestUrl(event);
      const hostname = event.hostname ?? hostnameFromUrl(url);
      return matchedVendor && url && hostname
        ? {
            category: matchedVendor.vendorCategory,
            classification: "tracking",
            classificationBasis: "local_v2_dag_runtime_vendor_observation",
            confidence: matchedVendor.confidence,
            essentiality: "non_essential",
            firstPartyOrThirdParty: sameSite(hostname, rootDomain) ? "first_party" : "third_party",
            hostname,
            requestUrl: url,
            regulatoryRelevance: matchedVendor.regulatoryRelevance,
            runtimePhase: "pre_consent",
            tsMs: event.timestampMs,
            vendor: matchedVendor.vendorName,
            vendorName: matchedVendor.vendorName
          }
        : null;
    })
    .filter((row) => row !== null) as Array<Record<string, unknown>>)
    .slice(0, 25);
  const embeddedContentSummary = summarizeEmbeddedContentEvidence(preconsentIframeEvents, preconsentRequests);
  const fingerprintingRuntimeEvidence = browserApiAccessRows(bundle);
  const fingerprintingEvidenceSummary = summarizeFingerprintingEvidence(bundle);
  const sessionReplayEvidenceSummary = summarizeSessionReplayEvidence(reportableVendorRows, preconsentRequests, requestPurposeRows);
  const cookieWriteObservations = cookieEvents.map((event) => ({
    beforeConsent: event.consentStateAtTime === "pre_consent",
    category: event.cookiePurpose ?? "unknown",
    cookieName: event.cookieName,
    domain: event.cookieDomain ?? event.hostname,
    firstObservedAtMs: event.timestampMs,
    initiatorDomain: event.hostname,
    initiatorUrl: event.url,
    initiatorVendor: reportableVendorRows[0]?.vendorName ?? null,
    nonEssential: event.cookiePurpose !== "security",
    party: event.cookieParty ?? (event.thirdParty ? "third_party" : "first_party"),
    setAtMs: event.timestampMs,
    setMethod: event.operation ?? "cookie_event",
    thirdParty: event.thirdParty === true || event.cookieParty === "third_party",
    timestampMs: event.timestampMs,
    timingEvidence: event.consentStateAtTime === "pre_consent" ? "before_consent_cookie_write" : "observed_cookie_write"
  }));
  const hybridRuntimeEvidence = {
    consentSummary: {
      bannerPresent: consentSurfaceLikelyPresent,
      firstVisibleMs: cmp?.observedAtMs ?? null,
      cmpFrameworkSignalObserved: Boolean(cmpVendorName),
      cmpRuntimeSignalLabels: cmpSignalLabels,
      cookieNoticeObserved: consentSurfaceLikelyPresent,
      requestsBeforeAnyConsentAction: preconsentRequests.length > 0
    },
    cookieNoticeObserved: consentSurfaceLikelyPresent,
    cmpFrameworkSignalObserved: Boolean(cmpVendorName),
    cmpRuntimeSignalLabels: cmpSignalLabels,
    ...(consentRuntimeEvidenceReportable ? {
      firstLayerConsentChoices: retainedFirstLayerConsentChoices,
      first_layer_consent_choices: retainedFirstLayerConsentChoices
    } : {}),
    cookieWriteObservations,
    networkSummary: {
      preConsentRequestCount: preconsentRequests.length,
      preConsentThirdPartyRequestCount: preconsentRequests.length,
      thirdPartyDomainCount: thirdPartyDomains.length,
      thirdPartyRequestCount,
      totalRequestCount: networkEvents.length
    },
    requestObservations: networkEvents.slice(0, 200).map((event) => ({
      collectionEndpointObserved: event.collectionEndpointObserved === true,
      domain: event.hostname ?? hostnameFromUrl(event.url),
      preConsent: event.consentStateAtTime === "pre_consent",
      requestUrl: requestUrl(event),
      thirdParty: event.thirdParty === true || event.isThirdParty === true,
      timestampMs: event.timestampMs,
      url: requestUrl(event)
    })),
    requestPurposeClassificationConfidence: requestPurposeRows,
    requestToVendorObservations: reportableVendorRows.map((vendor) => ({
      category: vendor.vendorCategory,
      hostname: vendor.scriptHost,
      observedVia: vendor.observedVia,
      preConsent: true,
      regulatoryRelevance: vendor.regulatoryRelevance,
      vendor: vendor.vendorName
    })),
    embeddedContentSummary,
    embedded_content_summary: embeddedContentSummary,
    fingerprintingEvidenceSummary,
    fingerprinting_evidence_summary: fingerprintingEvidenceSummary,
    fingerprintingRuntimeEvidence,
    fingerprinting_runtime_evidence: fingerprintingRuntimeEvidence,
    iframeSummary: {
      frameHostnames: uniqueStrings(preconsentIframeEvents.map((event) => event.hostname)),
      iframeEvents: preconsentIframeEvents,
      preConsentIframeCount: preconsentIframeEvents.length,
      thirdPartyPreConsentIframeCount: preconsentIframeEvents.filter((event) => event.thirdParty).length
    },
    sessionReplayEvidenceSummary,
    session_replay_evidence_summary: sessionReplayEvidenceSummary,
    storageSummary: {
      cookiesBeforeConsentCount,
      cookiesSeenCount: cookieNames.length,
      thirdPartyCookieBeforeConsentCount: preconsentCookies.filter((event) => event.cookieParty === "third_party" || event.thirdParty === true).length
    },
    timelineMarkers: {
      firstCmpVisibleMs: cmp?.observedAtMs ?? null,
      firstNonEssentialRequestMs: firstNumber(...preconsentRequests.map((event) => event.timestampMs)),
      firstRequestMs: firstNumber(...networkEvents.map((event) => event.timestampMs)),
      firstTrackingCookieSetMs: firstNumber(...preconsentCookies.map((event) => event.timestampMs)),
      timelineConfidence: "direct_v2_runtime"
    },
    vendorSummary: {
      advertisingVendors: uniqueStrings(advertisingVendors.map((vendor) => vendor.vendorName)),
      advertisingRetargetingVendors: uniqueStrings(advertisingRetargetingVendors.map((vendor) => vendor.vendorName)),
      analyticsVendors: uniqueStrings(analyticsVendors.map((vendor) => vendor.vendorName)),
      normalizedVendors: uniqueStrings(reportableVendorRows.map((vendor) => vendor.vendorName)),
      preConsentVendorCount: reportableVendorRows.length,
      retargetingBehavioralAdvertisingVendors: uniqueStrings(retargetingBehavioralAdvertisingVendors.map((vendor) => vendor.vendorName)),
      rawThirdPartyDomains: thirdPartyDomains,
      vendorCategoryCounts
    }
  };
  const runtimeArtifacts = {
    ...(scanRecord.runtimeArtifacts ?? {}),
    local_v2_dag_scan_core_duration_ms: durationMsFromTimestamps(bundle.startedAt, bundle.completedAt),
    ...(localV2NoGo ? {
      scanNoGoAssessment: localV2NoGo.scanNoGoAssessment,
      scan_no_go_assessment: localV2NoGo.scanNoGoAssessment,
      visualAccessReview: localV2NoGo.visualAccessReview,
      visual_access_review: localV2NoGo.visualAccessReview
    } : {}),
    consent_audit_completed: true,
    consent_baseline_tracker_evidence_urls: runtimeEvidenceReportable ? preconsentRequestUrls : [],
    consent_baseline_tracker_vendor_names: runtimeEvidenceReportable ? uniqueStrings(reportableVendorRows.map((vendor) => vendor.vendorName)) : [],
    consent_preconsent_violation_count: runtimeEvidenceReportable ? Math.max(preconsentRequests.length, reportableVendorRows.length) : 0,
    collection_surface_count: collectionSurfaceSummary.collectionSurfaceCount,
    collection_surface_observed: collectionSurfaceSummary.collectionSurfacesObserved,
    collectionSurfaceSummary,
    collection_surface_summary: collectionSurfaceSummary,
    consentActionableChoiceObserved: consentRuntimeEvidenceReportable ? Boolean(cmpVendorName) : null,
    consentSurfaceObserved: consentRuntimeEvidenceReportable ? consentSurfaceLikelyPresent : null,
    consent_actionable_choice_observed: consentRuntimeEvidenceReportable ? Boolean(cmpVendorName) : null,
    consent_surface_observed: consentRuntimeEvidenceReportable ? consentSurfaceLikelyPresent : null,
    cookieNoticeObserved: consentRuntimeEvidenceReportable ? consentSurfaceLikelyPresent : null,
    cookie_notice_observed: consentRuntimeEvidenceReportable ? consentSurfaceLikelyPresent : null,
    ...(cookieSurface ? { cookiePolicyPresent: true, cookie_policy_present: true } : {}),
    ...(consentRuntimeEvidenceReportable && cmpVendorName ? {
      cmpFrameworkSignalObserved: true,
      cmpRuntimeSignalLabels: cmpSignalLabels,
      cmp_framework_signal_observed: true,
      cmp_runtime_signal_labels: cmpSignalLabels,
      cmp_vendor_name: cmpVendorName
    } : {}),
    ...(consentRuntimeEvidenceReportable ? {
      firstLayerConsentChoices: retainedFirstLayerConsentChoices,
      first_layer_consent_choices: retainedFirstLayerConsentChoices,
      rejectPathDepthAndAvailability: {
        completeRejectPathAvailable: retainedFirstLayerConsentChoices.rejectControlObserved,
        completeRejectPathDetected: retainedFirstLayerConsentChoices.rejectControlObserved,
        firstLayerCookieConsentBannerObserved: firstLayerConsentControlInventoryRetained,
        firstLayerConsentChoices: retainedFirstLayerConsentChoices,
        gdprEprivacyConsentSurfaceObserved: firstLayerConsentControlInventoryRetained ? "confirmed" : "unconfirmed",
        layerInspected: retainedFirstLayerConsentChoices.layerInspected,
        rejectAvailableOnFirstLayer: retainedFirstLayerConsentChoices.rejectControlObserved,
        rejectEquivalentFound: retainedFirstLayerConsentChoices.rejectControlObserved,
        rejectControlObserved: retainedFirstLayerConsentChoices.rejectControlObserved,
        visibleRejectLabels: retainedFirstLayerConsentChoices.rejectLabels
      },
      reject_path_depth_and_availability: {
        complete_reject_path_available: retainedFirstLayerConsentChoices.rejectControlObserved,
        complete_reject_path_detected: retainedFirstLayerConsentChoices.rejectControlObserved,
        first_layer_cookie_consent_banner_observed: firstLayerConsentControlInventoryRetained,
        first_layer_consent_choices: retainedFirstLayerConsentChoices,
        gdpr_eprivacy_consent_surface_observed: firstLayerConsentControlInventoryRetained ? "confirmed" : "unconfirmed",
        layer_inspected: retainedFirstLayerConsentChoices.layerInspected,
        reject_available_on_first_layer: retainedFirstLayerConsentChoices.rejectControlObserved,
        reject_equivalent_found: retainedFirstLayerConsentChoices.rejectControlObserved,
        reject_control_observed: retainedFirstLayerConsentChoices.rejectControlObserved,
        visible_reject_labels: retainedFirstLayerConsentChoices.rejectLabels
      }
    } : {}),
    consentTimeline: hybridRuntimeEvidence.timelineMarkers,
    consent_timeline: hybridRuntimeEvidence.timelineMarkers,
    advertising_vendor_count: advertisingVendors.length,
    advertising_vendor_names: uniqueStrings(advertisingVendors.map((vendor) => vendor.vendorName)),
    advertisingRetargetingVendorCount: advertisingRetargetingVendors.length,
    advertisingRetargetingVendorNames: uniqueStrings(advertisingRetargetingVendors.map((vendor) => vendor.vendorName)),
    advertising_retargeting_vendor_count: advertisingRetargetingVendors.length,
    advertising_retargeting_vendor_names: uniqueStrings(advertisingRetargetingVendors.map((vendor) => vendor.vendorName)),
    retargeting_behavioral_advertising_vendor_count: retargetingBehavioralAdvertisingVendors.length,
    retargeting_behavioral_advertising_vendor_names: uniqueStrings(retargetingBehavioralAdvertisingVendors.map((vendor) => vendor.vendorName)),
    retargetingBehavioralAdvertisingVendorCount: retargetingBehavioralAdvertisingVendors.length,
    retargetingBehavioralAdvertisingVendorNames: uniqueStrings(retargetingBehavioralAdvertisingVendors.map((vendor) => vendor.vendorName)),
    analytics_vendor_count: analyticsVendors.length,
    analytics_vendor_names: uniqueStrings(analyticsVendors.map((vendor) => vendor.vendorName)),
    domainVendorRegistry: reportableVendorRows.map((vendor) => ({
      endpointHostname: vendor.scriptHost,
      observedVia: vendor.observedVia,
      vendorDisplayCategory: vendor.vendorDisplayCategory,
      vendorCategory: vendor.vendorCategory,
      vendorName: vendor.vendorName
    })),
    embeddedContentSummary,
    embedded_content_summary: embeddedContentSummary,
    fingerprintingEvidenceSummary,
    fingerprinting_evidence_summary: fingerprintingEvidenceSummary,
    fingerprintingRuntimeEvidence,
    fingerprinting_runtime_evidence: fingerprintingRuntimeEvidence,
    hybridRuntimeEvidence: hybridRuntimeEvidence,
    hybrid_runtime_evidence: hybridRuntimeEvidence,
    iframeEvents,
    iframe_events: iframeEvents,
    initial_cookie_count: cookieNames.length,
    initial_cookie_domains: uniqueStrings(cookieEvents.map((event) => event.cookieDomain ?? event.hostname)),
    initial_cookie_names: cookieNames,
    cookies_before_consent_count: cookiesBeforeConsentCount,
    cookieWriteObservations,
    cookie_write_observations: cookieWriteObservations,
    key_page_discovery_summary: {
      pageSummaries: [privacySurface, termsSurface, cookieSurface]
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map(({ pageUrl, surface }) => ({
          bestCandidateUrl: pageUrl ?? surface.normalizedUrl ?? surface.url,
          pageType: surface.surfaceType,
          successfulUrl: pageUrl ?? surface.normalizedUrl ?? surface.url,
          surfaceDetected: true,
          surfaceState: "linked_and_verified"
        }))
    },
    requestPurposeClassificationConfidence: requestPurposeRows,
    request_purpose_classification_confidence: requestPurposeRows,
    sessionReplayEvidenceSummary,
    session_replay_evidence_summary: sessionReplayEvidenceSummary,
    policyDisclosureSummary: policySurfaceSummary,
    policy_disclosure_summary: policySurfaceSummary,
    runtimeCoverageStatus: effectiveRuntimeCoverageStatus,
    runtime_coverage_status: effectiveRuntimeCoverageStatus,
    runtimeCountsRetained: effectiveRuntimeCountsRetained,
    runtime_counts_retained: effectiveRuntimeCountsRetained,
    runtimeLimitationKeys: effectiveRuntimeLimitationKeys,
    runtime_limitation_keys: effectiveRuntimeLimitationKeys,
    visualCaptureFailureReason: visualCapture.failureReason,
    visualCaptureMethod: visualCapture.captureMethod,
    visualCaptureNotes: visualCapture.notes,
    visualCaptureStatus: visualCapture.status,
    visual_capture_failure_reason: visualCapture.failureReason,
    visual_capture_method: visualCapture.captureMethod,
    visual_capture_notes: visualCapture.notes,
    visual_capture_status: visualCapture.status,
    visual_capture_technical_limit: visualCaptureUnavailable,
    thirdPartyRequestCount: thirdPartyRequestCount,
    thirdPartyRequestDomains: thirdPartyDomains,
    third_party_request_count: thirdPartyRequestCount,
    third_party_request_domains: thirdPartyDomains,
    visual_evidence_artifacts: (bundle.screenshots ?? [])
      .filter(isPreConsentScreenshotArtifact)
      .sort((left, right) => preConsentScreenshotRank(left) - preConsentScreenshotRank(right))
      .flatMap((screenshot) => {
      if (!isPreConsentScreenshotArtifact(screenshot)) {
        return [];
      }
      const capturedErrorShell = isPreConsentErrorShellScreenshot(bundle, screenshot);
      const storagePointer = localV2ScreenshotStoragePointer({
        scanArtifactUri: options.scanArtifactUri,
        scanId: scanRecord.scan.id,
        screenshotPath: screenshot.path
      });
      return [{
        bucket: storagePointer.bucket,
        capture_method: getString((screenshot as { captureMethod?: unknown }).captureMethod) ?? visualCapture.captureMethod ?? null,
        capture_step: "initial_load",
        consent_state: screenshot.consentStateAtTime ?? "pre_consent",
        final_url: screenshot.url ?? bundle.normalizedUrl ?? bundle.url,
        id: screenshot.artifactId === "screenshot_pre_consent_full_page"
          ? "local_v2:screenshot_pre_consent_full_page"
          : "local_v2:screenshot_pre_consent",
        interaction_state: "none",
        key: capturedErrorShell ? null : storagePointer.key,
        mime_type: "image/png",
        page_url: screenshot.url ?? bundle.normalizedUrl ?? bundle.url,
        status: capturedErrorShell ? "capture_failed" : "available",
        status_reason: capturedErrorShell ? "pre_consent_error_shell_captured" : null
      }];
    })
  };
  const snapshot = {
    ...(scanRecord.snapshot ?? {}),
    certscore_overall: localV2NoGo ? null : score,
    consent_maturity_score: localV2NoGo ? null : Math.max(0, score - 5),
    consent_score: localV2NoGo ? null : Math.max(0, score - 10),
    cookie_banner_present: consentRuntimeEvidenceReportable ? consentSurfaceLikelyPresent : null,
    cookie_count_total: runtimeEvidenceReportable ? cookieNames.length : 0,
    cookies_before_consent_count: runtimeEvidenceReportable ? cookiesBeforeConsentCount : 0,
    data_collection_risk_score: runtimeEvidenceReportable ? Math.min(100, Math.max(20, thirdPartyRequestCount)) : null,
    domain: requestedHost,
    final_effective_url: bundle.normalizedUrl ?? bundle.url,
    final_url: bundle.normalizedUrl ?? bundle.url,
    ...(localV2NoGo ? {
      access_posture_class: "early_loss",
      block_page_classification: localV2NoGo.pageState === "access_blocked"
        ? "access_denied"
        : localV2NoGo.pageState === "visual_error_shell"
          ? "visual_error_shell"
          : "capture_failed",
      blocked_flag: true,
      challenge_suspected: true,
      coverage_level: "limited_none",
      homepage_fetch_status: "blocked",
      scan_outcome: localV2NoGo.pageState === "access_blocked"
        ? "reachability_blocked_homepage_403"
        : localV2NoGo.pageState === "visual_error_shell"
          ? "homepage_visual_error_shell"
          : "homepage_visual_capture_failed",
      stop_reason_code: localV2NoGo.pageState === "access_blocked"
        ? "reachability_blocked_homepage_403"
        : localV2NoGo.pageState === "visual_error_shell"
          ? "homepage_visual_error_shell"
          : "homepage_visual_capture_failed",
      stop_reason_detail: localV2NoGo.pageState === "access_blocked"
        ? "The retained initial-load evidence showed an access-denied or forbidden page instead of the normal public site."
        : localV2NoGo.pageState === "visual_error_shell"
          ? "The retained initial-load screenshot appeared to be a visual error shell instead of the normal public site."
          : "The scanner could not retain a usable homepage visual/runtime capture.",
      stop_reason_label: localV2NoGo.pageState === "access_blocked"
        ? "Homepage access blocked"
        : localV2NoGo.pageState === "visual_error_shell"
          ? "Homepage visual error shell"
          : "Homepage capture failed"
    } : {
      homepage_fetch_status: "success"
    }),
    legal_coverage_score: localV2NoGo ? null : score,
    pages_scanned: localV2NoGo ? 0 : Math.max(scanRecord.scan.pagesScanned, 1),
    partial_scan: true,
    preconsent_tracking_detected: runtimeEvidenceReportable ? bundle.derivedRuntimeSignals?.preConsentTrackingObserved === true || preconsentRequests.length > 0 : false,
    privacy_policy_present: Boolean(privacySurface),
    privacy_score: localV2NoGo ? null : score,
    registered_domain: rootDomain,
    runtime_counts_retained: effectiveRuntimeCountsRetained,
    runtime_coverage_status: effectiveRuntimeCoverageStatus,
    runtime_limitation_keys: effectiveRuntimeLimitationKeys,
    third_party_cookie_count: runtimeEvidenceReportable ? preconsentCookies.filter((event) => event.cookieParty === "third_party" || event.thirdParty === true).length : 0,
    third_party_cookie_set_before_consent: runtimeEvidenceReportable ? preconsentCookies.length > 0 : false,
    third_party_request_count: runtimeEvidenceReportable ? thirdPartyRequestCount : 0,
    third_party_script_domain_count: runtimeEvidenceReportable ? thirdPartyDomains.length : 0,
    tracker_count_total: runtimeEvidenceReportable ? Math.max(reportableVendorRows.length, thirdPartyDomains.length) : 0,
    tracker_vendor_count: runtimeEvidenceReportable ? reportableVendorRows.length : 0,
    tracking_before_consent_detected: runtimeEvidenceReportable ? bundle.derivedRuntimeSignals?.preConsentTrackingObserved === true || preconsentRequests.length > 0 : false,
    verified_public_surfaces_count: localV2NoGo ? 0 : policySurfaces.length,
    ...(consentRuntimeEvidenceReportable && cmpVendorName ? { cmp_vendor_name: cmpVendorName } : {}),
    ...(cookieSurface ? { cookie_policy_present: true } : {}),
    ...(termsSurface ? { terms_of_service_present: true } : {})
  };
  const policyEnrichmentRows = policySurfaces.map(({ pageUrl, surface }) => ({
    id: `local-v2-${surface.observationId}`,
    pageType: normalizePolicyPageType(surface.surfaceType),
    pageUrl: pageUrl ?? surface.normalizedUrl ?? surface.url,
    page_type: normalizePolicyPageType(surface.surfaceType),
    page_url: pageUrl ?? surface.normalizedUrl ?? surface.url,
    policyActionableFlags: surface.mentionedControls ?? [],
    policyMentions: (surface.observedTopics ?? []).map((topic) => ({ topic })),
    policySummaryShort: surface.textExcerpt ?? `${policySurfaceLabel(surface.surfaceType)} retained by local v2 DAG scan.`,
    policy_actionable_flags: surface.mentionedControls ?? [],
    policy_mentions: (surface.observedTopics ?? []).map((topic) => ({ topic })),
    policy_summary_short: surface.textExcerpt ?? `${policySurfaceLabel(surface.surfaceType)} retained by local v2 DAG scan.`
  }));
  const signalRows = (runtimeEvidenceReportable ? [
    {
      category: "privacy",
      key: "privacy.preconsent_tracking_detected",
      label: "Pre-consent tracking detected",
      primaryCategory: "privacy_consent_user_choice",
      primaryCategoryDescription: "Consent, preference, and user-choice signals",
      primaryCategoryLabel: "Privacy consent & user choice",
      subcategory: "consent",
      value: true,
      valueType: "boolean"
    },
    {
      category: "privacy",
      key: "tracking_before_consent_detected",
      label: "Tracking before consent detected",
      primaryCategory: "privacy_consent_user_choice",
      primaryCategoryDescription: "Consent, preference, and user-choice signals",
      primaryCategoryLabel: "Privacy consent & user choice",
      subcategory: "consent",
      value: true,
      valueType: "boolean"
    }
  ] : []) satisfies ScanDetailResponse["signals"];
  const unreliableRuntimeSignalKeys = new Set([
    "privacy.preconsent_tracking_detected",
    "tracking_before_consent_detected",
    "third_party_cookie_set_before_consent"
  ]);
  const baseSignals = runtimeEvidenceReportable
    ? scanRecord.signals
    : scanRecord.signals.filter((signal) => !unreliableRuntimeSignalKeys.has(signal.key));
  const existingSignalKeys = new Set(baseSignals.map((signal) => signal.key));
  const materializedSignals = [
    ...baseSignals,
    ...signalRows.filter((signal) => !existingSignalKeys.has(signal.key))
  ];
  const preconsentViolations = runtimeEvidenceReportable ? reportableVendorRows.map((vendor) => ({
    collectionEndpointType: vendor.collectionEndpointType,
    confidence: vendor.confidence,
    detectionSource: vendor.detectionSource,
    evidenceUrls: preconsentRequestUrls.filter((url) => vendor.scriptHost && url.includes(vendor.scriptHost)).slice(0, 5),
    firstPartyOrThirdParty: vendor.firstPartyOrThirdParty,
    matchedSignatureId: vendor.matchedSignatureId,
    observedVia: vendor.observedVia,
    scriptHost: vendor.scriptHost,
    vendorDisplayCategory: vendor.vendorDisplayCategory,
    vendorCategory: vendor.vendorCategory,
    vendorName: vendor.vendorName
  })) : [];

  return {
    ...scanRecord,
    pageEvidence: scanRecord.pageEvidence,
    policyEnrichment: [...scanRecord.policyEnrichment, ...policyEnrichmentRows],
    preconsentViolations: runtimeEvidenceReportable
      ? (scanRecord.preconsentViolations.length > 0 ? scanRecord.preconsentViolations : preconsentViolations)
      : [],
    primaryPolicyEnrichment: scanRecord.primaryPolicyEnrichment ?? policyEnrichmentRows.find((row) => row.pageType === "privacy_policy") ?? policyEnrichmentRows[0] ?? null,
    runtimeArtifacts,
    scan: {
      ...scanRecord.scan,
      pagesScanned: localV2NoGo ? 0 : Math.max(scanRecord.scan.pagesScanned, 1)
    },
    signals: materializedSignals,
    snapshot,
    trackerVendors: runtimeEvidenceReportable
      ? (scanRecord.trackerVendors.length > 0 ? scanRecord.trackerVendors : inventoryVendorRows)
      : []
  };
}

export async function materializeLocalV2DagScanDetail(scanRecord: ScanDetailResponse): Promise<ScanDetailResponse> {
  const input = getLocalV2DagReportInput(scanRecord);
  if (!input || scanRecord.scan.status !== "completed") {
    return scanRecord;
  }
  const shouldReadLocalOutDir = Boolean(input.outDir && shouldUseLocalV2DagScanTool());
  const localBundle = shouldReadLocalOutDir && input.outDir
    ? await readLocalV2DagBundle(input.outDir)
    : null;
  const bundle = localBundle ?? (input.scanArtifactUri
    ? await readLocalV2DagBundleFromS3(input.scanArtifactUri)
    : null);
  return bundle ? buildMaterializedLocalV2Detail(scanRecord, bundle, {
    localOutDir: shouldReadLocalOutDir ? input.outDir : null,
    scanArtifactUri: input.scanArtifactUri
  }) : scanRecord;
}
