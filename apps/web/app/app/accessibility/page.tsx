import Link from "next/link";
import { getDashboardContext } from "../../../server/auth";
import { getOrganizationAccessibilityOverview } from "../../../server/accessibility/get-organization-accessibility-overview";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

function formatMetric(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : "—";
}

export default async function AccessibilityPage() {
  const { organization } = await getDashboardContext();
  const overview = await getOrganizationAccessibilityOverview(organization.id);

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Accessibility intelligence</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Cross-domain accessibility posture</h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Latest completed scan per domain, ranked for accessibility risk review and WCAG-oriented issue triage.
          </p>
        </div>
        <Link className="text-sm font-medium text-slate-900 underline underline-offset-4" href="/app">
          Back to overview
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Highest accessibility risk</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{formatMetric(overview.summary.highestLitigationRiskScore)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Domains with statement</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{overview.summary.domainsWithStatementCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Domains with VPAT</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{overview.summary.domainsWithVpatCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Claim mismatches</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{overview.summary.claimMismatchCount}</p>
        </div>
      </div>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-950">Leaderboard</h2>
          <p className="text-sm text-slate-600">Sorted by accessibility risk score, then total automated WCAG issue volume.</p>
        </div>
        <div className="space-y-4">
          {overview.leaderboard.map((row) => (
            <div key={row.scanId} className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <p className="text-base font-semibold text-slate-950">{row.domainHostname}</p>
                  <p className="text-sm text-slate-500">Latest scan {formatDateTime(row.completedAt)}</p>
                </div>
                <Link className="text-sm font-medium text-slate-900 underline underline-offset-4" href={`/app/scans/${row.scanId}`}>
                  Open scan
                </Link>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Accessibility score</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-950">{formatMetric(row.accessibilityScore)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Accessibility risk score</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-950">{formatMetric(row.accessibilityLitigationRiskScore)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">WCAG errors</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-950">{formatMetric(row.wcagErrorCountTotal)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Disclosure posture</p>
                  <p className="mt-1 text-sm text-slate-800">
                    Statement {row.accessibilityStatementPresent ? "Yes" : "No"} · VPAT {row.vpatPresent ? "Yes" : "No"} · Contact{" "}
                    {row.accessibilityContactMethodPresent ? "Yes" : "No"}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm text-slate-600">
                <p>Contrast failures: {formatMetric(row.wcagContrastFailuresCount)}</p>
                <p>Missing alt text: {formatMetric(row.wcagMissingAltCount)}</p>
                <p>Keyboard issues: {formatMetric(row.wcagKeyboardNavigationIssueCount)}</p>
                <p>ARIA issues: {formatMetric(row.wcagAriaErrorCount)}</p>
                <p>Claim mismatch: {row.accessibilityClaimMismatchDetected ? "Yes" : "No"}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
