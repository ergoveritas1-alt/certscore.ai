#!/usr/bin/env node
/**
 * Offline eval-only corpus builder for CertScore.ai finding review.
 *
 * This script queries the local/dev database for recent scan results,
 * rebuilds unified findings and executive projections using the exact
 * same production logic, then exports positive and challenge examples
 * for independent LLM review.
 *
 * SAFETY:
 * - Read-only DB access only (uses getReadPool via { readOnly: true }).
 * - No writes to production tables.
 * - No LLM calls in the scan path.
 * - Does not modify production logic, thresholds, or policies.
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import process from "node:process";
import {
  cleanupScanArtifactDirectory,
  getScanArtifactRetentionConfig
} from "../../../../packages/shared/src/utils/artifact-retention";
import { closePools, query, queryOne } from "@website-signal-risk-scanner/db";
import { loadScanRecord, type ScanRow } from "../report-production-finding-frequency";
import { projectExecutiveFindingsFromUnifiedPackets } from "../../lib/scans/executive-findings-projection";
import { buildRegulatoryRiskSource } from "../../lib/scans/regulatory-risk-source";
import { buildMergedSignalRecords } from "../../lib/scans/merged-signals";
import {
  withHybridRuntimeArtifactFallbacks,
  getHybridDerivedTrackerVendors
} from "../../lib/scans/hybrid-runtime-evidence";
import { getPrimaryPolicyEnrichmentRow } from "../../lib/scans/policy-enrichment-row";
import {
  getPrimaryCategoryDescription,
  getPrimaryCategoryLabel,
  mapSignalKeyToTaxonomy
} from "../../lib/scans/signal-taxonomy";
import type { UnifiedFindingDisplayPacket } from "../../lib/scans/unified-findings";
import type { CertScoreFinding } from "../../lib/scans/finding-registry";

/* ------------------------------------------------------------------ */
/* CLI args                                                           */
/* ------------------------------------------------------------------ */

function getArgValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function getNumberArg(flag: string, fallback: number): number {
  const raw = getArgValue(flag);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getDateArg(flag: string): Date | null {
  const raw = getArgValue(flag);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type CorpusConfig = {
  since: Date | null;
  limitScans: number;
  topNFindings: number;
  positivePerFinding: number;
  challengePerFinding: number;
  findingId: string | null;
  outDir: string;
  dryRun: boolean;
  includeSuppressed: boolean;
  includeMixed: boolean;
  includeAnonymousScans: boolean;
};

export function isArtifactExportAllowed(dryRun: boolean, env: Record<string, string | undefined> = process.env): boolean {
  return dryRun || getScanArtifactRetentionConfig(env).enabled;
}

export type ScanContext = {
  scanId: string;
  domain: string | null;
  requestedUrl: string | null;
  finalUrl: string | null;
  createdAt: string;
  scannedAt: string | null;
  snapshot: Record<string, unknown> | null;
  runtimeArtifacts: Record<string, unknown> | null;
  unifiedFindings: UnifiedFindingDisplayPacket[];
  executiveProjection: ReturnType<typeof projectExecutiveFindingsFromUnifiedPackets>;
  regulatoryRisk: ReturnType<typeof buildRegulatoryRiskSource>;
};

export type EnrichedFinding = {
  scanContext: ScanContext;
  packet: UnifiedFindingDisplayPacket;
  executiveFinding: CertScoreFinding | null;
  status: string;
};

type PositiveExample = {
  example_type: "positive";
  scan_id: string;
  domain: string | null;
  requested_url: string | null;
  final_url: string | null;
  created_at: string;
  scanned_at: string | null;
  finding_id: string;
  finding_label: string;
  section: string;
  confidence: string;
  direct_vs_inferred: string;
  surface_priority: number;
  appeared_in_executive_summary: boolean;
  regulatory_lanes: string[];
  normalized_concern_ids: string[];
  concern_policy_rule_ids: string[];
  evidence: {
    counts: Record<string, number>;
    evidence_snippets: string[];
    vendors: string[];
    request_domains: string[];
    request_samples: string[];
    cookie_samples: string[];
    consent_summary: Record<string, unknown>;
    fingerprinting_or_device_signals: Record<string, unknown>;
    policy_anchors: string[];
    runtime_anchors: string[];
    conflict_bridge: string | null;
  };
  coverage_flags: string[];
  coverage_limitation_evidence: Record<string, unknown> | null;
  known_limitations: string[];
  selection_reason: string;
};

type ChallengeExample = {
  example_type: "challenge";
  scan_id: string;
  domain: string | null;
  requested_url: string | null;
  final_url: string | null;
  created_at: string;
  scanned_at: string | null;
  finding_id: string;
  candidate_finding_id: string;
  finding_label: string;
  observed_status:
    | "weak_positive"
    | "downgraded"
    | "suppressed"
    | "review_only"
    | "support_only"
    | "near_miss"
    | "ambiguous_positive";
  confidence: string;
  direct_vs_inferred: string;
  evidence_present: Record<string, unknown>;
  evidence_missing: string[];
  coverage_flags: string[];
  coverage_limitation_evidence: Record<string, unknown> | null;
  known_limitations: string[];
  why_this_could_be_false_positive: string;
  why_it_might_still_be_valid: string;
  recommended_human_review_questions: string[];
};

type CorpusIndex = {
  generated_at: string;
  db_source: string;
  scan_window: { from: string | null; to: string | null };
  scans_considered: number;
  top_finding_ids: string[];
  per_finding_counts: Record<
    string,
    {
      finding_label: string;
      total_examples: number;
      positive_examples: number;
      challenge_examples: number;
      positive_paths: string[];
      challenge_paths: string[];
    }
  >;
  warnings: string[];
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function safeIso(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  const parsed = new Date(d);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => typeof v === "string" && v.trim().length > 0))];
}

function formatConsentEvidenceStep(value: unknown, prefix: string): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return `${prefix}: ${value.trim()}`;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const action = typeof row.action === "string" ? row.action.trim() : null;
  const text = typeof row.text === "string" ? row.text.trim() : null;
  const urlAfterClick = typeof row.urlAfterClick === "string" ? row.urlAfterClick.trim() : null;
  const stepIndex = typeof row.stepIndex === "number" && Number.isFinite(row.stepIndex) ? row.stepIndex : null;

  const parts = uniqueStrings([
    stepIndex !== null ? `step ${stepIndex}` : null,
    action,
    text,
    urlAfterClick ? `after ${urlAfterClick}` : null
  ]);

  return parts.length > 0 ? `${prefix}: ${parts.join(" | ")}` : null;
}

function getSnapshotString(snapshot: Record<string, unknown> | null, keys: string[]): string | null {
  if (!snapshot) return null;
  for (const key of keys) {
    const v = snapshot[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function getSnapshotBoolean(snapshot: Record<string, unknown> | null, keys: string[]): boolean | null {
  if (!snapshot) return null;
  for (const key of keys) {
    const v = snapshot[key];
    if (typeof v === "boolean") return v;
  }
  return null;
}

function getSnapshotNumber(snapshot: Record<string, unknown> | null, keys: string[]): number | null {
  if (!snapshot) return null;
  for (const key of keys) {
    const v = snapshot[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* DB: load scans                                                     */
/* ------------------------------------------------------------------ */

async function loadRecentScans(config: CorpusConfig): Promise<ScanRow[]> {
  const since = config.since;
  const baseSql = `
    select s.id, s.organization_id, s.domain_id, s.scan_type, s.status,
           s.created_at, s.started_at, s.completed_at, s.pages_requested,
           s.pages_scanned, s.error_message
    from scans s
    where s.status = 'completed'
      and s.scan_type = 'full'
      ${config.includeAnonymousScans ? "" : "and s.organization_id is not null"}
      ${since ? "and s.completed_at >= $1" : ""}
    order by s.completed_at desc nulls last
    limit ${config.limitScans}
  `;
  const params = since ? [since.toISOString()] : [];
  const result = await query<ScanRow>(baseSql, params, { readOnly: true });
  return result.rows;
}

async function loadDomainHostname(domainId: string | null): Promise<string | null> {
  if (!domainId) return null;
  const row = await queryOne<{ hostname: string }>(
    `select hostname from domains where id = $1`,
    [domainId],
    { readOnly: true }
  );
  return row?.hostname ?? null;
}

/* ------------------------------------------------------------------ */
/* Build scan context                                                 */
/* ------------------------------------------------------------------ */

async function buildScanContext(
  scan: ScanRow,
  buildScanReportUnifiedFindingsFn: (record: Record<string, unknown>) => UnifiedFindingDisplayPacket[]
): Promise<ScanContext | null> {
  try {
    const record = await loadScanRecord({
      buildMergedSignalRecords: buildMergedSignalRecords as (input: Record<string, unknown>) => unknown[],
      getHybridDerivedTrackerVendors: getHybridDerivedTrackerVendors as (
        runtimeArtifacts: Record<string, unknown> | null
      ) => Array<Record<string, unknown>>,
      getPrimaryCategoryDescription: getPrimaryCategoryDescription as (category: string) => string,
      getPrimaryCategoryLabel: getPrimaryCategoryLabel as (category: string) => string,
      getPrimaryPolicyEnrichmentRow: getPrimaryPolicyEnrichmentRow as (
        rows: Array<Record<string, unknown>>
      ) => Record<string, unknown> | null,
      mapSignalKeyToTaxonomy: mapSignalKeyToTaxonomy as (input: {
        category: string;
        key: string;
        label: string;
      }) => { primaryCategory: string; subcategory?: string | null },
      scan,
      withHybridRuntimeArtifactFallbacks: withHybridRuntimeArtifactFallbacks as (
        runtimeArtifacts: Record<string, unknown>
      ) => Record<string, unknown> | null
    });

    const unifiedFindings = buildScanReportUnifiedFindingsFn(record);
    const executiveProjection = projectExecutiveFindingsFromUnifiedPackets(unifiedFindings);
    const hostname =
      (record.snapshot && typeof record.snapshot.domain === "string"
        ? record.snapshot.domain
        : null) ?? (await loadDomainHostname(scan.domain_id));

    const regulatoryRisk = buildRegulatoryRiskSource({
      snapshot: (record.snapshot as Record<string, unknown>) ?? {},
      runtimeArtifacts: (record.runtimeArtifacts as Record<string, unknown>) ?? null,
      hostname
    });

    const snapshot = (record.snapshot as Record<string, unknown> | null) ?? null;
    const configRow = await queryOne<{ scan_config_json: Record<string, unknown> | null }>(
      `select scan_config_json from scans where id = $1`,
      [scan.id],
      { readOnly: true }
    );
    const scanConfig = configRow?.scan_config_json ?? null;
    let requestedUrl: string | null =
      typeof scanConfig === "object" && scanConfig !== null
        ? ((scanConfig as Record<string, unknown>).normalizedUrl as string | undefined) ??
          ((scanConfig as Record<string, unknown>).hostname as string | undefined) ??
          ((scanConfig as Record<string, unknown>).target_url as string | undefined) ??
          ((scanConfig as Record<string, unknown>).url as string | undefined) ??
          null
        : null;
    // Fallback: try to extract from execution metadata in validation-canary configs
    if (!requestedUrl && typeof scanConfig === "object" && scanConfig !== null) {
      const execution = (scanConfig as Record<string, unknown>).execution as Record<string, unknown> | undefined;
      const summary = execution?.summary as Record<string, unknown> | undefined;
      const stages = Array.isArray(summary?.stages) ? summary.stages : [];
      for (const stage of stages) {
        if (typeof stage === "object" && stage !== null) {
          const metadata = (stage as Record<string, unknown>).metadata as Record<string, unknown> | undefined;
          const finalUrl = metadata?.finalUrl as string | undefined;
          if (finalUrl) {
            requestedUrl = finalUrl;
            break;
          }
        }
      }
    }
    // Last resort: use domain hostname
    if (!requestedUrl && hostname) {
      requestedUrl = hostname.startsWith("http") ? hostname : `https://${hostname}`;
    }

    return {
      scanId: scan.id,
      domain: hostname,
      requestedUrl: typeof requestedUrl === "string" ? requestedUrl : null,
      finalUrl:
        getSnapshotString(snapshot, ["final_url", "finalUrl"]) ??
        (typeof requestedUrl === "string" ? requestedUrl : null),
      createdAt: scan.created_at,
      scannedAt: scan.completed_at ?? scan.started_at ?? scan.created_at,
      snapshot,
      runtimeArtifacts: (record.runtimeArtifacts as Record<string, unknown> | null) ?? null,
      unifiedFindings,
      executiveProjection,
      regulatoryRisk
    };
  } catch (error) {
    console.warn(`[eval] Failed to build scan context for ${scan.id}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Enrich findings                                                    */
/* ------------------------------------------------------------------ */

function enrichFindings(context: ScanContext): EnrichedFinding[] {
  const findings: EnrichedFinding[] = [];
  const execById = new Map(context.executiveProjection.findings.map((f) => [f.id, f]));

  for (const packet of context.unifiedFindings) {
    const status = String(packet.presentationDecision?.status ?? "unknown");
    if (status !== "surface" && status !== "audit_only" && status !== "review" && status !== "suppress") continue;

    const mappedId = context.executiveProjection.trace.packets.find(
      (p) => p.unifiedFindingId === packet.unifiedFindingId
    )?.executiveFindingId;

    const executiveFinding = mappedId ? execById.get(mappedId) ?? null : null;

    findings.push({
      scanContext: context,
      packet,
      executiveFinding,
      status
    });
  }

  return findings;
}

/* ------------------------------------------------------------------ */
/* Scoring / selection helpers                                        */
/* ------------------------------------------------------------------ */

export function scoreConfidence(confidence: string): number {
  if (confidence === "strong") return 3;
  if (confidence === "good") return 2;
  if (confidence === "moderate" || confidence === "limited") return 1;
  return 0;
}

export function scoreDirectness(directness: string): number {
  if (directness === "direct") return 3;
  if (directness === "mixed") return 2;
  if (directness === "inferred") return 1;
  return 0;
}

export function evidenceRichness(packet: UnifiedFindingDisplayPacket): number {
  const e = packet.evidence ?? {};
  let score = 0;
  score += Object.keys(e.counts ?? {}).length;
  score += (e.snippets ?? []).length;
  score += (e.entities ? Object.values(e.entities).flat().length : 0);
  score += (e.sourceUrls ?? []).length;
  score += (e.pageUrls ?? []).length;
  score += packet.sourceRefs?.length ?? 0;
  return score;
}

export function hasCoverageIssues(context: ScanContext): boolean {
  const s = context.snapshot;
  if (!s) return true;
  return (
    getSnapshotBoolean(s, ["partial_scan", "partialScan"]) === true ||
    getSnapshotBoolean(s, ["blocked_flag", "blockedFlag"]) === true ||
    getSnapshotBoolean(s, ["captcha_flag", "captchaFlag"]) === true ||
    (getSnapshotNumber(s, ["redirect_count", "redirectCount"]) ?? 0) > 1 ||
    getSnapshotBoolean(s, ["timeout_flag", "timeoutFlag"]) === true
  );
}

export function getCoverageFlags(context: ScanContext): string[] {
  const flags: string[] = [];
  const s = context.snapshot;
  if (!s) return flags;
  if (getSnapshotBoolean(s, ["partial_scan", "partialScan"]) === true) flags.push("partial_scan");
  if (getSnapshotBoolean(s, ["blocked_flag", "blockedFlag"]) === true) flags.push("blocked");
  if (getSnapshotBoolean(s, ["captcha_flag", "captchaFlag"]) === true) flags.push("captcha");
  const redirects = getSnapshotNumber(s, ["redirect_count", "redirectCount"]) ?? 0;
  if (redirects > 1) flags.push(`redirected(${redirects})`);
  if (getSnapshotBoolean(s, ["timeout_flag", "timeoutFlag"]) === true) flags.push("timeout");
  const pagesRequested = getSnapshotNumber(s, ["pages_requested", "pagesRequested"]);
  const pagesScanned = getSnapshotNumber(s, ["pages_scanned", "pagesScanned"]);
  if (pagesRequested !== null && pagesScanned !== null && pagesScanned < pagesRequested) {
    flags.push("incomplete_pages");
  }
  return flags;
}

function getKnownLimitations(context: ScanContext): string[] {
  const lims: string[] = [];
  const flags = getCoverageFlags(context);
  if (flags.length > 0) lims.push(...flags.map((f) => `Scan coverage issue: ${f}`));
  const coverageLimitationEvidence = getCoverageLimitationEvidence(context);
  const retained = coverageLimitationEvidence?.runtimeSignalsRetained;
  if (retained && typeof retained === "object") {
    const thirdPartyRequestCount = getRecordNumber(retained as Record<string, unknown>, ["thirdPartyRequestCount"]);
    const preconsentEvidenceUrlCount = getRecordNumber(retained as Record<string, unknown>, ["preconsentEvidenceUrlCount"]);
    if ((thirdPartyRequestCount ?? 0) > 0 || (preconsentEvidenceUrlCount ?? 0) > 0) {
      lims.push("Runtime signals were retained before or during limited page coverage.");
    }
  }
  if (!context.snapshot) lims.push("Missing snapshot");
  if (!context.runtimeArtifacts) lims.push("Missing runtime artifacts");
  return lims;
}

function getRecordNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function getCoverageLimitationEvidence(context: ScanContext): Record<string, unknown> | null {
  const runtimeArtifacts = context.runtimeArtifacts;
  const retained =
    runtimeArtifacts?.coverage_limitation_evidence ??
    runtimeArtifacts?.coverageLimitationEvidence;
  if (retained && typeof retained === "object" && !Array.isArray(retained)) {
    return retained as Record<string, unknown>;
  }

  const flags = getCoverageFlags(context);
  if (flags.length === 0) return null;
  const runtimeSignalsRetained = {
    cookieCount: getRecordNumber(runtimeArtifacts ?? {}, ["initial_cookie_count", "initialCookieCount"]),
    preconsentEvidenceUrlCount: Array.isArray(runtimeArtifacts?.consent_baseline_tracker_evidence_urls)
      ? runtimeArtifacts.consent_baseline_tracker_evidence_urls.length
      : Array.isArray(runtimeArtifacts?.consentBaselineTrackerEvidenceUrls)
        ? runtimeArtifacts.consentBaselineTrackerEvidenceUrls.length
        : 0,
    requestDomainSamples: Array.isArray(runtimeArtifacts?.third_party_request_domains)
      ? runtimeArtifacts.third_party_request_domains.slice(0, 10)
      : Array.isArray(runtimeArtifacts?.thirdPartyRequestDomains)
        ? runtimeArtifacts.thirdPartyRequestDomains.slice(0, 10)
        : [],
    scriptTagCount: getRecordNumber(runtimeArtifacts ?? {}, ["script_tag_count", "scriptTagCount"]) ?? 0,
    thirdPartyRequestCount: getRecordNumber(runtimeArtifacts ?? {}, ["third_party_request_count", "thirdPartyRequestCount"]) ?? 0,
    trackerVendorSamples: Array.isArray(runtimeArtifacts?.consent_baseline_tracker_vendor_names)
      ? runtimeArtifacts.consent_baseline_tracker_vendor_names.slice(0, 10)
      : Array.isArray(runtimeArtifacts?.consentBaselineTrackerVendorNames)
        ? runtimeArtifacts.consentBaselineTrackerVendorNames.slice(0, 10)
        : []
  };
  return {
    coverageFlags: flags,
    coverageLevel: context.snapshot ? getSnapshotString(context.snapshot, ["coverage_level", "coverageLevel"]) : null,
    explanation: "Scan coverage limitations may have prevented full page-text evidence capture.",
    finalUrl: context.finalUrl,
    homepageHttpStatus: context.snapshot ? getSnapshotNumber(context.snapshot, ["homepage_http_status", "homepageHttpStatus"]) : null,
    runtimeSignalsRetained
  };
}

/* ------------------------------------------------------------------ */
/* Build positive example                                             */
/* ------------------------------------------------------------------ */

export function buildPositiveExample(enriched: EnrichedFinding): PositiveExample {
  const { scanContext, packet, executiveFinding } = enriched;
  const s = scanContext.snapshot;
  const runtimeArtifacts = scanContext.runtimeArtifacts;
  const packetDetails =
    packet.details && typeof packet.details === "object" ? (packet.details as Record<string, unknown>) : null;

  const conflictBridge =
    packet.details?.family === "contradiction"
      ? (packet.details as Record<string, unknown>).contradictionBasis ?? null
      : null;

  const policyAnchors: string[] = [];
  const runtimeAnchors: string[] = [];

  if (packet.details?.family === "contradiction") {
    const d = packet.details as Record<string, unknown>;
    if (typeof d.policySnippet === "string") policyAnchors.push(d.policySnippet);
    if (typeof d.claim === "string") policyAnchors.push(d.claim);
    if (typeof d.observedBehavior === "string") runtimeAnchors.push(d.observedBehavior);
    if (Array.isArray(d.runtimeEvidenceArtifacts)) {
      runtimeAnchors.push(...(d.runtimeEvidenceArtifacts as string[]));
    }
  }

  const consentSummary: Record<string, unknown> = {};
  if (s) {
    const cmp = getSnapshotString(s, ["cmp_vendor_name", "cmpVendorName"]);
    if (cmp) consentSummary.cmp_vendor = cmp;
    const preconsent = getSnapshotBoolean(s, ["preconsent_tracking_detected", "preconsentTrackingDetected"]);
    if (preconsent !== null) consentSummary.preconsent_tracking_detected = preconsent;
    const banner = getSnapshotBoolean(s, ["cookie_banner_present", "cookieBannerPresent"]);
    if (banner !== null) consentSummary.banner_present = banner;
    const reject = getSnapshotBoolean(s, ["reject_all_present", "rejectAllPresent"]);
    if (reject !== null) consentSummary.reject_all_present = reject;
  }

  const fpSignals: Record<string, unknown> = {};
  if (s) {
    fpSignals.fingerprinting_vendor_detected =
      getSnapshotBoolean(s, ["fingerprinting_or_identity_vendor_detected", "fingerprintingOrIdentityVendorDetected"]);
    fpSignals.device_signal_vendor_detected =
      getSnapshotBoolean(s, ["device_signal_vendor_detected", "deviceSignalVendorDetected"]);
  }

  const entities = packet.evidence?.entities ?? {};
  const vendors = uniqueStrings([
    ...(entities.vendors ?? []),
    ...(entities.tracker_vendors ?? []),
    ...(entities.session_replay_vendors ?? []),
    ...(packet.details && (packet.details as Record<string, unknown>).vendors
      ? ((packet.details as Record<string, unknown>).vendors as string[])
      : [])
  ]);

  const requestDomains = uniqueStrings([
    ...(entities.request_domains ?? []),
    ...(entities.third_party_domains ?? [])
  ]);

  const detailRequestUrls =
    packet.details?.family === "consent_tracking" && Array.isArray(packetDetails?.requestUrls)
      ? (packetDetails.requestUrls as string[])
      : [];
  const requestSamples = uniqueStrings([
    ...(entities.request_urls ?? []),
    ...(entities.tracking_urls ?? []),
    ...(entities.runtimeRequestUrls ?? []),
    ...detailRequestUrls
  ]).slice(0, 5);

  const cookieSamples = uniqueStrings([
    ...(entities.cookie_names ?? []),
    ...(entities.initial_cookies ?? [])
  ]).slice(0, 5);

  if (packet.details?.family === "consent_tracking") {
    const detailVendors = Array.isArray(packetDetails?.vendors) ? (packetDetails.vendors as string[]) : [];
    const optOutLog = Array.isArray(runtimeArtifacts?.consent_opt_out_evidence_log)
      ? runtimeArtifacts.consent_opt_out_evidence_log
      : Array.isArray(runtimeArtifacts?.consentOptOutEvidenceLog)
        ? runtimeArtifacts.consentOptOutEvidenceLog
        : [];
    runtimeAnchors.push(
      ...requestSamples.map((url) => `Runtime request: ${url}`),
      ...(detailVendors.length > 0 ? [`Runtime vendors: ${detailVendors.slice(0, 5).join(", ")}`] : []),
      ...optOutLog.slice(0, 3).map((entry) => formatConsentEvidenceStep(entry, "Opt-out path"))
    );
  }

  const evidenceSnippets = (packet.evidence?.snippets ?? []).map((snippet) => String(snippet).slice(0, 500));
  const exportedEvidenceSnippets = evidenceSnippets.length > 0 ? evidenceSnippets : runtimeAnchors.map((entry) => entry.slice(0, 500));

  const regulatoryLanes: string[] = [];
  const r = scanContext.regulatoryRisk;
  if (r.californiaExposureLikely) regulatoryLanes.push("CCPA/CPRA");
  if (r.mentionsUnder13) regulatoryLanes.push("COPPA");

  return {
    example_type: "positive",
    scan_id: scanContext.scanId,
    domain: scanContext.domain,
    requested_url: scanContext.requestedUrl,
    final_url: scanContext.finalUrl,
    created_at: scanContext.createdAt,
    scanned_at: scanContext.scannedAt,
    finding_id: executiveFinding?.id ?? packet.unifiedFindingId,
    finding_label: executiveFinding?.label ?? packet.title,
    section: executiveFinding?.section ?? "Unknown",
    confidence: executiveFinding?.confidence ?? mapConfidenceBand(packet.confidenceBand),
    direct_vs_inferred: executiveFinding?.directVsInferred ?? mapDirectness(packet.confidenceInputs?.hasDirectRuntimeEvidence),
    surface_priority: executiveFinding?.defaultSurfacePriority ?? 0,
    appeared_in_executive_summary:
      scanContext.executiveProjection.trace.packets.find((p) => p.unifiedFindingId === packet.unifiedFindingId)
        ?.inExecutiveFindings ?? false,
    regulatory_lanes: regulatoryLanes,
    normalized_concern_ids: packet.concernContext?.promotionEligibilities?.map((e) => String(e)) ?? [],
    concern_policy_rule_ids: packet.sourceRefs
      ?.filter((ref) => ref.kind === "signal")
      .map((ref) => (ref as { key: string }).key) ?? [],
    evidence: {
      counts: packet.evidence?.counts ?? {},
      evidence_snippets: exportedEvidenceSnippets,
      vendors,
      request_domains: requestDomains,
      request_samples: requestSamples,
      cookie_samples: cookieSamples,
      consent_summary: consentSummary,
      fingerprinting_or_device_signals: fpSignals,
      policy_anchors: policyAnchors,
      runtime_anchors: runtimeAnchors,
      conflict_bridge: typeof conflictBridge === "string" ? conflictBridge : null
    },
    coverage_flags: getCoverageFlags(scanContext),
    coverage_limitation_evidence: getCoverageLimitationEvidence(scanContext),
    known_limitations: getKnownLimitations(scanContext),
    selection_reason: buildPositiveSelectionReason(enriched)
  };
}

export function mapConfidenceBand(band: string | undefined): string {
  if (band === "high") return "strong";
  if (band === "moderate") return "good";
  return "limited";
}

export function mapDirectness(hasDirect: boolean | undefined): string {
  return hasDirect ? "direct" : "inferred";
}

function buildPositiveSelectionReason(enriched: EnrichedFinding): string {
  const parts: string[] = ["Surfaced finding with strong support."];
  if (enriched.executiveFinding) {
    parts.push(`Mapped to executive finding ${enriched.executiveFinding.id} (${enriched.executiveFinding.confidence}, ${enriched.executiveFinding.directVsInferred}).`);
  }
  parts.push(`Evidence richness score: ${evidenceRichness(enriched.packet)}.`);
  if (!hasCoverageIssues(enriched.scanContext)) {
    parts.push("Scan completed without coverage issues.");
  }
  return parts.join(" ");
}

/* ------------------------------------------------------------------ */
/* Build challenge example                                            */
/* ------------------------------------------------------------------ */

export function buildChallengeExample(enriched: EnrichedFinding): ChallengeExample {
  const { scanContext, packet, executiveFinding } = enriched;
  const s = scanContext.snapshot;

  const observedStatus = classifyChallengeStatus(enriched);

  const evidencePresent: Record<string, unknown> = {};
  const evidenceMissing: string[] = [];

  if (packet.evidence) {
    if (Object.keys(packet.evidence.counts ?? {}).length > 0) evidencePresent.counts = packet.evidence.counts;
    const snippets = packet.evidence.snippets;
    if ((snippets ?? []).length > 0) evidencePresent.snippets = (snippets ?? []).length;
    if (packet.evidence.entities) {
      const entityKeys = Object.keys(packet.evidence.entities);
      if (entityKeys.length > 0) evidencePresent.entity_keys = entityKeys;
    }
  }

  if (!packet.evidence?.snippets || packet.evidence.snippets.length === 0) {
    evidenceMissing.push("evidence_snippets");
  }
  if (!packet.sourceRefs || packet.sourceRefs.length === 0) {
    evidenceMissing.push("source_refs");
  }

  if (packet.details?.family === "contradiction") {
    const d = packet.details as Record<string, unknown>;
    if (!d.policySnippet && !d.claim) evidenceMissing.push("policy_anchor");
    if (!d.observedBehavior && !Array.isArray(d.runtimeEvidenceArtifacts)) evidenceMissing.push("runtime_anchor");
    if (!d.contradictionBasis && !d.conflictType) evidenceMissing.push("conflict_bridge");
  }

  if (packet.unifiedFindingId.includes("fingerprinting") || packet.unifiedFindingId.includes("device")) {
    const hasFpVendor =
      getSnapshotBoolean(s, ["fingerprinting_or_identity_vendor_detected", "fingerprintingOrIdentityVendorDetected"]) ===
      true;
    const hasMultiSignal = (packet.evidence?.counts?.device_signals ?? 0) > 1;
    if (!hasFpVendor && !hasMultiSignal) {
      evidenceMissing.push("multi_signal_fingerprinting_evidence");
    }
  }

  const whyFp = buildWhyFalsePositive(enriched, evidenceMissing);
  const whyValid = buildWhyMightBeValid(enriched);

  return {
    example_type: "challenge",
    scan_id: scanContext.scanId,
    domain: scanContext.domain,
    requested_url: scanContext.requestedUrl,
    final_url: scanContext.finalUrl,
    created_at: scanContext.createdAt,
    scanned_at: scanContext.scannedAt,
    finding_id: executiveFinding?.id ?? packet.unifiedFindingId,
    candidate_finding_id: packet.unifiedFindingId,
    finding_label: executiveFinding?.label ?? packet.title,
    observed_status: observedStatus,
    confidence: executiveFinding?.confidence ?? mapConfidenceBand(packet.confidenceBand),
    direct_vs_inferred: executiveFinding?.directVsInferred ?? mapDirectness(packet.confidenceInputs?.hasDirectRuntimeEvidence),
    evidence_present: evidencePresent,
    evidence_missing: evidenceMissing,
    coverage_flags: getCoverageFlags(scanContext),
    coverage_limitation_evidence: getCoverageLimitationEvidence(scanContext),
    known_limitations: getKnownLimitations(scanContext),
    why_this_could_be_false_positive: whyFp,
    why_it_might_still_be_valid: whyValid,
    recommended_human_review_questions: buildReviewQuestions(enriched, evidenceMissing)
  };
}

export function classifyChallengeStatus(enriched: EnrichedFinding): ChallengeExample["observed_status"] {
  const status = enriched.status;
  const confidence = enriched.executiveFinding?.confidence ?? "moderate";
  const directness = enriched.executiveFinding?.directVsInferred ?? "mixed";

  if (status === "suppress") return "suppressed";
  if (status === "audit_only") return "downgraded";
  if (status === "review") return "review_only";
  if (status === "surface" && confidence === "moderate") return "weak_positive";
  if (status === "surface" && directness === "inferred") return "ambiguous_positive";
  if (hasCoverageIssues(enriched.scanContext)) return "near_miss";
  return "support_only";
}

function buildWhyFalsePositive(enriched: EnrichedFinding, evidenceMissing: string[]): string {
  const parts: string[] = [];
  if (enriched.status !== "surface") {
    parts.push(`Finding was ${enriched.status} rather than surfaced.`);
  }
  if (enriched.executiveFinding?.directVsInferred === "inferred") {
    parts.push("Evidence is inferred rather than directly observed.");
  }
  if (evidenceMissing.length > 0) {
    parts.push(`Missing evidence fields: ${evidenceMissing.join(", ")}.`);
  }
  if (hasCoverageIssues(enriched.scanContext)) {
    parts.push("Scan had coverage issues that may reduce evidence quality.");
  }
  if (enriched.packet.details?.family === "contradiction") {
    const d = enriched.packet.details as Record<string, unknown>;
    if (!d.policySnippet && !d.claim) {
      parts.push("Contradiction finding lacks policy anchor.");
    }
    if (!d.observedBehavior && !Array.isArray(d.runtimeEvidenceArtifacts)) {
      parts.push("Contradiction finding lacks runtime anchor.");
    }
    if (!d.contradictionBasis && !d.conflictType) {
      parts.push("Contradiction finding lacks explicit conflict bridge.");
    }
  }
  if (parts.length === 0) {
    parts.push("Evidence exists but may be interpreted differently.");
  }
  return parts.join(" ");
}

function buildWhyMightBeValid(enriched: EnrichedFinding): string {
  const parts: string[] = [];
  if (enriched.status === "surface") {
    parts.push("Finding was surfaced by production logic.");
  }
  if (enriched.executiveFinding?.confidence === "strong") {
    parts.push("Executive projection assigned strong confidence.");
  }
  if (evidenceRichness(enriched.packet) > 2) {
    parts.push("Multiple evidence signals are present.");
  }
  if (parts.length === 0) {
    parts.push("Some supporting signals were detected even if conclusion is debatable.");
  }
  return parts.join(" ");
}

function buildReviewQuestions(enriched: EnrichedFinding, evidenceMissing: string[]): string[] {
  const qs: string[] = [];
  if (enriched.packet.details?.family === "contradiction") {
    qs.push("Does the policy anchor clearly state the claimed behavior?");
    qs.push("Does the runtime anchor clearly show contradictory behavior?");
    qs.push("Is the conflict bridge explicitly explained?");
  }
  if (enriched.packet.unifiedFindingId.includes("fingerprinting")) {
    qs.push("Are multiple independent device/browser signals collected?");
    qs.push("Is there proof the signals are used for identification?");
  }
  if (enriched.packet.unifiedFindingId.includes("preconsent") || enriched.packet.unifiedFindingId.includes("tracking")) {
    qs.push("Is the timing clearly before any consent interaction?");
    qs.push("Are the requests demonstrably non-essential?");
  }
  if (evidenceMissing.includes("evidence_snippets")) {
    qs.push("Are there concrete snippets or network artifacts that support this finding?");
  }
  if (hasCoverageIssues(enriched.scanContext)) {
    qs.push("Could coverage gaps have caused false negatives or false positives?");
  }
  if (qs.length === 0) {
    qs.push("Is the evidence sufficient to support the claimed finding?");
  }
  return qs;
}

/* ------------------------------------------------------------------ */
/* Selection logic                                                    */
/* ------------------------------------------------------------------ */

function scorePositive(enriched: EnrichedFinding): number {
  let score = 0;
  if (enriched.status === "surface") score += 100;
  score += scoreConfidence(enriched.executiveFinding?.confidence ?? "") * 10;
  score += scoreDirectness(enriched.executiveFinding?.directVsInferred ?? "") * 10;
  score += evidenceRichness(enriched.packet);
  if (!hasCoverageIssues(enriched.scanContext)) score += 5;
  if (enriched.scanContext.executiveProjection.trace.packets.find((p: { unifiedFindingId: string }) => p.unifiedFindingId === enriched.packet.unifiedFindingId)?.inExecutiveFindings) {
    score += 10;
  }
  return score;
}

function scoreChallenge(enriched: EnrichedFinding): number {
  let score = 0;
  // Prefer non-surfaced statuses for challenge set
  if (enriched.status === "suppress") score += 100;
  if (enriched.status === "audit_only") score += 80;
  if (enriched.status === "review") score += 60;
  if (enriched.status === "surface" && (enriched.executiveFinding?.confidence === "moderate" || enriched.executiveFinding?.directVsInferred === "inferred")) {
    score += 40;
  }
  if (hasCoverageIssues(enriched.scanContext)) score += 20;
  if (enriched.packet.details?.family === "contradiction") {
    const d = enriched.packet.details as Record<string, unknown>;
    if (!d.policySnippet || !d.observedBehavior || !d.contradictionBasis) {
      score += 15;
    }
  }
  // Diversify by domain: slight penalty for same domain
  return score;
}

function selectExamples(
  allEnriched: EnrichedFinding[],
  config: CorpusConfig
): {
  positive: Map<string, EnrichedFinding[]>;
  challenge: Map<string, EnrichedFinding[]>;
  topFindingIds: string[];
} {
  // Group by finding id
  const byFinding = new Map<string, EnrichedFinding[]>();
  for (const e of allEnriched) {
    const fid = e.executiveFinding?.id ?? e.packet.unifiedFindingId;
    if (!byFinding.has(fid)) byFinding.set(fid, []);
    byFinding.get(fid)!.push(e);
  }

  // Compute top findings by surface frequency
  const surfaceCounts = new Map<string, number>();
  for (const [fid, list] of byFinding) {
    surfaceCounts.set(fid, list.filter((e) => e.status === "surface").length);
  }

  let sortedFindingIds = [...surfaceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([fid]) => fid);

  if (config.findingId) {
    sortedFindingIds = sortedFindingIds.filter((fid) => fid === config.findingId);
  }

  const topFindingIds = sortedFindingIds.slice(0, config.topNFindings);

  const positive = new Map<string, EnrichedFinding[]>();
  const challenge = new Map<string, EnrichedFinding[]>();

  for (const fid of topFindingIds) {
    const list = byFinding.get(fid) ?? [];

    // Positive: strongest surfaced examples, prefer different domains
    const positiveCandidates = list
      .filter((e) => e.status === "surface")
      .sort((a, b) => scorePositive(b) - scorePositive(a));
    const selectedPositive = pickDiverse(positiveCandidates, config.positivePerFinding);
    positive.set(fid, selectedPositive);

    // Challenge: most questionable examples
    let challengeCandidates = list.filter((e) => {
      if (e.status === "suppress" && !config.includeSuppressed) return false;
      if (e.status === "audit_only" || e.status === "review") {
        if (!config.includeMixed) return false;
        // Exclude downgraded examples that still have strong evidence — they are not true challenges
        const isStrongDespiteDowngrade =
          e.packet.confidenceBand === "high" &&
          e.packet.confidenceInputs?.hasDirectRuntimeEvidence === true &&
          evidenceRichness(e.packet) > 5;
        return !isStrongDespiteDowngrade;
      }
      return true;
    });
    // Exclude positives we already selected
    const positiveScanIds = new Set(selectedPositive.map((e) => e.scanContext.scanId));
    challengeCandidates = challengeCandidates.filter((e) => !positiveScanIds.has(e.scanContext.scanId));
    challengeCandidates.sort((a, b) => scoreChallenge(b) - scoreChallenge(a));
    const selectedChallenge = pickDiverse(challengeCandidates, config.challengePerFinding);
    challenge.set(fid, selectedChallenge);
  }

  return { positive, challenge, topFindingIds };
}

export function pickDiverse(candidates: EnrichedFinding[], limit: number): EnrichedFinding[] {
  const picked: EnrichedFinding[] = [];
  const domains = new Set<string>();
  // First pass: prefer unique domains
  for (const c of candidates) {
    if (picked.length >= limit) break;
    const d = c.scanContext.domain ?? "unknown";
    if (!domains.has(d)) {
      domains.add(d);
      picked.push(c);
    }
  }
  // Second pass: fill remaining slots
  for (const c of candidates) {
    if (picked.length >= limit) break;
    if (!picked.includes(c)) {
      picked.push(c);
    }
  }
  return picked;
}

/* ------------------------------------------------------------------ */
/* Export                                                             */
/* ------------------------------------------------------------------ */

function exportExamples(
  positive: Map<string, EnrichedFinding[]>,
  challenge: Map<string, EnrichedFinding[]>,
  topFindingIds: string[],
  outDir: string
): CorpusIndex {
  const generatedAt = new Date().toISOString();
  const perFindingCounts: CorpusIndex["per_finding_counts"] = {};
  const warnings: string[] = [];

  for (const fid of topFindingIds) {
    const posList = positive.get(fid) ?? [];
    const chalList = challenge.get(fid) ?? [];
    const label = posList[0]?.executiveFinding?.label ?? chalList[0]?.executiveFinding?.label ?? fid;

    const positivePaths: string[] = [];
    const challengePaths: string[] = [];

    // Export positives
    for (let i = 0; i < posList.length; i++) {
      const item = posList[i];
      if (!item) continue;
      const ex = buildPositiveExample(item);
      const dir = join(outDir, "findings", fid, "positive");
      ensureDir(dir);
      const path = join(dir, `${i + 1}.json`);
      writeFileSync(path, JSON.stringify(ex, null, 2), "utf8");
      positivePaths.push(path);
    }

    // Export challenges
    for (let i = 0; i < chalList.length; i++) {
      const item = chalList[i];
      if (!item) continue;
      const ex = buildChallengeExample(item);
      const dir = join(outDir, "findings", fid, "challenge");
      ensureDir(dir);
      const path = join(dir, `${i + 1}.json`);
      writeFileSync(path, JSON.stringify(ex, null, 2), "utf8");
      challengePaths.push(path);
    }

    perFindingCounts[fid] = {
      finding_label: label,
      total_examples: posList.length + chalList.length,
      positive_examples: posList.length,
      challenge_examples: chalList.length,
      positive_paths: positivePaths,
      challenge_paths: challengePaths
    };

    if (posList.length === 0) warnings.push(`No positive examples for ${fid}`);
    if (chalList.length === 0) warnings.push(`No challenge examples for ${fid}`);
  }

  const index: CorpusIndex = {
    generated_at: generatedAt,
    db_source: "local/dev PostgreSQL (read-only)",
    scan_window: { from: null, to: null },
    scans_considered: 0,
    top_finding_ids: topFindingIds,
    per_finding_counts: perFindingCounts,
    warnings
  };

  const indexPath = join(outDir, "corpus_index.json");
  writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf8");

  return index;
}

function exportCsvAndMarkdown(
  allEnriched: EnrichedFinding[],
  topFindingIds: string[],
  perFindingCounts: CorpusIndex["per_finding_counts"],
  outDir: string
) {
  // CSV
  const rows = topFindingIds.map((fid) => {
    const list = allEnriched.filter((e) => (e.executiveFinding?.id ?? e.packet.unifiedFindingId) === fid);
    const surfaced = list.filter((e) => e.status === "surface");
    const strong = surfaced.filter((e) => e.executiveFinding?.confidence === "strong").length;
    const good = surfaced.filter((e) => e.executiveFinding?.confidence === "good").length;
    const limited = surfaced.filter((e) => e.executiveFinding?.confidence === "moderate").length;
    const direct = surfaced.filter((e) => e.executiveFinding?.directVsInferred === "direct").length;
    const inferred = surfaced.filter((e) => e.executiveFinding?.directVsInferred === "inferred").length;
    const execCount = surfaced.filter((e) =>
      e.scanContext.executiveProjection.trace.packets.find(
        (p: { unifiedFindingId: string }) => p.unifiedFindingId === e.packet.unifiedFindingId
      )?.inExecutiveFindings
    ).length;
    const regCount = 0; // Simplified; could derive from regulatory projection if stored
    const posExported = (perFindingCounts[fid]?.positive_examples ?? 0);
    const chalExported = (perFindingCounts[fid]?.challenge_examples ?? 0);
    const label = list[0]?.executiveFinding?.label ?? fid;
    return { fid, label, total: list.length, strong, good, limited, direct, inferred, execCount, regCount, posExported, chalExported };
  });

  const csvLines = [
    "finding_id,finding_label,total_count,strong_count,good_count,limited_count,direct_count,inferred_count,executive_summary_count,regulatory_projection_count,positive_examples_exported,challenge_examples_exported",
    ...rows.map(
      (r) =>
        `"${r.fid}","${r.label}",${r.total},${r.strong},${r.good},${r.limited},${r.direct},${r.inferred},${r.execCount},${r.regCount},${r.posExported},${r.chalExported}`
    )
  ];
  writeFileSync(join(outDir, "top_10_findings.csv"), csvLines.join("\n") + "\n", "utf8");

  // Markdown
  const mdLines = [
    "# Top Findings Corpus Summary",
    "",
    "| Finding | Total | Strong | Good | Limited | Direct | Inferred | Executive | Positive | Challenge |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...rows.map(
      (r) =>
        `| ${r.label} | ${r.total} | ${r.strong} | ${r.good} | ${r.limited} | ${r.direct} | ${r.inferred} | ${r.execCount} | ${r.posExported} | ${r.chalExported} |`
    )
  ];
  writeFileSync(join(outDir, "top_10_findings.md"), mdLines.join("\n") + "\n", "utf8");
}

function exportCorpusSummary(
  allEnriched: EnrichedFinding[],
  topFindingIds: string[],
  scansConsidered: number,
  perFindingCounts: CorpusIndex["per_finding_counts"],
  outDir: string
) {
  const surfaced = allEnriched.filter((e) => e.status === "surface");
  const byConfidence = {
    strong: surfaced.filter((e) => e.executiveFinding?.confidence === "strong").length,
    good: surfaced.filter((e) => e.executiveFinding?.confidence === "good").length,
    limited: surfaced.filter((e) => e.executiveFinding?.confidence === "moderate").length
  };
  const coverageIssueScans = new Set(
    allEnriched.filter((e) => hasCoverageIssues(e.scanContext)).map((e) => e.scanContext.scanId)
  );

  const lines = [
    "# Corpus Summary",
    "",
    `## Overview`,
    `- Scans considered: ${scansConsidered}`,
    `- Total findings evaluated: ${allEnriched.length}`,
    `- Surfaced findings: ${surfaced.length}`,
    `- Top findings selected: ${topFindingIds.length}`,
    "",
    `## Evidence Strength Distribution`,
    `- Strong confidence: ${byConfidence.strong}`,
    `- Good confidence: ${byConfidence.good}`,
    `- Limited confidence: ${byConfidence.limited}`,
    "",
    `## Coverage Issues`,
    `- Scans with coverage issues: ${coverageIssueScans.size}`,
    "",
    `## Top Findings`,
    ...topFindingIds.map((fid) => `- ${fid}: ${perFindingCounts[fid]?.positive_examples ?? 0} positive, ${perFindingCounts[fid]?.challenge_examples ?? 0} challenge`),
    "",
    `## Suggested Improvements`,
    `- Add more explicit contradiction conflict bridge storage.`,
    `- Store pre-consent timing artifacts for stronger challenge review.`,
    `- Capture policy snippet hashes for faster policy anchor retrieval.`
  ];

  writeFileSync(join(outDir, "corpus_summary.md"), lines.join("\n") + "\n", "utf8");
}

function exportJsonlAndPrompt(
  positive: Map<string, EnrichedFinding[]>,
  challenge: Map<string, EnrichedFinding[]>,
  topFindingIds: string[],
  outDir: string
) {
  const jsonlPath = join(outDir, "kimi_review_input.jsonl");
  const lines: string[] = [];

  for (const fid of topFindingIds) {
    for (const ex of positive.get(fid) ?? []) {
      lines.push(JSON.stringify(buildPositiveExample(ex)));
    }
    for (const ex of challenge.get(fid) ?? []) {
      lines.push(JSON.stringify(buildChallengeExample(ex)));
    }
  }

  writeFileSync(jsonlPath, lines.join("\n") + "\n", "utf8");

  const prompt = `---
# Kimi Think Mode — Independent Finding Review Prompt

You are an independent compliance signal reviewer. You are NOT part of the CertScore.ai detection pipeline. You must independently reason from the evidence provided.

## Input
Each line in the accompanying JSONL file is a single finding example (positive or challenge) from the CertScore.ai scan corpus.

## Your Task
For each example, evaluate whether the finding is well-supported by the evidence. Assess:
- Whether the finding is justified
- Whether the confidence level is appropriate
- Whether this may be a false positive or weak inference

## Rules
1. Evidence-first reasoning: only trust what is explicitly present.
2. Direct vs inferred: direct = clearly observable; inferred = behavioral interpretation.
3. Policy/runtime contradiction: ONLY valid if ALL THREE exist: policy anchor, runtime anchor, explicit contradiction explanation.
4. Be skeptical of inferred findings and single-signal conclusions.
5. Common false positive patterns:
   - vendor presence without proof of tracking behavior
   - inferred fingerprinting without multi-signal device collection
   - missing consent interaction context
   - redirected domains causing misleading attribution
   - partial/blocked scans

## Required Output (strict JSON only)
For each example, return:
\`\`\`json
{
  "classification": "agree_confirmed | agree_but_weaker_confidence | needs_human_review | likely_false_positive | insufficient_evidence | wrong_finding_type",
  "confidence_adjustment": "keep | downgrade | upgrade",
  "reasoning": {
    "summary": "...",
    "key_supporting_evidence": ["..."],
    "missing_or_weak_evidence": ["..."],
    "contradictions_or_risks": ["..."]
  },
  "finding_type_assessment": "direct_runtime | inferred_behavior | policy_runtime_contradiction | unsupported_projection",
  "false_positive_risk": "low | medium | high",
  "recommended_action": "keep | downgrade | suppress | requires_manual_review",
  "notes": ["optional"]
}
\`\`\`

Do NOT include any text outside the JSON.
`;

  writeFileSync(join(outDir, "kimi_review_prompt.md"), prompt, "utf8");
}

/* ------------------------------------------------------------------ */
/* Main                                                               */
/* ------------------------------------------------------------------ */

async function main() {
  const config: CorpusConfig = {
    since: getDateArg("--since") ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    limitScans: getNumberArg("--limit-scans", 500),
    topNFindings: getNumberArg("--top-n-findings", 10),
    positivePerFinding: getNumberArg("--positive-per-finding", 5),
    challengePerFinding: getNumberArg("--challenge-per-finding", 5),
    findingId: getArgValue("--finding-id"),
    outDir: getArgValue("--out-dir") ?? `artifacts/eval/finding-corpus/${new Date().toISOString().slice(0, 10)}`,
    dryRun: hasFlag("--dry-run"),
    includeSuppressed: !hasFlag("--no-include-suppressed"),
    includeMixed: !hasFlag("--no-include-mixed"),
    includeAnonymousScans: hasFlag("--include-anonymous-scans")
  };

  console.info("[eval] Corpus builder starting...");
  console.info(`[eval] Config: ${JSON.stringify({ ...config, since: config.since?.toISOString() })}`);

  if (!isArtifactExportAllowed(config.dryRun)) {
    console.error(
      "[eval] Artifact export is disabled. Re-run with --dry-run or set SCAN_ARTIFACTS_ENABLED=true to write corpus files."
    );
    process.exitCode = 1;
    return;
  }

  const scans = await loadRecentScans(config);
  console.info(`[eval] Loaded ${scans.length} recent scans.`);

  if (scans.length === 0) {
    console.warn("[eval] No scans found. Exiting.");
    process.exitCode = 0;
    return;
  }

  // Dynamic import to avoid TSX issues with TSX components
  const componentModule = await import("../../components/scans/shared-scan-detail-view");
  const buildScanReportUnifiedFindingsFn =
    (componentModule as Record<string, unknown>).buildScanReportUnifiedFindings as (
      record: Record<string, unknown>
    ) => UnifiedFindingDisplayPacket[];

  if (typeof buildScanReportUnifiedFindingsFn !== "function") {
    throw new Error("Could not resolve buildScanReportUnifiedFindings from shared scan detail view.");
  }

  const allEnriched: EnrichedFinding[] = [];
  let processed = 0;

  for (const scan of scans) {
    const context = await buildScanContext(scan, buildScanReportUnifiedFindingsFn);
    if (!context) continue;
    const enriched = enrichFindings(context);
    allEnriched.push(...enriched);
    processed++;
    if (processed % 50 === 0) {
      console.info(`[eval] Processed ${processed}/${scans.length} scans...`);
    }
  }

  console.info(`[eval] Total enriched findings: ${allEnriched.length}`);

  const { positive, challenge, topFindingIds } = selectExamples(allEnriched, config);

  console.info(`[eval] Top findings: ${topFindingIds.join(", ")}`);

  if (config.dryRun) {
    console.info("[eval] Dry run complete. No files written.");
    console.info(`[eval] Would export to: ${config.outDir}`);
    for (const fid of topFindingIds) {
      console.info(`  ${fid}: ${positive.get(fid)?.length ?? 0} positive, ${challenge.get(fid)?.length ?? 0} challenge`);
    }
    return;
  }

  ensureDir(config.outDir);

  const index = exportExamples(positive, challenge, topFindingIds, config.outDir);
  index.scans_considered = processed;
  index.scan_window.from = scans[scans.length - 1]?.completed_at ?? scans[scans.length - 1]?.created_at ?? null;
  index.scan_window.to = scans[0]?.completed_at ?? scans[0]?.created_at ?? null;

  // Re-write index with updated counts
  writeFileSync(join(config.outDir, "corpus_index.json"), JSON.stringify(index, null, 2), "utf8");

  exportCsvAndMarkdown(allEnriched, topFindingIds, index.per_finding_counts, config.outDir);
  exportCorpusSummary(allEnriched, topFindingIds, processed, index.per_finding_counts, config.outDir);
  exportJsonlAndPrompt(positive, challenge, topFindingIds, config.outDir);
  exportFullFindingStats(allEnriched, config.outDir);

  const cleanupResult = await cleanupScanArtifactDirectory({
    config: getScanArtifactRetentionConfig(),
    dir: config.outDir
  });

  console.info(`[eval] Corpus exported to: ${config.outDir}`);
  console.info(`[eval] Retention cleanup removed ${cleanupResult.deletedFiles.length} old file(s) from ${config.outDir}.`);
  console.info(`[eval] Scans considered: ${processed}`);
  console.info(`[eval] Top findings:`);
  for (const fid of topFindingIds) {
    const pos = positive.get(fid)?.length ?? 0;
    const chal = challenge.get(fid)?.length ?? 0;
    console.info(`  ${fid}: ${pos} positive, ${chal} challenge`);
  }
  if (index.warnings.length > 0) {
    console.warn(`[eval] Warnings (${index.warnings.length}):`);
    for (const w of index.warnings) console.warn(`  - ${w}`);
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closePools();
    });
}

// --- Full stats export (inserted by patch) ---
function exportFullFindingStats(
  allEnriched: EnrichedFinding[],
  outDir: string
) {
  const byFid = new Map<string, EnrichedFinding[]>();
  for (const e of allEnriched) {
    const fid = e.executiveFinding?.id ?? e.packet.unifiedFindingId;
    if (!byFid.has(fid)) byFid.set(fid, []);
    byFid.get(fid)!.push(e);
  }

  const rows: Record<string, string | number>[] = [];
  for (const [fid, list] of byFid) {
    const surfaced = list.filter(e => e.status === "surface");
    const suppressed = list.filter(e => e.status === "suppress");
    const auditOnly = list.filter(e => e.status === "audit_only");
    const review = list.filter(e => e.status === "review");
    const strong = surfaced.filter(e => e.executiveFinding?.confidence === "strong").length;
    const good = surfaced.filter(e => e.executiveFinding?.confidence === "good").length;
    const limited = surfaced.filter(e => e.executiveFinding?.confidence === "moderate").length;
    const direct = surfaced.filter(e => e.executiveFinding?.directVsInferred === "direct").length;
    const inferred = surfaced.filter(e => e.executiveFinding?.directVsInferred === "inferred").length;
    const execMapped = surfaced.filter(e =>
      e.scanContext.executiveProjection.trace.packets.find(
        (p: { unifiedFindingId: string }) => p.unifiedFindingId === e.packet.unifiedFindingId
      )?.inExecutiveFindings
    ).length;
    const withSnippets = surfaced.filter(e => evidenceRichness(e.packet) > 0).length;
    const domains = new Set(list.map(e => e.scanContext.domain).filter(Boolean));
    const scans = new Set(list.map(e => e.scanContext.scanId));

    rows.push({
      finding_id: fid,
      finding_label: list[0]?.executiveFinding?.label ?? list[0]?.packet.label ?? fid,
      total_encounters: list.length,
      surfaced: surfaced.length,
      suppressed: suppressed.length,
      audit_only: auditOnly.length,
      review: review.length,
      surface_rate: surfaced.length / (list.length || 1),
      suppression_rate: suppressed.length / (list.length || 1),
      audit_only_rate: auditOnly.length / (list.length || 1),
      strong,
      good,
      limited,
      direct,
      inferred,
      exec_mapped: execMapped,
      with_snippets: withSnippets,
      unique_domains: domains.size,
      unique_scans: scans.size,
    });
  }

  rows.sort((a, b) => (b.total_encounters as number) - (a.total_encounters as number));

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => {
      const v = r[h];
      if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(3);
      const s = String(v);
      if (s.includes(",") || s.includes('"')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }).join(","))
  ].join("\n") + "\n";

  writeFileSync(join(outDir, "full_finding_stats.csv"), csv, "utf8");
}
