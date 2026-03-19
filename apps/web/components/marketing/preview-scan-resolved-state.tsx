import type { PreviewScanStatusResponse } from "@website-signal-risk-scanner/shared";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import Link from "next/link";
import { RegulatoryRelevanceSection } from "../scans/regulatory-relevance-section";
import { RegulatoryRiskSection } from "../scans/regulatory-risk-section";

type PreviewScanResolvedStateProps = {
  loginHref: string;
  scan: PreviewScanStatusResponse;
};

export function PreviewScanResolvedState({ loginHref, scan }: PreviewScanResolvedStateProps) {
  if (scan.status === "failed") {
    return (
      <div className="space-y-6">
        <div className="space-y-4">
          <Badge tone="warning">Preview scan failed</Badge>
          <h1 className="text-4xl font-semibold tracking-tight">We could not complete that preview</h1>
          <p className="max-w-2xl text-lg text-slate-600">
            The preview funnel is still lightweight. Try another website or start a new preview scan.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/">Try another website</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/login?next=/app">Log in</Link>
          </Button>
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

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Badge tone="success">Preview scan complete</Badge>
        <h1 className="text-4xl font-semibold tracking-tight">{scan.hostname}</h1>
        <p className="max-w-3xl text-lg text-slate-600">
          {payload.disclaimer} Create an account to save websites, run deeper scans, and track changes over time.
        </p>
        <p className="text-sm text-slate-500">This preview is intentionally lightweight and may scan only a very small site surface.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Scan summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>Homepage scanned: {scan.hostname}</p>
            <p>Pages scanned: {scan.pagesScanned}</p>
            <p>Observed findings: {payload.sampleFindings.length}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">High</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{payload.issueCounts.high}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Medium</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{payload.issueCounts.medium}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Low</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{payload.issueCounts.low}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Sample findings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            {payload.sampleFindings.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="font-medium text-slate-950">No high-confidence sample findings were derived</p>
                <p className="mt-1 text-slate-600">
                  This lightweight preview did not surface a strong accessibility, privacy, or disclosure issue from the scanned signals.
                </p>
              </div>
            ) : (
              payload.sampleFindings.map((finding) => (
                <div key={`${finding.category}-${finding.title}`} className="rounded-2xl border border-slate-200 p-4">
                  <p className="font-medium text-slate-950">{finding.title}</p>
                  <p className="mt-1 text-slate-600">{finding.description}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                    {finding.category === "legal" ? "disclosure" : finding.category} · {finding.severity} · {finding.affectedPage}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.96)_0%,rgba(255,255,255,0.88)_100%)]">
        <div aria-hidden="true" className="pointer-events-none select-none blur-[3px] opacity-60">
          <div className="space-y-8 p-6">
            <RegulatoryRiskSection risk={scan.regulatoryRisk} agencyMappings={scan.agencyMappings} />

            <RegulatoryRelevanceSection mappings={scan.agencyMappings} />

            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <Card className="border-slate-200 bg-ink text-white">
                <CardHeader>
                  <CardTitle>Saved scan workflow</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-slate-200">
                  <p>Deeper scans, saved history, and change tracking continue inside the app.</p>
                  <div className="rounded-2xl bg-white/5 p-4 text-sm">
                    <p className="font-medium text-white">Full results include:</p>
                    <ul className="mt-3 space-y-2">
                      <li>Multi-page scan coverage based on your plan</li>
                      <li>Saved signal summaries and recent changes</li>
                      <li>Per-website scan history</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>

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
            </div>
          </div>
        </div>

        <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(180deg,rgba(248,250,252,0.3)_0%,rgba(248,250,252,0.82)_18%,rgba(255,255,255,0.96)_42%,rgba(248,250,252,0.98)_100%)] px-6 py-10">
          <Card className="w-full max-w-xl border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
            <CardHeader>
              <CardTitle>Create an account to view the rest of the results</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-600">
              <p>You've seen the top preview findings. Sign up to unlock the remaining results, deeper scans, and saved scan history.</p>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="font-medium text-slate-950">After signup you unlock:</p>
                <ul className="mt-3 space-y-2">
                  <li>Regulatory overlays and expanded result sections</li>
                  <li>Multi-page scan coverage based on your plan</li>
                  <li>Saved signal summaries and recent changes</li>
                </ul>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild className="flex-1">
                  <Link href={loginHref}>Create account to continue</Link>
                </Button>
                <Button asChild className="flex-1" variant="secondary">
                  <Link href={loginHref}>Already have an account? Sign in</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
