import "server-only";

import { GetObjectCommand, S3Client, type GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { CanonicalEvidenceBundle } from "@certscore/contracts";
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
  const outDir = getString(localV2Dag?.outDir);
  const scanArtifactUri = getLocalV2DagLambdaScanArtifactUri(scanRecord);
  const normalizedUrl = getString(config.normalizedUrl);
  const hostname = getString(config.hostname) ?? scanRecord.scan.domainHostname;
  const profile = getString(v2DagParallel.profile) ?? getString(config.profile) ?? "standard";

  return {
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
  const input = getLocalV2DagReportInput(scanRecord);
  if (!input || input.scanArtifactUri) {
    return false;
  }
  if (scanRecord.scan.status !== "queued" && scanRecord.scan.status !== "running" && scanRecord.scan.status !== "processing") {
    return false;
  }

  const startedAtMs = Date.parse(scanRecord.scan.startedAt ?? scanRecord.scan.createdAt ?? "");
  if (!Number.isFinite(startedAtMs)) {
    return false;
  }

  return nowMs - startedAtMs >= 25_000;
}

export async function tryRefreshLocalV2DagLambdaResult(scanRecord: ScanDetailResponse) {
  if (!shouldAttemptLocalV2DagLambdaResultRefresh(scanRecord)) {
    return false;
  }

  try {
    const { pollLocalV2DagLambdaResultQueue } = await import("./local-v2-dag-lambda-result-poller");
    const result = await pollLocalV2DagLambdaResultQueue({
      maxMessages: 10,
      visibilityTimeoutSeconds: 30,
      waitTimeSeconds: 1
    });
    return result.handled > 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("CERTSCORE_V2_DAG_LAMBDA_RESULT_QUEUE_URL")) {
      console.warn("[web] local v2 DAG Lambda result refresh skipped", { error: message });
    }
    return false;
  }
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
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
    case "tag_manager":
    case "tracking":
      return value;
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

function resolveLocalV2OutDir(outDir: string) {
  const resolved = path.resolve(outDir);
  const roots = v2ArtifactRoots();
  const inAllowedRoot = roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
  if (!inAllowedRoot) {
    throw new Error("Local v2 DAG artifact path is outside artifacts/local-v2-dag-scans.");
  }
  return resolved;
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

function buildVendorEvidence(bundle: CanonicalEvidenceBundle) {
  const vendors = bundle.normalizedVendorObservations ?? [];
  return vendors.map((vendor) => {
    const vendorName = firstString(vendor.product, vendor.vendor, vendor.entity) ?? "Unknown vendor";
    const category = purposeToCategory(firstString(vendor.purpose));
    const evidenceHost = uniqueStrings((vendor.matchedEvidenceRefs ?? []).map((ref) => hostnameFromUrl(ref.url ?? ref.label))).find(Boolean) ?? null;
    return {
      beforeConsent: true,
      collectionEndpointType: "direct_third_party",
      confidence: typeof vendor.confidence === "number" ? vendor.confidence : 0.85,
      detectionSource: "local_v2_dag_runtime",
      firstPartyOrThirdParty: "third_party",
      matchedSignatureId: vendor.observationId ?? null,
      scriptHost: evidenceHost,
      vendorCategory: category,
      vendorName
    };
  }).filter((vendor) => vendor.vendorCategory !== "cmp");
}

function vendorRowsForCategories(
  vendors: ReturnType<typeof buildVendorEvidence>,
  categories: string[]
) {
  const categorySet = new Set(categories);
  return vendors.filter((vendor) => categorySet.has(vendor.vendorCategory));
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

  return {
    coverageRetained: true,
    embeddedContentHosts: uniqueStrings(observations.map((event) => event.hostname)),
    embeddedContentObservationCount: observations.length,
    embeddedContentObserved: observations.length > 0,
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
  const observedTopics = uniqueStrings(article13Surfaces.flatMap((row) => row.surface.observedTopics ?? []));
  const article13DisclosureSignals = article13Surfaces.flatMap((row) =>
    (row.surface.article13DisclosureSignals ?? []).map((signal) => ({
      confidence: signal.confidence,
      disclosureType: signal.disclosureType,
      evidenceText: firstString(signal.evidenceText),
      source: signal.source,
      status: signal.status,
      surfaceUrl: row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url
    }))
  );
  const mentionedControls = uniqueStrings(policySurfaces.flatMap((row) => row.surface.mentionedControls ?? []));
  const processingErrorObserved = /processing error|privacy center.*error/i.test(text);
  return {
    article13DisclosureSignals,
    article13DisclosureTypesObserved: uniqueStrings(article13DisclosureSignals
      .filter((signal) => signal.status === "observed")
      .map((signal) => signal.disclosureType)),
    article13DisclosureTypesPartial: uniqueStrings(article13DisclosureSignals
      .filter((signal) => signal.status === "partial")
      .map((signal) => signal.disclosureType)),
    mentionedControls,
    observedTopics,
    policySurfaceCount: policySurfaces.length,
    privacyPolicyPresent: article13Surfaces.length > 0,
    privacyPolicyTextCharacterCount: text.length,
    privacyPolicyUrls: uniqueStrings(article13Surfaces.map((row) => row.pageUrl ?? row.surface.normalizedUrl ?? row.surface.url)),
    processingErrorObserved,
    retainedPrivacyPolicyTextExcerpt: text.slice(0, 1_000)
  };
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

function buildMaterializedLocalV2Detail(scanRecord: ScanDetailResponse, bundle: CanonicalEvidenceBundle): ScanDetailResponse {
  const requestedHost = scanRecord.scan.domainHostname ?? hostnameFromUrl(bundle.normalizedUrl ?? bundle.url);
  const rootDomain = registrableDomain(requestedHost);
  const networkEvents = bundle.networkEvents ?? [];
  const cookieEvents = bundle.cookieEvents ?? [];
  const vendorRows = buildVendorEvidence(bundle);
  const thirdPartyRequests = networkEvents.filter((event) => event.thirdParty === true || event.isThirdParty === true);
  const thirdPartyDomains = uniqueStrings(thirdPartyRequests.map((event) => event.hostname ?? hostnameFromUrl(event.url)));
  const preconsentRequests = thirdPartyRequests.filter((event) => event.consentStateAtTime === "pre_consent");
  const preconsentRequestUrls = uniqueStrings(preconsentRequests.map((event) => requestUrl(event)));
  const preconsentCookies = cookieEvents.filter((event) => event.consentStateAtTime === "pre_consent");
  const cookieNames = uniqueStrings(cookieEvents.map((event) => cookieName(event)));
  const preconsentCookieNames = uniqueStrings(preconsentCookies.map((event) => cookieName(event)));
  const advertisingRetargetingVendors = vendorRowsForCategories(vendorRows, ["advertising", "retargeting", "adtech", "marketing"]);
  const analyticsVendors = vendorRowsForCategories(vendorRows, ["analytics", "measurement"]);
  const iframeEvents = sanitizeIframeEvents(bundle, rootDomain);
  const preconsentIframeEvents = iframeEvents.filter((event) => event.preConsent);
  const cmp = bundle.cmpRuntimeObservations?.[0] ?? null;
  const cmpVendorName = firstString(cmp?.product, cmp?.vendor, cmp?.entity);
  const cmpSignalLabels = uniqueStrings((cmp?.signals ?? []).map((signal) =>
    firstString(signal.matchedValueRedacted, signal.matchedField, signal.signalType)
  ));
  const consentSurfaceLikelyPresent = Boolean(cmpVendorName ?? bundle.derivedRuntimeSignals?.consentBannerLikelyPresent);
  const firstLayerConsentChoices = summarizeFirstLayerConsentChoices(bundle);
  const policySurfaces = dedupePolicySurfaces(
    bundle.policySurfaceObservations ?? [],
    bundle.normalizedUrl ?? bundle.url ?? (requestedHost ? `https://${requestedHost}/` : null)
  );
  const policySurfaceSummary = summarizePolicySurfaces(policySurfaces, rootDomain);
  const collectionSurfaceSummary = summarizeCollectionSurfaces(bundle);
  const privacySurface = policySurfaces.find((row) => row.surface.surfaceType === "privacy_policy");
  const termsSurface = policySurfaces.find((row) => row.surface.surfaceType === "terms");
  const cookieSurface = policySurfaces.find((row) => row.surface.surfaceType === "cookie_policy");
  const thirdPartyRequestCount =
    bundle.runtimeCoverage?.observationCounts.thirdPartyRequests ?? thirdPartyRequests.length;
  const cookiesBeforeConsentCount =
    bundle.runtimeCoverage?.observationCounts.cookiesBeforeConsent ?? preconsentCookies.length;
  const vendorCategoryCounts = vendorRows.reduce<Record<string, number>>((counts, vendor) => {
    counts[vendor.vendorCategory] = (counts[vendor.vendorCategory] ?? 0) + 1;
    return counts;
  }, {});
  const score =
    thirdPartyRequestCount > 0 || cookiesBeforeConsentCount > 0
      ? Math.max(35, Math.min(72, 82 - Math.min(24, Math.round(thirdPartyRequestCount / 8)) - Math.min(18, cookiesBeforeConsentCount)))
      : 88;
  const requestPurposeRows = (preconsentRequests
    .map((event) => {
      const matchedVendor = vendorRows.find((vendor) => {
        const host = hostnameFromUrl(event.hostname ?? event.url);
        return Boolean(host && vendor.scriptHost && (host === vendor.scriptHost || host.endsWith(`.${vendor.scriptHost}`)));
      }) ?? vendorRows[0] ?? null;
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
  const sessionReplayEvidenceSummary = summarizeSessionReplayEvidence(vendorRows, preconsentRequests, requestPurposeRows);
  const cookieWriteObservations = cookieEvents.map((event) => ({
    beforeConsent: event.consentStateAtTime === "pre_consent",
    category: event.cookiePurpose ?? "unknown",
    cookieName: event.cookieName,
    domain: event.cookieDomain ?? event.hostname,
    initiatorDomain: event.hostname,
    initiatorUrl: event.url,
    initiatorVendor: vendorRows[0]?.vendorName ?? null,
    nonEssential: event.cookiePurpose !== "security",
    party: event.cookieParty ?? (event.thirdParty ? "third_party" : "first_party"),
    setMethod: event.operation ?? "cookie_event",
    thirdParty: event.thirdParty === true || event.cookieParty === "third_party",
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
    ...(firstLayerConsentChoices ? {
      firstLayerConsentChoices,
      first_layer_consent_choices: firstLayerConsentChoices
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
    requestToVendorObservations: vendorRows.map((vendor) => ({
      category: vendor.vendorCategory,
      hostname: vendor.scriptHost,
      preConsent: true,
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
      advertisingRetargetingVendors: uniqueStrings(advertisingRetargetingVendors.map((vendor) => vendor.vendorName)),
      analyticsVendors: uniqueStrings(analyticsVendors.map((vendor) => vendor.vendorName)),
      normalizedVendors: uniqueStrings(vendorRows.map((vendor) => vendor.vendorName)),
      preConsentVendorCount: vendorRows.length,
      rawThirdPartyDomains: thirdPartyDomains,
      vendorCategoryCounts
    }
  };
  const runtimeArtifacts = {
    ...(scanRecord.runtimeArtifacts ?? {}),
    local_v2_dag_scan_core_duration_ms: durationMsFromTimestamps(bundle.startedAt, bundle.completedAt),
    consent_audit_completed: true,
    consent_baseline_tracker_evidence_urls: preconsentRequestUrls,
    consent_baseline_tracker_vendor_names: uniqueStrings(vendorRows.map((vendor) => vendor.vendorName)),
    consent_preconsent_violation_count: Math.max(preconsentRequests.length, vendorRows.length),
    collection_surface_count: collectionSurfaceSummary.collectionSurfaceCount,
    collection_surface_observed: collectionSurfaceSummary.collectionSurfacesObserved,
    collectionSurfaceSummary,
    collection_surface_summary: collectionSurfaceSummary,
    consentActionableChoiceObserved: Boolean(cmpVendorName),
    consentSurfaceObserved: consentSurfaceLikelyPresent,
    consent_actionable_choice_observed: Boolean(cmpVendorName),
    consent_surface_observed: consentSurfaceLikelyPresent,
    cookieNoticeObserved: consentSurfaceLikelyPresent,
    cookie_notice_observed: consentSurfaceLikelyPresent,
    ...(cookieSurface ? { cookiePolicyPresent: true, cookie_policy_present: true } : {}),
    ...(cmpVendorName ? {
      cmpFrameworkSignalObserved: true,
      cmpRuntimeSignalLabels: cmpSignalLabels,
      cmp_framework_signal_observed: true,
      cmp_runtime_signal_labels: cmpSignalLabels,
      cmp_vendor_name: cmpVendorName
    } : {}),
    ...(firstLayerConsentChoices ? {
      firstLayerConsentChoices,
      first_layer_consent_choices: firstLayerConsentChoices,
      rejectPathDepthAndAvailability: {
        completeRejectPathAvailable: firstLayerConsentChoices.rejectControlObserved,
        completeRejectPathDetected: firstLayerConsentChoices.rejectControlObserved,
        firstLayerConsentChoices,
        layerInspected: firstLayerConsentChoices.layerInspected,
        rejectAvailableOnFirstLayer: firstLayerConsentChoices.rejectControlObserved,
        rejectEquivalentFound: firstLayerConsentChoices.rejectControlObserved,
        visibleRejectLabels: firstLayerConsentChoices.rejectLabels
      },
      reject_path_depth_and_availability: {
        complete_reject_path_available: firstLayerConsentChoices.rejectControlObserved,
        complete_reject_path_detected: firstLayerConsentChoices.rejectControlObserved,
        first_layer_consent_choices: firstLayerConsentChoices,
        layer_inspected: firstLayerConsentChoices.layerInspected,
        reject_available_on_first_layer: firstLayerConsentChoices.rejectControlObserved,
        reject_equivalent_found: firstLayerConsentChoices.rejectControlObserved,
        visible_reject_labels: firstLayerConsentChoices.rejectLabels
      }
    } : {}),
    consentTimeline: hybridRuntimeEvidence.timelineMarkers,
    consent_timeline: hybridRuntimeEvidence.timelineMarkers,
    advertising_retargeting_vendor_count: advertisingRetargetingVendors.length,
    advertising_retargeting_vendor_names: uniqueStrings(advertisingRetargetingVendors.map((vendor) => vendor.vendorName)),
    analytics_vendor_count: analyticsVendors.length,
    analytics_vendor_names: uniqueStrings(analyticsVendors.map((vendor) => vendor.vendorName)),
    domainVendorRegistry: vendorRows.map((vendor) => ({
      endpointHostname: vendor.scriptHost,
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
    thirdPartyRequestCount: thirdPartyRequestCount,
    thirdPartyRequestDomains: thirdPartyDomains,
    third_party_request_count: thirdPartyRequestCount,
    third_party_request_domains: thirdPartyDomains,
    visual_evidence_artifacts: (bundle.screenshots ?? []).flatMap((screenshot) => {
      if (screenshot.artifactId !== "screenshot_pre_consent") {
        return [];
      }
      return [{
        capture_step: "initial_load",
        consent_state: screenshot.consentStateAtTime ?? "pre_consent",
        final_url: screenshot.url ?? bundle.normalizedUrl ?? bundle.url,
        id: "local_v2:screenshot_pre_consent",
        interaction_state: "none",
        key: `local-v2-dag-scans/${scanRecord.scan.id}/screenshot-pre-consent.png`,
        mime_type: "image/png",
        page_url: screenshot.url ?? bundle.normalizedUrl ?? bundle.url,
        status: "available"
      }];
    })
  };
  const snapshot = {
    ...(scanRecord.snapshot ?? {}),
    certscore_overall: score,
    consent_maturity_score: Math.max(0, score - 5),
    consent_score: Math.max(0, score - 10),
    cookie_banner_present: consentSurfaceLikelyPresent,
    cookie_count_total: cookieNames.length,
    cookies_before_consent_count: cookiesBeforeConsentCount,
    data_collection_risk_score: Math.min(100, Math.max(20, thirdPartyRequestCount)),
    domain: requestedHost,
    final_effective_url: bundle.normalizedUrl ?? bundle.url,
    final_url: bundle.normalizedUrl ?? bundle.url,
    homepage_fetch_status: "success",
    legal_coverage_score: score,
    pages_scanned: Math.max(scanRecord.scan.pagesScanned, 1),
    partial_scan: true,
    preconsent_tracking_detected: bundle.derivedRuntimeSignals?.preConsentTrackingObserved === true || preconsentRequests.length > 0,
    privacy_policy_present: Boolean(privacySurface),
    privacy_score: score,
    registered_domain: rootDomain,
    third_party_cookie_count: preconsentCookies.filter((event) => event.cookieParty === "third_party" || event.thirdParty === true).length,
    third_party_cookie_set_before_consent: preconsentCookies.length > 0,
    third_party_request_count: thirdPartyRequestCount,
    third_party_script_domain_count: thirdPartyDomains.length,
    tracker_count_total: Math.max(vendorRows.length, thirdPartyDomains.length),
    tracker_vendor_count: vendorRows.length,
    tracking_before_consent_detected: bundle.derivedRuntimeSignals?.preConsentTrackingObserved === true || preconsentRequests.length > 0,
    verified_public_surfaces_count: policySurfaces.length,
    ...(cmpVendorName ? { cmp_vendor_name: cmpVendorName } : {}),
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
  const signalRows = [
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
  ] satisfies ScanDetailResponse["signals"];
  const existingSignalKeys = new Set(scanRecord.signals.map((signal) => signal.key));
  const materializedSignals = [
    ...scanRecord.signals,
    ...signalRows.filter((signal) => !existingSignalKeys.has(signal.key))
  ];
  const preconsentViolations = vendorRows.map((vendor) => ({
    collectionEndpointType: vendor.collectionEndpointType,
    confidence: vendor.confidence,
    detectionSource: vendor.detectionSource,
    evidenceUrls: preconsentRequestUrls.filter((url) => vendor.scriptHost && url.includes(vendor.scriptHost)).slice(0, 5),
    firstPartyOrThirdParty: vendor.firstPartyOrThirdParty,
    matchedSignatureId: vendor.matchedSignatureId,
    scriptHost: vendor.scriptHost,
    vendorCategory: vendor.vendorCategory,
    vendorName: vendor.vendorName
  }));

  return {
    ...scanRecord,
    pageEvidence: scanRecord.pageEvidence,
    policyEnrichment: [...scanRecord.policyEnrichment, ...policyEnrichmentRows],
    preconsentViolations: scanRecord.preconsentViolations.length > 0 ? scanRecord.preconsentViolations : preconsentViolations,
    primaryPolicyEnrichment: scanRecord.primaryPolicyEnrichment ?? policyEnrichmentRows.find((row) => row.pageType === "privacy_policy") ?? policyEnrichmentRows[0] ?? null,
    runtimeArtifacts,
    scan: {
      ...scanRecord.scan,
      pagesScanned: Math.max(scanRecord.scan.pagesScanned, 1)
    },
    signals: materializedSignals,
    snapshot,
    trackerVendors: scanRecord.trackerVendors.length > 0 ? scanRecord.trackerVendors : vendorRows
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
  return bundle ? buildMaterializedLocalV2Detail(scanRecord, bundle) : scanRecord;
}
