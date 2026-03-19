import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { RegulatoryRelevanceSection } from "../../../../../components/scans/regulatory-relevance-section";
import { getAdminScanDetail } from "../../../../../server/admin/get-admin-scan-detail";

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

function formatValue(value: unknown) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(", ") : "[]";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
}

function formatReason(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
    title: "Identity And Crawl",
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
      "final_url_scheme",
      "redirect_count",
      "render_mode_used",
      "scan_confidence",
      "partial_scan",
      "timeout_flag",
      "blocked_flag",
      "captcha_flag",
      "site_language_primary",
      "country_inferred",
      "region_state_inferred",
      "jurisdiction_guess",
      "traffic_tier_estimate"
    ]
  },
  {
    title: "Legal Coverage",
    fields: [
      "privacy_policy_present",
      "terms_of_service_present",
      "cookie_policy_present",
      "accessibility_statement_present",
      "refund_policy_present",
      "shipping_policy_present",
      "subscription_terms_present",
      "affiliate_disclosure_present",
      "advertising_disclosure_present",
      "contact_page_present",
      "privacy_contact_method_present",
      "privacy_request_form_present",
      "data_access_request_present",
      "data_deletion_request_present",
      "privacy_contact_channel_type",
      "do_not_sell_link_present",
      "dsar_request_mechanism_present",
      "subprocessor_list_present",
      "dpo_email_detected",
      "entity_jurisdiction_detected",
      "supervisory_authority_reference_present",
      "privacy_policy_hash",
      "terms_policy_hash",
      "cookie_policy_hash",
      "legal_pages_presence_hash",
      "privacy_policy_last_updated_found",
      "privacy_policy_last_updated_date",
      "privacy_policy_word_count",
      "privacy_policy_complexity_score",
      "privacy_language_readability_score",
      "policy_update_lag_days"
    ]
  },
  {
    title: "Policy Flags",
    fields: [
      "mentions_gdpr",
      "mentions_ccpa_or_cpra",
      "mentions_coppa",
      "mentions_under_13",
      "mentions_under_16",
      "mentions_sensitive_data",
      "mentions_biometric_data",
      "mentions_health_data",
      "mentions_financial_data",
      "mentions_location_data",
      "mentions_data_retention",
      "data_retention_specific_period_detected",
      "mentions_data_sale_or_sharing",
      "mentions_cross_border_transfer",
      "cross_border_transfer_mechanism_detected",
      "mentions_subprocessors_or_vendors",
      "mentions_automated_decisioning",
      "mentions_ai_usage",
      "double_opt_in_reference_present",
      "third_party_disclosure_specificity"
    ]
  },
  {
    title: "Consent And Trackers",
    fields: [
      "cookie_banner_present",
      "consent_mechanism_type",
      "cmp_vendor_name",
      "cmp_vendor_confidence",
      "reject_all_present",
      "accept_all_present",
      "granular_preferences_present",
      "preconsent_tracking_detected",
      "cookie_policy_linked_from_banner",
      "consent_mode_detected",
      "dark_pattern_accept_emphasis",
      "dark_pattern_reject_hidden",
      "prechecked_consent_boxes",
      "consent_persistence_mechanism_detected",
      "consent_banner_layout_type",
      "consent_banner_position",
      "default_tracking_state",
      "cookie_category_count",
      "consent_maturity_score",
      "consent_signature_hash",
      "cookie_count_total",
      "third_party_cookie_count",
      "first_party_cookie_set_before_consent",
      "third_party_cookie_set_before_consent",
      "tracking_before_consent_detected",
      "tracker_count_total",
      "analytics_tracker_count",
      "advertising_tracker_count",
      "social_tracker_count",
      "session_replay_tracker_count",
      "tag_manager_present",
      "tag_manager_vendor",
      "tracker_vendor_set_hash",
      "tracker_category_set_hash",
      "tracker_vendor_concentration_score",
      "tracker_diversity_score",
      "third_party_script_domain_count",
      "third_party_script_risk_score",
      "third_party_data_flow_risk_score",
      "tracker_regulatory_risk_score"
    ]
  },
  {
    title: "Forms And Accessibility",
    fields: [
      "form_count_total",
      "contact_form_present",
      "newsletter_signup_present",
      "account_signup_present",
      "login_page_present",
      "checkout_or_payment_form_present",
      "email_input_present",
      "phone_input_present",
      "address_input_present",
      "payment_card_input_present",
      "date_of_birth_input_present",
      "age_gate_present",
      "age_verification_mechanism_type",
      "forms_signature_hash",
      "pii_collection_risk_score",
      "form_data_sensitivity_score",
      "data_minimization_score",
      "high_sensitivity_data_collection_detected",
      "user_rights_friction_score",
      "wcag_error_count_total",
      "wcag_warning_count_total",
      "wcag_contrast_failures_count",
      "wcag_missing_alt_count",
      "wcag_form_label_error_count",
      "wcag_aria_error_count",
      "wcag_level_claimed",
      "accessibility_widget_present",
      "accessibility_widget_vendor",
      "accessibility_signature_hash",
      "accessibility_score_automated",
      "accessibility_remediation_likely",
      "accessibility_claim_accuracy_score",
      "accessibility_claim_mismatch_detected",
      "accessibility_litigation_risk_score",
      "ada_demand_letter_probability"
    ]
  },
  {
    title: "Security, Context, And Scores",
    fields: [
      "security_txt_present",
      "responsible_disclosure_present",
      "bug_bounty_program_present",
      "hsts_enabled",
      "https_enforced",
      "mixed_content_detected",
      "csp_header_present",
      "x_frame_options_present",
      "referrer_policy_present",
      "permissions_policy_present",
      "csp_report_endpoint_present",
      "security_headers_score",
      "tls_version_min_supported",
      "certificate_authority",
      "certificate_valid_days_remaining",
      "certificate_auto_renew_likely",
      "dnssec_enabled",
      "spf_record_present",
      "dmarc_record_present",
      "dkim_record_detected",
      "transparency_report_present",
      "transparency_score",
      "cms_platform",
      "ecommerce_platform",
      "frontend_framework",
      "hosting_or_cdn_provider",
      "cdn_provider",
      "edge_security_provider",
      "payment_processor_hints",
      "chat_support_vendor",
      "service_worker_detected",
      "public_api_endpoint_detected",
      "site_size_hint",
      "homepage_structured_hash",
      "digital_maturity_score",
      "domain_registration_year",
      "domain_age_years",
      "domain_privacy_protection_enabled",
      "request_domain_set_changed",
      "script_domain_set_changed",
      "security_header_posture_changed",
      "policy_behavior_conflict_detected",
      "session_replay_without_disclosure_detected",
      "accessibility_claim_vs_reality_gap_detected",
      "certscore_overall",
      "privacy_score",
      "consent_score",
      "tracker_risk_score",
      "accessibility_score",
      "data_collection_risk_score",
      "consumer_protection_score",
      "children_privacy_risk_score",
      "legal_coverage_score",
      "compliance_maturity_tier",
      "regulatory_exposure_score"
    ]
  }
] as const;

type AdminScanDetailPageProps = {
  params: Promise<{
    scanId: string;
  }>;
};

export default async function AdminScanDetailPage({ params }: AdminScanDetailPageProps) {
  const { scanId } = await params;
  const record = await getAdminScanDetail(scanId);

  if (!record) {
    notFound();
  }

  const executionPlan = getExecutionPlan(record.scan.scanConfigJson);

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Scan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p>ID: {record.scan.id}</p>
            <p>Workspace: {record.organizationName ?? "Unknown"}</p>
            <p>Domain: {record.domainHostname ?? "Unknown"}</p>
            <p>Type: {record.scan.scanType}</p>
            <p>Status: {record.scan.status}</p>
            <p>Pages requested: {record.scan.pagesRequested}</p>
            <p>Pages scanned: {record.scan.pagesScanned}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Timestamps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p>Created: {formatDateTime(record.scan.createdAt)}</p>
            <p>Completed: {formatDateTime(record.scan.completedAt)}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Collected Rows</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p>Tracker vendors: {record.trackerVendors.length}</p>
            <p>Accessibility rules: {record.accessibilityRuleCounts.length}</p>
            <p>Pages: {record.pages.length}</p>
            <p>Changes: {record.changes.length}</p>
          </CardContent>
        </Card>
      </div>

      <RegulatoryRelevanceSection mappings={record.agencyMappings} />

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Execution Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
          <p>Profile: {formatValue(executionPlan.profile)}</p>
          <p>Planned pages: {formatValue(executionPlan.pagesRequested)}</p>
          <p>Prefetch targets: {formatValue(executionPlan.prefetchTargetCount)}</p>
          <p>Expansion targets: {formatValue(executionPlan.expansionTargetCount)}</p>
          <p>Static fetch concurrency: {formatValue(executionPlan.staticFetchConcurrency)}</p>
          <p>Browser nav timeout: {formatValue(executionPlan.browserNavigationTimeoutMs)}</p>
          <p>Browser post-load wait: {formatValue(executionPlan.browserPostLoadWaitMs)}</p>
          <p>Block stylesheets: {formatValue(executionPlan.blockStylesheetsInBrowser)}</p>
        </CardContent>
      </Card>

      {record.runtimeArtifacts ? (
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Runtime Artifacts</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm text-slate-600 md:grid-cols-2 xl:grid-cols-4">
            <p>Third-party request count: {formatValue(record.runtimeArtifacts.third_party_request_count)}</p>
            <p>Third-party request domains: {formatValue(record.runtimeArtifacts.third_party_request_domains)}</p>
            <p>Initial cookie count: {formatValue(record.runtimeArtifacts.initial_cookie_count)}</p>
            <p>Initial cookie names: {formatValue(record.runtimeArtifacts.initial_cookie_names)}</p>
            <p>Initial cookie domains: {formatValue(record.runtimeArtifacts.initial_cookie_domains)}</p>
            <p>Script tag count: {formatValue(record.runtimeArtifacts.script_tag_count)}</p>
            <p>Script source domains: {formatValue(record.runtimeArtifacts.script_src_domains)}</p>
            <p>DOM node count: {formatValue(record.runtimeArtifacts.dom_node_count)}</p>
            <p>DOM structure hash: {formatValue(record.runtimeArtifacts.dom_structure_hash)}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle>Policy Review Queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {record.policyReviewQueue.length === 0 ? (
            <p className="text-sm text-slate-600">No policy review queue rows for this scan.</p>
          ) : (
            record.policyReviewQueue.map((row, index) => {
              const reason = typeof row.reason === "string" ? row.reason : "unknown";
              const reviewStatus = typeof row.review_status === "string" ? row.review_status : "pending";
              const reviewVerdict = typeof row.effective_review_verdict === "string"
                ? row.effective_review_verdict
                : typeof row.review_verdict === "string"
                  ? row.review_verdict
                  : null;
              const reviewerNotes = typeof row.reviewer_notes === "string" ? row.reviewer_notes : null;
              const standardReviewerNote = typeof row.standard_reviewer_note === "string" ? row.standard_reviewer_note : null;
              const noteMatchesStandard = row.reviewer_note_matches_standard === true;
              const guardrailApplied = row.verdict_overridden_by_scope_guardrail === true;
              const pageType = typeof row.page_type === "string" ? row.page_type : "unknown";

              return (
                <div
                  key={typeof row.id === "string" ? row.id : `${reason}-${index}`}
                  className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{formatReason(reason)}</p>
                      <p>
                        {formatReason(pageType)} · Status {reviewStatus}
                        {reviewVerdict ? ` · Verdict ${reviewVerdict}` : ""}
                      </p>
                    </div>
                    {standardReviewerNote ? (
                      <span
                        className={
                          noteMatchesStandard
                            ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700"
                            : "rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-amber-700"
                        }
                      >
                        {noteMatchesStandard ? "standard note" : "custom note"}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-500">Saved note</p>
                  <p className="mt-1 text-sm text-slate-700">{reviewerNotes ?? "Not provided"}</p>
                  {guardrailApplied ? (
                    <p className="mt-3 text-sm text-amber-700">
                      Scope guardrail applied: substantive policy-gap findings on non-privacy pages default to inconclusive.
                    </p>
                  ) : null}
                  {standardReviewerNote ? (
                    <>
                      <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-500">Standard note</p>
                      <p className="mt-1 text-sm text-slate-700">{standardReviewerNote}</p>
                    </>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {record.snapshot ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {SNAPSHOT_SECTIONS.map((section) => (
            <Card key={section.title} className="border-slate-200 bg-white">
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {section.fields.map((field) => (
                  <div key={field} className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
                    <span className="font-medium text-slate-700">{field}</span>
                    <span className="max-w-[60%] text-right text-slate-600">{formatValue(record.snapshot?.[field])}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-600">No snapshot persisted for this scan.</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Tracker Vendors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {record.trackerVendors.length === 0 ? (
              <p className="text-sm text-slate-600">No tracker vendor rows for this scan.</p>
            ) : (
              record.trackerVendors.map((tracker) => (
                <div key={`${tracker.vendorName}-${tracker.scriptHost ?? "none"}-${tracker.detectionSource}`} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">{tracker.vendorName}</p>
                  <p>
                    {tracker.vendorCategory} · {tracker.detectionSource} · {tracker.firstPartyOrThirdParty}
                  </p>
                  <p>
                    Before consent {tracker.beforeConsent ? "true" : "false"} · Confidence {tracker.confidence}
                  </p>
                  <p>Host {tracker.scriptHost ?? "n/a"} · Signature {tracker.matchedSignatureId ?? "n/a"}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Accessibility Rule Counts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {record.accessibilityRuleCounts.length === 0 ? (
              <p className="text-sm text-slate-600">No accessibility rule rows for this scan.</p>
            ) : (
              record.accessibilityRuleCounts.map((rule) => (
                <div key={rule.ruleCode} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">{rule.ruleCode}</p>
                  <p>
                    Group {rule.ruleGroup} · Severity {rule.severity}
                  </p>
                  <p>Instances {rule.instanceCount}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Page Metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {record.pages.length === 0 ? (
              <p className="text-sm text-slate-600">No page rows for this scan.</p>
            ) : (
              record.pages.map((page) => (
                <div key={page.pageUrl} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">
                  <p className="font-medium break-all text-slate-900">{page.pageUrl}</p>
                  <p>
                    {page.pageType} · {page.fetchStatus} · {page.fetchedVia}
                  </p>
                  <p>Language {page.pageLanguage ?? "n/a"}</p>
                  <p>Content hash {page.normalizedContentHash ?? "n/a"}</p>
                  <p>Title hash {page.titleHash ?? "n/a"}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle>Change Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {record.changes.length === 0 ? (
              <p className="text-sm text-slate-600">No change events for this scan.</p>
            ) : (
              record.changes.map((change, index) => (
                <div key={`${change.eventType}-${index}`} className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-900">{change.eventType}</p>
                  <p>
                    {change.eventGroup} · {change.severity} · {formatDateTime(change.eventTimestamp)}
                  </p>
                  <p>Field {change.fieldName ?? "n/a"}</p>
                  <p>Old {change.oldValueText ?? "null"}</p>
                  <p>New {change.newValueText ?? "null"}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
