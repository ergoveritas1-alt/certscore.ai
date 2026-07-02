import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { PULSE_STANDARD_DISCLAIMER } from "../../../lib/pulse/constants";
import { buildPulseProjection } from "../../../lib/pulse/projection";
import { normalizePulseUrl } from "../../../lib/pulse/request";
import { getAnonymousScanById } from "../../../server/scans/get-scan-by-id";
import { createPulseRequest, findLatestCompletedAnonymousScanForDomain } from "../../../server/pulse/repository";
import { PulseFeedbackForm } from "../feedback/pulse-feedback-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PulsePageProps = {
  params: Promise<{ domain: string }>;
};

export async function generateMetadata({ params }: PulsePageProps): Promise<Metadata> {
  const { domain } = await params;
  const normalized = normalizePulseUrl(domain);
  const label = normalized.ok ? normalized.normalizedDomain : domain;
  return {
    title: `CertScore Pulse for ${label}`,
    description: `Agent-readable CertScore summary of automated public-web observations for ${label}.`,
    robots: {
      follow: false,
      index: false
    }
  };
}

export default async function PulseDomainPage({ params }: PulsePageProps) {
  const { domain: rawDomain } = await params;
  const normalized = normalizePulseUrl(decodeURIComponent(rawDomain));
  if (!normalized.ok) {
    notFound();
  }
  const latest = await findLatestCompletedAnonymousScanForDomain(normalized.normalizedDomain);
  if (!latest) {
    notFound();
  }
  const scanRecord = await getAnonymousScanById(latest.id);
  if (!scanRecord || scanRecord.scan.status !== "completed") {
    notFound();
  }
  const { publicId } = await createPulseRequest({
    context: {
      detail: "standard",
      format: "json",
      freshness: "latest",
      ipHash: null,
      mode: "url",
      referer: null,
      sourceIp: null,
      userAgent: null,
      waitSeconds: 0
    },
    normalizedDomain: normalized.normalizedDomain,
    normalizedUrl: normalized.normalizedUrl,
    requestedUrl: normalized.normalizedUrl,
    resolutionMode: "reused_existing_scan",
    scanId: scanRecord.scan.id,
    status: "completed"
  });
  const pulse = buildPulseProjection({
    detail: "standard",
    format: "json",
    freshnessMode: "latest",
    pulseRequestId: publicId,
    requestedUrl: normalized.normalizedUrl,
    resolutionMode: "reused_existing_scan",
    scanRecord,
    waitSeconds: 0
  }) as any;

  return (
    <main className="min-h-screen bg-white">
      <SiteHeader />
      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">CertScore Pulse</p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950">CertScore Pulse for {pulse.domain}</h1>
          <p className="max-w-3xl text-base leading-7 text-slate-600">{pulse.summary.humanSummary}</p>
          <p className="max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
            {PULSE_STANDARD_DISCLAIMER}
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <Metric label="Score" value={pulse.summary.score === null ? "N/A" : `${pulse.summary.score}/100`} />
          <Metric label="Risk level" value={String(pulse.summary.riskLevel).replaceAll("_", " ")} />
          <Metric label="Freshness" value={String(pulse.freshness.status)} />
          <Metric label="Coverage" value={String(pulse.coverage.status)} />
        </div>

        <section className="mt-10 space-y-4">
          <h2 className="text-xl font-semibold text-slate-950">Top findings</h2>
          {pulse.topFindings.length > 0 ? (
            <div className="space-y-3">
              {pulse.topFindings.map((finding: any) => (
                <article key={finding.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-slate-950">{finding.label}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      {finding.criticality}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-700">{finding.evidence.summary}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{finding.nextStep}</p>
                  <Link className="mt-3 inline-flex text-sm font-semibold text-sky-700" href={finding.anchorUrl}>
                    Review evidence
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
              No major automated review signals were surfaced in this scan.
            </p>
          )}
        </section>

        <section className="mt-10 grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Review lenses</h2>
            <div className="mt-3 space-y-2">
              {pulse.reviewContext.lenses.map((lens: any) => (
                <p key={lens.name} className="text-sm leading-6 text-slate-700">
                  <span className="font-semibold">{lens.name}:</span> {String(lens.status).replaceAll("_", " ")} - {lens.summary}
                </p>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Evidence highlights</h2>
            <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              <p>{pulse.evidenceHighlights.trackerFootprint.summary}</p>
              <p>{pulse.evidenceHighlights.policySurfaces.summary}</p>
              <p>{pulse.evidenceHighlights.fingerprinting.summary}</p>
              <p>{pulse.evidenceHighlights.vendorMix.summary}</p>
            </div>
          </div>
        </section>

        <section className="mt-10 rounded-lg border border-slate-200 p-4">
          <h2 className="text-xl font-semibold text-slate-950">Coverage</h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">{pulse.coverage.summary}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-600">
            {pulse.coverage.limitations.map((item: string) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-slate-950">Share with an agent</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <LinkButton href={pulse.links.jsonUrl}>JSON</LinkButton>
            <LinkButton href={pulse.links.markdownUrl}>Markdown</LinkButton>
            {pulse.links.summaryJsonUrl ? <LinkButton href={pulse.links.summaryJsonUrl}>Summary JSON</LinkButton> : null}
            {pulse.links.evidenceJsonUrl ? <LinkButton href={pulse.links.evidenceJsonUrl}>Evidence JSON</LinkButton> : null}
            <LinkButton href={pulse.links.fullReportUrl}>Full report</LinkButton>
          </div>
        </section>

        <section className="mt-10">
          <PulseFeedbackForm pulseRequestId={publicId} />
        </section>

        <p className="mt-12 border-t border-slate-200 pt-6 text-sm leading-6 text-slate-600">{PULSE_STANDARD_DISCLAIMER}</p>
      </section>
      <SiteFooter />
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold capitalize text-slate-950">{value}</p>
    </div>
  );
}

function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link className="inline-flex min-h-9 items-center rounded-full border border-slate-300 px-3 text-sm font-semibold text-slate-700" href={href}>
      {children}
    </Link>
  );
}
