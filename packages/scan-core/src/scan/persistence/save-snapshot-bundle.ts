import { createAdminClient } from "@website-signal-risk-scanner/db";
import type { SnapshotBundle } from "../snapshot/types";
import { camelToSnakeRecord } from "../snapshot/case";
import { TRACKER_VENDOR_SIGNATURES } from "../snapshot/signature-registry";

type AccessibilityEvidencePersistenceInput = {
  accessibilityRuleCounts: SnapshotBundle["accessibilityRuleCounts"];
  accessibilityRuleExamples: SnapshotBundle["accessibilityRuleExamples"];
  domainId: string | null;
  organizationId: string | null;
  scanId: string;
};

type RuntimeArtifactsPatchInput = {
  domainId: string | null;
  organizationId: string | null;
  runtimeArtifacts: Record<string, unknown>;
  scanId: string;
};

const OPTIONAL_RUNTIME_ARTIFACT_COLUMNS = ["build_phase_summaries", "cookie_attribute_summary", "gpc_verification"] as const;

function getMissingColumnName(errorMessage: string) {
  const match = errorMessage.match(/Could not find the '([^']+)' column/i);
  return match?.[1] ?? null;
}

export function omitOptionalRuntimeArtifactsColumn(
  row: Record<string, unknown>,
  errorMessage: string
): Record<string, unknown> | null {
  const missingColumn = getMissingColumnName(errorMessage);
  if (!missingColumn || !OPTIONAL_RUNTIME_ARTIFACT_COLUMNS.includes(missingColumn as (typeof OPTIONAL_RUNTIME_ARTIFACT_COLUMNS)[number])) {
    return null;
  }

  const nextRow = { ...row };
  delete nextRow[missingColumn];
  return nextRow;
}

export function buildRuntimeArtifactRow(bundle: SnapshotBundle) {
  return {
    ...camelToSnakeRecord(bundle.runtimeArtifacts),
    organization_id: bundle.snapshot.organizationId,
    domain_id: bundle.snapshot.domainId
  };
}

export function buildSnapshotInsert(bundle: SnapshotBundle, options?: { omitPolicyEnrichmentId?: boolean }) {
  const snapshotRecord = {
    ...bundle.snapshot,
    ...(options?.omitPolicyEnrichmentId ? { policyEnrichmentId: null } : {})
  };

  return camelToSnakeRecord(snapshotRecord);
}

function matchesPreconsentEvidenceUrl(vendorName: string, url: string) {
  const lowerUrl = url.toLowerCase();
  const lowerVendor = vendorName.toLowerCase();

  if (lowerVendor.includes("linkedin")) {
    return lowerUrl.includes("linkedin") || lowerUrl.includes("licdn");
  }
  if (lowerVendor.includes("google")) {
    return lowerUrl.includes("google") || lowerUrl.includes("doubleclick") || lowerUrl.includes("googletagmanager");
  }
  if (lowerVendor.includes("marketo")) {
    return lowerUrl.includes("marketo") || lowerUrl.includes("munchkin");
  }
  if (lowerVendor.includes("reddit")) {
    return lowerUrl.includes("reddit");
  }
  if (lowerVendor.includes("clarity")) {
    return lowerUrl.includes("clarity");
  }

  return lowerUrl.includes(lowerVendor.replace(/\s+/g, ""));
}

function inferTrackerFromEvidenceUrls(evidenceUrls: string[]) {
  for (const url of evidenceUrls) {
    let requestUrl: URL;
    try {
      requestUrl = new URL(url);
    } catch {
      continue;
    }

    const fullPath = `${requestUrl.pathname}${requestUrl.search}`.toLowerCase();
    for (const signature of TRACKER_VENDOR_SIGNATURES) {
      const hostMatch =
        signature.hostnamePatterns?.some(
          (pattern) => requestUrl.hostname === pattern || requestUrl.hostname.endsWith(`.${pattern}`)
        ) ?? false;
      const pathMatch =
        signature.pathFragments?.some((fragment) => fullPath.includes(fragment.toLowerCase())) ?? false;

      if (hostMatch || (signature.allowFirstPartyProxy && pathMatch)) {
        return {
          collectionEndpointType: hostMatch ? "direct_third_party" : "first_party_collection_proxy",
          confidence: signature.confidence,
          detectionSource: signature.detectionSource,
          matchedSignatureId: signature.id,
          vendorCategory: signature.category,
          vendorName: signature.name
        } as const;
      }
    }
  }

  return null;
}

type PreconsentViolationInsert = {
  scan_id: string;
  organization_id: string | null;
  domain_id: string;
  vendor_name: string;
  vendor_category: string;
  detection_source: string;
  confidence: number;
  first_party_or_third_party: string;
  collection_endpoint_type: string;
  script_host: string | null;
  matched_signature_id: string | null;
  evidence_urls: string[];
};

type AccessibilityRuleExampleInsert = {
  scan_id: string;
  organization_id: string | null;
  domain_id: string;
  page_url: string;
  rule_code: string;
  rule_group: string;
  severity: string;
  impact: string | null;
  help: string;
  help_url: string;
  description: string;
  node_count: number;
  representative_selectors: string[];
};

export function buildPreconsentViolationRows(bundle: SnapshotBundle) {
  if (!bundle.snapshot.domainId) {
    return [];
  }

  const organizationId = bundle.snapshot.organizationId;
  const domainId = bundle.snapshot.domainId;
  const baselineVendors = bundle.runtimeArtifacts.consentBaselineTrackerVendorNames ?? [];
  const evidenceUrls = bundle.runtimeArtifacts.consentBaselineTrackerEvidenceUrls ?? [];
  const rows: PreconsentViolationInsert[] = baselineVendors.map((vendorName) => {
    const tracker = bundle.trackerVendors.find((candidate) => candidate.vendorName === vendorName);
    const vendorEvidenceUrls = evidenceUrls.filter((url) => matchesPreconsentEvidenceUrl(vendorName, url));
    const inferredTracker = inferTrackerFromEvidenceUrls(vendorEvidenceUrls);
    const resolvedVendorName = tracker?.vendorName ?? inferredTracker?.vendorName ?? vendorName;

    return {
      scan_id: bundle.snapshot.scanId,
      organization_id: organizationId,
      domain_id: domainId,
      vendor_name: resolvedVendorName,
      vendor_category: tracker?.vendorCategory ?? inferredTracker?.vendorCategory ?? "unknown",
      detection_source: tracker?.detectionSource ?? inferredTracker?.detectionSource ?? "runtime_audit",
      confidence: tracker?.confidence ?? inferredTracker?.confidence ?? 0,
      first_party_or_third_party: tracker?.firstPartyOrThirdParty ?? "unknown",
      collection_endpoint_type: tracker?.collectionEndpointType ?? inferredTracker?.collectionEndpointType ?? "unknown",
      script_host: tracker?.scriptHost ?? null,
      matched_signature_id: tracker?.matchedSignatureId ?? inferredTracker?.matchedSignatureId ?? null,
      evidence_urls: vendorEvidenceUrls
    };
  });

  return [...rows.reduce((accumulator, row) => {
    const existing = accumulator.get(row.vendor_name);
    if (!existing) {
      accumulator.set(row.vendor_name, row);
      return accumulator;
    }

    accumulator.set(row.vendor_name, {
      ...existing,
      confidence: Math.max(existing.confidence, row.confidence),
      collection_endpoint_type:
        existing.collection_endpoint_type === "unknown" ? row.collection_endpoint_type : existing.collection_endpoint_type,
      detection_source: existing.detection_source === "runtime_audit" ? row.detection_source : existing.detection_source,
      evidence_urls: [...new Set([...existing.evidence_urls, ...row.evidence_urls])],
      first_party_or_third_party:
        existing.first_party_or_third_party === "unknown" ? row.first_party_or_third_party : existing.first_party_or_third_party,
      matched_signature_id: existing.matched_signature_id ?? row.matched_signature_id,
      script_host: existing.script_host ?? row.script_host,
      vendor_category: existing.vendor_category === "unknown" ? row.vendor_category : existing.vendor_category
    });
    return accumulator;
  }, new Map<string, PreconsentViolationInsert>()).values()];
}

export function buildAccessibilityRuleExampleRows(bundle: SnapshotBundle) {
  if (!bundle.snapshot.domainId) {
    return [] as AccessibilityRuleExampleInsert[];
  }

  return bundle.accessibilityRuleExamples.map((example) => ({
    scan_id: bundle.snapshot.scanId,
    organization_id: bundle.snapshot.organizationId,
    domain_id: bundle.snapshot.domainId,
    page_url: example.pageUrl,
    rule_code: example.ruleCode,
    rule_group: example.ruleGroup,
    severity: example.severity,
    impact: example.impact,
    help: example.help,
    help_url: example.helpUrl,
    description: example.description,
    node_count: example.nodeCount,
    representative_selectors: example.representativeSelectors
  }));
}

export function buildObservedPageEvidenceRows(bundle: SnapshotBundle) {
  return bundle.pageEvidence.map((evidence) => ({
    ...camelToSnakeRecord(evidence),
    organization_id: bundle.snapshot.organizationId,
    domain_id: bundle.snapshot.domainId
  }));
}

export function buildScanSignalHitRows(bundle: SnapshotBundle) {
  return bundle.signalHits.map((hit) => ({
    ...camelToSnakeRecord(hit),
    organization_id: bundle.snapshot.organizationId,
    domain_id: bundle.snapshot.domainId
  }));
}

export async function persistAccessibilityEvidence(input: AccessibilityEvidencePersistenceInput) {
  const supabase = createAdminClient();

  if (input.accessibilityRuleCounts.length > 0) {
    const ruleRows = input.accessibilityRuleCounts.map((rule) => ({
      ...camelToSnakeRecord(rule),
      organization_id: input.organizationId,
      domain_id: input.domainId
    }));
    const { error: rulesError } = await supabase.from("scan_accessibility_rule_counts").upsert(ruleRows, {
      onConflict: "scan_id,rule_code"
    });

    if (rulesError) {
      throw new Error(`Failed to persist scan accessibility rule counts: ${rulesError.message}`);
    }
  }

  const { error: deleteRuleExamplesError } = await supabase
    .from("scan_accessibility_rule_examples")
    .delete()
    .eq("scan_id", input.scanId);
  if (deleteRuleExamplesError) {
    throw new Error(`Failed to clear scan accessibility rule examples: ${deleteRuleExamplesError.message}`);
  }

  if (input.domainId && input.accessibilityRuleExamples.length > 0) {
    const ruleExampleRows = input.accessibilityRuleExamples.map((example) => ({
      ...camelToSnakeRecord(example),
      organization_id: input.organizationId,
      domain_id: input.domainId
    }));
    const { error: ruleExamplesError } = await supabase.from("scan_accessibility_rule_examples").insert(ruleExampleRows);

    if (ruleExamplesError) {
      throw new Error(`Failed to persist scan accessibility rule examples: ${ruleExamplesError.message}`);
    }
  }
}

export async function persistRuntimeArtifactsPatch(input: RuntimeArtifactsPatchInput) {
  const supabase = createAdminClient();
  const runtimeArtifactsRow = {
    ...camelToSnakeRecord(input.runtimeArtifacts),
    domain_id: input.domainId,
    organization_id: input.organizationId,
    scan_id: input.scanId
  };
  const { error } = await supabase.from("scan_runtime_artifacts").upsert(runtimeArtifactsRow, {
    onConflict: "scan_id"
  });

  if (error) {
    const fallbackRow = omitOptionalRuntimeArtifactsColumn(runtimeArtifactsRow, error.message);

    if (fallbackRow) {
      const { error: fallbackError } = await supabase.from("scan_runtime_artifacts").upsert(fallbackRow, {
        onConflict: "scan_id"
      });

      if (!fallbackError) {
        return;
      }

      throw new Error(`Failed to persist scan runtime artifacts patch: ${fallbackError.message}`);
    }
  }

  if (error) {
    throw new Error(`Failed to persist scan runtime artifacts patch: ${error.message}`);
  }
}

export async function saveSnapshotBundle(bundle: SnapshotBundle) {
  const supabase = createAdminClient();
  const snapshotInsert = buildSnapshotInsert(bundle, {
    omitPolicyEnrichmentId: true
  });

  const { error: snapshotError } = await supabase.from("scan_snapshots").upsert(snapshotInsert, {
    onConflict: "scan_id"
  });

  if (snapshotError) {
    throw new Error(`Failed to persist scan snapshot: ${snapshotError.message}`);
  }

  const { error: deleteReviewQueueError } = await supabase.from("policy_review_queue").delete().eq("scan_id", bundle.snapshot.scanId);
  if (deleteReviewQueueError) {
    throw new Error(`Failed to clear policy review queue rows: ${deleteReviewQueueError.message}`);
  }

  const { error: deletePolicyEnrichmentError } = await supabase.from("policy_enrichment").delete().eq("scan_id", bundle.snapshot.scanId);
  if (deletePolicyEnrichmentError) {
    throw new Error(`Failed to clear policy enrichment rows: ${deletePolicyEnrichmentError.message}`);
  }

  if (bundle.policyEvidence.length > 0) {
    const evidenceRows = bundle.policyEvidence.map((evidence) => camelToSnakeRecord(evidence));
    const { error: policyEvidenceError } = await supabase.from("policy_evidence").upsert(evidenceRows, {
      onConflict: "evidence_hash"
    });

    if (policyEvidenceError) {
      throw new Error(`Failed to persist policy evidence: ${policyEvidenceError.message}`);
    }
  }

  if (bundle.policyEnrichments.length > 0) {
    const policyRows = bundle.policyEnrichments.map((row) => camelToSnakeRecord(row));
    const { error: policyEnrichmentError } = await supabase.from("policy_enrichment").insert(policyRows);

    if (policyEnrichmentError) {
      throw new Error(`Failed to persist policy enrichment rows: ${policyEnrichmentError.message}`);
    }
  }

  if (bundle.snapshot.policyEnrichmentId) {
    const traceableSnapshotInsert = buildSnapshotInsert(bundle);
    const { error: snapshotTraceError } = await supabase.from("scan_snapshots").upsert(traceableSnapshotInsert, {
      onConflict: "scan_id"
    });

    if (snapshotTraceError) {
      throw new Error(`Failed to persist policy enrichment traceability on scan snapshot: ${snapshotTraceError.message}`);
    }
  }

  if (bundle.policyReviewQueueItems.length > 0) {
    const reviewRows = bundle.policyReviewQueueItems.map((row) => camelToSnakeRecord(row));
    const { error: reviewQueueError } = await supabase.from("policy_review_queue").insert(reviewRows);

    if (reviewQueueError) {
      throw new Error(`Failed to persist policy review queue rows: ${reviewQueueError.message}`);
    }
  }

  await persistRuntimeArtifactsPatch({
    domainId: bundle.snapshot.domainId,
    organizationId: bundle.snapshot.organizationId,
    runtimeArtifacts: bundle.runtimeArtifacts,
    scanId: bundle.snapshot.scanId
  });

  const { error: deletePreconsentViolationsError } = await supabase
    .from("scan_preconsent_violations")
    .delete()
    .eq("scan_id", bundle.snapshot.scanId);
  if (deletePreconsentViolationsError) {
    throw new Error(`Failed to clear pre-consent violation rows: ${deletePreconsentViolationsError.message}`);
  }

  const preconsentViolationRows = buildPreconsentViolationRows(bundle);
  if (preconsentViolationRows.length > 0) {
    const { error: preconsentViolationsError } = await supabase
      .from("scan_preconsent_violations")
      .insert(preconsentViolationRows);

    if (preconsentViolationsError) {
      throw new Error(`Failed to persist pre-consent violation rows: ${preconsentViolationsError.message}`);
    }
  }

  const { error: deleteTrackersError } = await supabase.from("scan_tracker_vendors").delete().eq("scan_id", bundle.snapshot.scanId);
  if (deleteTrackersError) {
    throw new Error(`Failed to clear scan tracker vendors: ${deleteTrackersError.message}`);
  }

  if (bundle.trackerVendors.length > 0) {
    const trackerRows = bundle.trackerVendors.map((tracker) => ({
      ...camelToSnakeRecord(tracker),
      organization_id: bundle.snapshot.organizationId,
      domain_id: bundle.snapshot.domainId
    }));
    const { error: trackerError } = await supabase.from("scan_tracker_vendors").insert(trackerRows);

    if (trackerError) {
      throw new Error(`Failed to persist scan tracker vendors: ${trackerError.message}`);
    }
  }

  await persistAccessibilityEvidence({
    accessibilityRuleCounts: bundle.accessibilityRuleCounts,
    accessibilityRuleExamples: bundle.accessibilityRuleExamples,
    domainId: bundle.snapshot.domainId,
    organizationId: bundle.snapshot.organizationId,
    scanId: bundle.snapshot.scanId
  });

  const { error: deletePageEvidenceError } = await supabase.from("scan_page_evidence").delete().eq("scan_id", bundle.snapshot.scanId);
  if (deletePageEvidenceError) {
    throw new Error(`Failed to clear scan page evidence: ${deletePageEvidenceError.message}`);
  }

  const pageEvidenceRows = buildObservedPageEvidenceRows(bundle);
  if (pageEvidenceRows.length > 0) {
    const { error: pageEvidenceError } = await supabase.from("scan_page_evidence").insert(pageEvidenceRows);

    if (pageEvidenceError) {
      throw new Error(`Failed to persist scan page evidence: ${pageEvidenceError.message}`);
    }
  }

  const { error: deleteSignalHitsError } = await supabase.from("scan_signal_hits").delete().eq("scan_id", bundle.snapshot.scanId);
  if (deleteSignalHitsError) {
    throw new Error(`Failed to clear scan signal hits: ${deleteSignalHitsError.message}`);
  }

  const signalHitRows = buildScanSignalHitRows(bundle);
  if (signalHitRows.length > 0) {
    const { error: signalHitsError } = await supabase.from("scan_signal_hits").insert(signalHitRows);

    if (signalHitsError) {
      throw new Error(`Failed to persist scan signal hits: ${signalHitsError.message}`);
    }
  }

  const { error: deletePagesError } = await supabase.from("scan_pages").delete().eq("scan_id", bundle.snapshot.scanId);
  if (deletePagesError) {
    throw new Error(`Failed to clear scan pages: ${deletePagesError.message}`);
  }

  if (bundle.pages.length > 0) {
    const pageRows = Array.from(
      new Map(
        bundle.pages.map((page) => [
          page.pageUrl,
          {
            ...camelToSnakeRecord(page),
            organization_id: bundle.snapshot.organizationId,
            domain_id: bundle.snapshot.domainId
          }
        ])
      ).values()
    );
    const { error: pagesError } = await supabase.from("scan_pages").insert(pageRows);

    if (pagesError) {
      throw new Error(`Failed to persist scan pages: ${pagesError.message}`);
    }
  }
}
