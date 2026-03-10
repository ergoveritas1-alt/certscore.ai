import Link from "next/link";
import { notFound } from "next/navigation";
import type { FetchStatus, PreviewSampleFinding } from "@website-signal-risk-scanner/shared";
import { Badge } from "@website-signal-risk-scanner/ui";
import { CollapsibleSectionCard } from "../../../../components/scans/collapsible-section-card";
import { FullScanProgressCard } from "../../../../components/scans/full-scan-progress-card";
import { InfoTip } from "../../../../components/scans/info-tip";
import { PolicyEnrichmentSection } from "../../../../components/scans/policy-enrichment-section";
import { RegulatoryRiskSection } from "../../../../components/scans/regulatory-risk-section";
import { ScanStatusAutoRefresh } from "../../../../components/scans/scan-status-auto-refresh";
import { getDashboardContext } from "../../../../server/auth";
import { buildPreviewPayloadFromSnapshot } from "../../../../server/preview-scan/build-preview-payload";
import { getScanById } from "../../../../server/scans/get-scan-by-id";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatEventMetadata(metadata: unknown) {
  if (metadata == null) {
    return "—";
  }

  if (Array.isArray(metadata)) {
    return metadata.slice(0, 3).map((value) => String(value)).join(", ") || "—";
  }

  if (typeof metadata !== "object") {
    return String(metadata);
  }

  const entries = Object.entries(metadata);

  if (entries.length === 0) {
    return "—";
  }

  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(",") : String(value)}`)
    .join(" · ");
}

function formatValue(value: unknown) {
  if (value === null || value === undefined) {
    return "Not observed";
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "[]";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function getSnapshotNumber(snapshot: Record<string, unknown>, key: string) {
  const value = snapshot[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getSnapshotBoolean(snapshot: Record<string, unknown>, key: string) {
  return snapshot[key] === true;
}

function getSnapshotFetchStatus(snapshot: Record<string, unknown>, key: string): FetchStatus | null {
  const value = snapshot[key];
  if (
    value === "ok" ||
    value === "redirected" ||
    value === "blocked" ||
    value === "timeout" ||
    value === "not_found" ||
    value === "forbidden" ||
    value === "error" ||
    value === "skipped"
  ) {
    return value;
  }

  return null;
}

function derivePreviewFindingsFromSnapshotRecord(
  snapshot: Record<string, unknown>,
  input: { hostname: string; normalizedUrl: string; pagesScanned: number }
) {
  return buildPreviewPayloadFromSnapshot({
    hostname: input.hostname,
    normalizedUrl: input.normalizedUrl,
    snapshot: {
      accessibilityScore: getSnapshotNumber(snapshot, "accessibility_score"),
      certscoreOverall: getSnapshotNumber(snapshot, "certscore_overall"),
      contactPagePresent: getSnapshotBoolean(snapshot, "contact_page_present"),
      cookieBannerPresent: getSnapshotBoolean(snapshot, "cookie_banner_present"),
      granularPreferencesPresent: getSnapshotBoolean(snapshot, "granular_preferences_present"),
      homepageFetchStatus: getSnapshotFetchStatus(snapshot, "homepage_fetch_status"),
      pagesScanned: input.pagesScanned,
      partialScan: getSnapshotBoolean(snapshot, "partial_scan"),
      privacyPolicyPresent: getSnapshotBoolean(snapshot, "privacy_policy_present"),
      privacyScore: getSnapshotNumber(snapshot, "privacy_score"),
      preconsentTrackingDetected: getSnapshotBoolean(snapshot, "preconsent_tracking_detected"),
      rejectAllPresent: getSnapshotBoolean(snapshot, "reject_all_present"),
      termsOfServicePresent: getSnapshotBoolean(snapshot, "terms_of_service_present"),
      thirdPartyCookieSetBeforeConsent: getSnapshotBoolean(snapshot, "third_party_cookie_set_before_consent"),
      totalSignals: getSnapshotNumber(snapshot, "total_signals"),
      trackingBeforeConsentDetected: getSnapshotBoolean(snapshot, "tracking_before_consent_detected"),
      wcagFormLabelErrorCount: getSnapshotNumber(snapshot, "wcag_form_label_error_count"),
      wcagMissingAltCount: getSnapshotNumber(snapshot, "wcag_missing_alt_count")
    }
  }).sampleFindings;
}

function hasTruthySignal(
  signals: Array<{ key: string; value: boolean | number | string | string[] }>,
  key: string
) {
  return signals.some((signal) => {
    const matches = signal.key === key || signal.key.endsWith(`.${key}`);
    return matches && signal.value === true;
  });
}

function getExecutionPlan(scanConfigJson: Record<string, unknown> | null) {
  const execution =
    scanConfigJson && typeof scanConfigJson.execution === "object" && scanConfigJson.execution !== null
      ? (scanConfigJson.execution as Record<string, unknown>)
      : null;
  const scanPlan =
    execution && typeof execution.scanPlan === "object" && execution.scanPlan !== null
      ? (execution.scanPlan as Record<string, unknown>)
      : null;

  return {
    pagesRequested: typeof execution?.pagesRequested === "number" ? execution.pagesRequested : null,
    profile: typeof scanPlan?.profile === "string" ? scanPlan.profile : null,
    prefetchTargetCount: typeof scanPlan?.prefetchTargetCount === "number" ? scanPlan.prefetchTargetCount : null,
    expansionTargetCount: typeof scanPlan?.expansionTargetCount === "number" ? scanPlan.expansionTargetCount : null,
    staticFetchConcurrency: typeof scanPlan?.staticFetchConcurrency === "number" ? scanPlan.staticFetchConcurrency : null,
    browserNavigationTimeoutMs:
      typeof scanPlan?.browserNavigationTimeoutMs === "number" ? scanPlan.browserNavigationTimeoutMs : null,
    browserPostLoadWaitMs: typeof scanPlan?.browserPostLoadWaitMs === "number" ? scanPlan.browserPostLoadWaitMs : null,
    blockStylesheetsInBrowser:
      typeof scanPlan?.blockStylesheetsInBrowser === "boolean" ? scanPlan.blockStylesheetsInBrowser : null
  };
}

const SNAPSHOT_SECTIONS = [
  {
    title: "Coverage",
    fields: [
      "total_signals",
      "accessibility_signal_count",
      "privacy_signal_count",
      "disclosure_signal_count",
      "certscore_overall",
      "privacy_score",
      "consent_score",
      "tracker_risk_score",
      "accessibility_score",
      "data_collection_risk_score",
      "consumer_protection_score",
      "children_privacy_risk_score",
      "legal_coverage_score",
      "regulatory_exposure_score",
      "compliance_maturity_tier"
    ]
  },
  {
    title: "Crawl And Site",
    fields: [
      "scan_timestamp",
      "scanner_schema_version",
      "detection_engine_version",
      "domain",
      "registered_domain",
      "crawl_source",
      "crawl_tier",
      "robots_allowed",
      "robots_fetch_status",
      "robots_fetch_http_status",
      "homepage_fetch_status",
      "homepage_fetch_http_status",
      "final_url",
      "redirect_count",
      "render_mode_used",
      "scan_confidence",
      "partial_scan",
      "timeout_flag",
      "blocked_flag",
      "captcha_flag",
      "country_inferred",
      "jurisdiction_guess",
      "traffic_tier_estimate"
    ]
  },
  {
    title: "Privacy And Consent",
    fields: [
      "privacy_policy_present",
      "terms_of_service_present",
      "cookie_policy_present",
      "do_not_sell_link_present",
      "dsar_request_mechanism_present",
      "privacy_request_form_present",
      "data_access_request_present",
      "data_deletion_request_present",
      "privacy_contact_channel_type",
      "user_rights_friction_score",
      "cookie_banner_present",
      "consent_mechanism_type",
      "cmp_vendor_name",
      "reject_all_present",
      "granular_preferences_present",
      "cookie_category_count",
      "consent_persistence_mechanism_detected",
      "preconsent_tracking_detected",
      "tracking_before_consent_detected",
      "cookie_count_total",
      "third_party_cookie_count"
    ]
  },
  {
    title: "Trackers, Forms, And Security",
    fields: [
      "tracker_count_total",
      "session_replay_tracker_count",
      "third_party_script_domain_count",
      "tracker_vendor_concentration_score",
      "tracker_diversity_score",
      "form_count_total",
      "checkout_or_payment_form_present",
      "high_sensitivity_data_collection_detected",
      "security_txt_present",
      "hsts_enabled",
      "csp_header_present",
      "permissions_policy_present",
      "tls_version_min_supported",
      "certificate_authority",
      "dnssec_enabled",
      "spf_record_present",
      "dmarc_record_present",
      "dkim_record_detected",
      "request_domain_set_changed",
      "script_domain_set_changed",
      "security_header_posture_changed",
      "infrastructure_change_detected"
    ]
  }
] as const;

const SNAPSHOT_SECTION_HELP: Record<string, string> = {
  Coverage: "A compact view of how many signals the scan surfaced and how the main scoring layers resolved.",
  "Crawl And Site": "Core crawl outcome, fetch behavior, and site-level context captured during the scan.",
  "Privacy And Consent": "Observed consent controls, privacy-rights paths, and pre-consent behavior indicators.",
  "Trackers, Forms, And Security": "Runtime tracker surface, data-collection forms, and core security posture signals."
};

type ScanDetailPageProps = {
  params: Promise<{
    scanId: string;
  }>;
};

export default async function ScanDetailPage({ params }: ScanDetailPageProps) {
  const [{ scanId }, { organization }] = await Promise.all([params, getDashboardContext()]);
  const scanRecord = await getScanById({
    organizationId: organization.id,
    scanId
  });

  if (!scanRecord) {
    notFound();
  }

  const isInProgress = scanRecord.scan.status === "queued" || scanRecord.scan.status === "running";
  const executionPlan = getExecutionPlan(scanRecord.scan.scanConfigJson);
  const previewDerivedFindings = scanRecord.snapshot
    ? derivePreviewFindingsFromSnapshotRecord(scanRecord.snapshot, {
        hostname: scanRecord.scan.domainHostname ?? "Unknown website",
        normalizedUrl: `https://${scanRecord.scan.domainHostname ?? ""}`,
        pagesScanned: scanRecord.scan.pagesScanned
      })
    : [];
  const relatedPreviewFindings =
    previewDerivedFindings.length === 0 && scanRecord.relatedPreviewSnapshot
      ? derivePreviewFindingsFromSnapshotRecord(scanRecord.relatedPreviewSnapshot, {
          hostname: scanRecord.scan.domainHostname ?? "Unknown website",
          normalizedUrl: `https://${scanRecord.scan.domainHostname ?? ""}`,
          pagesScanned: scanRecord.scan.pagesScanned
        })
      : [];
  const signalDerivedFindings =
    previewDerivedFindings.length === 0
      ? [
          hasTruthySignal(scanRecord.signals, "tracking_before_consent_detected") ||
          hasTruthySignal(scanRecord.signals, "preconsent_tracking_detected") ||
          hasTruthySignal(scanRecord.signals, "third_party_cookie_set_before_consent")
            ? {
                affectedPage: "Homepage",
                category: "privacy",
                severity: "high",
                title: "Tracking activity observed before consent",
                description:
                  "The live scan observed tracking signals or third-party cookies before a clear consent interaction point was completed."
              }
            : null
        ].filter((finding): finding is PreviewSampleFinding => Boolean(finding))
      : [];
  const sampleFindings = [...previewDerivedFindings, ...signalDerivedFindings, ...relatedPreviewFindings].slice(0, 3);

  return (
    <div className="min-w-0 overflow-x-hidden space-y-8">
      <div className="space-y-3">
        <div className="space-y-3">
          <Badge tone={scanRecord.scan.status === "completed" ? "success" : "warning"}>
            {formatStatus(scanRecord.scan.status)}
          </Badge>
          <div className="flex flex-wrap items-end gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              Scan: {scanRecord.scan.domainHostname ?? "Unknown website"}
            </h1>
            <span className="text-sm font-normal text-slate-400">
              Created {formatDateTime(scanRecord.scan.createdAt)}
            </span>
          </div>
          <ScanStatusAutoRefresh status={scanRecord.scan.status} />
        </div>
      </div>

      {isInProgress ? (
        <FullScanProgressCard
          createdAt={scanRecord.scan.createdAt}
          events={scanRecord.events.map((event) => ({
            createdAt: event.createdAt,
            eventType: event.eventType,
            message: event.message,
            metadataJson: event.metadataJson
          }))}
          status={scanRecord.scan.status}
        />
      ) : null}

      {scanRecord.snapshot ? (
        <div className={sampleFindings.length > 0 ? "grid gap-4 lg:grid-cols-[0.7fr_1.3fr]" : "grid gap-4"}>
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
            <div className="space-y-2 text-sm text-slate-600">
              <div className="flex items-center gap-1.5 text-base font-semibold text-slate-900">
                <span>Overall score: {formatValue(scanRecord.snapshot.certscore_overall)}</span>
                <InfoTip text="A high-level website score based on the current scan’s signal mix. Higher is better here: higher values generally reflect stronger observable posture across the surfaced checks." />
              </div>
              <div className="flex items-center gap-1.5">
                <span>Regulatory risk: {formatValue(scanRecord.regulatoryRisk?.overallScore)}</span>
                <InfoTip text="A weighted regulatory risk score based on privacy, consent, disclosure, accessibility, and data-exposure signals. Higher means more regulator-relevant risk indicators surfaced in the scan." />
              </div>
              <div className="flex items-center gap-1.5">
                <span>Privacy: {formatValue(scanRecord.snapshot.privacy_score)}</span>
                <InfoTip text="A score for observable privacy-rights, disclosure, and data-handling signals found in this scan. Higher is better here." />
              </div>
              <div className="flex items-center gap-1.5">
                <span>Accessibility: {formatValue(scanRecord.snapshot.accessibility_score)}</span>
                <InfoTip text="A score based on automated accessibility findings and related public-facing accessibility signals detected during the scan. Higher is better here." />
              </div>
            </div>
          </div>
          {sampleFindings.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <p className="text-base font-semibold text-slate-900">Sample findings</p>
                  <InfoTip text="A compact summary of the most headline-worthy findings selected from the scan so you can orient quickly before drilling into the detailed sections below." />
                </div>
                <div className="space-y-3">
                  {sampleFindings.map((finding) => (
                    <div key={`${finding.category}-${finding.title}`} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-sm font-medium text-slate-950">{finding.title}</p>
                      <p className="mt-1 text-sm text-slate-600">{finding.description}</p>
                      <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                        {finding.category === "legal" ? "disclosure" : finding.category} · {finding.severity} · {finding.affectedPage}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <RegulatoryRiskSection risk={scanRecord.regulatoryRisk} agencyMappings={scanRecord.agencyMappings} />

      <CollapsibleSectionCard
        title={
          <span className="flex items-center gap-1.5">
            <span>Signals</span>
            <InfoTip text="The active structured signals persisted for this scan. These normalized flags and counts drive the downstream summaries and scores." />
          </span>
        }
      >
          {scanRecord.signals.length === 0 ? (
            <p className="text-sm text-slate-600">No structured signals are available for this scan yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {scanRecord.signals.map((signal) => (
                <div key={signal.key} className="rounded-2xl border border-slate-200 p-4">
                  <p className="font-medium text-slate-900">{signal.label}</p>
                  <p className="mt-1 text-sm text-slate-500 capitalize">{signal.category}</p>
                  <p className="mt-3 text-sm text-slate-700">
                    {Array.isArray(signal.value) ? signal.value.join(", ") : String(signal.value)}
                  </p>
                </div>
              ))}
            </div>
          )}
      </CollapsibleSectionCard>

      <PolicyEnrichmentSection
        enrichments={scanRecord.policyEnrichment}
        reviewQueue={scanRecord.policyReviewQueue}
      />

      <CollapsibleSectionCard
        title={
          <span className="flex items-center gap-1.5">
            <span>Execution profile</span>
            <InfoTip text="The scan plan and runtime budget selected for this run, including crawl depth, concurrency, and browser behavior settings." />
          </span>
        }
        contentClassName="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4"
      >
          <p>Profile: {formatValue(executionPlan.profile)}</p>
          <p>Planned pages: {formatValue(executionPlan.pagesRequested)}</p>
          <p>Prefetch targets: {formatValue(executionPlan.prefetchTargetCount)}</p>
          <p>Expansion targets: {formatValue(executionPlan.expansionTargetCount)}</p>
          <p>Static fetch concurrency: {formatValue(executionPlan.staticFetchConcurrency)}</p>
          <p>Browser nav timeout: {formatValue(executionPlan.browserNavigationTimeoutMs)}</p>
          <p>Browser post-load wait: {formatValue(executionPlan.browserPostLoadWaitMs)}</p>
          <p>Block stylesheets: {formatValue(executionPlan.blockStylesheetsInBrowser)}</p>
      </CollapsibleSectionCard>

      {scanRecord.snapshot ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {SNAPSHOT_SECTIONS.map((section) => (
            <CollapsibleSectionCard
              key={section.title}
              title={
                <span className="flex items-center gap-1.5">
                  <span>{section.title}</span>
                  <InfoTip text={SNAPSHOT_SECTION_HELP[section.title] ?? "Structured snapshot fields persisted for this area of the scan."} />
                </span>
              }
              contentClassName="space-y-2 text-sm"
            >
                {section.fields.map((field) => (
                  <div key={field} className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
                    <span className="font-medium text-slate-700">{field}</span>
                    <span className="max-w-[60%] text-right text-slate-600">{formatValue(scanRecord.snapshot?.[field])}</span>
                  </div>
                ))}
            </CollapsibleSectionCard>
          ))}
        </div>
      ) : null}

      {scanRecord.snapshot ? (
        <CollapsibleSectionCard
          title={
            <span className="flex items-center gap-1.5">
              <span>Accessibility</span>
              <InfoTip text="Automated accessibility metrics and related public-facing accessibility signals detected during this scan." />
            </span>
          }
          contentClassName="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4"
        >
          <p>Accessibility score: {formatValue(scanRecord.snapshot.accessibility_score)}</p>
          <p>Automated score: {formatValue(scanRecord.snapshot.accessibility_score_automated)}</p>
          <p>WCAG errors: {formatValue(scanRecord.snapshot.wcag_error_count_total)}</p>
          <p>WCAG warnings: {formatValue(scanRecord.snapshot.wcag_warning_count_total)}</p>
          <p>Missing alt text: {formatValue(scanRecord.snapshot.wcag_missing_alt_count)}</p>
          <p>Form label issues: {formatValue(scanRecord.snapshot.wcag_form_label_error_count)}</p>
          <p>Keyboard issues: {formatValue(scanRecord.snapshot.wcag_keyboard_navigation_issue_count)}</p>
          <p>Claim mismatch detected: {formatValue(scanRecord.snapshot.accessibility_claim_mismatch_detected)}</p>
          <p>Accessibility statement present: {formatValue(scanRecord.snapshot.accessibility_statement_present)}</p>
          <p>Accessibility contact present: {formatValue(scanRecord.snapshot.accessibility_contact_method_present)}</p>
          <p>Widget present: {formatValue(scanRecord.snapshot.accessibility_widget_present)}</p>
          <p>Litigation risk score: {formatValue(scanRecord.snapshot.accessibility_litigation_risk_score)}</p>
        </CollapsibleSectionCard>
      ) : null}

      {scanRecord.runtimeArtifacts ? (
        <CollapsibleSectionCard
          title={
            <span className="flex items-center gap-1.5">
              <span>Runtime evidence</span>
              <InfoTip text="Compact browser-run evidence such as request domains, cookie counts, script domains, and DOM summary fields. Raw HTML and screenshots are not stored." />
            </span>
          }
          contentClassName="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4"
        >
            <p>Third-party request count: {formatValue(scanRecord.runtimeArtifacts.third_party_request_count)}</p>
            <p>Third-party request domains: {formatValue(scanRecord.runtimeArtifacts.third_party_request_domains)}</p>
            <p>Initial cookie count: {formatValue(scanRecord.runtimeArtifacts.initial_cookie_count)}</p>
            <p>Initial cookie names: {formatValue(scanRecord.runtimeArtifacts.initial_cookie_names)}</p>
            <p>Script tag count: {formatValue(scanRecord.runtimeArtifacts.script_tag_count)}</p>
            <p>Script source domains: {formatValue(scanRecord.runtimeArtifacts.script_src_domains)}</p>
            <p>DOM node count: {formatValue(scanRecord.runtimeArtifacts.dom_node_count)}</p>
            <p>DOM structure hash: {formatValue(scanRecord.runtimeArtifacts.dom_structure_hash)}</p>
        </CollapsibleSectionCard>
      ) : null}

      <CollapsibleSectionCard
        title={
          <span className="flex items-center gap-1.5">
            <span>Scan events</span>
            <InfoTip text="The event log recorded while this scan ran, including crawl milestones, persistence steps, and derived processing stages." />
          </span>
        }
      >
          {scanRecord.events.length === 0 ? (
            <p className="text-sm text-slate-600">No scan events have been recorded for this scan yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="pb-2 pr-4 font-medium">Time</th>
                    <th className="pb-2 pr-4 font-medium">Event</th>
                    <th className="pb-2 pr-4 font-medium">Message</th>
                    <th className="pb-2 font-medium">Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scanRecord.events.map((event) => (
                    <tr key={event.id} className="align-top">
                      <td className="py-2 pr-4 whitespace-nowrap text-slate-500">{formatDateTime(event.createdAt)}</td>
                      <td className="py-2 pr-4 text-slate-700">{event.eventType}</td>
                      <td className="py-2 pr-4 text-slate-900">{event.message}</td>
                      <td className="py-2 font-mono text-xs text-slate-500">{formatEventMetadata(event.metadataJson)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </CollapsibleSectionCard>
    </div>
  );
}
