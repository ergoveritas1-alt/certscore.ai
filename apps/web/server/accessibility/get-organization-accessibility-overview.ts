"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";

type ScanRow = {
  completed_at: string | null;
  domain_id: string | null;
  id: string;
};

type DomainRow = {
  hostname: string;
  id: string;
};

type SnapshotRow = {
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

export async function getOrganizationAccessibilityOverview(organizationId: string) {
  const db = createAdminClient();
  const { data: completedScans, error: scansError } = await db
    .from("scans")
    .select("id, domain_id, completed_at")
    .eq("organization_id", organizationId)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(500);

  if (scansError) {
    throw new Error(`Failed to load accessibility scans: ${scansError.message}`);
  }

  const latestByDomain = new Map<string, ScanRow>();
  for (const scan of (completedScans ?? []) as ScanRow[]) {
    if (!scan.domain_id || latestByDomain.has(scan.domain_id)) {
      continue;
    }
    latestByDomain.set(scan.domain_id, scan);
  }

  const latestScans = [...latestByDomain.values()];
  const domainIds = latestScans.map((scan) => scan.domain_id).filter((value): value is string => Boolean(value));
  const scanIds = latestScans.map((scan) => scan.id);

  const [{ data: domains, error: domainsError }, { data: snapshots, error: snapshotsError }] = await Promise.all([
    domainIds.length
      ? db.from("domains").select("id, hostname").eq("organization_id", organizationId).in("id", domainIds)
      : Promise.resolve({ data: [] as DomainRow[], error: null }),
    scanIds.length
      ? db
          .from("scan_snapshots")
          .select(
            "scan_id, accessibility_score, accessibility_litigation_risk_score, accessibility_statement_present, vpat_or_accessibility_conformance_doc_present, accessibility_contact_method_present, accessibility_claim_mismatch_detected, wcag_error_count_total, wcag_missing_alt_count, wcag_contrast_failures_count, wcag_aria_error_count, wcag_keyboard_navigation_issue_count"
          )
          .in("scan_id", scanIds)
      : Promise.resolve({ data: [] as SnapshotRow[], error: null })
  ]);

  if (domainsError) {
    throw new Error(`Failed to load accessibility domains: ${domainsError.message}`);
  }
  if (snapshotsError) {
    throw new Error(`Failed to load accessibility snapshots: ${snapshotsError.message}`);
  }

  const domainMap = new Map(((domains ?? []) as DomainRow[]).map((domain) => [domain.id, domain.hostname]));
  const snapshotMap = new Map(((snapshots ?? []) as SnapshotRow[]).map((snapshot) => [snapshot.scan_id, snapshot]));

  const rows = latestScans
    .map((scan) => {
      const snapshot = snapshotMap.get(scan.id);
      const hostname = scan.domain_id ? domainMap.get(scan.domain_id) : null;
      if (!snapshot || !hostname) {
        return null;
      }

      return {
        accessibilityClaimMismatchDetected: snapshot.accessibility_claim_mismatch_detected ?? false,
        accessibilityContactMethodPresent: snapshot.accessibility_contact_method_present ?? false,
        accessibilityLitigationRiskScore: snapshot.accessibility_litigation_risk_score ?? 0,
        accessibilityScore: snapshot.accessibility_score ?? 0,
        accessibilityStatementPresent: snapshot.accessibility_statement_present ?? false,
        completedAt: scan.completed_at,
        domainHostname: hostname,
        scanId: scan.id,
        vpatPresent: snapshot.vpat_or_accessibility_conformance_doc_present ?? false,
        wcagAriaErrorCount: snapshot.wcag_aria_error_count ?? 0,
        wcagContrastFailuresCount: snapshot.wcag_contrast_failures_count ?? 0,
        wcagErrorCountTotal: snapshot.wcag_error_count_total ?? 0,
        wcagKeyboardNavigationIssueCount: snapshot.wcag_keyboard_navigation_issue_count ?? 0,
        wcagMissingAltCount: snapshot.wcag_missing_alt_count ?? 0
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  const leaderboard = [...rows]
    .sort(
      (left, right) =>
        right.accessibilityLitigationRiskScore - left.accessibilityLitigationRiskScore ||
        right.wcagErrorCountTotal - left.wcagErrorCountTotal ||
        left.domainHostname.localeCompare(right.domainHostname)
    );

  return {
    leaderboard,
    summary: {
      claimMismatchCount: rows.filter((row) => row.accessibilityClaimMismatchDetected).length,
      domainsWithStatementCount: rows.filter((row) => row.accessibilityStatementPresent).length,
      domainsWithVpatCount: rows.filter((row) => row.vpatPresent).length,
      highestLitigationRiskScore: leaderboard[0]?.accessibilityLitigationRiskScore ?? 0
    }
  };
}
