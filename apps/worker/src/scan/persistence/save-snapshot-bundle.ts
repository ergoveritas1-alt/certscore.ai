import { createAdminClient } from "@website-signal-risk-scanner/db";
import type { SnapshotBundle } from "../snapshot/types";
import { camelToSnakeRecord } from "../snapshot/case";

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

  if (!bundle.snapshot.organizationId) {
    return;
  }

  const { error: runtimeArtifactsError } = await supabase.from("scan_runtime_artifacts").upsert(buildRuntimeArtifactRow(bundle), {
    onConflict: "scan_id"
  });

  if (runtimeArtifactsError) {
    throw new Error(`Failed to persist scan runtime artifacts: ${runtimeArtifactsError.message}`);
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

  const { error: deleteRulesError } = await supabase
    .from("scan_accessibility_rule_counts")
    .delete()
    .eq("scan_id", bundle.snapshot.scanId);
  if (deleteRulesError) {
    throw new Error(`Failed to clear scan accessibility rule counts: ${deleteRulesError.message}`);
  }

  if (bundle.accessibilityRuleCounts.length > 0) {
    const ruleRows = bundle.accessibilityRuleCounts.map((rule) => ({
      ...camelToSnakeRecord(rule),
      organization_id: bundle.snapshot.organizationId,
      domain_id: bundle.snapshot.domainId
    }));
    const { error: rulesError } = await supabase.from("scan_accessibility_rule_counts").insert(ruleRows);

    if (rulesError) {
      throw new Error(`Failed to persist scan accessibility rule counts: ${rulesError.message}`);
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
