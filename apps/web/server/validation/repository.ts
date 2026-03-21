"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import {
  VALIDATION_DEFAULT_INTERVAL_MINUTES,
  VALIDATION_DEFAULT_RUN_MODE,
  VALIDATION_INTERVAL_OPTIONS,
  type ValidationPipelineState,
  type ValidationRunMode,
  type ValidationRunStatus,
  type ValidationVerdict
} from "@website-signal-risk-scanner/shared";
import { normalizeUrl, extractHostname } from "@website-signal-risk-scanner/shared";
import { revalidatePath } from "next/cache";
import { enqueueFullScanJob } from "../queue/full-scan-queue";
import { enqueueValidationCollectJob, getValidationQueueAvailability, getValidationQueueHealth } from "../queue/validation-queue";
import { getWebServerEnv } from "../../lib/env";
import { requireValidationAdminContext } from "./auth";
import { shouldSurfacePrimarySignalFinding } from "../../lib/scans/finding-evidence-gates";

type ValidationSettingsRow = {
  automatic_interval_minutes: number;
  last_tranco_sync_at: string | null;
  last_worker_heartbeat_at: string | null;
  last_worker_host: string | null;
  last_worker_started_at: string | null;
  next_due_at: string | null;
  operator_note: string | null;
  pipeline_enabled: boolean;
  run_mode: ValidationRunMode;
  singleton_key: string;
  updated_at: string;
  updated_by_user_id: string | null;
};

type ValidationRunRow = {
  average_agreement_score: number | null;
  completed_at: string | null;
  created_at: string;
  domain_id: string | null;
  error_message: string | null;
  finding_count: number;
  hostname: string;
  id: string;
  rank_band: string | null;
  reviewed_finding_count: number;
  scan_id: string | null;
  status: ValidationRunStatus;
  tranco_rank: number | null;
  trigger_mode: ValidationRunMode;
};

type ScanEventRow = {
  created_at: string;
  event_type: string;
  id: string;
  message: string;
  metadata_json: unknown;
};

type ValidationTargetRow = {
  active: boolean;
  backoff_until: string | null;
  cooldown_until: string | null;
  deny_reason: string | null;
  denylisted: boolean;
  failure_count?: number;
  hostname: string;
  id: string;
  last_completed_at?: string | null;
  last_error: string | null;
  last_run_at?: string | null;
  last_status: string | null;
  normalized_url: string;
  rank_band: string | null;
  source?: string;
  tranco_rank: number | null;
};

type ValidationRunFindingRow = {
  category: string;
  description: string;
  evidence_json: Record<string, unknown>;
  finding_rank: number;
  id: string;
  page_url: string | null;
  rule_key: string;
  severity: string;
  subtype: string | null;
  title: string;
  validation_verdicts?:
    | {
        confidence: number | null;
      }
    | Array<{
        confidence: number | null;
      }>
    | null;
};

type ExistingFindingIdentity = Pick<ValidationRunFindingRow, "rule_key" | "title">;

type ScanSignalRow = {
  category: string;
  signal_key: string;
  signal_label: string;
  signal_value_json: boolean | number | string | string[] | null;
  value_type: string;
};

type SnapshotSupplementRow = {
  accessibility_litigation_risk_score: number | null;
  retargeting_pixel_detected: boolean | null;
};

type PolicyReviewQueueRow = {
  id: string;
  policy_enrichment_id: string | null;
  reason: string;
  review_status: string | null;
  scan_id: string;
};

type PolicyEnrichmentLookupRow = {
  id: string;
  policy_ambiguity_score?: number | null;
  policy_coverage_ratio?: number | null;
  policy_effective_date?: string | null;
  policy_field_coverage?: Record<string, unknown>;
  policy_governing_law?: string | null;
  policy_notice_contact_present?: boolean | null;
  page_type: string | null;
  page_url: string | null;
  policy_semantic_confidence?: number | null;
  policy_snippet_count?: number | null;
  policy_structurally_weak?: boolean | null;
  policy_summary_short?: string | null;
  policy_termination_or_suspension_present?: boolean | null;
  policy_cancellation_or_refund_present?: boolean | null;
  policy_arbitration_present?: boolean | null;
};

const TRANCO_SOURCE_FALLBACK_URL = "https://tranco-list.eu/latest_list";

function rankBandForRank(rank: number | null) {
  if (!rank) {
    return null;
  }

  if (rank <= 5_000) {
    return "1k-5k";
  }

  if (rank <= 20_000) {
    return "5k-20k";
  }

  if (rank <= 50_000) {
    return "20k-50k";
  }

  if (rank <= 100_000) {
    return "50k-100k";
  }

  return null;
}

async function listTrancoPreviewTargets(limit = 7) {
  const env = getWebServerEnv();
  const response = await fetch(env.VALIDATION_TRANCO_SOURCE_URL ?? TRANCO_SOURCE_FALLBACK_URL, {
    headers: {
      "User-Agent": "ValidationOpsCrawler/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Tranco source: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  let body = await response.text();

  if (contentType.includes("text/html") || body.includes("/download/")) {
    const match = body.match(/href="(\/download\/[^"]+\/1000000)"/i);

    if (!match?.[1]) {
      throw new Error("Failed to resolve Tranco CSV download URL.");
    }

    const csvUrl = new URL(match[1], "https://tranco-list.eu").toString();
    const csvResponse = await fetch(csvUrl, {
      headers: {
        "User-Agent": "ValidationOpsCrawler/1.0"
      }
    });

    if (!csvResponse.ok) {
      throw new Error(`Failed to fetch Tranco CSV: ${csvResponse.status}`);
    }

    body = await csvResponse.text();
  }

  const minRank = env.VALIDATION_TRANCO_MIN_RANK ?? 10_000;
  const maxRank = env.VALIDATION_TRANCO_MAX_RANK ?? 20_000;
  const rows: ValidationTargetRow[] = [];

  for (const line of body.split(/\r?\n/)) {
    if (!line) {
      continue;
    }

    const [rankText, hostText] = line.split(",");
    const rank = Number(rankText);
    const hostname = hostText?.trim().toLowerCase();

    if (!Number.isFinite(rank) || !hostname) {
      continue;
    }

    if (rank < minRank || rank > maxRank) {
      continue;
    }

    try {
      rows.push({
        active: true,
        backoff_until: null,
        cooldown_until: null,
        deny_reason: null,
        denylisted: false,
        failure_count: 0,
        hostname,
        id: `tranco-preview-${rank}`,
        last_completed_at: null,
        last_error: null,
        last_run_at: null,
        last_status: null,
        normalized_url: normalizeUrl(hostname),
        rank_band: rankBandForRank(rank),
        source: "tranco",
        tranco_rank: rank
      });
    } catch {
      continue;
    }

    if (rows.length >= limit) {
      break;
    }
  }

  return rows;
}

function getUpcomingTargets(targets: ValidationTargetRow[], limit = 7) {
  const now = new Date();
  const eligibleTargets = targets.filter((target) => {
    if (!target.active || target.denylisted) {
      return false;
    }

    const cooldownOk = !target.cooldown_until || new Date(target.cooldown_until) <= now;
    const backoffOk = !target.backoff_until || new Date(target.backoff_until) <= now;
    return cooldownOk && backoffOk;
  });

  const manualTargets = eligibleTargets
    .filter((target) => target.source === "manual")
    .sort((left, right) => {
      const leftRunAt = left.last_run_at ? new Date(left.last_run_at).getTime() : 0;
      const rightRunAt = right.last_run_at ? new Date(right.last_run_at).getTime() : 0;

      if (leftRunAt !== rightRunAt) {
        return leftRunAt - rightRunAt;
      }

      return left.hostname.localeCompare(right.hostname);
    });

  const shuffledTrancoTargets = eligibleTargets
    .filter((target) => {
      const rank = target.tranco_rank;
      return target.source === "tranco" && rank !== null && rank >= 1000 && rank <= 20000;
    })
    .sort(() => Math.random() - 0.5);

  return [...manualTargets, ...shuffledTrancoTargets].slice(0, limit);
}

function isPopulatedValidationSignal(key: string, value: ScanSignalRow["signal_value_json"]) {
  if (value === null || value === undefined || value === "") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return false;
    }

    if (/score|window_days|word_count|semantic_confidence/i.test(key)) {
      return true;
    }

    return value > 0;
  }

  if (typeof value === "string") {
    return value.trim().length > 0 && value !== "unknown" && value !== "absent" && value !== "none";
  }

  return true;
}

function isConcerningValidationSignal(row: ScanSignalRow) {
  if (!isPopulatedValidationSignal(row.signal_key, row.signal_value_json)) {
    return false;
  }

  const negativePatterns = [
    /dark_pattern/,
    /preconsent/,
    /conflict/,
    /mismatch/,
    /litigation_risk_score/,
    /error_count/,
    /warning_count/,
    /issue_count/,
    /failures_count/,
    /store_credit_only/,
    /termination_for_cause/,
    /service_suspension_or_termination/,
    /retargeting_pixel/,
    /session_replay/,
    /functional_misalignment/,
    /technical_disclosure/,
    /disclosure_gap/,
    /surface_missing/,
    /fetch_failed/,
    /bounded_search/,
    /structurally_obstructed/,
    /likely_obstructed/,
    /high_sensitivity_data_collection_detected/,
    /limited_time_offer_language_present/,
    /discount_claim_present/,
    /original_price_comparison_present/
  ];

  if (negativePatterns.some((pattern) => pattern.test(row.signal_key))) {
    return true;
  }

  if (typeof row.signal_value_json === "number" && /risk_score|ambiguity_score|friction_score/i.test(row.signal_key)) {
    return row.signal_value_json > 0;
  }

  return false;
}

function getValidationConcernReason(row: ScanSignalRow) {
  const key = row.signal_key;

  if (/functional_misalignment/i.test(key)) {
    return "Strong runtime evidence suggests the live rights-fulfillment experience conflicts with the site’s policy posture.";
  }

  if (/technical_disclosure/i.test(key)) {
    return "Runtime behavior suggests a tracking or replay function that is not clearly disclosed in the scanned policy materials.";
  }

  if (/disclosure_gap/i.test(key)) {
    return "Observed runtime cookies could not be reconciled to explicit cookie disclosures on the site.";
  }

  if (/structurally_obstructed|likely_obstructed/i.test(key)) {
    return "The scanned policy surface was too weak or structurally obstructed for reliable technical disclosure reconciliation.";
  }

  if (/preconsent|tracking_before_consent/i.test(key)) {
    return "Observed before a clear user choice was made.";
  }

  if (/conflict|mismatch/i.test(key)) {
    return "Signals a contradiction or mismatch that merits direct review.";
  }

  if (/dark_pattern|limited_time_offer_language_present|discount_claim_present|original_price_comparison_present/i.test(key)) {
    return "Promotional or choice architecture may need closer disclosure review.";
  }

  if (/store_credit_only/i.test(key)) {
    return "Post-purchase remedy may be more restrictive than expected.";
  }

  if (/termination_for_cause|service_suspension_or_termination/i.test(key)) {
    return "Terms reserve restrictive enforcement rights that should be read directly.";
  }

  if (/risk_score|ambiguity_score|friction_score/i.test(key)) {
    return "Scanner-derived risk indicator is elevated.";
  }

  if (/error_count|warning_count|issue_count|failures_count/i.test(key)) {
    return "Automated issues were surfaced in this area.";
  }

  if (/surface_missing/i.test(key)) {
    return "A key disclosure or support page surface was not detected during the scan.";
  }

  if (/fetch_failed/i.test(key)) {
    return "A key disclosure or support page was detected, but its target URL could not be fetched successfully.";
  }

  if (/key_page_discovery_unresolved_after_bounded_search/i.test(key)) {
    return "The scanner exhausted its bounded key-page discovery budget without confirming one or more expected legal or support pages.";
  }

  return "This signal is worth reviewer attention.";
}

function getValidationSignalSeverity(row: ScanSignalRow) {
  if (/preconsent|session_replay|conflict|mismatch|functional_misalignment|technical_disclosure|disclosure_gap/i.test(row.signal_key)) {
    return "high";
  }

  if (/privacy_policy_(surface_missing|fetch_failed)/i.test(row.signal_key)) {
    return "high";
  }

  if (/key_page_discovery_unresolved_after_bounded_search|structurally_obstructed|likely_obstructed|surface_missing|fetch_failed/i.test(row.signal_key)) {
    return "medium";
  }

  if (typeof row.signal_value_json === "number" && /risk_score|ambiguity_score|friction_score/i.test(row.signal_key)) {
    return row.signal_value_json >= 70 ? "high" : "medium";
  }

  return "medium";
}

function getSupplementalFindingTitle(row: ScanSignalRow) {
  if (row.signal_key === "privacy.policy_runtime_functional_misalignment_detected") {
    return "High-confidence functional misalignment";
  }

  if (row.signal_key === "disclosure.policy_runtime_missing_technical_disclosure_detected") {
    return "Missing technical disclosure";
  }

  if (row.signal_key === "disclosure.policy_runtime_disclosure_likely_obstructed") {
    return "Disclosure likely obstructed";
  }

  if (row.signal_key === "privacy.cookie_runtime_disclosure_gap_detected") {
    return "Cookie disclosure gap";
  }

  if (row.signal_key === "disclosure.cookie_policy_structurally_obstructed") {
    return "Cookie policy structurally obstructed";
  }

  if (row.signal_key === "disclosure.privacy_policy_surface_missing") {
    return "Privacy policy surface not detected";
  }

  if (row.signal_key === "disclosure.privacy_policy_fetch_failed") {
    return "Privacy policy page unavailable";
  }

  if (row.signal_key === "disclosure.terms_of_service_surface_missing") {
    return "Terms page surface not detected";
  }

  if (row.signal_key === "disclosure.terms_of_service_fetch_failed") {
    return "Terms page unavailable";
  }

  if (row.signal_key === "disclosure.cookie_policy_surface_missing") {
    return "Cookie policy surface not detected";
  }

  if (row.signal_key === "disclosure.cookie_policy_fetch_failed") {
    return "Cookie policy unavailable";
  }

  if (row.signal_key === "disclosure.accessibility_statement_surface_missing") {
    return "Accessibility statement surface not detected";
  }

  if (row.signal_key === "disclosure.accessibility_statement_fetch_failed") {
    return "Accessibility statement unavailable";
  }

  if (row.signal_key === "disclosure.contact_page_surface_missing") {
    return "Contact page surface not detected";
  }

  if (row.signal_key === "disclosure.contact_page_fetch_failed") {
    return "Contact page unavailable";
  }

  if (row.signal_key === "disclosure.key_page_discovery_unresolved_after_bounded_search") {
    return "Bounded key-page discovery unresolved";
  }

  if (row.signal_key === "privacy.user_rights_friction_score" && typeof row.signal_value_json === "number") {
    return row.signal_value_json >= 100 ? "Critical user-rights fulfillment friction" : "High user-rights fulfillment friction";
  }

  if (row.signal_key === "accessibility.accessibility_risk_score" && typeof row.signal_value_json === "number") {
    return "Elevated accessibility risk score";
  }

  return row.signal_label;
}

function buildSupplementalValidationFindingRows(existingFindings: ValidationRunFindingRow[], scanSignals: ScanSignalRow[]) {
  const existingRuleKeys = new Set(existingFindings.map((row) => row.rule_key));
  const existingTitles = new Set(existingFindings.map((row) => row.title.trim().toLowerCase()));
  const supplements: ValidationRunFindingRow[] = [];

  for (const row of scanSignals) {
    if (!isConcerningValidationSignal(row)) {
      continue;
    }

    const title = getSupplementalFindingTitle(row);
    const fallbackEvidence = {
      signalCategory: row.category,
      signalKey: row.signal_key,
      signalLabel: row.signal_label,
      signalValue: row.signal_value_json
    } satisfies Record<string, unknown>;

    if (
      !shouldSurfacePrimarySignalFinding({
        fallbackEvidence,
        key: row.signal_key,
        linkedValidationEvidence: null
      })
    ) {
      continue;
    }

    if (existingRuleKeys.has(`scan_signal.${row.signal_key}`) || existingTitles.has(title.trim().toLowerCase())) {
      continue;
    }

    supplements.push({
      category: row.category,
      description: getValidationConcernReason(row),
      evidence_json: {
        signalKey: row.signal_key,
        signalLabel: row.signal_label,
        signalValue: row.signal_value_json,
        signalCategory: row.category
      },
      finding_rank: existingFindings.length + supplements.length + 1,
      id: `supplemental:${row.signal_key}`,
      page_url: null,
      rule_key: `scan_signal.${row.signal_key}`,
      severity: getValidationSignalSeverity(row),
      subtype: "scan_signal_review",
      title
    });
  }

  return supplements;
}

function normalizePolicyPageTypeLabel(pageType: string | null) {
  switch (pageType) {
    case "privacy_policy":
      return "Privacy Policy";
    case "terms_of_service":
      return "TOS";
    case "cookie_policy":
      return "Cookie Policy";
    default:
      return "Policy";
  }
}

function buildPolicyReviewDescription(reason: string) {
  switch (reason) {
    case "policy_behavior_conflict_candidate":
      return "Observed site behavior may conflict with the site’s public-facing policy language.";
    case "session_replay_without_disclosure_detected":
      return "Session replay behavior may be present without a clear matching disclosure in the scanned policy pages.";
    case "missing_dsar_high_exposure":
      return "The site may have elevated exposure while still lacking a clear DSAR path in policy disclosures.";
    case "low_confidence_critical_fields":
      return "Critical policy extraction fields were low confidence and need manual review in the scan report.";
    default:
      return `This issue was added to the scan report review queue under ${reason.replaceAll("_", " ")}.`;
  }
}

function buildSupplementalPolicyQueueFindings(input: {
  existingFindings: ExistingFindingIdentity[];
  policyEnrichmentById: Map<string, PolicyEnrichmentLookupRow>;
  policyReviewQueueRows: PolicyReviewQueueRow[];
  startingRank: number;
}) {
  const existingRuleKeys = new Set(input.existingFindings.map((row) => row.rule_key));
  const existingTitles = new Set(input.existingFindings.map((row) => row.title.trim().toLowerCase()));
  const supplements: ValidationRunFindingRow[] = [];

  for (const row of input.policyReviewQueueRows) {
    const enrichment = row.policy_enrichment_id ? input.policyEnrichmentById.get(row.policy_enrichment_id) : undefined;
    const pageType = enrichment?.page_type ?? "unknown";
    const pageTypeLabel = normalizePolicyPageTypeLabel(pageType);
    const title =
      row.reason === "low_confidence_critical_fields"
        ? `Low-confidence extraction ${pageTypeLabel}`
        : `${row.reason.replaceAll("_", " ")} ${pageTypeLabel}`.replace(/\b\w/g, (char) => char.toUpperCase());
    const ruleKey = `policy_review.${row.reason}.${String(pageType).toLowerCase()}`;

    if (existingRuleKeys.has(ruleKey) || existingTitles.has(title.trim().toLowerCase())) {
      continue;
    }

    supplements.push({
      category: "legal",
      description: buildPolicyReviewDescription(row.reason),
      evidence_json: {
        pageType: enrichment?.page_type ?? null,
        pageUrl: enrichment?.page_url ?? null,
        policyEnrichmentId: row.policy_enrichment_id,
        policyAmbiguityScore: enrichment?.policy_ambiguity_score ?? null,
        policyArbitrationPresent: enrichment?.policy_arbitration_present ?? null,
        policyCancellationOrRefundPresent: enrichment?.policy_cancellation_or_refund_present ?? null,
        policyCoverageRatio: enrichment?.policy_coverage_ratio ?? null,
        policyEffectiveDate: enrichment?.policy_effective_date ?? null,
        policyFieldCoverage: enrichment?.policy_field_coverage ?? {},
        policyGoverningLaw: enrichment?.policy_governing_law ?? null,
        policyNoticeContactPresent: enrichment?.policy_notice_contact_present ?? null,
        reviewQueueReason: row.reason,
        reviewStatus: row.review_status,
        policySemanticConfidence: enrichment?.policy_semantic_confidence ?? null,
        policySnippetCount: enrichment?.policy_snippet_count ?? null,
        policyStructurallyWeak: enrichment?.policy_structurally_weak ?? null,
        policySummaryShort: enrichment?.policy_summary_short ?? null,
        policyTerminationOrSuspensionPresent: enrichment?.policy_termination_or_suspension_present ?? null
      },
      finding_rank: input.startingRank + supplements.length + 1,
      id: `supplemental:policy_review:${row.id}`,
      page_url: enrichment?.page_url ?? null,
      rule_key: ruleKey,
      severity: row.reason === "policy_behavior_conflict_candidate" ? "high" : "medium",
      subtype: "policy_review_queue",
      title
    });
  }

  return supplements;
}

function buildSupplementalSnapshotFindings(input: {
  existingFindings: ExistingFindingIdentity[];
  snapshot: SnapshotSupplementRow | null;
  startingRank: number;
}) {
  const snapshot = input.snapshot;
  if (!snapshot) {
    return [] as ValidationRunFindingRow[];
  }

  const existingRuleKeys = new Set(input.existingFindings.map((row) => row.rule_key));
  const existingTitles = new Set(input.existingFindings.map((row) => row.title.trim().toLowerCase()));
  const supplements: ValidationRunFindingRow[] = [];

  if (snapshot.retargeting_pixel_detected === true) {
    const title = "Retargeting pixel detected";
    const ruleKey = "scan_snapshot.commerce.retargeting_pixel_detected";

    if (!existingRuleKeys.has(ruleKey) && !existingTitles.has(title.toLowerCase())) {
      supplements.push({
        category: "privacy",
        description: "Advertising or retargeting technology appears to be active and merits direct review.",
        evidence_json: {
          snapshotField: "retargeting_pixel_detected",
          value: true
        },
        finding_rank: input.startingRank + supplements.length + 1,
        id: "supplemental:snapshot:retargeting_pixel_detected",
        page_url: null,
        rule_key: ruleKey,
        severity: "high",
        subtype: "snapshot_review",
        title
      });
    }
  }

  if (typeof snapshot.accessibility_litigation_risk_score === "number") {
    const title = "Accessibility risk score";
    const ruleKey = "scan_snapshot.accessibility.accessibility_risk_score";

    if (!existingRuleKeys.has(ruleKey) && !existingTitles.has(title.toLowerCase())) {
      supplements.push({
        category: "accessibility",
        description: "Scanner-derived risk indicator is elevated.",
        evidence_json: {
          snapshotField: "accessibility_litigation_risk_score",
          value: snapshot.accessibility_litigation_risk_score
        },
        finding_rank: input.startingRank + supplements.length + 1,
        id: "supplemental:snapshot:accessibility_risk_score",
        page_url: null,
        rule_key: ruleKey,
        severity: "medium",
        subtype: "snapshot_review",
        title
      });
    }
  }

  return supplements;
}

async function loadSupplementalValidationFindings(input: {
  existingFindings: ExistingFindingIdentity[];
  scanId: string | null;
}) {
  if (!input.scanId) {
    return [] as ValidationRunFindingRow[];
  }

  const supabase = createAdminClient();
  const [{ data: scanSignals, error: scanSignalsError }, { data: snapshot, error: snapshotError }, { data: policyQueue, error: policyQueueError }] =
    await Promise.all([
      supabase
        .from("scan_signals")
        .select("category, signal_key, signal_label, signal_value_json, value_type")
        .eq("scan_id", input.scanId),
      supabase
        .from("scan_snapshots")
        .select("retargeting_pixel_detected, accessibility_litigation_risk_score")
        .eq("scan_id", input.scanId)
        .maybeSingle(),
      supabase
        .from("policy_review_queue")
        .select("id, policy_enrichment_id, reason, review_status, scan_id")
        .eq("scan_id", input.scanId)
    ]);

  if (scanSignalsError) {
    throw new Error(`Failed to load supplemental scan signals for ${input.scanId}: ${scanSignalsError.message}`);
  }

  if (snapshotError) {
    throw new Error(`Failed to load supplemental snapshot context for ${input.scanId}: ${snapshotError.message}`);
  }

  if (policyQueueError) {
    throw new Error(`Failed to load supplemental policy review queue for ${input.scanId}: ${policyQueueError.message}`);
  }

  const queueRows = (policyQueue ?? []) as PolicyReviewQueueRow[];
  const enrichmentIds = queueRows
    .map((row) => row.policy_enrichment_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  let policyEnrichmentRows: PolicyEnrichmentLookupRow[] = [];
  if (enrichmentIds.length > 0) {
    const { data: enrichmentRows, error: enrichmentError } = await supabase
      .from("policy_enrichment")
      .select("id, page_type, page_url, policy_ambiguity_score, policy_arbitration_present, policy_cancellation_or_refund_present, policy_coverage_ratio, policy_effective_date, policy_field_coverage, policy_governing_law, policy_notice_contact_present, policy_semantic_confidence, policy_snippet_count, policy_structurally_weak, policy_summary_short, policy_termination_or_suspension_present")
      .in("id", enrichmentIds);

    if (enrichmentError) {
      throw new Error(`Failed to load supplemental policy enrichment rows for ${input.scanId}: ${enrichmentError.message}`);
    }

    policyEnrichmentRows = (enrichmentRows ?? []) as PolicyEnrichmentLookupRow[];
  }
  const policyEnrichmentById = new Map(policyEnrichmentRows.map((row) => [row.id, row]));

  const existingFindingRows = input.existingFindings.map((row, index) => ({
    category: "privacy",
    description: "",
    evidence_json: {},
    finding_rank: index + 1,
    id: `existing:${index}`,
    page_url: null,
    rule_key: row.rule_key,
    severity: "medium",
    subtype: null,
    title: row.title
  })) satisfies ValidationRunFindingRow[];

  const signalSupplements = buildSupplementalValidationFindingRows(existingFindingRows, (scanSignals ?? []) as ScanSignalRow[]);
  const policySupplements = buildSupplementalPolicyQueueFindings({
    existingFindings: [...input.existingFindings, ...signalSupplements],
    policyEnrichmentById,
    policyReviewQueueRows: queueRows,
    startingRank: input.existingFindings.length + signalSupplements.length
  });
  const snapshotSupplements = buildSupplementalSnapshotFindings({
    existingFindings: [...input.existingFindings, ...signalSupplements, ...policySupplements],
    snapshot: (snapshot as SnapshotSupplementRow | null) ?? null,
    startingRank: input.existingFindings.length + signalSupplements.length + policySupplements.length
  });

  return [...signalSupplements, ...policySupplements, ...snapshotSupplements].map((row, index) => ({
    ...row,
    finding_rank: input.existingFindings.length + index + 1
  }));
}

function shouldLoadSupplementalFindingsForRunStatus(status: string | null | undefined) {
  return status === "completed" || status === "failed";
}

function getEffectiveValidationRunStatus(input: {
  scanStatus?: string | null;
  status: string | null | undefined;
}) {
  if (input.status === "completed" || input.status === "failed") {
    return input.status;
  }

  if (input.scanStatus === "completed") {
    return "completed";
  }

  if (input.scanStatus === "failed") {
    return "failed";
  }

  if (input.scanStatus === "running" || input.scanStatus === "processing") {
    return "collecting";
  }

  return input.status ?? null;
}

async function ensureValidationDomainForOrganization(input: {
  organizationId: string;
  hostname: string;
  normalizedUrl: string;
}) {
  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("domains")
    .select("id, hostname, normalized_url")
    .eq("organization_id", input.organizationId)
    .eq("normalized_url", input.normalizedUrl)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load validation domain ${input.normalizedUrl}: ${existingError.message}`);
  }

  if (existing) {
    return existing as { hostname: string; id: string; normalized_url: string };
  }

  const { data, error } = await supabase
    .from("domains")
    .insert({
      hostname: input.hostname,
      normalized_url: input.normalizedUrl,
      organization_id: input.organizationId,
      scan_frequency: "manual"
    })
    .select("id, hostname, normalized_url")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create validation domain ${input.hostname}: ${error?.message ?? "Unknown error"}`);
  }

  return data as { hostname: string; id: string; normalized_url: string };
}

async function createValidationScan(input: {
  domainId: string;
  hostname: string;
  normalizedUrl: string;
  organizationId: string;
  pagesRequested?: number;
  submittedByUserId: string;
}) {
  const supabase = createAdminClient();
  const pagesRequested = Math.max(3, input.pagesRequested ?? 8);
  const scanConfig = {
    hostname: input.hostname,
    maxPages: pagesRequested,
    normalizedUrl: input.normalizedUrl,
    processor: "agentic-validation-v1",
    profile: "agentic-validation-v1",
    source: "validation-manual"
  };

  const { data, error } = await supabase
    .from("scans")
    .insert({
      domain_id: input.domainId,
      organization_id: input.organizationId,
      pages_requested: pagesRequested,
      pages_scanned: 0,
      scan_config_json: scanConfig,
      scan_type: "full",
      status: "queued",
      submitted_by_user_id: input.submittedByUserId
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create validation scan for ${input.hostname}: ${error?.message ?? "Unknown error"}`);
  }

  const scanId = (data as { id: string }).id;
  const { error: domainError } = await supabase
    .from("domains")
    .update({ latest_scan_id: scanId })
    .eq("id", input.domainId)
    .eq("organization_id", input.organizationId);
  if (domainError) {
    throw new Error(`Failed to set validation domain latest scan: ${domainError.message}`);
  }

  return scanId;
}

function getPipelineState(settings: ValidationSettingsRow): ValidationPipelineState {
  return process.env.VALIDATION_PIPELINE_ENABLED === "0"
    ? "paused_by_env"
    : settings.pipeline_enabled
      ? "running"
      : "paused_by_admin";
}

async function requireAdmin() {
  return requireValidationAdminContext();
}

export async function getValidationSettings() {
  const context = await requireAdmin();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("validation_settings")
    .upsert(
      {
        automatic_interval_minutes: VALIDATION_DEFAULT_INTERVAL_MINUTES,
        run_mode: VALIDATION_DEFAULT_RUN_MODE,
        singleton_key: "default"
      },
      { onConflict: "singleton_key" }
    )
    .select("singleton_key, pipeline_enabled, run_mode, automatic_interval_minutes, operator_note, updated_at, updated_by_user_id, next_due_at, last_tranco_sync_at, last_worker_heartbeat_at, last_worker_started_at, last_worker_host")
    .single();

  if (error || !data) {
    throw new Error(`Failed to load validation settings: ${error?.message ?? "Unknown error"}`);
  }

  const row = data as ValidationSettingsRow;
  const queueHealth = getValidationQueueAvailability().enabled ? await getValidationQueueHealth() : null;
  const heartbeatAgeMs = row.last_worker_heartbeat_at ? Date.now() - new Date(row.last_worker_heartbeat_at).getTime() : null;
  const workerHealthy = typeof heartbeatAgeMs === "number" ? heartbeatAgeMs <= 90_000 : false;
  const collectWaiting = queueHealth?.collect.waiting ?? 0;
  const rankWaiting = queueHealth?.rank.waiting ?? 0;
  const collectActive = queueHealth?.collect.active ?? 0;
  const rankActive = queueHealth?.rank.active ?? 0;
  const backlogDetected = Boolean(
    queueHealth &&
      (collectWaiting > 0 || rankWaiting > 0) &&
      collectActive + rankActive === 0
  );

  return {
    automaticIntervalMinutes: row.automatic_interval_minutes,
    lastTrancoSyncAt: row.last_tranco_sync_at,
    lastWorkerHeartbeatAt: row.last_worker_heartbeat_at,
    lastWorkerHost: row.last_worker_host,
    lastWorkerStartedAt: row.last_worker_started_at,
    nextDueAt: row.next_due_at,
    operatorNote: row.operator_note,
    pipelineEnabled: row.pipeline_enabled,
    pipelineState: getPipelineState(row),
    queueHealth,
    runMode: row.run_mode,
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id,
    workerBacklogDetected: backlogDetected,
    workerHealthy,
    viewerEmail: context.user.email ?? ""
  };
}

export async function listValidationTargets(limit = 25) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("validation_targets")
    .select(
      "id, hostname, normalized_url, tranco_rank, rank_band, active, denylisted, deny_reason, cooldown_until, backoff_until, last_status, last_error, last_run_at, last_completed_at, failure_count, source"
    )
    .order("tranco_rank", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load validation targets: ${error.message}`);
  }

  const rows = (data ?? []) as ValidationTargetRow[];
  const fallbackRows = rows.length > 0 ? rows : await listTrancoPreviewTargets(limit);

  return getUpcomingTargets(fallbackRows, limit).map((row) => ({
    active: row.active,
    backoffUntil: row.backoff_until,
    cooldownUntil: row.cooldown_until,
    denyReason: row.deny_reason,
    denylisted: row.denylisted,
    hostname: row.hostname,
    id: row.id,
    isPersisted: !row.id.startsWith("tranco-preview-"),
    lastError: row.last_error,
    lastStatus: row.last_status,
    normalizedUrl: row.normalized_url,
    rankBand: row.rank_band,
    source: row.source ?? "tranco",
    trancoRank: row.tranco_rank
  }));
}

export async function listValidationRuns(input?: {
  page?: number;
  rankBand?: string | null;
  ruleKey?: string | null;
  status?: string | null;
}) {
  await requireAdmin();
  const supabase = createAdminClient();
  const page = Math.max(1, input?.page ?? 1);
  const from = (page - 1) * 50;
  const to = from + 49;

  let scanIdsFilter: string[] | null = null;
  if (input?.ruleKey) {
    const { data: matchingRunIds, error: runIdsError } = await supabase
      .from("validation_run_findings")
      .select("validation_run_id")
      .eq("rule_key", input.ruleKey);

    if (runIdsError) {
      throw new Error(`Failed to filter validation runs by rule key: ${runIdsError.message}`);
    }

    scanIdsFilter = [...new Set(((matchingRunIds ?? []) as Array<{ validation_run_id: string }>).map((row) => row.validation_run_id))];
    if (scanIdsFilter.length === 0) {
      return {
        items: [],
        page,
        pageCount: 0,
        totalCount: 0
      };
    }
  }

  let query = supabase
    .from("validation_runs")
    .select("id, domain_id, hostname, tranco_rank, rank_band, trigger_mode, status, scan_id, created_at, completed_at, finding_count, reviewed_finding_count, average_agreement_score, error_message", {
      count: "exact"
    })
    .order("created_at", { ascending: false });

  if (input?.status) {
    query = query.eq("status", input.status);
  }

  if (input?.rankBand) {
    query = query.eq("rank_band", input.rankBand);
  }

  if (scanIdsFilter) {
    query = query.in("id", scanIdsFilter);
  }

  const { data, error, count } = await query.range(from, to);
  if (error) {
    throw new Error(`Failed to load validation runs: ${error.message}`);
  }

  const rows = (data ?? []) as ValidationRunRow[];
  const runIds = rows.map((row) => row.id);
  const scanIds = rows.map((row) => row.scan_id).filter((value): value is string => typeof value === "string" && value.length > 0);
  const findingCountByRun = new Map<string, number>();
  const existingFindingIdentitiesByRun = new Map<string, ExistingFindingIdentity[]>();
  const scanStatusById = new Map<string, { completed_at: string | null; started_at: string | null; status: string }>();

  if (runIds.length > 0) {
    const { data: findings, error: findingsError } = await supabase
      .from("validation_run_findings")
      .select("id, validation_run_id, rule_key, title")
      .in("validation_run_id", runIds);

    if (findingsError) {
      throw new Error(`Failed to load validation run findings: ${findingsError.message}`);
    }

    for (const row of (findings ?? []) as Array<{ id: string; validation_run_id: string; rule_key: string; title: string }>) {
      const list = findingCountByRun.get(row.validation_run_id) ?? 0;
      findingCountByRun.set(row.validation_run_id, list + 1);
      const existing = existingFindingIdentitiesByRun.get(row.validation_run_id) ?? [];
      existing.push({ rule_key: row.rule_key, title: row.title });
      existingFindingIdentitiesByRun.set(row.validation_run_id, existing);
    }
  }

  if (scanIds.length > 0) {
    const { data: scans, error: scansError } = await supabase
      .from("scans")
      .select("id, status, started_at, completed_at")
      .in("id", scanIds);

    if (scansError) {
      throw new Error(`Failed to load linked scans for validation runs: ${scansError.message}`);
    }

    for (const row of (scans ?? []) as Array<{ completed_at: string | null; id: string; started_at: string | null; status: string }>) {
      scanStatusById.set(row.id, row);
    }
  }

  const supplementalCountByRun = new Map<string, number>();
  for (const row of rows) {
    const effectiveStatus = getEffectiveValidationRunStatus({
      scanStatus: row.scan_id ? (scanStatusById.get(row.scan_id)?.status ?? null) : null,
      status: row.status
    });
    const persistedCount = findingCountByRun.get(row.id) ?? row.finding_count;
    const supplements = shouldLoadSupplementalFindingsForRunStatus(effectiveStatus)
      ? await loadSupplementalValidationFindings({
          existingFindings: existingFindingIdentitiesByRun.get(row.id) ?? [],
          scanId: row.scan_id
        })
      : [];
    supplementalCountByRun.set(row.id, persistedCount + supplements.length);
  }

  const totalCount = count ?? 0;
  return {
    items: rows.map((row) => ({
      averageAgreementScore: null,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      domainId: row.domain_id,
      errorMessage: row.error_message,
      findingCount: supplementalCountByRun.get(row.id) ?? findingCountByRun.get(row.id) ?? row.finding_count,
      hostname: row.hostname,
      id: row.id,
      rankBand: row.rank_band,
      reviewedFindingCount: 0,
      scanCompletedAt: row.scan_id ? (scanStatusById.get(row.scan_id)?.completed_at ?? null) : null,
      scanId: row.scan_id,
      scanStartedAt: row.scan_id ? (scanStatusById.get(row.scan_id)?.started_at ?? null) : null,
      scanStatus: row.scan_id ? (scanStatusById.get(row.scan_id)?.status ?? null) : null,
      status: getEffectiveValidationRunStatus({
        scanStatus: row.scan_id ? (scanStatusById.get(row.scan_id)?.status ?? null) : null,
        status: row.status
      }),
      trancoRank: row.tranco_rank,
      triggerMode: row.trigger_mode
    })),
    page,
    pageCount: Math.ceil(totalCount / 50),
    totalCount
  };
}

export async function getValidationRunDetail(validationRunId: string) {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data: run, error: runError } = await supabase
    .from("validation_runs")
    .select("id, domain_id, hostname, tranco_rank, rank_band, trigger_mode, status, scan_id, created_at, completed_at, finding_count, reviewed_finding_count, average_agreement_score, error_message")
    .eq("id", validationRunId)
    .maybeSingle();

  if (runError) {
    throw new Error(`Failed to load validation run ${validationRunId}: ${runError.message}`);
  }

  if (!run) {
    return null;
  }

  const [{ data: scanRow }, { data: scanSnapshot }, { data: runtimeArtifacts }, { count: accessibilityRuleCountTotal }] = await Promise.all([
    (run as ValidationRunRow).scan_id
      ? supabase
          .from("scans")
          .select("status, started_at, completed_at")
          .eq("id", (run as ValidationRunRow).scan_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    (run as ValidationRunRow).scan_id
      ? supabase
          .from("scan_snapshots")
          .select("timeout_flag, render_mode_used, preconsent_tracking_detected, tracking_before_consent_detected, wcag_error_count_total, pages_scanned, pages_requested")
          .eq("scan_id", (run as ValidationRunRow).scan_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    (run as ValidationRunRow).scan_id
      ? supabase
          .from("scan_runtime_artifacts")
          .select("consent_audit_completed, consent_preconsent_violation_count, consent_baseline_tracker_evidence_urls, key_page_discovery_summary")
          .eq("scan_id", (run as ValidationRunRow).scan_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    (run as ValidationRunRow).scan_id
      ? supabase
          .from("scan_accessibility_rule_counts")
          .select("rule_code", { count: "exact", head: true })
          .eq("scan_id", (run as ValidationRunRow).scan_id)
      : Promise.resolve({ count: 0 })
  ]);

  const { data: scanEvents } = (run as ValidationRunRow).scan_id
    ? await supabase
        .from("scan_events")
        .select("id, event_type, message, metadata_json, created_at")
        .eq("scan_id", (run as ValidationRunRow).scan_id)
        .order("created_at", { ascending: true })
    : { data: [] as ScanEventRow[] };

  const { data: findings, error: findingsError } = await supabase
    .from("validation_run_findings")
    .select("id, category, subtype, rule_key, title, description, severity, page_url, evidence_json, finding_rank, validation_verdicts ( confidence )")
    .eq("validation_run_id", validationRunId)
    .order("finding_rank", { ascending: true });

  if (findingsError) {
    throw new Error(`Failed to load validation run findings: ${findingsError.message}`);
  }

  let normalizedFindings = (findings ?? []) as ValidationRunFindingRow[];
  const scanStatus =
    scanRow && typeof (scanRow as { status?: unknown }).status === "string"
      ? String((scanRow as { status: string }).status)
      : null;
  const effectiveStatus = getEffectiveValidationRunStatus({
    scanStatus,
    status: (run as ValidationRunRow).status
  });
  const supplementalFindings = shouldLoadSupplementalFindingsForRunStatus(effectiveStatus)
    ? await loadSupplementalValidationFindings({
        existingFindings: normalizedFindings,
        scanId: (run as ValidationRunRow).scan_id
      })
    : [];
  normalizedFindings = [...normalizedFindings, ...supplementalFindings];

  return {
    averageAgreementScore: (run as ValidationRunRow).average_agreement_score,
    completedAt:
      (run as ValidationRunRow).completed_at ??
      (scanRow && typeof (scanRow as { completed_at?: unknown }).completed_at === "string"
        ? String((scanRow as { completed_at: string }).completed_at)
        : null),
    createdAt: (run as ValidationRunRow).created_at,
    domainId: (run as ValidationRunRow).domain_id,
    errorMessage: (run as ValidationRunRow).error_message,
    findingCount: normalizedFindings.length,
    hostname: (run as ValidationRunRow).hostname,
    id: (run as ValidationRunRow).id,
    rankBand: (run as ValidationRunRow).rank_band,
    reviewedFindingCount: (run as ValidationRunRow).reviewed_finding_count,
    scanCompletedAt:
      scanRow && typeof (scanRow as { completed_at?: unknown }).completed_at === "string"
        ? String((scanRow as { completed_at: string }).completed_at)
        : null,
    scanId: (run as ValidationRunRow).scan_id,
    scanStartedAt:
      scanRow && typeof (scanRow as { started_at?: unknown }).started_at === "string"
        ? String((scanRow as { started_at: string }).started_at)
        : null,
    scanStatus:
      scanStatus,
    scanExecution: {
      accessibilityRuleCountTotal: accessibilityRuleCountTotal ?? 0,
      consentAuditCompleted:
        runtimeArtifacts && typeof (runtimeArtifacts as { consent_audit_completed?: unknown }).consent_audit_completed === "boolean"
          ? Boolean((runtimeArtifacts as { consent_audit_completed: boolean }).consent_audit_completed)
          : null,
      consentPreconsentViolationCount:
        runtimeArtifacts && typeof (runtimeArtifacts as { consent_preconsent_violation_count?: unknown }).consent_preconsent_violation_count === "number"
          ? Number((runtimeArtifacts as { consent_preconsent_violation_count: number }).consent_preconsent_violation_count)
          : null,
      keyPageDiscoverySummary:
        runtimeArtifacts && typeof (runtimeArtifacts as { key_page_discovery_summary?: unknown }).key_page_discovery_summary === "object"
          ? ((runtimeArtifacts as { key_page_discovery_summary: unknown }).key_page_discovery_summary ?? null)
          : null,
      pagesRequested:
        scanSnapshot && typeof (scanSnapshot as { pages_requested?: unknown }).pages_requested === "number"
          ? Number((scanSnapshot as { pages_requested: number }).pages_requested)
          : null,
      pagesScanned:
        scanSnapshot && typeof (scanSnapshot as { pages_scanned?: unknown }).pages_scanned === "number"
          ? Number((scanSnapshot as { pages_scanned: number }).pages_scanned)
          : null,
      preconsentTrackingDetected:
        scanSnapshot && typeof (scanSnapshot as { preconsent_tracking_detected?: unknown }).preconsent_tracking_detected === "boolean"
          ? Boolean((scanSnapshot as { preconsent_tracking_detected: boolean }).preconsent_tracking_detected)
          : null,
      renderModeUsed:
        scanSnapshot && typeof (scanSnapshot as { render_mode_used?: unknown }).render_mode_used === "string"
          ? String((scanSnapshot as { render_mode_used: string }).render_mode_used)
          : null,
      timeoutFlag:
        scanSnapshot && typeof (scanSnapshot as { timeout_flag?: unknown }).timeout_flag === "boolean"
          ? Boolean((scanSnapshot as { timeout_flag: boolean }).timeout_flag)
          : null,
      trackerEvidenceUrlCount:
        runtimeArtifacts &&
        Array.isArray((runtimeArtifacts as { consent_baseline_tracker_evidence_urls?: unknown }).consent_baseline_tracker_evidence_urls)
          ? ((runtimeArtifacts as { consent_baseline_tracker_evidence_urls: unknown[] }).consent_baseline_tracker_evidence_urls).length
          : 0,
      trackingBeforeConsentDetected:
        scanSnapshot && typeof (scanSnapshot as { tracking_before_consent_detected?: unknown }).tracking_before_consent_detected === "boolean"
          ? Boolean((scanSnapshot as { tracking_before_consent_detected: boolean }).tracking_before_consent_detected)
          : null,
      wcagErrorCountTotal:
        scanSnapshot && typeof (scanSnapshot as { wcag_error_count_total?: unknown }).wcag_error_count_total === "number"
          ? Number((scanSnapshot as { wcag_error_count_total: number }).wcag_error_count_total)
          : null
    },
    scanEvents: ((scanEvents ?? []) as ScanEventRow[]).map((event) => ({
      createdAt: event.created_at,
      eventType: event.event_type,
      id: event.id,
      message: event.message,
      metadataJson: event.metadata_json
    })),
    status: effectiveStatus,
    trancoRank: (run as ValidationRunRow).tranco_rank,
    triggerMode: (run as ValidationRunRow).trigger_mode,
    rows: normalizedFindings.map((finding) => {
      const verdictRows = Array.isArray(finding.validation_verdicts)
        ? finding.validation_verdicts
        : finding.validation_verdicts
          ? [finding.validation_verdicts]
          : [];
      const verdict = verdictRows[0];

      return {
        automatedFinding: {
          category: finding.category,
          description: finding.description,
          evidence: finding.evidence_json ?? {},
          modelConfidence: verdict?.confidence ?? null,
          pageUrl: finding.page_url,
          rank: finding.finding_rank,
          ruleKey: finding.rule_key,
          severity: finding.severity,
          subtype: finding.subtype,
          title: finding.title
        }
      };
    })
  };
}

export async function getValidationIssueAnalytics() {
  await requireAdmin();
  const supabase = createAdminClient();
  const { data: findings, error: findingsError } = await supabase
    .from("validation_run_findings")
    .select("id, rule_key, title");

  if (findingsError) {
    throw new Error(`Failed to load validation finding analytics: ${findingsError.message}`);
  }

  const findingRows = (findings ?? []) as Array<{ id: string; rule_key: string; title: string }>;
  const findingIds = findingRows.map((row) => row.id);
  const verdictMap = new Map<string, ValidationVerdict>();

  if (findingIds.length > 0) {
    const { data: verdicts, error: verdictsError } = await supabase
      .from("validation_verdicts")
      .select("validation_run_finding_id, verdict")
      .in("validation_run_finding_id", findingIds);

    if (verdictsError) {
      throw new Error(`Failed to load validation verdict analytics: ${verdictsError.message}`);
    }

    for (const row of (verdicts ?? []) as Array<{ validation_run_finding_id: string; verdict: ValidationVerdict }>) {
      verdictMap.set(row.validation_run_finding_id, row.verdict);
    }
  }

  const byRule = new Map<
    string,
    {
      flaggedCount: number;
      inconclusiveCount: number;
      notSupportedCount: number;
      reviewedCount: number;
      supportedCount: number;
      title: string;
    }
  >();

  for (const finding of findingRows) {
    const bucket = byRule.get(finding.rule_key) ?? {
      flaggedCount: 0,
      inconclusiveCount: 0,
      notSupportedCount: 0,
      reviewedCount: 0,
      supportedCount: 0,
      title: finding.title
    };
    bucket.flaggedCount += 1;
    const verdict = verdictMap.get(finding.id);
    if (verdict) {
      bucket.reviewedCount += 1;
      if (verdict === "supported") {
        bucket.supportedCount += 1;
      } else if (verdict === "not_supported") {
        bucket.notSupportedCount += 1;
      } else {
        bucket.inconclusiveCount += 1;
      }
    }
    byRule.set(finding.rule_key, bucket);
  }

  return [...byRule.entries()]
    .map(([ruleKey, row]) => ({
      ...row,
      notSupportedRate: row.reviewedCount > 0 ? row.notSupportedCount / row.reviewedCount : 0,
      ruleKey,
      supportedRate: row.reviewedCount > 0 ? row.supportedCount / row.reviewedCount : 0
    }))
    .sort((left, right) => right.reviewedCount - left.reviewedCount || left.supportedRate - right.supportedRate);
}

export async function updateValidationSettingsAction(input: {
  automaticIntervalMinutes?: number;
  operatorNote?: string | null;
  pipelineEnabled?: boolean;
  runMode?: ValidationRunMode;
}) {
  const context = await requireAdmin();
  const supabase = createAdminClient();

  if (input.automaticIntervalMinutes !== undefined && !(VALIDATION_INTERVAL_OPTIONS as readonly number[]).includes(input.automaticIntervalMinutes)) {
    throw new Error("Invalid validation interval.");
  }

  const patch: Record<string, boolean | number | string | null> = {
    updated_by_user_id: context.user.id
  };

  if (input.automaticIntervalMinutes !== undefined) {
    patch.automatic_interval_minutes = input.automaticIntervalMinutes;
  }

  if (input.pipelineEnabled !== undefined) {
    patch.pipeline_enabled = input.pipelineEnabled;
  }

  if (input.runMode !== undefined) {
    patch.run_mode = input.runMode;
  }

  if (input.operatorNote !== undefined) {
    patch.operator_note = input.operatorNote;
  }

  const { error } = await supabase.from("validation_settings").update(patch).eq("singleton_key", "default");
  if (error) {
    throw new Error(`Failed to update validation settings: ${error.message}`);
  }

  await supabase.from("validation_audit_events").insert({
    actor_user_id: context.user.id,
    event_type:
      input.pipelineEnabled !== undefined
        ? input.pipelineEnabled
          ? "validation.pipeline_resumed"
          : "validation.pipeline_paused"
        : input.runMode !== undefined
          ? "validation.mode_changed"
          : "validation.interval_changed",
    metadata_json: input,
    reason: input.operatorNote ?? null
  });

  revalidatePath("/app");
  revalidatePath("/app/scans");
  revalidatePath("/app/issues");
}

export async function queueManualValidationRunAction(input: {
  hostname?: string;
  normalizedUrl?: string;
  source?: string;
  targetId: string;
  trancoRank?: number;
}) {
  const context = await requireAdmin();
  const availability = getValidationQueueAvailability();
  if (!availability.enabled) {
    throw new Error(availability.reason ?? "Validation queue is unavailable.");
  }

  const supabase = createAdminClient();
  const isSyntheticPreviewTarget = input.targetId.startsWith("tranco-preview-");
  let resolvedTarget: { hostname: string; id: string; normalized_url: string; tranco_rank: number | null } | null = null;

  if (!isSyntheticPreviewTarget) {
    const { data: target, error } = await supabase
      .from("validation_targets")
      .select("id, hostname, normalized_url, tranco_rank")
      .eq("id", input.targetId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load validation target: ${error.message}`);
    }

    resolvedTarget = (target as { hostname: string; id: string; normalized_url: string; tranco_rank: number | null } | null) ?? null;
  }

  if (!resolvedTarget && input.hostname && input.normalizedUrl) {
    const materializedSource = input.source === "tranco" ? "tranco" : "manual";
    const { data: insertedTarget, error: insertError } = await supabase
      .from("validation_targets")
      .upsert(
        {
          active: true,
          denylisted: false,
          hostname: input.hostname,
          normalized_url: input.normalizedUrl,
          rank_band: rankBandForRank(input.trancoRank ?? null),
          source: materializedSource,
          tranco_rank: input.trancoRank ?? null
        },
        { onConflict: "hostname" }
      )
      .select("id, hostname, normalized_url, tranco_rank")
      .single();

    if (insertError || !insertedTarget) {
      throw new Error(`Failed to materialize validation target: ${insertError?.message ?? "Unknown error"}`);
    }

    await supabase.from("validation_audit_events").insert({
      actor_user_id: context.user.id,
      event_type: "validation.target_added",
      metadata_json: {
        hostname: input.hostname,
        normalizedUrl: input.normalizedUrl,
        source: `${materializedSource}_fallback_materialized`,
        trancoRank: input.trancoRank ?? null
      }
    });

    resolvedTarget = insertedTarget as { hostname: string; id: string; normalized_url: string; tranco_rank: number | null };
  }

  if (!resolvedTarget) {
    throw new Error("Validation target not found.");
  }

  const { data: settings, error: settingsError } = await supabase
    .from("validation_settings")
    .select("pipeline_enabled")
    .eq("singleton_key", "default")
    .single();

  if (settingsError) {
    throw new Error(`Failed to load validation pipeline state: ${settingsError.message}`);
  }

  if (process.env.VALIDATION_PIPELINE_ENABLED === "0" || !(settings as { pipeline_enabled: boolean }).pipeline_enabled) {
    throw new Error("Validation pipeline is paused.");
  }

  const domain = await ensureValidationDomainForOrganization({
    hostname: resolvedTarget.hostname,
    normalizedUrl: resolvedTarget.normalized_url,
    organizationId: context.organization.id
  });
  const scanId = await createValidationScan({
    domainId: domain.id,
    hostname: resolvedTarget.hostname,
    normalizedUrl: resolvedTarget.normalized_url,
    organizationId: context.organization.id,
    submittedByUserId: context.user.id
  });

  const { data: run, error: runError } = await supabase
    .from("validation_runs")
    .insert({
      domain_id: domain.id,
      hostname: resolvedTarget.hostname,
      normalized_url: resolvedTarget.normalized_url,
      rank_band:
        typeof resolvedTarget.tranco_rank === "number"
          ? resolvedTarget.tranco_rank <= 5_000
            ? "1k-5k"
            : resolvedTarget.tranco_rank <= 20_000
              ? "5k-20k"
              : resolvedTarget.tranco_rank <= 50_000
                ? "20k-50k"
                : "50k-100k"
          : null,
      scan_id: scanId,
      status: "queued",
      tranco_rank: resolvedTarget.tranco_rank,
      trigger_mode: "manual",
      triggered_by_user_id: context.user.id,
      validation_target_id: resolvedTarget.id
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(`Failed to create manual validation run: ${runError?.message ?? "Unknown error"}`);
  }

  const { error: targetError } = await supabase
    .from("validation_targets")
    .update({
      last_error: null,
      last_run_at: new Date().toISOString(),
      last_status: "queued"
    })
    .eq("id", resolvedTarget.id);

  if (targetError) {
    throw new Error(`Failed to mark validation target queued: ${targetError.message}`);
  }

  await enqueueFullScanJob(scanId);
  await enqueueValidationCollectJob((run as { id: string }).id);
  await supabase.from("validation_audit_events").insert({
    actor_user_id: context.user.id,
    event_type: "validation.manual_run_queued",
    metadata_json: {
      hostname: resolvedTarget.hostname,
      targetId: resolvedTarget.id,
      validationRunId: (run as { id: string }).id
    }
  });

  const { error: removeError } = await supabase.from("validation_targets").delete().eq("id", resolvedTarget.id);
  if (removeError) {
    throw new Error(`Failed to consume validation target from queue: ${removeError.message}`);
  }

  await supabase.from("validation_audit_events").insert({
    actor_user_id: context.user.id,
    event_type: "validation.target_removed",
    metadata_json: {
      hostname: resolvedTarget.hostname,
      reason: "queued_for_manual_run",
      targetId: resolvedTarget.id,
      validationRunId: (run as { id: string }).id
    }
  });

  await addRandomTrancoValidationTarget({
    actorUserId: context.user.id,
    eventType: "validation.target_added",
    excludedHostnames: [resolvedTarget.hostname],
    metadata: {
      replacedHostname: resolvedTarget.hostname,
      validationRunId: (run as { id: string }).id
    },
    supabase
  });

  revalidatePath("/app");
  revalidatePath("/app/scans");
  revalidatePath("/app/validation");

  return {
    scanId,
    validationRunId: (run as { id: string }).id
  };
}

export async function queueValidationRescanAction(input: { domainId: string }) {
  const context = await requireAdmin();
  const availability = getValidationQueueAvailability();
  if (!availability.enabled) {
    throw new Error(availability.reason ?? "Validation queue is unavailable.");
  }

  const supabase = createAdminClient();
  const { data: domain, error: domainError } = await supabase
    .from("domains")
    .select("id, hostname, normalized_url")
    .eq("id", input.domainId)
    .eq("organization_id", context.organization.id)
    .maybeSingle();

  if (domainError) {
    throw new Error(`Failed to load validation domain: ${domainError.message}`);
  }

  if (!domain) {
    throw new Error("Validation domain not found.");
  }

  const { data: settings, error: settingsError } = await supabase
    .from("validation_settings")
    .select("pipeline_enabled")
    .eq("singleton_key", "default")
    .single();

  if (settingsError) {
    throw new Error(`Failed to load validation pipeline state: ${settingsError.message}`);
  }

  if (process.env.VALIDATION_PIPELINE_ENABLED === "0" || !(settings as { pipeline_enabled: boolean }).pipeline_enabled) {
    throw new Error("Validation pipeline is paused.");
  }

  const scanId = await createValidationScan({
    domainId: (domain as { id: string }).id,
    hostname: (domain as { hostname: string }).hostname,
    normalizedUrl: (domain as { normalized_url: string }).normalized_url,
    organizationId: context.organization.id,
    submittedByUserId: context.user.id
  });

  const { data: previousRun } = await supabase
    .from("validation_runs")
    .select("tranco_rank, rank_band")
    .eq("domain_id", (domain as { id: string }).id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: run, error: runError } = await supabase
    .from("validation_runs")
    .insert({
      domain_id: (domain as { id: string }).id,
      hostname: (domain as { hostname: string }).hostname,
      normalized_url: (domain as { normalized_url: string }).normalized_url,
      rank_band: (previousRun as { rank_band: string | null } | null)?.rank_band ?? null,
      scan_id: scanId,
      status: "queued",
      tranco_rank: (previousRun as { tranco_rank: number | null } | null)?.tranco_rank ?? null,
      trigger_mode: "manual",
      triggered_by_user_id: context.user.id,
      validation_target_id: null
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error(`Failed to create validation re-scan run: ${runError?.message ?? "Unknown error"}`);
  }

  await enqueueFullScanJob(scanId);
  await enqueueValidationCollectJob((run as { id: string }).id);
  await supabase.from("validation_audit_events").insert({
    actor_user_id: context.user.id,
    event_type: "validation.manual_run_queued",
    metadata_json: {
      domainId: input.domainId,
      hostname: (domain as { hostname: string }).hostname,
      scanId,
      validationRunId: (run as { id: string }).id,
      reason: "validation_rescan"
    }
  });

  revalidatePath("/app");
  revalidatePath("/app/scans");
  revalidatePath("/app/validation");

  return {
    scanId,
    validationRunId: (run as { id: string }).id
  };
}

export async function updateValidationTargetStateAction(input: {
  clearBackoff?: boolean;
  denyReason?: string | null;
  denylisted?: boolean;
  hostname?: string;
  normalizedUrl?: string;
  source?: string;
  targetId: string;
  trancoRank?: number;
}) {
  const context = await requireAdmin();
  const supabase = createAdminClient();
  const patch: Record<string, string | boolean | null> = {};
  const isSyntheticPreviewTarget = input.targetId.startsWith("tranco-preview-");

  let resolvedTargetId = input.targetId;
  if (isSyntheticPreviewTarget && input.hostname && input.normalizedUrl) {
    const materializedSource = input.source === "tranco" ? "tranco" : "manual";
    const { data: insertedTarget, error: insertError } = await supabase
      .from("validation_targets")
      .upsert(
        {
          active: true,
          denylisted: false,
          hostname: input.hostname,
          normalized_url: input.normalizedUrl,
          rank_band: rankBandForRank(input.trancoRank ?? null),
          source: materializedSource,
          tranco_rank: input.trancoRank ?? null
        },
        { onConflict: "hostname" }
      )
      .select("id")
      .single();

    if (insertError || !insertedTarget) {
      throw new Error(`Failed to materialize validation target: ${insertError?.message ?? "Unknown error"}`);
    }

    resolvedTargetId = (insertedTarget as { id: string }).id;
  }

  if (input.clearBackoff) {
    patch.backoff_until = null;
    patch.cooldown_until = null;
    patch.last_error = null;
  }

  if (input.denylisted !== undefined) {
    patch.denylisted = input.denylisted;
    patch.deny_reason = input.denylisted ? input.denyReason ?? "Suppressed by operator." : null;
  }

  const { error } = await supabase.from("validation_targets").update(patch).eq("id", resolvedTargetId);
  if (error) {
    throw new Error(`Failed to update validation target: ${error.message}`);
  }

  await supabase.from("validation_audit_events").insert({
    actor_user_id: context.user.id,
    event_type: input.denylisted ? "validation.target_suppressed" : input.clearBackoff ? "validation.target_backoff_cleared" : "validation.target_updated",
    metadata_json: {
      ...input,
      targetId: resolvedTargetId
    }
  });

  revalidatePath("/app");
  revalidatePath("/app/scans");
}

export async function removeValidationTargetAction(input: { targetId: string }) {
  const context = await requireAdmin();
  const supabase = createAdminClient();

  const { data: target, error: loadError } = await supabase
    .from("validation_targets")
    .select("id, hostname")
    .eq("id", input.targetId)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load validation target: ${loadError.message}`);
  }

  if (!target) {
    throw new Error("Validation target not found.");
  }

  const { error } = await supabase.from("validation_targets").delete().eq("id", input.targetId);
  if (error) {
    throw new Error(`Failed to remove validation target: ${error.message}`);
  }

  await supabase.from("validation_audit_events").insert({
    actor_user_id: context.user.id,
    event_type: "validation.target_removed",
    metadata_json: {
      hostname: (target as { hostname: string }).hostname,
      targetId: input.targetId
    }
  });

  revalidatePath("/app");
  revalidatePath("/app/scans");
  revalidatePath("/app/validation");
}

async function pickRandomTrancoValidationTarget(
  supabase: ReturnType<typeof createAdminClient>,
  excludedHostnames: string[] = []
) {
  const targetRank = Math.floor(Math.random() * (50_000 - 1_000 + 1)) + 1_000;
  const excluded = excludedHostnames.filter(Boolean);

  const loadCandidate = async (direction: "gte" | "lte") => {
    let query = supabase
      .from("validation_targets")
      .select("hostname, normalized_url, tranco_rank")
      .eq("source", "tranco")
      .gte("tranco_rank", 1_000)
      .lte("tranco_rank", 50_000)
      .limit(1);

    query =
      direction === "gte"
        ? query.gte("tranco_rank", targetRank).order("tranco_rank", { ascending: true })
        : query.lte("tranco_rank", targetRank).order("tranco_rank", { ascending: false });

    if (excluded.length > 0) {
      query = query.not("hostname", "in", `(${excluded.map((hostname) => `"${hostname}"`).join(",")})`);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new Error(`Failed to load Tranco validation target: ${error.message}`);
    }

    return (data as { hostname: string; normalized_url: string; tranco_rank: number | null } | null) ?? null;
  };

  const higherCandidate = await loadCandidate("gte");
  const lowerCandidate = await loadCandidate("lte");
  const candidate =
    higherCandidate && lowerCandidate
      ? Math.abs((higherCandidate.tranco_rank ?? targetRank) - targetRank) <= Math.abs((lowerCandidate.tranco_rank ?? targetRank) - targetRank)
        ? higherCandidate
        : lowerCandidate
      : higherCandidate ?? lowerCandidate;

  if (!candidate) {
    throw new Error("No Tranco validation target is available in the 1000-50000 range.");
  }

  return {
    candidate,
    targetRank
  };
}

async function addRandomTrancoValidationTarget(params: {
  actorUserId: string;
  excludedHostnames?: string[];
  eventType?: string;
  metadata?: Record<string, unknown>;
  supabase: ReturnType<typeof createAdminClient>;
}) {
  const { actorUserId, excludedHostnames, eventType = "validation.target_added", metadata, supabase } = params;
  try {
    const { candidate, targetRank } = await pickRandomTrancoValidationTarget(supabase, excludedHostnames);

    const hostname = extractHostname(candidate.normalized_url);
    const normalizedUrl = normalizeUrl(candidate.normalized_url);

    const { error } = await supabase.from("validation_targets").upsert(
      {
        active: true,
        denylisted: false,
        hostname,
        normalized_url: normalizedUrl,
        rank_band: rankBandForRank(candidate.tranco_rank ?? null),
        source: "tranco",
        tranco_rank: candidate.tranco_rank ?? null
      },
      { onConflict: "hostname" }
    );

    if (error) {
      throw new Error(`Failed to add validation target: ${error.message}`);
    }

    await supabase.from("validation_audit_events").insert({
      actor_user_id: actorUserId,
      event_type: eventType,
      metadata_json: {
        hostname,
        ...metadata,
        normalizedUrl,
        selectedRank: candidate.tranco_rank,
        targetRank
      }
    });

    return {
      hostname,
      normalizedUrl,
      selectedRank: candidate.tranco_rank,
      targetRank
    };
  } catch (error) {
    const previews = await listTrancoPreviewTargets(32);
    const excluded = new Set((excludedHostnames ?? []).filter(Boolean));
    const fallback = previews.find((target) => !excluded.has(target.hostname));

    if (!fallback) {
      if (error instanceof Error) {
        throw error;
      }

      throw new Error("No Tranco validation target is available.");
    }

    const { error: insertError } = await supabase.from("validation_targets").upsert(
      {
        active: true,
        denylisted: false,
        hostname: fallback.hostname,
        normalized_url: fallback.normalized_url,
        rank_band: rankBandForRank(fallback.tranco_rank ?? null),
        source: "tranco",
        tranco_rank: fallback.tranco_rank ?? null
      },
      { onConflict: "hostname" }
    );

    if (insertError) {
      throw new Error(`Failed to add validation target: ${insertError.message}`);
    }

    await supabase.from("validation_audit_events").insert({
      actor_user_id: actorUserId,
      event_type: eventType,
      metadata_json: {
        hostname: fallback.hostname,
        ...metadata,
        normalizedUrl: fallback.normalized_url,
        selectedRank: fallback.tranco_rank,
        targetRank: fallback.tranco_rank,
        replacementSource: "tranco_preview_fallback"
      }
    });

    return {
      hostname: fallback.hostname,
      normalizedUrl: fallback.normalized_url,
      selectedRank: fallback.tranco_rank,
      targetRank: fallback.tranco_rank
    };
  }
}

export async function addValidationTargetAction(input: { hostname: string }) {
  const context = await requireAdmin();
  const supabase = createAdminClient();
  const normalizedUrl = normalizeUrl(input.hostname);
  const hostname = extractHostname(normalizedUrl);

  const { error } = await supabase.from("validation_targets").upsert(
    {
      active: true,
      denylisted: false,
      hostname,
      normalized_url: normalizedUrl,
      source: "manual"
    },
    { onConflict: "hostname" }
  );

  if (error) {
    throw new Error(`Failed to add validation target: ${error.message}`);
  }

  await supabase.from("validation_audit_events").insert({
    actor_user_id: context.user.id,
    event_type: "validation.target_added",
    metadata_json: {
      hostname,
      normalizedUrl,
      source: "manual_entry"
    }
  });

  revalidatePath("/app");
  revalidatePath("/app/validation");
}
