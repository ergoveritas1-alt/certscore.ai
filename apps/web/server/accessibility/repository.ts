"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";

export type AccessibilityOverviewScanRow = {
  completed_at: string | null;
  domain_id: string | null;
  id: string;
};

export type AccessibilityOverviewDomainRow = {
  hostname: string;
  id: string;
};

export type AccessibilityOverviewSnapshotRow = {
  accessibility_claim_mismatch_detected: boolean | null;
  accessibility_contact_method_present: boolean | null;
  accessibility_litigation_risk_score: number | null;
  accessibility_score: number | null;
  accessibility_statement_present: boolean | null;
  scan_id: string;
  vpat_or_accessibility_conformance_doc_present: boolean | null;
  wcag_aria_error_count: number | null;
  wcag_contrast_failures_count: number | null;
  wcag_error_count_total: number | null;
  wcag_keyboard_navigation_issue_count: number | null;
  wcag_missing_alt_count: number | null;
};

export async function loadAccessibilityOverviewCompletedScans(organizationId: string): Promise<AccessibilityOverviewScanRow[]> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("scans")
    .select("id, domain_id, completed_at")
    .eq("organization_id", organizationId)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`Failed to load accessibility scans: ${error.message}`);
  }

  return (data ?? []) as AccessibilityOverviewScanRow[];
}

export async function loadAccessibilityOverviewDomainsAndSnapshots(input: {
  domainIds: string[];
  organizationId: string;
  scanIds: string[];
}): Promise<{
  domains: AccessibilityOverviewDomainRow[];
  snapshots: AccessibilityOverviewSnapshotRow[];
}> {
  const db = createDatabaseClient();
  const [{ data: domains, error: domainsError }, { data: snapshots, error: snapshotsError }] = await Promise.all([
    input.domainIds.length
      ? db.from("domains").select("id, hostname").eq("organization_id", input.organizationId).in("id", input.domainIds)
      : Promise.resolve({ data: [] as AccessibilityOverviewDomainRow[], error: null }),
    input.scanIds.length
      ? db
          .from("scan_snapshots")
          .select(
            "scan_id, accessibility_score, accessibility_litigation_risk_score, accessibility_statement_present, vpat_or_accessibility_conformance_doc_present, accessibility_contact_method_present, accessibility_claim_mismatch_detected, wcag_error_count_total, wcag_missing_alt_count, wcag_contrast_failures_count, wcag_aria_error_count, wcag_keyboard_navigation_issue_count"
          )
          .in("scan_id", input.scanIds)
      : Promise.resolve({ data: [] as AccessibilityOverviewSnapshotRow[], error: null })
  ]);

  if (domainsError) {
    throw new Error(`Failed to load accessibility domains: ${domainsError.message}`);
  }

  if (snapshotsError) {
    throw new Error(`Failed to load accessibility snapshots: ${snapshotsError.message}`);
  }

  return {
    domains: (domains ?? []) as AccessibilityOverviewDomainRow[],
    snapshots: (snapshots ?? []) as AccessibilityOverviewSnapshotRow[]
  };
}
