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
import {
  getPrimaryCategoryDescription,
  getPrimaryCategoryLabel,
  groupSnapshotFieldsByPrimaryCategory,
  PRIMARY_SCAN_CATEGORY_META
} from "../../../../lib/scans/signal-taxonomy";
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

function formatCompactValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Not observed";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "Not observed";
    }

    if (value.length <= 3) {
      return value.join(", ");
    }

    return `${value.slice(0, 3).join(", ")} +${value.length - 3} more`;
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function getFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatRating(value: unknown) {
  const numericValue = getFiniteNumber(value);

  if (numericValue === null) {
    return "—";
  }

  const clamped = Math.min(100, Math.max(0, numericValue));
  const rating = Math.round((clamped / 20) * 10) / 10;
  return `${rating.toFixed(1)}/5`;
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

const OPERATIONAL_SNAPSHOT_SECTIONS = [
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
] as const;

const SNAPSHOT_SECTION_HELP: Record<string, string> = {
  Coverage: "A compact view of how many signals the scan surfaced and how the main scoring layers resolved.",
  "Crawl And Site": "Core crawl outcome, fetch behavior, and site-level context captured during the scan."
};

type ResultMetric = {
  label: string;
  value: string;
  tooltip: string;
};

type ResultDetail = {
  label: string;
  value: unknown;
};

function ResultCategorySection(input: {
  title: string;
  intro: string;
  includes: string;
  metrics: ResultMetric[];
  details: ResultDetail[];
  defaultOpen?: boolean;
}) {
  const visibleDetails = input.details.filter((detail) => {
    if (detail.value === null || detail.value === undefined || detail.value === "") {
      return false;
    }

    if (Array.isArray(detail.value)) {
      return detail.value.length > 0;
    }

    return true;
  });

  return (
    <CollapsibleSectionCard
      title={
        <span className="flex items-center gap-1.5">
          <span>{input.title}</span>
          <InfoTip text={`${input.intro} Includes: ${input.includes}`} />
        </span>
      }
      subtitle={input.intro}
      defaultOpen={input.defaultOpen}
      contentClassName="space-y-4"
    >
      <p className="text-sm text-slate-600">
        <span className="font-medium text-slate-700">Includes:</span> {input.includes}
      </p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {input.metrics.map((metric) => (
          <div key={`${input.title}-${metric.label}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-1.5">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{metric.label}</p>
              <InfoTip align="start" text={metric.tooltip} />
            </div>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{metric.value}</p>
          </div>
        ))}
      </div>

      {visibleDetails.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {visibleDetails.map((detail) => (
            <div key={`${input.title}-${detail.label}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{detail.label}</p>
              <p className="mt-1 text-sm text-slate-700">{formatCompactValue(detail.value)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </CollapsibleSectionCard>
  );
}

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

  const snapshot = scanRecord.snapshot;
  const runtimeArtifacts = scanRecord.runtimeArtifacts;
  const isInProgress = scanRecord.scan.status === "queued" || scanRecord.scan.status === "running";
  const executionPlan = getExecutionPlan(scanRecord.scan.scanConfigJson);
  const previewDerivedFindings = snapshot
    ? derivePreviewFindingsFromSnapshotRecord(snapshot, {
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
  const preConsentTrackingObserved =
    snapshot?.preconsent_tracking_detected === true ||
    snapshot?.tracking_before_consent_detected === true ||
    hasTruthySignal(scanRecord.signals, "tracking_before_consent_detected") ||
    hasTruthySignal(scanRecord.signals, "preconsent_tracking_detected") ||
    hasTruthySignal(scanRecord.signals, "third_party_cookie_set_before_consent");
  const taxonomySnapshotSections = snapshot
    ? groupSnapshotFieldsByPrimaryCategory(Object.keys(snapshot)).map((group) => ({
        title: group.category.label,
        description: group.category.description,
        fields: group.entries.map((entry) => entry.key)
      }))
    : [];

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

      {snapshot ? (
        <div className={sampleFindings.length > 0 ? "grid gap-4 lg:grid-cols-[0.7fr_1.3fr]" : "grid gap-4"}>
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5">
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-base font-semibold text-slate-900">Ratings</p>
                  <InfoTip
                    align="start"
                    text="These headline ratings use a 0.0 to 5.0 higher-is-better scale so they are visually distinct from the 0 to 100 lower-is-better risk scores shown in the Regulatory risk section below."
                  />
                </div>
                <p className="text-sm text-slate-600">Higher is better. Risk scores stay below on a separate 0 to 100 scale.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Overall rating</p>
                    <InfoTip text="A 5-point higher-is-better rating derived from the scan's overall CertScore. It summarizes the observable posture surfaced across the current checks." />
                  </div>
                  <p className="mt-2 text-3xl font-semibold text-slate-950">{formatRating(snapshot.certscore_overall)}</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Privacy</p>
                    <InfoTip text="A 5-point higher-is-better rating derived from the privacy posture score for observable privacy-rights, disclosure, and data-handling signals found in this scan." />
                  </div>
                  <p className="mt-2 text-3xl font-semibold text-slate-950">{formatRating(snapshot.privacy_score)}</p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Accessibility</p>
                    <InfoTip text="A 5-point higher-is-better rating derived from the accessibility posture score based on automated findings and related public-facing accessibility signals detected during the scan." />
                  </div>
                  <p className="mt-2 text-3xl font-semibold text-slate-950">{formatRating(snapshot.accessibility_score)}</p>
                </div>
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

      {snapshot ? (
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <p className="text-base font-semibold text-slate-900">Results by area</p>
              <InfoTip text="The scan is organized here into seven primary signal categories designed for operators, investors, insurers, legal advisors, and researchers before moving into regulatory interpretation or raw diagnostics." />
            </div>
            <p className="text-sm text-slate-600">This view groups the scan into seven product-facing categories, with Regulatory kept as a secondary overlay below.</p>
          </div>

          <div className="space-y-4">
            <ResultCategorySection
              title={PRIMARY_SCAN_CATEGORY_META.privacy_consent_user_choice.label}
              intro={PRIMARY_SCAN_CATEGORY_META.privacy_consent_user_choice.description}
              includes="Consent experience, pre-consent tracking, privacy-rights mechanisms, and consent-manipulation signals."
              defaultOpen
              metrics={[
                {
                  label: "Privacy rating",
                  value: formatRating(snapshot.privacy_score),
                  tooltip:
                    "A 5-point higher-is-better summary of observable privacy posture, including public rights paths, privacy disclosures, and data-handling signals surfaced in this scan."
                },
                {
                  label: "Consent rating",
                  value: formatRating(snapshot.consent_score),
                  tooltip:
                    "A 5-point higher-is-better summary of consent posture, including visible consent controls, reject-all availability, granular choices, and consent-related behavior."
                },
                {
                  label: "Cookie banner",
                  value: formatCompactValue(snapshot.cookie_banner_present),
                  tooltip:
                    "Whether the scan observed a visible cookie or consent banner on the site during this run."
                },
                {
                  label: "Pre-consent tracking",
                  value: formatCompactValue(preConsentTrackingObserved),
                  tooltip:
                    "Whether tracking-related behavior or third-party cookie activity was observed before a clear consent interaction point was completed."
                }
              ]}
              details={[
                { label: "Consent mechanism", value: snapshot.consent_mechanism_type },
                { label: "CMP vendor", value: snapshot.cmp_vendor_name },
                { label: "Reject-all control", value: snapshot.reject_all_present },
                { label: "Granular preferences", value: snapshot.granular_preferences_present },
                { label: "Reject button missing", value: snapshot.dark_pattern_reject_button_missing },
                { label: "Accept more prominent", value: snapshot.dark_pattern_accept_button_prominence },
                { label: "Forced consent wall", value: snapshot.dark_pattern_forced_consent_wall },
                { label: "Dismiss without reject", value: snapshot.dark_pattern_dismiss_without_reject },
                { label: "DSAR mechanism", value: snapshot.dsar_request_mechanism_present },
                { label: "Privacy request form", value: snapshot.privacy_request_form_present },
                { label: "Access request path", value: snapshot.data_access_request_present },
                { label: "Deletion request path", value: snapshot.data_deletion_request_present },
                { label: "Privacy contact channel", value: snapshot.privacy_contact_channel_type },
                { label: "Cookie count", value: snapshot.cookie_count_total },
                { label: "Third-party cookies", value: snapshot.third_party_cookie_count }
              ]}
            />

            <ResultCategorySection
              title={PRIMARY_SCAN_CATEGORY_META.consumer_transparency_disclosures.label}
              intro={PRIMARY_SCAN_CATEGORY_META.consumer_transparency_disclosures.description}
              includes="Core legal pages, consumer policies, subscription and billing transparency, and commercial pressure or scarcity signals."
              defaultOpen
              metrics={[
                {
                  label: "Legal coverage",
                  value: formatRating(snapshot.legal_coverage_score),
                  tooltip:
                    "A 5-point higher-is-better summary of public-facing policy and disclosure coverage, including whether key legal or transparency pages are present."
                },
                {
                  label: "Consumer posture",
                  value: formatRating(snapshot.consumer_protection_score),
                  tooltip:
                    "A 5-point higher-is-better summary of consumer-facing transparency posture, including disclosures, cancellation or refund clarity, and policy-to-behavior consistency signals."
                },
                {
                  label: "Privacy policy",
                  value: formatCompactValue(snapshot.privacy_policy_present),
                  tooltip:
                    "Whether the scan detected a public privacy policy page or a strong privacy-policy signal."
                },
                {
                  label: "Terms",
                  value: formatCompactValue(snapshot.terms_of_service_present),
                  tooltip:
                    "Whether the scan detected a public terms of service, terms and conditions, or comparable terms page."
                }
              ]}
              details={[
                { label: "Cookie policy", value: snapshot.cookie_policy_present },
                { label: "Accessibility statement", value: snapshot.accessibility_statement_present },
                { label: "Contact page", value: snapshot.contact_page_present },
                { label: "Subscription terms", value: snapshot.subscription_terms_present },
                { label: "Auto-renew disclosure", value: snapshot.auto_renew_disclosure_present ?? snapshot.auto_renewal_disclosure_present },
                { label: "Cancellation policy", value: snapshot.subscription_cancellation_policy_present ?? snapshot.cancellation_policy_present },
                { label: "Free trial", value: snapshot.free_trial_detected },
                { label: "Refund policy", value: snapshot.refund_policy_present },
                { label: "Countdown timer", value: snapshot.dark_pattern_countdown_timer_present },
                { label: "Fake scarcity language", value: snapshot.dark_pattern_fake_scarcity_language },
                { label: "Policy enrichment pages", value: scanRecord.policyEnrichment.length },
                { label: "Policy review items", value: scanRecord.policyReviewQueue.length }
              ]}
            />

            <ResultCategorySection
              title={PRIMARY_SCAN_CATEGORY_META.data_collection_third_party_ecosystem.label}
              intro={PRIMARY_SCAN_CATEGORY_META.data_collection_third_party_ecosystem.description}
              includes="Analytics and tracking, advertising and retargeting, session replay tools, and commerce, support, or integration signals."
              defaultOpen
              metrics={[
                {
                  label: "Tracker count",
                  value: formatCompactValue(snapshot.tracker_count_total),
                  tooltip:
                    "The total number of tracker detections surfaced in the scan across the observed pages and runtime evidence."
                },
                {
                  label: "3P script domains",
                  value: formatCompactValue(snapshot.third_party_script_domain_count),
                  tooltip:
                    "The number of distinct third-party script source domains observed, which helps indicate how broad the site's external script ecosystem is."
                },
                {
                  label: "Forms",
                  value: formatCompactValue(snapshot.form_count_total),
                  tooltip:
                    "The number of detected forms observed in the scan, used as a simple indicator of user-input and data-collection surface area."
                },
                {
                  label: "Sensitive collection",
                  value: formatCompactValue(snapshot.high_sensitivity_data_collection_detected),
                  tooltip:
                    "Whether the scan detected signals suggesting collection of higher-sensitivity user data through public-facing forms or flows."
                }
              ]}
              details={[
                { label: "Session replay trackers", value: snapshot.session_replay_tracker_count },
                { label: "Session replay tool", value: snapshot.session_replay_tool_detected },
                { label: "Google Ads", value: snapshot.ad_network_google_ads },
                { label: "Meta Ads", value: snapshot.ad_network_meta_ads },
                { label: "Retargeting pixel", value: snapshot.retargeting_pixel_detected },
                { label: "Checkout or payment flow", value: snapshot.checkout_or_payment_form_present },
                { label: "Chat support vendor", value: snapshot.chat_support_vendor },
                { label: "Payment processors", value: snapshot.payment_processor_hints },
                { label: "Tracker concentration", value: snapshot.tracker_vendor_concentration_score },
                { label: "Tracker diversity", value: snapshot.tracker_diversity_score },
                { label: "3P request count", value: runtimeArtifacts?.third_party_request_count },
                { label: "3P request domains", value: runtimeArtifacts?.third_party_request_domains },
                { label: "Initial cookies", value: runtimeArtifacts?.initial_cookie_count },
                { label: "Initial cookie names", value: runtimeArtifacts?.initial_cookie_names },
                { label: "Script tag count", value: runtimeArtifacts?.script_tag_count },
                { label: "Script source domains", value: runtimeArtifacts?.script_src_domains }
              ]}
            />

            <ResultCategorySection
              title={PRIMARY_SCAN_CATEGORY_META.sensitive_data_identity_signals.label}
              intro={PRIMARY_SCAN_CATEGORY_META.sensitive_data_identity_signals.description}
              includes="Identity inputs, financial inputs, health-related inputs, and location or demographic collection hints surfaced from public-facing forms."
              defaultOpen
              metrics={[
                {
                  label: "Sensitive collection",
                  value: formatCompactValue(snapshot.high_sensitivity_data_collection_detected),
                  tooltip:
                    "Whether the scan detected observed signals that the site may request more sensitive categories of personal or identity-related information."
                },
                {
                  label: "SSN collection",
                  value: formatCompactValue(snapshot.form_collects_ssn),
                  tooltip:
                    "Whether form labels, placeholders, names, or nearby text suggested SSN or social-security-number collection."
                },
                {
                  label: "Government ID",
                  value: formatCompactValue(snapshot.form_collects_government_id),
                  tooltip:
                    "Whether the scan observed explicit form signals suggesting passport, driver's license, national ID, or similar government-ID collection."
                },
                {
                  label: "Financial info",
                  value: formatCompactValue(snapshot.form_collects_financial_information),
                  tooltip:
                    "Whether public-facing forms appeared to request bank, routing, salary, card, or comparable financial information."
                }
              ]}
              details={[
                { label: "Health information", value: snapshot.form_collects_health_information },
                { label: "Birthdate collection", value: snapshot.form_collects_birthdate },
                { label: "Geolocation collection", value: snapshot.form_collects_geolocation },
                { label: "Date-of-birth input", value: snapshot.date_of_birth_input_present },
                { label: "Payment-card input", value: snapshot.payment_card_input_present },
                { label: "Address input", value: snapshot.address_input_present },
                { label: "Age gate", value: snapshot.age_gate_present },
                { label: "Parental consent reference", value: snapshot.parental_consent_reference_present }
              ]}
            />

            <ResultCategorySection
              title={PRIMARY_SCAN_CATEGORY_META.accessibility.label}
              intro={PRIMARY_SCAN_CATEGORY_META.accessibility.description}
              includes="Automated issue signals, navigation and interaction issues, contrast or visual issues, and accessibility claims or statements."
              defaultOpen
              metrics={[
                {
                  label: "Accessibility rating",
                  value: formatRating(snapshot.accessibility_score),
                  tooltip:
                    "A 5-point higher-is-better summary of overall accessibility posture based on automated issues plus related public-facing accessibility signals."
                },
                {
                  label: "Automated rating",
                  value: formatRating(snapshot.accessibility_score_automated),
                  tooltip:
                    "A 5-point higher-is-better summary driven more directly by automated accessibility findings from the scan."
                },
                {
                  label: "WCAG errors",
                  value: formatCompactValue(snapshot.wcag_error_count_total),
                  tooltip:
                    "The count of automated accessibility issues classified as errors in the scan's WCAG-oriented checks."
                },
                {
                  label: "WCAG warnings",
                  value: formatCompactValue(snapshot.wcag_warning_count_total),
                  tooltip:
                    "The count of automated accessibility issues classified as warnings, which may require manual review or template-level follow-up."
                }
              ]}
              details={[
                { label: "Missing alt text", value: snapshot.wcag_missing_alt_count },
                { label: "Form label issues", value: snapshot.wcag_form_label_error_count },
                { label: "Keyboard issues", value: snapshot.wcag_keyboard_navigation_issue_count },
                { label: "Claim mismatch", value: snapshot.accessibility_claim_mismatch_detected },
                { label: "Accessibility statement", value: snapshot.accessibility_statement_present },
                { label: "Accessibility contact", value: snapshot.accessibility_contact_method_present },
                { label: "Accessibility widget", value: snapshot.accessibility_widget_present },
                { label: "Litigation risk score", value: snapshot.accessibility_litigation_risk_score }
              ]}
            />

            <ResultCategorySection
              title={PRIMARY_SCAN_CATEGORY_META.security_trust_governance.label}
              intro={PRIMARY_SCAN_CATEGORY_META.security_trust_governance.description}
              includes="Transport and headers, DNS authentication, trust and disclosure pages, and incident or vulnerability transparency signals."
              defaultOpen
              metrics={[
                {
                  label: "TLS minimum",
                  value: formatCompactValue(snapshot.tls_version_min_supported),
                  tooltip:
                    "The minimum TLS protocol version observed or inferred for the site, used as a basic indicator of transport security posture."
                },
                {
                  label: "HSTS",
                  value: formatCompactValue(snapshot.hsts_enabled),
                  tooltip:
                    "Whether HTTP Strict Transport Security was observed, which helps enforce HTTPS usage in supported browsers."
                },
                {
                  label: "CSP",
                  value: formatCompactValue(snapshot.csp_header_present),
                  tooltip:
                    "Whether a Content Security Policy header was observed, which is a basic indicator of script and resource-loading controls."
                },
                {
                  label: "DMARC",
                  value: formatCompactValue(snapshot.dmarc_record_present),
                  tooltip:
                    "Whether a DMARC record was detected for the domain, which is a useful public signal of email authentication governance."
                }
              ]}
              details={[
                { label: "Permissions policy", value: snapshot.permissions_policy_present },
                { label: "security.txt", value: snapshot.security_txt_present },
                { label: "Vulnerability disclosure page", value: snapshot.vulnerability_disclosure_page_present },
                { label: "Trust center", value: snapshot.trust_center_present },
                { label: "Incident status page", value: snapshot.incident_status_page_present },
                { label: "DNSSEC", value: snapshot.dnssec_enabled },
                { label: "SPF", value: snapshot.spf_record_present },
                { label: "DKIM", value: snapshot.dkim_record_detected },
                { label: "Certificate authority", value: snapshot.certificate_authority },
                { label: "Security posture changed", value: snapshot.security_header_posture_changed },
                { label: "Infrastructure changed", value: snapshot.infrastructure_change_detected },
                { label: "Country inferred", value: snapshot.country_inferred },
                { label: "Jurisdiction guess", value: snapshot.jurisdiction_guess }
              ]}
            />

            <ResultCategorySection
              title={PRIMARY_SCAN_CATEGORY_META.ai_automation_emerging_practices.label}
              intro={PRIMARY_SCAN_CATEGORY_META.ai_automation_emerging_practices.description}
              includes="Visible AI assistants, AI disclosures and documentation, AI search or answer experiences, and hiring or automated-decision signals."
              defaultOpen
              metrics={[
                {
                  label: "AI chatbot",
                  value: formatCompactValue(snapshot.ai_chatbot_present),
                  tooltip:
                    "Whether the scan detected a likely visible chatbot or assistant experience based on vendor signatures, widget markers, and explicit assistant language."
                },
                {
                  label: "AI vendor",
                  value: formatCompactValue(snapshot.ai_chatbot_vendor),
                  tooltip:
                    "The strongest visible AI or chat-assistant vendor signature detected on the site during the scan, if any."
                },
                {
                  label: "AI disclosure",
                  value: formatCompactValue(snapshot.ai_disclosure_text_present),
                  tooltip:
                    "Whether visible page text suggested explicit AI-related disclosure language such as AI-generated responses, powered by AI, or automated assistant messaging."
                },
                {
                  label: "AI search/answers",
                  value: formatCompactValue(snapshot.ai_search_or_answer_experience_detected),
                  tooltip:
                    "Whether the scan detected a clearly AI-labeled question-to-answer or instant-answer experience, beyond generic site search."
                }
              ]}
              details={[
                { label: "AI assistant widget", value: snapshot.ai_assistant_widget_detected },
                { label: "AI policy reference", value: snapshot.ai_terms_or_policy_ai_reference },
                { label: "AI help-center reference", value: snapshot.ai_help_center_ai_reference },
                { label: "Hiring automation signal", value: snapshot.ai_hiring_automation_signal_detected }
              ]}
            />
          </div>
        </div>
      ) : null}

      <RegulatoryRiskSection risk={scanRecord.regulatoryRisk} agencyMappings={scanRecord.agencyMappings} />

      <CollapsibleSectionCard
        title={
          <span className="flex items-center gap-1.5">
            <span>Advanced diagnostics</span>
            <InfoTip text="Raw scan records, execution metadata, and lower-level evidence retained for deeper review or troubleshooting. This area is intentionally schema-heavier than the primary result sections above." />
          </span>
        }
        contentClassName="space-y-6"
      >
        <PolicyEnrichmentSection
          enrichments={scanRecord.policyEnrichment}
          reviewQueue={scanRecord.policyReviewQueue}
        />

        <CollapsibleSectionCard
          title={
            <span className="flex items-center gap-1.5">
              <span>Raw signals</span>
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
                  <p className="mt-1 text-sm text-slate-500">{signal.primaryCategoryLabel}{signal.subcategory ? ` · ${signal.subcategory}` : ""}</p>
                  <p className="mt-3 text-sm text-slate-700">
                    {Array.isArray(signal.value) ? signal.value.join(", ") : String(signal.value)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSectionCard>

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

        {snapshot ? (
          <div className="grid gap-6 xl:grid-cols-2">
            {OPERATIONAL_SNAPSHOT_SECTIONS.map((section) => (
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
                    <span className="max-w-[60%] text-right text-slate-600">{formatValue(snapshot[field])}</span>
                  </div>
                ))}
              </CollapsibleSectionCard>
            ))}

            {taxonomySnapshotSections.map((section) => (
              <CollapsibleSectionCard
                key={section.title}
                title={
                  <span className="flex items-center gap-1.5">
                    <span>{section.title}</span>
                    <InfoTip text={section.description} />
                  </span>
                }
                contentClassName="space-y-2 text-sm"
              >
                {section.fields.map((field) => (
                  <div key={field} className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
                    <span className="font-medium text-slate-700">{field}</span>
                    <span className="max-w-[60%] text-right text-slate-600">{formatValue(snapshot[field])}</span>
                  </div>
                ))}
              </CollapsibleSectionCard>
            ))}
          </div>
        ) : null}

        {snapshot ? (
          <CollapsibleSectionCard
            title={
              <span className="flex items-center gap-1.5">
                <span>Accessibility metrics</span>
                <InfoTip text="Automated accessibility metrics and related public-facing accessibility signals detected during this scan." />
              </span>
            }
            contentClassName="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4"
          >
            <p>Accessibility score: {formatValue(snapshot.accessibility_score)}</p>
            <p>Automated score: {formatValue(snapshot.accessibility_score_automated)}</p>
            <p>WCAG errors: {formatValue(snapshot.wcag_error_count_total)}</p>
            <p>WCAG warnings: {formatValue(snapshot.wcag_warning_count_total)}</p>
            <p>Missing alt text: {formatValue(snapshot.wcag_missing_alt_count)}</p>
            <p>Form label issues: {formatValue(snapshot.wcag_form_label_error_count)}</p>
            <p>Keyboard issues: {formatValue(snapshot.wcag_keyboard_navigation_issue_count)}</p>
            <p>Claim mismatch detected: {formatValue(snapshot.accessibility_claim_mismatch_detected)}</p>
            <p>Accessibility statement present: {formatValue(snapshot.accessibility_statement_present)}</p>
            <p>Accessibility contact present: {formatValue(snapshot.accessibility_contact_method_present)}</p>
            <p>Widget present: {formatValue(snapshot.accessibility_widget_present)}</p>
            <p>Litigation risk score: {formatValue(snapshot.accessibility_litigation_risk_score)}</p>
          </CollapsibleSectionCard>
        ) : null}

        {runtimeArtifacts ? (
          <CollapsibleSectionCard
            title={
              <span className="flex items-center gap-1.5">
                <span>Runtime evidence</span>
                <InfoTip text="Compact browser-run evidence such as request domains, cookie counts, script domains, and DOM summary fields. Raw HTML and screenshots are not stored." />
              </span>
            }
            contentClassName="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4"
          >
            <p>Third-party request count: {formatValue(runtimeArtifacts.third_party_request_count)}</p>
            <p>Third-party request domains: {formatValue(runtimeArtifacts.third_party_request_domains)}</p>
            <p>Initial cookie count: {formatValue(runtimeArtifacts.initial_cookie_count)}</p>
            <p>Initial cookie names: {formatValue(runtimeArtifacts.initial_cookie_names)}</p>
            <p>Script tag count: {formatValue(runtimeArtifacts.script_tag_count)}</p>
            <p>Script source domains: {formatValue(runtimeArtifacts.script_src_domains)}</p>
            <p>DOM node count: {formatValue(runtimeArtifacts.dom_node_count)}</p>
            <p>DOM structure hash: {formatValue(runtimeArtifacts.dom_structure_hash)}</p>
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
      </CollapsibleSectionCard>
    </div>
  );
}
