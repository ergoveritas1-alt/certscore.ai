import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import type { ReactNode } from "react";
import { CaliforniaPrivacyCoverageChecklistCard } from "../../../../components/scans/california-privacy-coverage-checklist-card";
import { GdprEprivacyCoverageChecklistCard } from "../../../../components/scans/gdpr-eprivacy-coverage-checklist-card";
import { RegulatoryChecklistSection } from "../../../../components/scans/regulatory-checklist-section";
import { VendorBrandChip } from "../../../../components/scans/vendor-brand-chip";
import { V2ScanLabSubmitControl } from "./v2-scan-lab-submit-progress";
import { V2PriorityIssuesCarousel, type V2PriorityRegulatoryGap } from "./v2-priority-issues-carousel";
import { submitV2ScanLabAction } from "./actions";
import type { CaliforniaPrivacyCoverageChecklistItem } from "../../../../lib/scans/california-privacy-coverage-checklist";
import type { GdprEprivacyCoverageChecklistItem } from "../../../../lib/scans/gdpr-eprivacy-coverage-checklist";
import { deriveRegulatoryCoverageScore } from "../../../../lib/scans/regulatory-coverage-score";
import {
  getV2ScanLabRunProfiles,
  isV2ScanLabConsentDagEligibleProfile,
  type V2ScanLabRunProfile,
} from "../../../../server/admin/v2-scan-lab-runner";
import {
  loadV2ScanLabArtifacts,
  type V2ScanLabModel,
  type V2ScanLabReviewSummary,
} from "../../../../server/admin/v2-scan-lab-artifacts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type V2ScanLabPageProps = {
  searchParams?: Promise<{
    chain?: string;
    scanMessage?: string;
    scanStatus?: string;
    scanTimeSec?: string;
    url?: string;
    profile?: string;
    consentDag?: string;
  }>;
};

const PROFILE_OPTIONS = getV2ScanLabRunProfiles();
const DEFAULT_SCAN_PROFILE: V2ScanLabRunProfile = "full";

export default async function AdminV2ScanLabPage({ searchParams }: V2ScanLabPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const inputUrl = resolvedSearchParams.url ?? "";
  const selectedChainKey = resolvedSearchParams.chain ?? "";
  const hasExplicitProfile = typeof resolvedSearchParams.profile === "string";
  const profile = PROFILE_OPTIONS.includes(resolvedSearchParams.profile as V2ScanLabRunProfile)
    ? resolvedSearchParams.profile as V2ScanLabRunProfile
    : DEFAULT_SCAN_PROFILE;
  const consentDag = isV2ScanLabConsentDagEligibleProfile(profile)
    && (resolvedSearchParams.consentDag === "yes" || (!hasExplicitProfile && resolvedSearchParams.consentDag === undefined));
  const result = inputUrl.trim()
    ? await loadV2ScanLabArtifacts({ chainKey: selectedChainKey, url: inputUrl, profile })
    : null;

  return (
    <div className="space-y-6">
      {result?.status !== "ready" ? (
        <ScanPrompt
          inputUrl={inputUrl}
          profile={profile}
          consentDag={consentDag}
          scanMessage={resolvedSearchParams.scanMessage ?? ""}
          scanStatus={resolvedSearchParams.scanStatus ?? ""}
        />
      ) : null}

      {!result ? <InitialState /> : null}

      {result?.status === "error" ? (
        <StatusCard title="Internal Diagnostic Error" tone="danger">
          <p>
            <span className="font-mono">{result.error.code}</span>: {result.error.message}
          </p>
          {result.error.artifactPath ? <p className="mt-2 font-mono">{result.error.artifactPath}</p> : null}
        </StatusCard>
      ) : null}

{result?.status === "empty" ? (
        <StatusCard title="No Saved Artifacts" tone="muted">
          <p>{result.message}</p>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
{`pnpm v2:scan --url <url> --profile tiny --out ./artifacts/<domain>
pnpm v2:review --bundle ./artifacts/<domain>/CanonicalEvidenceBundle.json --out ./artifacts/<domain>/ReviewResult.json
pnpm v2:project --bundle ./artifacts/<domain>/CanonicalEvidenceBundle.json --review ./artifacts/<domain>/ReviewResult.json --out ./artifacts/<domain>/V2ReportProjectionDraft.json
pnpm v2:wc01-evidence-preview ...`}
          </pre>
        </StatusCard>
      ) : null}

      {result?.status === "ready" ? (
        <ScanLabModelView
          inputUrl={inputUrl}
          model={result.model}
          profile={profile}
          consentDag={consentDag}
          scanMessage={resolvedSearchParams.scanMessage ?? ""}
          scanStatus={resolvedSearchParams.scanStatus ?? ""}
          scanTimeSec={resolvedSearchParams.scanTimeSec ?? ""}
        />
      ) : null}
    </div>
  );
}

function ScanLabModelView({
  inputUrl,
  model,
  profile,
  consentDag,
  scanMessage,
  scanStatus,
  scanTimeSec,
}: {
  inputUrl: string;
  model: V2ScanLabModel;
  profile: V2ScanLabRunProfile;
  consentDag: boolean;
  scanMessage: string;
  scanStatus: string;
  scanTimeSec: string;
}) {
  return (
    <div className="space-y-6">
      <LabReportHeader
        inputUrl={inputUrl}
        model={model}
        profile={profile}
        consentDag={consentDag}
        scanMessage={scanMessage}
        scanStatus={scanStatus}
        scanTimeSec={scanTimeSec}
      />
      <LegacyStyleReportOverview model={model} />
      <V2RegulatoryReviewBeta model={model} />
    </div>
  );
}

function V2RegulatoryReviewBeta({ model }: { model: V2ScanLabModel }) {
  const checklist = model.regulatoryReviewChecklist;
  return (
    <section className="scroll-mt-6" id="regulatory-review-beta" data-testid="v2-regulatory-review-beta">
      <RegulatoryChecklistSection
        headingLabel="Regulatory Diagnostics"
        showAdvancedEvidenceToggle
        tabs={[
          {
            content: (
              <GdprEprivacyCoverageChecklistCard
                defaultOpen
                items={checklist.gdprEprivacyItems as GdprEprivacyCoverageChecklistItem[]}
                showDebugConfidenceImprovements={false}
                showSummaryStrip={false}
              />
            ),
            id: "gdpr-eprivacy",
            label: "GDPR / ePrivacy",
            shortLabel: "GDPR/ePrivacy",
          },
          {
            content: (
              <CaliforniaPrivacyCoverageChecklistCard
                defaultOpen
                items={checklist.californiaPrivacyItems as CaliforniaPrivacyCoverageChecklistItem[]}
                showDebugConfidenceImprovements={false}
                showSummaryStrip={false}
              />
            ),
            badgeLabel: "alpha",
            id: "california-privacy",
            label: "CCPA/CPRA",
            shortLabel: "CCPA/CPRA",
          },
        ]}
      />
    </section>
  );
}

function ScanPrompt({
  inputUrl,
  profile,
  consentDag,
  scanMessage,
  scanStatus,
  variant = "large",
}: {
  inputUrl: string;
  profile: V2ScanLabRunProfile;
  consentDag: boolean;
  scanMessage: string;
  scanStatus: string;
  variant?: "compact" | "large";
}) {
  const showStatusMessage = (scanStatus === "failed" || scanStatus === "invalid") && scanMessage.length > 0;
  const compact = variant === "compact";
  return (
    <Card className={`overflow-visible border-slate-200 bg-white shadow-sm ${compact ? "rounded-2xl" : "rounded-[1.25rem]"}`}>
      <CardContent className="space-y-4 p-0">
        <form action={submitV2ScanLabAction} className="group/scan-form relative">
          <div className={`flex flex-row items-center gap-0 ${compact ? "min-h-12" : "min-h-16"}`}>
            <label className="min-w-0 flex-1">
              <span className="sr-only">URL or domain</span>
              <input
                className={`w-full min-w-0 border-0 bg-white text-slate-950 outline-none placeholder:text-slate-400 focus:ring-0 ${
                  compact ? "h-12 rounded-2xl px-4 text-sm" : "h-16 rounded-[1.25rem] px-6 text-lg"
                }`}
                name="url"
                placeholder="Enter another site"
                type="text"
                defaultValue={inputUrl}
              />
            </label>
            <div className={`flex shrink-0 items-center ${compact ? "gap-2 px-2" : "gap-3 px-3"}`}>
              <details className="group relative">
                <summary
                  aria-label="Scan options"
                  className={`inline-flex cursor-pointer list-none items-center justify-center rounded-full text-sky-600 transition hover:bg-sky-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 [&::-webkit-details-marker]:hidden ${
                    compact ? "h-9 w-9 border border-transparent" : "h-12 w-12 border-2 border-sky-300 hover:border-sky-400"
                  }`}
                >
                  <CloudIcon compact={compact} />
                </summary>
                <div className={`absolute right-0 z-30 w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1.5 text-sm shadow-[0_18px_46px_rgba(15,23,42,0.16)] ${
                  compact ? "top-[2.75rem]" : "top-[4.25rem]"
                }`}>
                  <div className="pb-1">
                    <div className="px-3 pb-1.5 pt-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Options</div>
                    <label className="flex w-full cursor-pointer items-center justify-between gap-4 px-3 py-2.5 text-left transition hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-700">Force re-scan</span>
                      </span>
                      <input className="peer sr-only" name="freshRescan" type="checkbox" value="yes" defaultChecked />
                      <span className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-slate-200 transition peer-checked:bg-sky-500 peer-checked:[&>span]:translate-x-4">
                        <span className="h-4 w-4 translate-x-0.5 rounded-full bg-white shadow-sm transition" />
                      </span>
                    </label>
                    <label className="flex w-full cursor-pointer items-center justify-between gap-4 px-3 py-2.5 text-left transition hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-700">Planned consent DAG</span>
                        <span className="mt-1 block text-xs leading-4 text-slate-500">Parallel consent paths with lean reject capture.</span>
                      </span>
                      <input className="peer sr-only" name="consentDag" type="checkbox" value="yes" defaultChecked={consentDag} />
                      <span className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-slate-200 transition peer-checked:bg-sky-500 peer-checked:[&>span]:translate-x-4">
                        <span className="h-4 w-4 translate-x-0.5 rounded-full bg-white shadow-sm transition" />
                      </span>
                    </label>
                  </div>
                  <div className="border-t border-slate-200/70 pt-1">
                    <div className="px-3 pb-1.5 pt-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-slate-400">Scan profile</div>
                    <div role="listbox" aria-label="Scan profile">
                        {PROFILE_OPTIONS.map((option) => (
                          <label
                            key={option}
                            className="flex w-full cursor-pointer items-start gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50 has-[:checked]:bg-slate-50"
                          >
                            <input
                              className="mt-0.5 h-4 w-4 text-sky-600"
                              name="profile"
                              type="radio"
                              value={option}
                              defaultChecked={option === profile}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold capitalize text-slate-950">{option}</span>
                              <span className="mt-1 block text-sm leading-5 text-slate-500">{getProfileDescription(option)}</span>
                            </span>
                          </label>
                        ))}
                    </div>
                  </div>
                </div>
              </details>
              <V2ScanLabSubmitControl
                className={`rounded-full bg-slate-950 text-white hover:bg-slate-800 ${
                  compact ? "h-10 min-w-20 px-5 text-sm" : "h-12 min-w-28 px-6 text-base"
                }`}
                idleContent="Scan"
                pendingContent="Scanning..."
              />
            </div>
          </div>
          {showStatusMessage ? (
            <div className="mx-5 mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 group-data-[submitted=true]/scan-form:hidden">
              {scanMessage}
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}

function getProfileDescription(profile: V2ScanLabRunProfile) {
  switch (profile) {
    case "tiny":
      return "Minimal pre-consent runtime pass.";
    case "standard":
      return "Broader runtime and review coverage.";
    case "policy":
      return "Policy-surface assisted review path.";
    case "full":
      return "Runtime, consent-flow, and policy coverage.";
  }
}

function CloudIcon({ compact = false }: { compact?: boolean }) {
  return (
    <svg aria-hidden="true" className={compact ? "h-4 w-4" : "h-5 w-5"} fill="none" viewBox="0 0 24 24">
      <path
        d="M7.5 18.5h9.1a4.4 4.4 0 0 0 .4-8.8 6 6 0 0 0-11.4 1.8 3.6 3.6 0 0 0 1.9 7Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10 9.2v4.1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
      <path d="M10 6.7h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 20 20">
      <path d="M10 17s5-4.8 5-9a5 5 0 0 0-10 0c0 4.2 5 9 5 9Z" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="10" cy="8" r="1.7" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path
        d="M8.5 13.5 15.5 17M15.5 7 8.5 10.5M7 14.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM17 8.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM17 21.5a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <rect x="4" y="6" width="16" height="12" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m5.5 8 6.5 5 6.5-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path d="M6 18h12M8 18v-5a4 4 0 0 1 8 0v5M10 20.2a2.4 2.4 0 0 0 4 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M6.5 10.5a6 6 0 0 1 11 0M4.5 8a9 9 0 0 1 15 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" opacity="0.65" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24">
      <path d="M3.5 12s3.2-5.5 8.5-5.5S20.5 12 20.5 12s-3.2 5.5-8.5 5.5S3.5 12 3.5 12Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function DisclosureButtonIcon() {
  return (
    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm transition duration-150 group-open/executive-summary:rotate-90 group-hover/executive-summary:border-slate-300 group-hover/executive-summary:text-slate-700">
      <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 20 20">
        <path d="M7 4 13 10 7 16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" />
      </svg>
    </span>
  );
}

function ChevronRightIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      <path d="m8 5 5 5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
      <path d="m5 8 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function WarningBadgeIcon() {
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-700">
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 20 20">
        <path d="M10 3.2 17 16H3l7-12.8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.7" />
        <path d="M10 7.6v3.8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" />
        <path d="M10 14h.01" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2" />
      </svg>
    </span>
  );
}

function LabReportHeader({
  inputUrl,
  model,
  profile,
  consentDag,
  scanMessage,
  scanStatus,
  scanTimeSec,
}: {
  inputUrl: string;
  model: V2ScanLabModel;
  profile: V2ScanLabRunProfile;
  consentDag: boolean;
  scanMessage: string;
  scanStatus: string;
  scanTimeSec: string;
}) {
  const createdLabel = formatCreatedLabel(model.selectedChain.cohort, scanTimeSec);
  const isNoGo = model.noGoSummary.status === "observed";
  const hasCoverageLimitations = model.coverageLimitations.length > 0 || model.reviewSummary.posture === "limited_artifacts";
  const statusLabel = isNoGo ? "No-go" : hasCoverageLimitations ? "Limited" : "Completed";
  const statusClassName = isNoGo
    ? "border-rose-200 bg-rose-50 text-rose-900"
    : hasCoverageLimitations
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] items-end gap-4">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="min-w-0 break-words text-4xl font-semibold tracking-tight text-slate-950">
              Scan: {model.query.domain}
            </h2>
            <InfoIcon />
            <span className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${statusClassName}`}>
              {statusLabel}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-500 shadow-sm">
              <PinIcon />
              <CloudIcon compact />
            </span>
            <span className="text-sm text-slate-400">{createdLabel}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <HeaderActionButton label="Share" tone="active"><ShareIcon /></HeaderActionButton>
            <HeaderActionButton label="Email"><MailIcon /></HeaderActionButton>
            <HeaderActionButton label="Monitor"><BellIcon /></HeaderActionButton>
            <HeaderActionButton
              disabled={!model.visualSnapshot.href}
              href={model.visualSnapshot.href}
              label={model.visualSnapshot.label}
            >
              <EyeIcon />
            </HeaderActionButton>
          </div>
        </div>

        <div>
          <ScanPrompt
            inputUrl={inputUrl || model.query.input}
            profile={profile}
            consentDag={consentDag}
            scanMessage={scanMessage}
            scanStatus={scanStatus}
            variant="compact"
          />
        </div>
      </div>
    </div>
  );
}

function LegacyStyleReportOverview({ model }: { model: V2ScanLabModel }) {
  const consentPlatform = model.runtimeSnapshot.consentPlatform;
  const thirdPartyRequests = model.runtimeSnapshot.metrics.thirdPartyRequests;
  const cookiesBeforeConsent = model.runtimeSnapshot.metrics.cookiesBeforeConsent;
  const trackerFootprint = model.runtimeSnapshot.trackerFootprint;
  const policySurfaces = model.runtimeSnapshot.policySurfaces;
  const noGoSummary = model.noGoSummary;
  const isNoGo = noGoSummary.status === "observed";
  const overallScore = deriveV2OverallScore(model);

  return (
    <section className="overflow-visible rounded-3xl border border-slate-200 bg-white shadow-[0_18px_60px_-32px_rgba(15,23,42,0.18)]">
      <details className="group/executive-summary" data-testid="v2-executive-summary-details" open>
        <summary
          className="flex min-h-[4.75rem] cursor-pointer list-none flex-wrap items-center gap-3 px-6 py-4 marker:hidden [&::-webkit-details-marker]:hidden lg:px-8"
          data-testid="v2-executive-summary-toggle"
        >
          <DisclosureButtonIcon />
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-slate-500">Exec Summary</p>
          <span className={isNoGo
            ? "rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-900"
            : "rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-900"}
          >
            {isNoGo ? "Scan not representative" : getActionLabel(model.reviewSummary.posture)}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            Benchmark: <BenchmarkInline model={model} />
          </span>
        </summary>
        <div
          className="grid min-w-0 items-stretch gap-6 px-6 pb-6 pt-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.9fr)] lg:px-8"
          data-executive-summary-layout
        >
          <div className="min-w-0 flex flex-col gap-5 lg:min-h-0">
            <div className="space-y-5">
              <div className="space-y-3">
                {isNoGo ? (
                  <NoGoExecSummary noGoSummary={noGoSummary} />
                ) : (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <OldMetricCard
                      label="Overall score"
                      value={overallScore.value}
                      detail={overallScore.detail}
                      tone={overallScore.tone}
                      barPercent={overallScore.score}
                      stub={overallScore.score === null}
                    />
                    <OldMetricCard
                      label="3rd-party requests"
                      value={thirdPartyRequests.value === null ? "Stub" : formatMetricNumber(thirdPartyRequests.value)}
                      detail={thirdPartyRequests.detail}
                      stub={thirdPartyRequests.status !== "observed"}
                      tone="orange"
                    />
                    <OldMetricCard
                      label="Cookies before consent"
                      value={cookiesBeforeConsent.value === null ? "Stub" : formatMetricNumber(cookiesBeforeConsent.value)}
                      detail={cookiesBeforeConsent.detail}
                      stub={cookiesBeforeConsent.status !== "observed"}
                      tone="green"
                    />
                  </div>
                )}
              </div>
            </div>

            {isNoGo ? (
              <div
                className="grid min-w-0 gap-3 overflow-visible"
                data-executive-top-findings-list
                id="v2-executive-top-findings-list"
              >
                <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm leading-6 text-slate-700">
                  Scores and regulatory projections were withheld for this scan because the captured page was not
                  representative of the public site. Re-run when the site is available or try a different scan context.
                </div>
              </div>
            ) : (
              <V2PriorityIssuesCarousel
                regulatoryGaps={buildRegulatoryGapFindings(model)}
                signals={model.candidateSignals}
              />
            )}
          </div>

          {isNoGo ? (
            <NoGoQualitySnapshot />
          ) : (
            <aside className="min-w-0 space-y-3 rounded-[1.7rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(241,245,249,0.72))] p-3 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.22)]">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Signal snapshot</p>
              </div>
              <SnapshotPanel title="Consent platform">
                <ConsentPlatformCard consentPlatform={consentPlatform} />
              </SnapshotPanel>
              <SnapshotPanel title="Tracker footprint">
                <TrackerFootprintCard trackerFootprint={trackerFootprint} />
              </SnapshotPanel>
              <SnapshotPanel title="Policy surfaces">
                <PolicySurfacesCard policySurfaces={policySurfaces} />
              </SnapshotPanel>
            </aside>
          )}
        </div>
      </details>
    </section>
  );
}

function NoGoExecSummary({ noGoSummary }: { noGoSummary: V2ScanLabModel["noGoSummary"] }) {
  return (
    <div className="space-y-2">
      <h2 className="max-w-3xl text-[2rem] font-semibold leading-tight tracking-tight text-slate-950 lg:text-[2.5rem]">
          Public site access was limited during this scan
      </h2>
      <p className="max-w-3xl text-sm leading-6 text-slate-600">
        CertScore captured a maintenance, unavailable, blocked, placeholder, wrong-site, blank, or otherwise
        non-representative page instead of the normal public site. Scores, regulatory projections, and substantive
        findings are withheld for this scan.
      </p>
      <p className="sr-only">
        {noGoSummary.title}. {noGoSummary.message} {noGoSummary.reason}
      </p>
    </div>
  );
}

function NoGoQualitySnapshot() {
  return (
    <div
      className="min-w-0 space-y-4 rounded-[1.7rem] border border-slate-200 bg-[linear-gradient(180deg,rgba(248,250,252,0.95),rgba(241,245,249,0.72))] p-4 shadow-[0_18px_40px_-34px_rgba(15,23,42,0.22)]"
      data-executive-snapshot-pane
    >
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Scan quality snapshot</p>
          <p className="text-sm leading-6 text-slate-600">
            The scan retained evidence explaining why the report was not scored.
          </p>
        </div>
        <NoGoQualityCard
          detail="CertScore did not issue privacy, consent, accessibility, or regulatory scores from this run."
          label="Report status"
          value="Not scored"
        />
      </div>
    </div>
  );
}

function NoGoQualityCard({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value?: string;
}) {
  return (
    <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      {value ? <p className="mt-2 text-sm font-semibold text-slate-950">{value}</p> : null}
      <p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p>
    </div>
  );
}

function deriveV2OverallScore(model: V2ScanLabModel): {
  detail: string;
  score: number | null;
  tone: "blue" | "green" | "orange" | "red";
  value: string;
} {
  const checklist = model.regulatoryReviewChecklist;
  const frameworkScores = [
    {
      label: "GDPR/ePrivacy",
      result: deriveRegulatoryCoverageScore({
        framework: "gdpr_eprivacy",
        rows: checklist.gdprEprivacyItems as GdprEprivacyCoverageChecklistItem[],
      }),
    },
    {
      label: "CCPA/CPRA",
      result: deriveRegulatoryCoverageScore({
        framework: "california",
        rows: checklist.californiaPrivacyItems as CaliforniaPrivacyCoverageChecklistItem[],
      }),
    },
  ].filter((entry) => entry.result.score !== null);

  if (frameworkScores.length === 0) {
    return {
      detail: "No applicable v2 checklist rows were testable.",
      score: null,
      tone: "blue",
      value: "Not scored",
    };
  }

  const score = Math.round(
    frameworkScores.reduce((sum, entry) => sum + (entry.result.score ?? 0), 0) / frameworkScores.length
  );

  return {
    detail: "Diagnostic",
    score,
    tone: score >= 72 ? "green" : score >= 50 ? "orange" : "red",
    value: String(score),
  };
}

function buildRegulatoryGapFindings(model: V2ScanLabModel): V2PriorityRegulatoryGap[] {
  const checklist = model.regulatoryReviewChecklist;
  const gdprGaps = (checklist.gdprEprivacyItems as GdprEprivacyCoverageChecklistItem[])
    .filter((item) => item.assessmentStatus === "gap_observed")
    .map((item) => regulatoryGapFromItem({
      framework: "GDPR/ePrivacy" as const,
      idPrefix: "gdpr",
      item,
    }));
  const californiaGaps = (checklist.californiaPrivacyItems as CaliforniaPrivacyCoverageChecklistItem[])
    .filter((item) => item.assessmentStatus === "gap_observed")
    .map((item) => regulatoryGapFromItem({
      framework: "CCPA/CPRA" as const,
      idPrefix: "ccpa",
      item,
    }));
  return [...gdprGaps, ...californiaGaps];
}

function regulatoryGapFromItem(input: {
  framework: V2PriorityRegulatoryGap["framework"];
  idPrefix: string;
  item: GdprEprivacyCoverageChecklistItem | CaliforniaPrivacyCoverageChecklistItem;
}): V2PriorityRegulatoryGap {
  return {
    body: input.item.criticalEvidence.statusBasis || input.item.note || input.item.explanation,
    framework: input.framework,
    id: `${input.idPrefix}:${input.item.id}`,
    title: input.item.label,
  };
}

function BenchmarkInline({ model }: { model: V2ScanLabModel }) {
  const benchmark = model.benchmarkSummary;
  if (benchmark.status !== "observed") {
    return <span className="text-slate-500">not enough v2 corpus timing data</span>;
  }
  return (
    <span className="text-slate-900" title={benchmark.detail}>
      {benchmark.comparisonLabel}
    </span>
  );
}

function formatMetricNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function OldMetricCard({
  barPercent = null,
  detail,
  label,
  stub = false,
  tone = "blue",
  value,
}: {
  barPercent?: number | null;
  detail: string;
  label: string;
  stub?: boolean;
  tone?: "blue" | "green" | "orange" | "red";
  value: string;
}) {
  const normalizedBarPercent = barPercent === null ? null : Math.max(0, Math.min(100, Math.round(barPercent)));
  const defaultBarClass = stub
    ? "w-1/3 bg-slate-300"
    : tone === "green"
      ? "w-[18%] bg-lime-500"
      : tone === "orange"
        ? "w-[78%] bg-orange-500"
        : tone === "red"
          ? "w-[38%] bg-rose-500"
          : "w-2/3 bg-sky-400";
  const fillClass = stub
    ? "bg-slate-300"
    : tone === "green"
      ? "bg-lime-500"
      : tone === "orange"
        ? "bg-orange-500"
        : tone === "red"
          ? "bg-rose-500"
          : "bg-sky-400";
  const trackClass = tone === "green"
    ? "bg-emerald-100"
    : tone === "orange"
      ? "bg-amber-100"
      : tone === "red"
        ? "bg-rose-100"
        : "bg-sky-100";
  return (
    <div className="relative overflow-visible rounded-[1.1rem] border border-slate-200 bg-white px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="whitespace-nowrap text-[9px] uppercase tracking-[0.13em] text-slate-500">{label}</p>
        {stub ? <StubBadge /> : <InfoBadge />}
      </div>
      <p className="mt-2 text-[2.15rem] font-semibold leading-none tracking-tight text-slate-950">{value}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-slate-600">{detail}</p>
      <div className={`mt-3 h-2 rounded-full ${stub ? "bg-slate-100" : trackClass}`}>
        <div
          className={`h-2 rounded-full ${normalizedBarPercent === null ? defaultBarClass : fillClass}`}
          style={normalizedBarPercent === null ? undefined : { width: `${normalizedBarPercent}%` }}
        />
      </div>
    </div>
  );
}

function SnapshotPanel({ children, title }: { children: ReactNode; title: string }) {
  return (
    <div className="rounded-[1.05rem] border border-slate-200 bg-white px-3.5 py-2.5">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{title}</p>
      {children}
    </div>
  );
}

function TrackerFootprintCard({
  trackerFootprint,
}: {
  trackerFootprint: V2ScanLabModel["runtimeSnapshot"]["trackerFootprint"];
}) {
  const rows = [
    ...trackerFootprint.vendorLabels.map((label) => ({ label, type: "vendor" as const })),
    ...trackerFootprint.domainLabels.map((label) => ({ label, type: "domain" as const })),
  ];
  return (
    <details className="group/tracker-footprint">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="inline-flex min-w-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase leading-5 tracking-[0.16em] text-slate-500">
          <span className="truncate">
            {trackerFootprint.totalCount} total: {trackerFootprint.vendorCount} vendors, {trackerFootprint.domainCount} domains
          </span>
        </span>
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition group-open/tracker-footprint:rotate-180">
          <ChevronDownIcon />
        </span>
      </summary>
      <div className="mt-3 max-h-[13.25rem] space-y-1.5 overflow-y-auto pr-1">
        {rows.length > 0 ? rows.map((row) => (
          <TrackerFootprintRow key={`${row.type}:${row.label}`} label={row.label} type={row.type} />
        )) : (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            Tracker footprint unavailable in this v2 artifact.
          </p>
        )}
      </div>
    </details>
  );
}

function TrackerFootprintRow({ label, type }: { label: string; type: "vendor" | "domain" }) {
  return (
    <VendorBrandChip
      category={type}
      className="py-1 pl-1.5 pr-2.5 text-xs shadow-sm"
      label={label}
      suffix={type}
    />
  );
}

function ConsentPlatformCard({
  consentPlatform,
}: {
  consentPlatform: V2ScanLabModel["runtimeSnapshot"]["consentPlatform"];
}) {
  if (consentPlatform.status !== "observed") {
    return (
      <div className="flex items-center gap-2.5">
        <WarningBadgeIcon />
        <div>
          <p className="text-sm font-semibold text-slate-950">{consentPlatform.label}</p>
        </div>
      </div>
    );
  }
  return (
    <details className="group/consent-platform">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <VendorBrandChip
            className="h-7 w-7 rounded-full p-0"
            hideLabel
            label={consentPlatform.label}
          />
          <span className="truncate font-semibold text-slate-950">{consentPlatform.label}</span>
        </span>
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition group-open/consent-platform:rotate-180">
          <ChevronDownIcon />
        </span>
      </summary>
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-xs leading-5 text-slate-600">{consentPlatform.detail}</p>
        {consentPlatform.signals.length > 0 ? (
          <p className="mt-1.5 text-[11px] font-semibold uppercase leading-5 tracking-[0.12em] text-slate-400">
            {consentPlatform.signals.join(" / ")}
          </p>
        ) : null}
      </div>
    </details>
  );
}

function PolicySurfacesCard({
  policySurfaces,
}: {
  policySurfaces: V2ScanLabModel["runtimeSnapshot"]["policySurfaces"];
}) {
  if (policySurfaces.status !== "observed" || policySurfaces.surfaces.length === 0) {
    return (
      <SnapshotSurfaceRow
        detail="Run a standard or policy v2 scan to collect policy-surface observations."
        label="Policy surface detail unavailable"
      />
    );
  }

  return (
    <div className="space-y-2">
      {policySurfaces.surfaces.map((surface) => (
        <SnapshotSurfaceRow
          detail={[surface.url, surface.detail].filter(Boolean).join(" · ")}
          key={`${surface.surfaceType}:${surface.url ?? surface.label}`}
          label={surface.label}
        />
      ))}
    </div>
  );
}

function SnapshotSurfaceRow({ detail, label }: { detail?: string; label: string }) {
  if (detail) {
    return (
      <details className="group/snapshot-surface rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 truncate text-sm font-medium text-slate-700">{label}</span>
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition group-open/snapshot-surface:rotate-90">
            <ChevronRightIcon />
          </span>
        </summary>
        <p className="mt-1.5 break-words text-xs leading-5 text-slate-500">{detail}</p>
      </details>
    );
  }

  return (
    <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs font-medium text-slate-700 last:mb-0">
      <span>{label}</span>
      <ChevronRightIcon />
    </div>
  );
}

function StubInline({ children }: { children: ReactNode }) {
  return <span className="text-amber-700">{children}</span>;
}

function StubBadge() {
  return (
    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-800">
      Stub
    </span>
  );
}

function InfoBadge() {
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[10px] font-semibold leading-none text-slate-400">
      i
    </span>
  );
}

function HeaderActionButton({
  children,
  disabled = false,
  href,
  label,
  tone = "neutral",
}: {
  children: ReactNode;
  disabled?: boolean;
  href?: string | null;
  label: string;
  tone?: "active" | "neutral";
}) {
  const className = tone === "active"
    ? "group relative inline-flex h-10 w-10 items-center justify-center rounded-full border-0 bg-[linear-gradient(135deg,#0f8bd7_0%,#1ea7e1_62%,#67c7f0_100%)] text-sm text-white shadow-sm transition hover:brightness-[1.04] focus:outline-none focus:ring-2 focus:ring-sky-200 focus:ring-offset-2"
    : "group relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-sm text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-200 focus:ring-offset-2";
  if (href) {
    return (
      <a
        aria-label={label}
        className={className}
        href={href}
        rel="noreferrer"
        target="_blank"
        title={label}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      aria-label={label}
      className={`${className} ${disabled ? "cursor-not-allowed opacity-50 hover:border-slate-300 hover:text-slate-700" : ""}`}
      disabled={disabled}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function formatCohortTimestamp(cohort: string) {
  const match = cohort.match(/(\d{8}T\d{6})$/);
  if (!match?.[1]) {
    return null;
  }
  const raw = match[1];
  const date = new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function formatCreatedLabel(cohort: string, scanTimeSec: string) {
  const timestamp = formatCohortTimestamp(cohort);
  if (!timestamp) {
    return "Created Stub: timestamp unavailable";
  }
  const parsedScanTime = Number(scanTimeSec);
  if (Number.isFinite(parsedScanTime) && parsedScanTime >= 0) {
    return `Created ${timestamp} (scan time: ${Math.round(parsedScanTime)} sec)`;
  }
  return `Created ${timestamp}`;
}

function getActionLabel(posture: V2ScanLabReviewSummary["posture"]) {
  switch (posture) {
    case "artifact_ready":
      return "Ready for review";
    case "blocked":
      return "Blocked";
    case "limited_artifacts":
      return "Limited";
    case "needs_review":
      return "Action needed";
  }
}

function InitialState() {
  return null;
}

function StatusCard({ children, title, tone }: { children: ReactNode; title: string; tone: "danger" | "muted" }) {
  const className = tone === "danger"
    ? "border-red-200 bg-red-50 text-red-900"
    : "border-slate-200 bg-white text-slate-700";
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm">{children}</CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="mt-1 break-words font-mono text-slate-950">{value}</p>
    </div>
  );
}

function StatusPill({ children, tone }: { children: ReactNode; tone: "neutral" | "success" | "warning" }) {
  const classes = {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${classes[tone]}`}>
      {children}
    </span>
  );
}
