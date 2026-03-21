import Link from "next/link";
import type { PreviewSampleFinding, PreviewScanStatusResponse } from "@website-signal-risk-scanner/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { CollapsibleSectionCard } from "../scans/collapsible-section-card";
import { InfoTip } from "../scans/info-tip";
import { ReportExecutiveSummary } from "../scans/report-executive-summary";
import {
  SectionSubsection,
} from "../scans/report-primitives";
import { RegulatoryRelevanceSection } from "../scans/regulatory-relevance-section";
import { RegulatoryRiskSection } from "../scans/regulatory-risk-section";
import { PendingButtonLink } from "../ui/pending-link";

type PreviewScanResolvedStateProps = {
  loginHref: string;
  scan: PreviewScanStatusResponse;
};

function formatScore(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  const clamped = Math.min(100, Math.max(0, value));
  const rating = Math.round((clamped / 20) * 10) / 10;
  return `${rating.toFixed(1)}/5`;
}

function formatFindingCategory(value: PreviewSampleFinding["category"]) {
  if (value === "legal") {
    return "Privacy & disclosure";
  }

  if (value === "privacy") {
    return "Consent & tracking";
  }

  if (value === "accessibility") {
    return "Accessibility & consumer";
  }

  return value;
}

function groupFindings(findings: PreviewSampleFinding[]) {
  return [
    {
      title: "Privacy & disclosure",
      intro: "Public policy, disclosure, and contact-path issues surfaced from the lightweight homepage pass.",
      items: findings.filter((finding) => finding.category === "legal")
    },
    {
      title: "Consent & tracking",
      intro: "Consent-surface and pre-consent tracking issues surfaced from the live browser pass.",
      items: findings.filter((finding) => finding.category === "privacy")
    },
    {
      title: "Accessibility & consumer",
      intro: "Automated accessibility and user-facing trust signals surfaced from the scanned page surface.",
      items: findings.filter((finding) => finding.category === "accessibility")
    }
  ];
}

export function PreviewScanResolvedState({ loginHref, scan }: PreviewScanResolvedStateProps) {
  if (scan.status === "failed") {
    return (
      <div className="space-y-6">
        <div className="space-y-4">
          <Badge tone="warning">Preview scan failed</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">We could not complete that preview</h1>
          <p className="max-w-2xl text-lg text-slate-600">
            The preview funnel is still lightweight. Try another website or start a new homepage scan.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <PendingButtonLink href="/" idleContent="Try another website" pendingContent="Opening..." />
          <PendingButtonLink href="/login?next=/app" idleContent="Log in" pendingContent="Opening..." variant="secondary" />
        </div>
      </div>
    );
  }

  const payload = scan.previewPayload;
  if (!payload) {
    return (
      <div className="space-y-4">
        <Badge tone="warning">Preview unavailable</Badge>
        <h1 className="text-4xl font-semibold tracking-tight">This preview result is incomplete</h1>
      </div>
    );
  }

  const groupedFindings = groupFindings(payload.sampleFindings);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <Badge tone="success">Preview complete</Badge>
          <div className="flex flex-wrap items-end gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">Scan: {scan.hostname}</h1>
          </div>
          <p className="max-w-3xl text-sm text-slate-600">
            {payload.disclaimer} Create an account to save websites, run deeper scans, and track changes over time.
          </p>
        </div>
        <div className="flex justify-end md:pt-0.5">
          <PendingButtonLink href={loginHref} idleContent="Create account to continue" pendingContent="Opening..." />
        </div>
      </div>

      <ReportExecutiveSummary
        titleTooltip="This mirrors the signed-in scan summary component, but only includes the lighter homepage preview evidence available before signup."
        intro="The homepage preview is intentionally lightweight and may scan only a very small site surface."
        metrics={[
          { label: "Overall", value: formatScore(payload.scores?.overall) },
          { label: "Privacy", value: formatScore(payload.scores?.privacy) },
          { label: "Accessibility", value: formatScore(payload.scores?.accessibility) },
          { label: "Pages scanned", value: scan.pagesScanned },
          { label: "Observed findings", value: payload.sampleFindings.length }
        ]}
        badges={[
          ...(payload.issueCounts.high > 0
            ? [
                {
                  label: `${payload.issueCounts.high} high-severity finding${payload.issueCounts.high === 1 ? "" : "s"}`,
                  tone: "warning" as const
                }
              ]
            : []),
          ...(scan.regulatoryRisk
            ? [
                {
                  label: "Regulatory overlay available"
                }
              ]
            : [])
        ]}
      />

      {groupedFindings.map((section) => (
        <SectionSubsection
          key={section.title}
          title={section.title}
          intro={section.intro}
          tooltip={section.intro}
        >
          {section.items.length > 0 ? (
            section.items.map((finding) => (
              <div key={`${section.title}-${finding.title}`} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{finding.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{finding.description}</p>
                  </div>
                  <div className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-700">
                    {finding.severity}
                  </div>
                </div>
                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                  {formatFindingCategory(finding.category)} · {finding.affectedPage}
                </p>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-600">
              This preview did not surface a strong finding for this section from the scanned homepage evidence.
            </p>
          )}
        </SectionSubsection>
      ))}

      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,0.88)_100%)]">
        <div aria-hidden="true" className="pointer-events-none select-none blur-[3px] opacity-60">
          <div className="space-y-8 p-6">
            <RegulatoryRiskSection risk={scan.regulatoryRisk} agencyMappings={scan.agencyMappings} />

            <RegulatoryRelevanceSection mappings={scan.agencyMappings} />

            <CollapsibleSectionCard
              title={
                <span className="flex items-center gap-1.5">
                  <span>Advanced diagnostics</span>
                  <InfoTip text="The signed-in scan page continues into lower-level diagnostics, event history, and deeper evidence tables after the primary review sections." />
                </span>
              }
              defaultOpen
              contentClassName="space-y-4"
            >
              <Card className="border-slate-200 bg-white">
                <CardHeader>
                  <CardTitle>Preview notes</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-slate-600">
                  {payload.summaryBullets.map((bullet) => (
                    <p key={bullet}>{bullet}</p>
                  ))}
                  <p>More pages can be scanned under a signed-in plan, not just the homepage.</p>
                  <p>Saved scan history and change tracking are available inside the app.</p>
                </CardContent>
              </Card>
            </CollapsibleSectionCard>
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,rgba(248,250,252,0.3)_0%,rgba(248,250,252,0.82)_18%,rgba(255,255,255,0.96)_42%,rgba(248,250,252,0.98)_100%)] px-6 py-10">
          <Card className="w-full max-w-xl border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
            <CardHeader>
              <CardTitle>Create an account to view the rest of the results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-600">
              <p>
                The homepage preview now follows the same scan-page structure as the signed-in experience. Sign up to unlock the
                remaining sections, deeper scans, and saved scan history.
              </p>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="font-medium text-slate-950">After signup you unlock:</p>
                <ul className="mt-3 space-y-2">
                  <li>Full section-by-section review across the complete scan result page</li>
                  <li>Regulatory overlays, richer evidence, and deeper diagnostics</li>
                  <li>Multi-page scan coverage, saved summaries, and change tracking</li>
                </ul>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <PendingButtonLink className="flex-1" href={loginHref} idleContent="Create account to continue" pendingContent="Opening..." />
                <PendingButtonLink className="flex-1" href={loginHref} idleContent="Already have an account? Sign in" pendingContent="Opening..." variant="secondary" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
