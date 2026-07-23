export const SCAN_NO_GO_REASON_CODES = [
  "blank_or_unusable_page",
  "loading_or_stalled",
  "not_found_404",
  "parked_or_placeholder",
  "site_not_ready",
  "captcha_or_challenge",
  "access_denied_or_forbidden_page",
  "rate_limited_429",
  "server_error_5xx",
  "configuration_error",
  "maintenance_or_unavailable",
  "tls_or_certificate_error",
  "unsupported_region",
  "navigation_transport_failure",
  "visual_capture_failed_or_placeholder",
  "retained_visual_error_shell",
] as const;

export type ScanNoGoReasonCode = typeof SCAN_NO_GO_REASON_CODES[number];

export type ScanNoGoPageState =
  | "access_blocked"
  | "blank_or_unusable"
  | "captcha_or_challenge"
  | "capture_failed"
  | "maintenance_or_unavailable"
  | "parked_or_placeholder"
  | "visual_error_shell"
  | "wrong_site_or_soft_404";

export type ScanNoGoLimitationKind =
  | "scanner_access_limitation"
  | "scanner_capture_limitation"
  | "target_site_state";

export type ScanNoGoReasonPresentation = {
  code: ScanNoGoReasonCode;
  customerTitle: string;
  explanation: string;
  reportSummary: string;
  recommendedNextAction: string;
  pageState: ScanNoGoPageState;
  retryLikelyToHelp: boolean;
  limitationKind: ScanNoGoLimitationKind;
  snapshotStopReasonCode: string;
  snapshotStopReasonLabel: string;
  snapshotStopReasonDetail: string;
  snapshotBlockPageClassification: string;
  snapshotHomepageFetchStatus: string;
  snapshotScanOutcome: string;
};

export const SCAN_NO_GO_REASON_PRESENTATIONS: Record<ScanNoGoReasonCode, ScanNoGoReasonPresentation> = {
  blank_or_unusable_page: {
    code: "blank_or_unusable_page",
    customerTitle: "The page appeared blank or unusable",
    explanation: "The retained initial page contained too little visible or structured content to represent a usable public website.",
    reportSummary: "CertScore observed a blank or effectively empty page instead of a representative public website.",
    recommendedNextAction: "Retry the scan and confirm that the public page finishes rendering in a normal browser. If it remains blank, review the site's client-side rendering and access requirements.",
    pageState: "blank_or_unusable",
    retryLikelyToHelp: true,
    limitationKind: "target_site_state",
    snapshotStopReasonCode: "homepage_blank_or_unusable",
    snapshotStopReasonLabel: "Homepage blank or unusable",
    snapshotStopReasonDetail: "The retained homepage appeared blank or contained too little usable content for a representative scan.",
    snapshotBlockPageClassification: "blank_or_unusable",
    snapshotHomepageFetchStatus: "blank",
    snapshotScanOutcome: "homepage_blank_or_unusable",
  },
  loading_or_stalled: {
    code: "loading_or_stalled",
    customerTitle: "The site remained on a loading screen",
    explanation: "The page remained on a loading or initialization state after a bounded confirmation wait.",
    reportSummary: "CertScore could not verify the normal public page because the retained page remained in a loading state.",
    recommendedNextAction: "Retry the scan after confirming that the page completes loading without requiring a private session, unsupported browser feature, or user interaction.",
    pageState: "blank_or_unusable",
    retryLikelyToHelp: true,
    limitationKind: "target_site_state",
    snapshotStopReasonCode: "homepage_loading_stalled",
    snapshotStopReasonLabel: "Homepage loading stalled",
    snapshotStopReasonDetail: "The retained homepage remained on a loading or initialization screen after the confirmation window.",
    snapshotBlockPageClassification: "loading_or_stalled",
    snapshotHomepageFetchStatus: "loading",
    snapshotScanOutcome: "homepage_loading_stalled",
  },
  not_found_404: {
    code: "not_found_404",
    customerTitle: "The site returned a 404 page",
    explanation: "The requested public page returned or displayed a Not Found response instead of the intended website.",
    reportSummary: "CertScore reached a 404 or Not Found page, so the scan does not represent the intended public site.",
    recommendedNextAction: "Confirm the submitted URL and homepage routing, then retry after the public page resolves successfully.",
    pageState: "wrong_site_or_soft_404",
    retryLikelyToHelp: false,
    limitationKind: "target_site_state",
    snapshotStopReasonCode: "homepage_not_found_404",
    snapshotStopReasonLabel: "Homepage returned 404",
    snapshotStopReasonDetail: "The requested homepage returned or displayed a 404 or Not Found response.",
    snapshotBlockPageClassification: "not_found_404",
    snapshotHomepageFetchStatus: "not_found",
    snapshotScanOutcome: "homepage_not_found_404",
  },
  parked_or_placeholder: {
    code: "parked_or_placeholder",
    customerTitle: "The domain shows a placeholder page",
    explanation: "The retained page was a parked-domain, default-hosting, or technical placeholder rather than the intended public website.",
    reportSummary: "CertScore observed a parked or placeholder page instead of a representative public site.",
    recommendedNextAction: "Publish or route the intended public website to this domain, then run the scan again.",
    pageState: "parked_or_placeholder",
    retryLikelyToHelp: false,
    limitationKind: "target_site_state",
    snapshotStopReasonCode: "homepage_parked_or_placeholder",
    snapshotStopReasonLabel: "Homepage is parked or a placeholder",
    snapshotStopReasonDetail: "The retained homepage was a parked-domain, default-hosting, or technical placeholder page.",
    snapshotBlockPageClassification: "parked_or_placeholder",
    snapshotHomepageFetchStatus: "placeholder",
    snapshotScanOutcome: "homepage_parked_or_placeholder",
  },
  site_not_ready: {
    code: "site_not_ready",
    customerTitle: "The site is not ready for scanning",
    explanation: "The retained page identified itself as a prelaunch or not-yet-ready experience rather than the normal public website.",
    reportSummary: "CertScore observed a prelaunch or site-not-ready page, so substantive website findings were withheld.",
    recommendedNextAction: "Retry after the public website launches or the normal site experience becomes available.",
    pageState: "parked_or_placeholder",
    retryLikelyToHelp: false,
    limitationKind: "target_site_state",
    snapshotStopReasonCode: "homepage_site_not_ready",
    snapshotStopReasonLabel: "Site not ready for scanning",
    snapshotStopReasonDetail: "The retained homepage was a prelaunch or site-not-ready page rather than the normal public website.",
    snapshotBlockPageClassification: "site_not_ready",
    snapshotHomepageFetchStatus: "not_ready",
    snapshotScanOutcome: "homepage_site_not_ready",
  },
  captcha_or_challenge: {
    code: "captcha_or_challenge",
    customerTitle: "A bot or human-verification challenge blocked the scan",
    explanation: "The retained page showed a CAPTCHA, bot check, or human-verification challenge instead of the normal public website.",
    reportSummary: "Site protection prevented CertScore from verifying a representative public page.",
    recommendedNextAction: "Allow verified scanner access or retry from an approved browsing path after the challenge is no longer presented.",
    pageState: "captcha_or_challenge",
    retryLikelyToHelp: true,
    limitationKind: "scanner_access_limitation",
    snapshotStopReasonCode: "homepage_security_challenge",
    snapshotStopReasonLabel: "Homepage security challenge",
    snapshotStopReasonDetail: "The retained homepage showed a CAPTCHA, bot check, or human-verification challenge.",
    snapshotBlockPageClassification: "security_challenge",
    snapshotHomepageFetchStatus: "blocked",
    snapshotScanOutcome: "homepage_security_challenge",
  },
  access_denied_or_forbidden_page: {
    code: "access_denied_or_forbidden_page",
    customerTitle: "The site denied access to the scanner",
    explanation: "The homepage returned or displayed an access-denied or forbidden response instead of the normal public website.",
    reportSummary: "Access controls prevented CertScore from verifying the public site.",
    recommendedNextAction: "Review firewall, CDN, WAF, geo, and crawler-access rules, then allow the approved scanner path and retry.",
    pageState: "access_blocked",
    retryLikelyToHelp: true,
    limitationKind: "scanner_access_limitation",
    snapshotStopReasonCode: "homepage_access_blocked",
    snapshotStopReasonLabel: "Homepage access blocked",
    snapshotStopReasonDetail: "The retained homepage returned or displayed an access-denied or forbidden response.",
    snapshotBlockPageClassification: "access_denied",
    snapshotHomepageFetchStatus: "blocked",
    snapshotScanOutcome: "homepage_access_blocked",
  },
  rate_limited_429: {
    code: "rate_limited_429",
    customerTitle: "The site rate-limited the scan",
    explanation: "The homepage returned or displayed a 429 Too Many Requests response before a representative page could be verified.",
    reportSummary: "Rate limiting prevented CertScore from reaching the normal public site.",
    recommendedNextAction: "Retry after the rate-limit window clears or allow the approved scanner identity through the relevant rate-limit rule.",
    pageState: "access_blocked",
    retryLikelyToHelp: true,
    limitationKind: "scanner_access_limitation",
    snapshotStopReasonCode: "homepage_rate_limited_429",
    snapshotStopReasonLabel: "Homepage rate limited",
    snapshotStopReasonDetail: "The homepage returned or displayed a 429 Too Many Requests response.",
    snapshotBlockPageClassification: "rate_limited_429",
    snapshotHomepageFetchStatus: "rate_limited",
    snapshotScanOutcome: "homepage_rate_limited_429",
  },
  server_error_5xx: {
    code: "server_error_5xx",
    customerTitle: "The site returned a server error",
    explanation: "The homepage returned or displayed a 5xx server, gateway, or availability error instead of the public website.",
    reportSummary: "A server-side error prevented CertScore from verifying the normal public site.",
    recommendedNextAction: "Confirm that the origin and upstream services are healthy, then retry the scan.",
    pageState: "visual_error_shell",
    retryLikelyToHelp: true,
    limitationKind: "target_site_state",
    snapshotStopReasonCode: "homepage_server_error_5xx",
    snapshotStopReasonLabel: "Homepage server error",
    snapshotStopReasonDetail: "The homepage returned or displayed a 5xx server, gateway, or availability error.",
    snapshotBlockPageClassification: "server_error_5xx",
    snapshotHomepageFetchStatus: "server_error",
    snapshotScanOutcome: "homepage_server_error_5xx",
  },
  configuration_error: {
    code: "configuration_error",
    customerTitle: "The site returned a configuration error",
    explanation: "The retained homepage exposed a configuration or raw API error instead of a usable public website.",
    reportSummary: "A site configuration error prevented CertScore from verifying the intended public page.",
    recommendedNextAction: "Correct the domain, host, routing, or application configuration, then retry the scan.",
    pageState: "visual_error_shell",
    retryLikelyToHelp: false,
    limitationKind: "target_site_state",
    snapshotStopReasonCode: "homepage_configuration_error",
    snapshotStopReasonLabel: "Homepage configuration error",
    snapshotStopReasonDetail: "The retained homepage exposed a configuration or raw API error instead of the public website.",
    snapshotBlockPageClassification: "configuration_error",
    snapshotHomepageFetchStatus: "configuration_error",
    snapshotScanOutcome: "homepage_configuration_error",
  },
  maintenance_or_unavailable: {
    code: "maintenance_or_unavailable",
    customerTitle: "The site is under maintenance or unavailable",
    explanation: "The retained page reported maintenance or temporary unavailability instead of the normal public website.",
    reportSummary: "CertScore observed a maintenance or unavailable page, so substantive findings were withheld.",
    recommendedNextAction: "Retry after maintenance finishes or normal site availability is restored.",
    pageState: "maintenance_or_unavailable",
    retryLikelyToHelp: true,
    limitationKind: "target_site_state",
    snapshotStopReasonCode: "homepage_maintenance_or_unavailable",
    snapshotStopReasonLabel: "Homepage under maintenance or unavailable",
    snapshotStopReasonDetail: "The retained homepage reported maintenance or temporary unavailability.",
    snapshotBlockPageClassification: "maintenance_or_unavailable",
    snapshotHomepageFetchStatus: "unavailable",
    snapshotScanOutcome: "homepage_maintenance_or_unavailable",
  },
  tls_or_certificate_error: {
    code: "tls_or_certificate_error",
    customerTitle: "The site has a TLS or certificate error",
    explanation: "A certificate or secure-connection error prevented CertScore from verifying the public website.",
    reportSummary: "The site's TLS or certificate state prevented a representative scan.",
    recommendedNextAction: "Repair the certificate, hostname coverage, certificate chain, or TLS configuration, then retry.",
    pageState: "visual_error_shell",
    retryLikelyToHelp: false,
    limitationKind: "target_site_state",
    snapshotStopReasonCode: "homepage_tls_or_certificate_error",
    snapshotStopReasonLabel: "Homepage TLS or certificate error",
    snapshotStopReasonDetail: "A TLS or certificate error prevented the public homepage from being verified.",
    snapshotBlockPageClassification: "tls_or_certificate_error",
    snapshotHomepageFetchStatus: "tls_error",
    snapshotScanOutcome: "homepage_tls_or_certificate_error",
  },
  unsupported_region: {
    code: "unsupported_region",
    customerTitle: "The site is unavailable from the scan region",
    explanation: "The retained page stated that visitors from the scan region cannot access the normal public website.",
    reportSummary: "A regional access restriction prevented CertScore from verifying a representative public page.",
    recommendedNextAction: "Retry from a supported region or update the site's regional access policy for the approved scanner path.",
    pageState: "access_blocked",
    retryLikelyToHelp: true,
    limitationKind: "scanner_access_limitation",
    snapshotStopReasonCode: "homepage_unsupported_region",
    snapshotStopReasonLabel: "Homepage unavailable from scan region",
    snapshotStopReasonDetail: "A regional restriction prevented the normal public homepage from being accessed from the scan region.",
    snapshotBlockPageClassification: "unsupported_region",
    snapshotHomepageFetchStatus: "blocked",
    snapshotScanOutcome: "homepage_unsupported_region",
  },
  navigation_transport_failure: {
    code: "navigation_transport_failure",
    customerTitle: "The scanner could not open the site",
    explanation: "Navigation failed before CertScore could retain enough page evidence to verify the public website.",
    reportSummary: "A transport or navigation failure prevented the public page from being verified.",
    recommendedNextAction: "Confirm DNS, network reachability, protocol support, and origin availability, then retry.",
    pageState: "capture_failed",
    retryLikelyToHelp: true,
    limitationKind: "scanner_capture_limitation",
    snapshotStopReasonCode: "navigation_transport_failure",
    snapshotStopReasonLabel: "Homepage navigation failed",
    snapshotStopReasonDetail: "Navigation failed before enough homepage evidence could be retained.",
    snapshotBlockPageClassification: "navigation_failure",
    snapshotHomepageFetchStatus: "failed",
    snapshotScanOutcome: "navigation_transport_failure",
  },
  visual_capture_failed_or_placeholder: {
    code: "visual_capture_failed_or_placeholder",
    customerTitle: "The homepage capture could not be verified",
    explanation: "CertScore retained only a failed or placeholder visual capture and could not verify what the public page displayed.",
    reportSummary: "A screenshot-capture failure prevented visual verification of the public homepage.",
    recommendedNextAction: "Retry the scan and confirm that a full homepage screenshot is retained successfully.",
    pageState: "capture_failed",
    retryLikelyToHelp: true,
    limitationKind: "scanner_capture_limitation",
    snapshotStopReasonCode: "homepage_visual_capture_failed",
    snapshotStopReasonLabel: "Homepage visual capture failed",
    snapshotStopReasonDetail: "The scanner retained only a failed or placeholder homepage visual capture.",
    snapshotBlockPageClassification: "capture_failed",
    snapshotHomepageFetchStatus: "capture_failed",
    snapshotScanOutcome: "homepage_visual_capture_failed",
  },
  retained_visual_error_shell: {
    code: "retained_visual_error_shell",
    customerTitle: "The captured page was an error screen",
    explanation: "The retained screenshot appeared to be a full-page error shell rather than the normal public website.",
    reportSummary: "CertScore observed a visual error screen and could not verify a representative public page.",
    recommendedNextAction: "Review the retained screenshot, resolve the underlying page or rendering error, and retry the scan.",
    pageState: "visual_error_shell",
    retryLikelyToHelp: true,
    limitationKind: "target_site_state",
    snapshotStopReasonCode: "homepage_visual_error_shell",
    snapshotStopReasonLabel: "Homepage visual error screen",
    snapshotStopReasonDetail: "The retained homepage screenshot appeared to be a full-page error shell.",
    snapshotBlockPageClassification: "visual_error_shell",
    snapshotHomepageFetchStatus: "visual_error",
    snapshotScanOutcome: "homepage_visual_error_shell",
  },
};

/** Canonical persisted scan outcomes that represent a terminal no-go result. */
export const SCAN_NO_GO_SNAPSHOT_OUTCOMES = Array.from(new Set([
  "no_go",
  ...Object.values(SCAN_NO_GO_REASON_PRESENTATIONS).map((presentation) => presentation.snapshotScanOutcome),
]));

const SCAN_NO_GO_REASON_BY_SNAPSHOT_OUTCOME = Object.fromEntries(
  Object.values(SCAN_NO_GO_REASON_PRESENTATIONS).map((presentation) => [
    presentation.snapshotScanOutcome,
    presentation.code,
  ]),
) as Record<string, ScanNoGoReasonCode>;

export function isScanNoGoSnapshotOutcome(value: string | null | undefined) {
  return Boolean(value && SCAN_NO_GO_SNAPSHOT_OUTCOMES.includes(value));
}

const LEGACY_SCAN_NO_GO_REASON_ALIASES: Record<string, ScanNoGoReasonCode> = {
  access_blocked: "access_denied_or_forbidden_page",
  blank_page_no_visible_content: "blank_or_unusable_page",
  bot_challenge_visible: "captcha_or_challenge",
  challenge_or_robot_page: "captcha_or_challenge",
  maintenance_recharging_page: "maintenance_or_unavailable",
  visual_error_shell: "retained_visual_error_shell",
};

const PAGE_STATE_REASON_FALLBACKS: Partial<Record<string, ScanNoGoReasonCode>> = {
  access_blocked: "access_denied_or_forbidden_page",
  blank_or_unusable: "blank_or_unusable_page",
  captcha_or_challenge: "captcha_or_challenge",
  capture_failed: "visual_capture_failed_or_placeholder",
  challenge_or_robot_page: "captcha_or_challenge",
  maintenance_or_unavailable: "maintenance_or_unavailable",
  parked_or_placeholder: "parked_or_placeholder",
  visual_error_shell: "retained_visual_error_shell",
  wrong_site_or_soft_404: "not_found_404",
};

export type ResolvedScanNoGoPresentation = ScanNoGoReasonPresentation & {
  internalReasonCode: string | null;
  isUnknown: boolean;
  usedFallback: boolean;
};

export type ScanResultDisposition = "no_go";

export type ExternalScanNoGoResult = {
  reasonCode: ScanNoGoReasonCode | "unknown";
  title: string;
  explanation: string;
  summary: string;
  limitationKind: ScanNoGoLimitationKind;
  recommendedNextAction: string;
  retryLikelyToHelp: boolean;
  evidenceExcerpt?: string;
};

export type ExternalScanNoGoProjection = {
  resultDisposition: ScanResultDisposition;
  noGo: ExternalScanNoGoResult;
};

export function isScanNoGoReasonCode(value: string): value is ScanNoGoReasonCode {
  return Object.prototype.hasOwnProperty.call(SCAN_NO_GO_REASON_PRESENTATIONS, value);
}

export function resolveScanNoGoPresentation(
  reasonCode: string | null | undefined,
  pageState?: string | null,
): ResolvedScanNoGoPresentation {
  const normalizedReason = reasonCode?.trim() || null;
  const canonicalReason = normalizedReason && isScanNoGoReasonCode(normalizedReason)
    ? normalizedReason
    : normalizedReason
      ? SCAN_NO_GO_REASON_BY_SNAPSHOT_OUTCOME[normalizedReason] ??
        LEGACY_SCAN_NO_GO_REASON_ALIASES[normalizedReason] ??
        PAGE_STATE_REASON_FALLBACKS[pageState ?? ""]
      : PAGE_STATE_REASON_FALLBACKS[pageState ?? ""];
  if (canonicalReason) {
    return {
      ...SCAN_NO_GO_REASON_PRESENTATIONS[canonicalReason],
      internalReasonCode: normalizedReason,
      isUnknown: false,
      usedFallback: normalizedReason !== canonicalReason,
    };
  }
  return {
    ...SCAN_NO_GO_REASON_PRESENTATIONS.visual_capture_failed_or_placeholder,
    customerTitle: "The public site could not be verified",
    explanation: "CertScore could not verify that the retained page represented the normal public website.",
    reportSummary: "The public site could not be verified, so substantive findings were withheld.",
    recommendedNextAction: "Review the retained scan evidence and retry from a normal public browsing path.",
    internalReasonCode: normalizedReason,
    isUnknown: true,
    usedFallback: true,
  };
}

function plainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function boundedPublicEvidenceExcerpt(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || /^[a-z0-9_:-]+$/i.test(normalized)) return null;
  return normalized.slice(0, 360);
}

/** Public-safe projection of a retained, structured scan no-go assessment. */
export function projectExternalScanNoGo(
  runtimeArtifacts: Record<string, unknown> | null | undefined,
): ExternalScanNoGoProjection | null {
  const assessment = plainRecord(runtimeArtifacts?.scan_no_go_assessment ?? runtimeArtifacts?.scanNoGoAssessment);
  if (!assessment || assessment.decision !== "no_go") {
    return null;
  }
  const visualReview = plainRecord(runtimeArtifacts?.visual_access_review ?? runtimeArtifacts?.visualAccessReview);
  const reasonCodes = [
    ...stringArray(assessment.reasonCodes),
    ...stringArray(assessment.reason_codes),
  ];
  const internalReasonCode = reasonCodes.find((code) => code !== "scan_no_go_corroborated")
    ?? (typeof visualReview?.reasonCode === "string" ? visualReview.reasonCode : null)
    ?? (typeof visualReview?.reason_code === "string" ? visualReview.reason_code : null);
  const pageState = typeof visualReview?.pageState === "string"
    ? visualReview.pageState
    : typeof visualReview?.page_state === "string"
      ? visualReview.page_state
      : typeof plainRecord(assessment.supportingSignals)?.visualPageState === "string"
        ? String(plainRecord(assessment.supportingSignals)?.visualPageState)
        : null;
  const presentation = resolveScanNoGoPresentation(internalReasonCode, pageState);
  const visualEvidence = [
    ...stringArray(visualReview?.keyVisualEvidence),
    ...stringArray(visualReview?.key_visual_evidence),
    typeof visualReview?.shortExplanation === "string" ? visualReview.shortExplanation : null,
    typeof visualReview?.short_explanation === "string" ? visualReview.short_explanation : null,
  ].map(boundedPublicEvidenceExcerpt).find((value): value is string => Boolean(value));
  return {
    resultDisposition: "no_go",
    noGo: {
      reasonCode: presentation.isUnknown ? "unknown" : presentation.code,
      title: presentation.customerTitle,
      explanation: presentation.explanation,
      summary: presentation.reportSummary,
      limitationKind: presentation.limitationKind,
      recommendedNextAction: presentation.recommendedNextAction,
      retryLikelyToHelp: presentation.retryLikelyToHelp,
      ...(visualEvidence ? { evidenceExcerpt: visualEvidence } : {}),
    },
  };
}

export function getScanNoGoLimitationKindLabel(kind: ScanNoGoLimitationKind) {
  return kind === "scanner_access_limitation"
    ? "Scanner access limitation"
    : kind === "scanner_capture_limitation"
      ? "Scanner capture limitation"
      : "Observed target-site state";
}
