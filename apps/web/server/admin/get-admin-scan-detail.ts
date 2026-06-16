"use server";

import {
  type AccessPostureClass,
  type RecoverableFindingClass,
  type ScanExecutionTier,
  buildAgencyMappings,
  buildStandardPolicyReviewNote,
  normalizePolicyReviewNote,
  type AgencyMapping,
  resolvePolicyReviewVerdict,
  type PolicyReviewVerdict
} from "@website-signal-risk-scanner/shared";
import { getScanFromDisplay } from "../../lib/scans/scan-from";
import { deriveAccessPosturePresentation } from "../../lib/scans/access-posture-presentation";
import { buildAgencyMappingSource } from "../../lib/scans/agency-mapping-source";
import { normalizeAccessPostureSummary } from "../../lib/scans/normalize-access-posture-summary";
import { deriveDisplayCreatedAt } from "../scans/display-state";
import { loadAdminScanDetailData } from "./repository";
import { requirePlatformAdminContext } from "./platform-admin";
import {
  mapAdminLocalV2DagLambdaEvent,
  type AdminLocalV2DagLambdaEvent
} from "./local-v2-dag-lambda-events";

export type AdminScanDetail = {
  accessPostureSummary: {
    accessPostureClass: AccessPostureClass | null;
    highestSuccessfulTier: ScanExecutionTier | null;
    interruptionLabel: string | null;
    interruptionReason: string | null;
    recoverableFindingClasses: RecoverableFindingClass[];
    stopTier: ScanExecutionTier | null;
  };
  accessibilityRuleCounts: Array<{
    instanceCount: number;
    ruleCode: string;
    ruleGroup: string;
    severity: string;
  }>;
  changes: Array<{
    eventGroup: string;
    eventTimestamp: string;
    eventType: string;
    fieldName: string | null;
    newValueText: string | null;
    oldValueText: string | null;
    severity: string;
  }>;
  domainHostname: string | null;
  organizationName: string | null;
  agencyMappings: AgencyMapping[];
  localV2DagLambdaEvents: AdminLocalV2DagLambdaEvent[];
  policyEnrichment: Array<Record<string, unknown>>;
  policyReviewQueue: Array<Record<string, unknown>>;
  pages: Array<{
    fetchStatus: string;
    fetchedVia: string;
    normalizedContentHash: string | null;
    pageLanguage: string | null;
    pageType: string;
    pageUrl: string;
    titleHash: string | null;
  }>;
  runtimeArtifacts: Record<string, unknown> | null;
  runtimeContextEvents: Array<{
    createdAt: string | null;
    message: string | null;
    metadataJson: Record<string, unknown> | null;
  }>;
  scan: {
    completedAt: string | null;
    createdAt: string;
    id: string;
    pagesRequested: number;
    pagesScanned: number;
    scanConfigJson: Record<string, unknown> | null;
    scanFromLabel: string;
    scanFromValue: string;
    scanType: string;
    status: string;
  };
  snapshot: Record<string, unknown> | null;
  trackerVendors: Array<{
    beforeConsent: boolean;
    confidence: number;
    detectionSource: string;
    firstPartyOrThirdParty: string;
    matchedSignatureId: string | null;
    scriptHost: string | null;
    vendorCategory: string;
    vendorName: string;
  }>;
};

function stripRecord<T extends Record<string, unknown>>(record: T) {
  const next = { ...record };
  delete next.id;
  delete next.created_at;
  delete next.updated_at;
  return next;
}

function stripTimestampFields<T extends Record<string, unknown>>(record: T) {
  const next = { ...record };
  delete next.created_at;
  delete next.updated_at;
  return next;
}

function nullifyEmptySnapshotHashes(snapshot: Record<string, unknown>) {
  const next = { ...snapshot };

  const trackerCountTotal = Number(next.tracker_count_total ?? 0);
  const formCountTotal = Number(next.form_count_total ?? 0);
  const pagesScanned = Number(next.pages_scanned ?? 0);
  const cookieBannerPresent = next.cookie_banner_present === true;
  const cmpVendorName = typeof next.cmp_vendor_name === "string" && next.cmp_vendor_name.length > 0;
  const legalPagePresenceCount = [
    "privacy_policy_present",
    "terms_of_service_present",
    "cookie_policy_present",
    "accessibility_statement_present",
    "refund_policy_present",
    "shipping_policy_present",
    "subscription_terms_present",
    "affiliate_disclosure_present",
    "advertising_disclosure_present",
    "contact_page_present"
  ].filter((field) => next[field] === true).length;
  const accessibilitySignalCount = Number(next.accessibility_signal_count ?? 0);

  if (trackerCountTotal === 0) {
    next.tracker_vendor_set_hash = null;
    next.tracker_category_set_hash = null;
  }

  if (!cookieBannerPresent && !cmpVendorName) {
    next.consent_signature_hash = null;
  }

  if (formCountTotal === 0) {
    next.forms_signature_hash = null;
  }

  if (accessibilitySignalCount === 0) {
    next.accessibility_signature_hash = null;
  }

  if (legalPagePresenceCount === 0) {
    next.legal_pages_presence_hash = null;
    next.privacy_policy_hash = null;
    next.terms_policy_hash = null;
    next.cookie_policy_hash = null;
  } else {
    if (next.privacy_policy_present !== true) {
      next.privacy_policy_hash = null;
    }

    if (next.terms_of_service_present !== true) {
      next.terms_policy_hash = null;
    }

    if (next.cookie_policy_present !== true) {
      next.cookie_policy_hash = null;
    }
  }

  if (pagesScanned === 0) {
    next.homepage_structured_hash = null;
  }

  return next;
}

export async function getAdminScanDetail(scanId: string): Promise<AdminScanDetail | null> {
  await requirePlatformAdminContext();
  const {
    accessibilityRuleCounts,
    changes,
    domain,
    localV2DagLambdaEvents,
    organization,
    pages,
    policyEnrichment,
    policyReviewQueue,
    runtimeArtifacts,
    runtimeContextEvents,
    scan,
    snapshot,
    trackerVendors
  } = await loadAdminScanDetailData(scanId);

  if (!scan) {
    return null;
  }

  const scanRow = scan;

  const accessPostureClass =
    typeof (snapshot as Record<string, unknown> | null)?.access_posture_class === "string"
      ? ((snapshot as Record<string, unknown>).access_posture_class as AccessPostureClass)
      : null;
  const rawHighestSuccessfulTier =
    typeof (snapshot as Record<string, unknown> | null)?.highest_successful_tier === "string"
      ? ((snapshot as Record<string, unknown>).highest_successful_tier as ScanExecutionTier)
      : null;
  const rawStopTier =
    typeof (snapshot as Record<string, unknown> | null)?.stop_tier === "string"
      ? ((snapshot as Record<string, unknown>).stop_tier as ScanExecutionTier)
      : null;
  const recoverableFindingClasses = Array.isArray((snapshot as Record<string, unknown> | null)?.recoverable_finding_classes)
    ? (((snapshot as Record<string, unknown>).recoverable_finding_classes as unknown[]).filter(
        (value): value is RecoverableFindingClass => typeof value === "string"
      ))
    : [];
  const totalSignals =
    typeof (snapshot as Record<string, unknown> | null)?.total_signals === "number"
      ? ((snapshot as Record<string, unknown>).total_signals as number)
      : null;
  const homepageFetchHttpStatus =
    typeof (snapshot as Record<string, unknown> | null)?.homepage_fetch_http_status === "number"
      ? ((snapshot as Record<string, unknown>).homepage_fetch_http_status as number)
      : null;
  const homepageFetchStatus =
    typeof (snapshot as Record<string, unknown> | null)?.homepage_fetch_status === "string"
      ? ((snapshot as Record<string, unknown>).homepage_fetch_status as string)
      : null;
  const accessPostureSummary = normalizeAccessPostureSummary({
    accessPostureClass,
    highestSuccessfulTier: rawHighestSuccessfulTier,
    homepageFetchHttpStatus,
    homepageFetchStatus,
    pagesScanned: scanRow.pages_scanned,
    recoverableFindingClasses,
    stopTier: rawStopTier,
    totalSignals
  });
  const accessPosturePresentation = deriveAccessPosturePresentation({
    accessPostureClass: accessPostureSummary.accessPostureClass,
    highestSuccessfulTier: accessPostureSummary.highestSuccessfulTier,
    stopTier: accessPostureSummary.stopTier,
    totalSignals,
    pagesScanned: scanRow.pages_scanned,
    recoverableFindingClasses: accessPostureSummary.recoverableFindingClasses
  });
  const displayCreatedAt = deriveDisplayCreatedAt({
    completedAt: scanRow.completed_at,
    createdAt: scanRow.created_at,
    startedAt: null
  });
  const scanFromDisplay = getScanFromDisplay(scanRow.scan_config_json ?? null);

  return {
    accessPostureSummary: {
      accessPostureClass: accessPostureSummary.accessPostureClass,
      highestSuccessfulTier: accessPostureSummary.highestSuccessfulTier,
      stopTier: accessPostureSummary.stopTier,
      recoverableFindingClasses: accessPostureSummary.recoverableFindingClasses,
      interruptionLabel: accessPosturePresentation.label,
      interruptionReason: accessPosturePresentation.reason
    },
    scan: {
      id: scanRow.id,
      scanType: scanRow.scan_type,
      status: scanRow.status,
      createdAt: displayCreatedAt,
      completedAt: scanRow.completed_at,
      pagesRequested: scanRow.pages_requested ?? 0,
      pagesScanned: scanRow.pages_scanned,
      scanConfigJson: scanRow.scan_config_json ?? null,
      scanFromLabel: scanFromDisplay.label,
      scanFromValue: scanFromDisplay.value
    },
    domainHostname: (domain as { hostname: string } | null)?.hostname ?? null,
    organizationName: (organization as { name: string } | null)?.name ?? null,
    snapshot: snapshot ? nullifyEmptySnapshotHashes(stripRecord(snapshot as Record<string, unknown>)) : null,
    agencyMappings: snapshot
      ? buildAgencyMappings(buildAgencyMappingSource(stripRecord(snapshot as Record<string, unknown>)))
      : [],
    policyEnrichment: ((policyEnrichment ?? []) as Array<Record<string, unknown>>).map((row) => stripTimestampFields(row)),
    localV2DagLambdaEvents: ((localV2DagLambdaEvents ?? []) as Array<Record<string, unknown>>).map(mapAdminLocalV2DagLambdaEvent),
    runtimeContextEvents: ((runtimeContextEvents ?? []) as Array<Record<string, unknown>>).map((row) => ({
      createdAt: typeof row.created_at === "string" ? row.created_at : null,
      message: typeof row.message === "string" ? row.message : null,
      metadataJson:
        row.metadata_json && typeof row.metadata_json === "object" && !Array.isArray(row.metadata_json)
          ? (row.metadata_json as Record<string, unknown>)
          : null
    })),
    policyReviewQueue: ((policyReviewQueue ?? []) as Array<Record<string, unknown>>).map((row) => {
      const strippedRow = stripTimestampFields(row);
      const savedReviewerNotes = normalizePolicyReviewNote(
        typeof strippedRow.reviewer_notes === "string" ? strippedRow.reviewer_notes : null
      );
      const reviewVerdict = (
        typeof strippedRow.review_verdict === "string" ? strippedRow.review_verdict : null
      ) as PolicyReviewVerdict | null;
      const pageType = typeof strippedRow.page_type === "string" ? strippedRow.page_type : null;
      const resolvedVerdict = resolvePolicyReviewVerdict({
        pageType,
        reason: typeof strippedRow.reason === "string" ? strippedRow.reason : null,
        reviewVerdict
      });
      const standardReviewerNote = buildStandardPolicyReviewNote({
        pageType,
        reason: typeof strippedRow.reason === "string" ? strippedRow.reason : null,
        reviewVerdict: resolvedVerdict.reviewVerdict
      });

      return {
        ...strippedRow,
        effective_review_verdict: resolvedVerdict.reviewVerdict,
        page_type: pageType,
        reviewer_note_matches_standard:
          savedReviewerNotes !== null && standardReviewerNote !== null ? savedReviewerNotes === standardReviewerNote : null,
        reviewer_notes: savedReviewerNotes,
        standard_reviewer_note: standardReviewerNote,
        verdict_overridden_by_scope_guardrail: resolvedVerdict.verdictOverriddenByScopeGuardrail
      };
    }),
    runtimeArtifacts: runtimeArtifacts ? stripRecord(runtimeArtifacts as Record<string, unknown>) : null,
    trackerVendors: ((trackerVendors ?? []) as Array<Record<string, unknown>>).map((tracker) => ({
      vendorName: String(tracker.vendor_name),
      vendorCategory: String(tracker.vendor_category),
      detectionSource: String(tracker.detection_source),
      confidence: Number(tracker.confidence),
      firstPartyOrThirdParty: String(tracker.first_party_or_third_party),
      beforeConsent: Boolean(tracker.before_consent),
      scriptHost: (tracker.script_host as string | null) ?? null,
      matchedSignatureId: (tracker.matched_signature_id as string | null) ?? null
    })),
    accessibilityRuleCounts: ((accessibilityRuleCounts ?? []) as Array<Record<string, unknown>>).map((rule) => ({
      ruleCode: String(rule.rule_code),
      ruleGroup: String(rule.rule_group),
      severity: String(rule.severity),
      instanceCount: Number(rule.instance_count)
    })),
    pages: ((pages ?? []) as Array<Record<string, unknown>>).map((page) => ({
      pageType: String(page.page_type),
      pageUrl: String(page.page_url),
      fetchStatus: String(page.fetch_status),
      fetchedVia: String(page.fetched_via),
      normalizedContentHash: (page.normalized_content_hash as string | null) ?? null,
      titleHash: (page.title_hash as string | null) ?? null,
      pageLanguage: (page.page_language as string | null) ?? null
    })),
    changes: ((changes ?? []) as Array<Record<string, unknown>>).map((event) => ({
      eventType: String(event.event_type),
      fieldName: (event.field_name as string | null) ?? null,
      oldValueText: (event.old_value_text as string | null) ?? null,
      newValueText: (event.new_value_text as string | null) ?? null,
      severity: String(event.severity),
      eventGroup: String(event.event_group),
      eventTimestamp: String(event.event_timestamp)
    }))
  };
}
