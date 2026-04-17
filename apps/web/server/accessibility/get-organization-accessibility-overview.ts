"use server";

import {
  loadAccessibilityOverviewCompletedScans,
  loadAccessibilityOverviewDomainsAndSnapshots,
  type AccessibilityOverviewScanRow
} from "./repository";

export async function getOrganizationAccessibilityOverview(organizationId: string) {
  const completedScans = await loadAccessibilityOverviewCompletedScans(organizationId);

  const latestByDomain = new Map<string, AccessibilityOverviewScanRow>();
  for (const scan of completedScans) {
    if (!scan.domain_id || latestByDomain.has(scan.domain_id)) {
      continue;
    }
    latestByDomain.set(scan.domain_id, scan);
  }

  const latestScans = [...latestByDomain.values()];
  const domainIds = latestScans.map((scan) => scan.domain_id).filter((value): value is string => Boolean(value));
  const scanIds = latestScans.map((scan) => scan.id);

  const { domains, snapshots } = await loadAccessibilityOverviewDomainsAndSnapshots({
    domainIds,
    organizationId,
    scanIds
  });

  const domainMap = new Map(domains.map((domain) => [domain.id, domain.hostname]));
  const snapshotMap = new Map(snapshots.map((snapshot) => [snapshot.scan_id, snapshot]));

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
