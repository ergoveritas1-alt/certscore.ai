import type {
  GdprEprivacyCoverageChecklistItem,
  GdprEprivacyCoverageChecklistStatus
} from "./gdpr-eprivacy-coverage-checklist";
import { getAssessmentDirection } from "./gdpr-eprivacy-assessment-direction";

export type GdprEprivacyReviewSummaryBullet = {
  id: string;
  headline: string;
  copy: string;
};

export type GdprEprivacyEvidenceCard = {
  evidenceType: string[];
  humanVerificationSteps: string[];
  interactionPath?: string;
  limits: string;
  observedDomains: string[];
  observedVendors: string[];
  policyDisclosureComparison?: string;
  reviewArea: string;
  status: GdprEprivacyCoverageChecklistStatus;
  whatCertScoreObserved: string;
  whyThisMatters: string;
};

export type GdprEprivacyReviewSummary = {
  bullets: GdprEprivacyReviewSummaryBullet[];
  coverageText: string;
  evidenceCards: GdprEprivacyEvidenceCard[];
  limits: string;
  priorityReviewText: string;
  suggestedRemediation: string[];
  whatToVerify: string[];
};

const CUSTOMER_LABELS: Record<string, string> = {
  accessibility_consent_controls: "Consent control accessibility",
  accept_consent_control: "Accept consent control",
  consent_surface_observed: "Consent banner / preference surface",
  options_settings_preferences_control: "Options / settings / preferences control",
  cross_border_endpoint_review: "Cross-border endpoint review",
  post_reject_tracking_reduction: "Tracking after refusal",
  pre_consent_cookies_storage: "Cookies or storage before consent",
  pre_consent_third_party_tracking: "3rd party tracking before consent",
  preference_withdrawal_control: "Post-choice consent controls",
  reject_all_path_availability: "Reject option",
  sensitive_surfaces_third_party_tracking: "Sensitive forms with 3rd party tracking",
  session_replay_after_refusal: "Session replay after refusal / opt-out",
  session_replay_before_consent: "Session replay before consent",
  session_replay_disclosure_alignment: "Session replay disclosure alignment",
  session_replay_fingerprinting_review: "Session replay / behavioral analytics",
  session_replay_sensitive_surface: "Session replay on sensitive surfaces"
};

const LIMITS_COPY =
  "Automated public-web observations from the tested URL, scan location, browser state, and interaction path. Validate against consent configuration, vendor purpose, legal basis, regional behavior, and policy scope.";

const SUMMARY_LIMITS_COPY =
  "Automated public-web observations from the tested URL, scan location, browser state, and interaction path. Validate important conclusions against consent configuration, regional behavior, and policy scope.";

function uniqueStrings(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asRecordArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry) => {
    const record = asRecord(entry);
    if (record) {
      return [record];
    }
    if (typeof entry !== "string") {
      return [];
    }
    try {
      const parsed = JSON.parse(entry);
      const parsedRecord = asRecord(parsed);
      return parsedRecord ? [parsedRecord] : [];
    } catch {
      return [];
    }
  });
}

function getBoolean(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value === true || value === false) {
      return value;
    }
  }
  return null;
}

function getNumber(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

function getString(record: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function getStringArray(record: Record<string, unknown> | null | undefined, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => {
    const value = record?.[key];
    if (Array.isArray(value)) {
      return value;
    }
    return typeof value === "string" ? [value] : [];
  }));
}

function getRow(items: GdprEprivacyCoverageChecklistItem[], id: string) {
  return items.find((item) => item.id === id) ?? null;
}

function getRetainedEvidence(item: GdprEprivacyCoverageChecklistItem | null) {
  return item?.criticalEvidence.retainedEvidence ?? {};
}

function getRetainedRecord(item: GdprEprivacyCoverageChecklistItem | null, key: string) {
  return asRecord(getRetainedEvidence(item)[key]);
}

function getPolicyTextExtractionStatus(item: GdprEprivacyCoverageChecklistItem | null) {
  const health =
    getRetainedRecord(item, "policyTextExtractionHealth") ??
    getRetainedRecord(item, "policy_text_extraction_health");
  return getString(health, ["policyTextExtractionStatus", "policy_text_extraction_status"]);
}

function policyTextExtractionLimited(item: GdprEprivacyCoverageChecklistItem | null) {
  const status = getPolicyTextExtractionStatus(item);
  return Boolean(status && status !== "ok");
}

function getFindingEntities(item: GdprEprivacyCoverageChecklistItem | null) {
  return asRecordArray(getRetainedEvidence(item).findingEntities);
}

function getEntityObjects(item: GdprEprivacyCoverageChecklistItem | null, key: string) {
  return getFindingEntities(item).flatMap((findingEntity) => {
    const entities = asRecord(findingEntity.entities);
    return asRecordArray(entities?.[key]);
  });
}

function getEntityStrings(item: GdprEprivacyCoverageChecklistItem | null, keys: string[]) {
  return uniqueStrings(getFindingEntities(item).flatMap((findingEntity) => {
    const entities = asRecord(findingEntity.entities);
    if (!entities) {
      return [];
    }
    return keys.flatMap((key) => {
      const value = entities[key];
      return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
    });
  }));
}

function getRetainedStrings(item: GdprEprivacyCoverageChecklistItem | null, keys: string[]) {
  const evidence = getRetainedEvidence(item);
  return uniqueStrings(keys.flatMap((key) => {
    const value = evidence[key];
    return Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  }));
}

function getRuntimeVendorDisclosureRows(item: GdprEprivacyCoverageChecklistItem | null) {
  return [
    ...asRecordArray(getRetainedEvidence(item).runtimeVendorDisclosureEvidence),
    ...getEntityObjects(item, "runtimeVendorDisclosureEvidence")
  ];
}

function getObservedVendors(item: GdprEprivacyCoverageChecklistItem | null) {
  const disclosureRows = getRuntimeVendorDisclosureRows(item);
  return uniqueStrings([
    ...getRetainedStrings(item, [
      "baselineVendors",
      "persistedVendors",
      "postRejectVendors",
      "visibleRejectLabels"
    ]),
    ...getEntityStrings(item, [
      "runtimeVendors",
      "relatedVendors",
      "sessionReplayRuntimeVendors",
      "session_replay_runtime_vendors",
      "unmatchedRuntimeVendors"
    ]),
    ...disclosureRows.flatMap((row) => [
      ...getStringArray(row, ["observedRuntimeVendors", "observed_runtime_vendors"]),
      ...getStringArray(row, ["unmatchedRuntimeVendors", "unmatched_runtime_vendors"])
    ])
  ]).slice(0, 8);
}

function getObservedDomains(item: GdprEprivacyCoverageChecklistItem | null) {
  const disclosureRows = getRuntimeVendorDisclosureRows(item);
  return uniqueStrings([
    ...getEntityStrings(item, [
      "runtimeDomains",
      "runtimeRequestHosts",
      "runtimeRequestUrls",
      "unmatchedRuntimeDomains"
    ]),
    ...disclosureRows.flatMap((row) => [
      ...getStringArray(row, ["observedRuntimeDomains", "observed_runtime_domains"]),
      ...getStringArray(row, ["unmatchedRuntimeDomains", "unmatched_runtime_domains"])
    ])
  ]).slice(0, 8);
}

function getPreConsentVendors(item: GdprEprivacyCoverageChecklistItem | null) {
  return uniqueStrings([
    ...getRetainedStrings(item, ["baselineVendors", "preConsentVendors", "preConsentVendorNames"]),
    ...getEntityStrings(item, ["preConsentVendorNames", "runtimeVendors", "relatedVendors", "vendors"])
  ]).slice(0, 8);
}

function getPostRejectVendors(item: GdprEprivacyCoverageChecklistItem | null) {
  return uniqueStrings([
    ...getRetainedStrings(item, ["persistedVendors", "postRejectVendors"]),
    ...getEntityStrings(item, ["postRejectTrackerVendors", "persistedVendors", "runtimeVendors", "relatedVendors"])
  ]).slice(0, 8);
}

function getSessionReplayVendors(item: GdprEprivacyCoverageChecklistItem | null) {
  return uniqueStrings([
    ...getEntityStrings(item, ["sessionReplayRuntimeVendors", "session_replay_runtime_vendors", "relatedVendors"]),
    ...getObservedVendors(item).filter((vendor) => /clarity|fullstory|hotjar|contentsquare|logrocket/i.test(vendor))
  ]).slice(0, 8);
}

function hasEvidenceFlag(item: GdprEprivacyCoverageChecklistItem | null, pattern: RegExp) {
  return getFindingEntities(item).some((findingEntity) =>
    getStringArray(findingEntity, ["evidenceFlags"]).some((flag) => pattern.test(flag))
  );
}

function rowIs(item: GdprEprivacyCoverageChecklistItem | null, status: GdprEprivacyCoverageChecklistStatus) {
  return item?.status === status;
}

function addBullet(
  bullets: GdprEprivacyReviewSummaryBullet[],
  bullet: GdprEprivacyReviewSummaryBullet
) {
  if (bullets.length >= 5 || bullets.some((candidate) => candidate.id === bullet.id)) {
    return;
  }
  bullets.push(bullet);
}

export function getGdprEprivacyCustomerLabel(item: GdprEprivacyCoverageChecklistItem) {
  return CUSTOMER_LABELS[item.id] ?? item.label;
}

export function deriveGdprEprivacyEvidenceCard(item: GdprEprivacyCoverageChecklistItem): GdprEprivacyEvidenceCard {
  const observedVendors = getObservedVendors(item);
  const observedDomains = getObservedDomains(item);
  const evidenceRefs = item.evidenceRefs.slice(0, 4);
  const defaultObserved = evidenceRefs.length > 0
    ? evidenceRefs.join("; ")
    : item.limitation ?? item.criticalEvidence.statusBasis;

  const common = {
    limits: LIMITS_COPY,
    observedDomains,
    observedVendors,
    reviewArea: getGdprEprivacyCustomerLabel(item),
    status: item.status
  };

  switch (item.id) {
    case "pre_consent_third_party_tracking":
      return {
        ...common,
        evidenceType: ["Runtime browser scan", "Network request evidence", "Consent-state logging"],
        humanVerificationSteps: [
          "Confirm vendor purpose and whether each request is strictly necessary.",
          "Verify consent mode or equivalent controls suppress measurement before opt-in."
        ],
        interactionPath: "Before recorded consent interaction",
        whatCertScoreObserved: observedVendors.length > 0
          ? `3rd party tracking activity was observed before recorded consent for ${observedVendors.join(", ")}.`
          : "3rd party tracking activity was observed before a recorded consent action.",
        whyThisMatters: "Some privacy regimes require non-essential tracking activity to be gated until valid consent is obtained."
      };
    case "pre_consent_cookies_storage":
      return {
        ...common,
        evidenceType: ["Runtime browser scan", "Cookie/storage evidence", "Consent-state logging"],
        humanVerificationSteps: [
          "Confirm whether retained cookies or storage entries are necessary.",
          "Verify non-essential storage is gated before opt-in where required."
        ],
        interactionPath: "Before recorded consent interaction",
        whatCertScoreObserved: defaultObserved,
        whyThisMatters: "Cookie or browser storage writes can be distinct from request-only tracking and should be reviewed on their own evidence."
      };
    case "reject_all_path_availability":
      return {
        ...common,
        evidenceType: ["Consent interaction evidence", "Runtime browser scan"],
        humanVerificationSteps: [
          "Confirm the visible refusal control is equivalent to rejecting non-essential purposes.",
          "Retest regional and device variants of the consent surface."
        ],
        interactionPath: "Observed consent surface",
        whatCertScoreObserved: defaultObserved,
        whyThisMatters: "A meaningful refusal path is a key part of consent-choice review."
      };
    case "accept_consent_control":
      return {
        ...common,
        evidenceType: ["Consent control evidence", "Runtime browser scan"],
        humanVerificationSteps: [
          "Confirm the visible accept control is part of the first-layer cookie or consent surface.",
          "Retest regional and device variants of the consent surface."
        ],
        interactionPath: "Observed consent surface",
        whatCertScoreObserved: defaultObserved,
        whyThisMatters: "Accept-control availability helps compare the first-layer consent choices retained by the scanner."
      };
    case "options_settings_preferences_control":
      return {
        ...common,
        evidenceType: ["Consent control evidence", "Runtime browser scan"],
        humanVerificationSteps: [
          "Confirm the visible options/settings/preferences control opens meaningful cookie or consent choices.",
          "Retest regional and device variants of the consent surface."
        ],
        interactionPath: "Observed consent surface",
        whatCertScoreObserved: defaultObserved,
        whyThisMatters: "A meaningful options or preferences path helps users review cookie and purpose choices before making a consent decision."
      };
    case "post_reject_tracking_reduction":
      return {
        ...common,
        evidenceType: ["Consent interaction evidence", "Network request evidence", "Post-reject comparison"],
        humanVerificationSteps: [
          "Confirm Decline disables non-essential vendors.",
          "Review tag sequencing and consent-mode configuration for vendors observed after refusal."
        ],
        interactionPath: "Around or after recorded reject interaction",
        whatCertScoreObserved: getPostRejectVendors(item).length > 0
          ? `Non-essential tracking was still observed after the recorded reject action for ${getPostRejectVendors(item).join(", ")}.`
          : defaultObserved,
        whyThisMatters: "If non-essential tracking persists after refusal, the consent control may not be enforcing the represented choice."
      };
    case "preference_withdrawal_control":
      return {
        ...common,
        evidenceType: ["Consent interaction evidence", "Consent-control lifecycle evidence"],
        humanVerificationSteps: [
          "Confirm users can reopen or change cookie preferences after the initial choice.",
          "Check footer, privacy links, CMP widgets, and regional variants."
        ],
        interactionPath: "After the initial consent choice",
        whatCertScoreObserved: defaultObserved,
        whyThisMatters: "Users may need a persistent way to revisit or withdraw consent choices."
      };
    case "session_replay_fingerprinting_review":
      return {
        ...common,
        evidenceType: ["Runtime browser scan", "Session replay vendor detection"],
        humanVerificationSteps: [
          "Confirm session replay or behavioral analytics configuration, masking, retention, and consent gating.",
          "Review whether the vendor appears on sensitive pages or forms."
        ],
        whatCertScoreObserved: getSessionReplayVendors(item).length > 0
          ? `Behavioral analytics or session replay vendor observed: ${getSessionReplayVendors(item).join(", ")}.`
          : defaultObserved,
        whyThisMatters: "Session replay and behavioral analytics often require extra review for purpose, disclosure, masking, and consent controls."
      };
    case "cross_border_endpoint_review":
      return {
        ...common,
        evidenceType: ["Runtime browser scan", "Endpoint jurisdiction evidence", "Vendor disclosure comparison"],
        humanVerificationSteps: [
          "Review analytics, behavioral tracking, adtech, and identifier-bearing endpoint vendors before generic asset hosts.",
          "Confirm transfer context, vendor purpose, and public disclosure alignment for material runtime vendors."
        ],
        whatCertScoreObserved: getRetainedStrings(item, ["evidenceHighlights"])[0] ??
          "Transfer-relevant 3rd party endpoint evidence was retained for review.",
        whyThisMatters: "Transfer-relevant analytics or behavioral tracking endpoints can require review of vendor purpose, region, disclosure alignment, and transfer safeguards."
      };
    case "sensitive_surfaces_third_party_tracking":
      return {
        ...common,
        evidenceType: ["Runtime browser scan", "Sensitive-field correlation"],
        humanVerificationSteps: [
          "Review important forms and account flows not reached by the automated scan.",
          "Confirm whether any 3rd party scripts run on sensitive collection surfaces."
        ],
        whatCertScoreObserved: defaultObserved,
        whyThisMatters: "Sensitive collection surfaces paired with 3rd party tracking can materially change privacy review priority."
      };
    default:
      return {
        ...common,
        evidenceType: ["Runtime browser scan", "Retained report evidence"],
        humanVerificationSteps: ["Review retained evidence and validate important conclusions in the live consent configuration."],
        whatCertScoreObserved: defaultObserved,
        whyThisMatters: "This row summarizes automated public-web evidence for privacy review."
      };
  }
}

export function deriveGdprEprivacyReviewSummary(
  items: GdprEprivacyCoverageChecklistItem[]
): GdprEprivacyReviewSummary {
  const consentSurface = getRow(items, "consent_surface_observed");
  const preConsentTracking = getRow(items, "pre_consent_third_party_tracking");
  const preConsentStorage = getRow(items, "pre_consent_cookies_storage");
  const rejectPath = getRow(items, "reject_all_path_availability");
  const postRejectTracking = getRow(items, "post_reject_tracking_reduction");
  const preferenceControl = getRow(items, "preference_withdrawal_control");
  const sensitiveSurface = getRow(items, "sensitive_surfaces_third_party_tracking");
  const sessionReplay = getRow(items, "session_replay_fingerprinting_review");
  const sessionReplayBeforeConsent = getRow(items, "session_replay_before_consent");
  const sessionReplayDisclosure = getRow(items, "session_replay_disclosure_alignment");
  const sessionReplaySensitiveSurface = getRow(items, "session_replay_sensitive_surface");
  const sessionReplayAfterRefusal = getRow(items, "session_replay_after_refusal");
  const policyTextExtraction = getRow(items, "policy_text_extraction");
  const bullets: GdprEprivacyReviewSummaryBullet[] = [];

  const rejectEvidence = getRetainedEvidence(rejectPath);
  const rejectPathObserved =
    rowIs(rejectPath, "Observed") &&
    (
      getBoolean(rejectEvidence, ["completeRejectPathAvailable"]) === true ||
      getBoolean(rejectEvidence, ["rejectInteractionSucceeded"]) === true
    );
  const postRejectVendors = getPostRejectVendors(postRejectTracking);
  const postRejectPersistenceEvidence =
    hasEvidenceFlag(postRejectTracking, /reject_did_not_reduce_tracking|nonessential_vendor_persisted_after_reject/) ||
    postRejectVendors.length > 0;

  if (rejectPathObserved && rowIs(postRejectTracking, "Gap observed") && postRejectPersistenceEvidence) {
    addBullet(bullets, {
      copy: postRejectVendors.length > 0
        ? `CertScore observed a visible Decline option, but also observed non-essential tracking activity around refusal for ${postRejectVendors.join(", ")}.`
        : "CertScore observed a visible Decline option, but also observed non-essential tracking activity around the reject interaction.",
      headline: "Reject path observed, but tracking persisted around refusal",
      id: "reject_path_observed_tracking_persisted"
    });
  }

  const preConsentVendors = getPreConsentVendors(preConsentTracking);
  if (
    (rowIs(preConsentTracking, "Gap observed") || rowIs(preConsentStorage, "Gap observed")) &&
    preConsentVendors.length > 0
  ) {
    addBullet(bullets, {
      copy: `CertScore observed 3rd party tracking activity before a recorded consent action for ${preConsentVendors.join(", ")}.`,
      headline: "3rd party tracking observed before recorded consent",
      id: "pre_consent_tracking_observed"
    });
  }

  const sessionReplayVendors = getSessionReplayVendors(sessionReplay);
  if ((rowIs(sessionReplay, "Review signal") || rowIs(sessionReplay, "Observed")) && sessionReplayVendors.length > 0) {
    addBullet(bullets, {
      copy: `CertScore observed ${sessionReplayVendors.join(", ")} in the tested runtime context.`,
      headline: "Session replay / behavioral analytics vendor observed",
      id: "session_replay_behavioral_analytics_observed"
    });
  }

  if (rowIs(sessionReplayBeforeConsent, "Gap observed") && sessionReplayVendors.length > 0) {
    addBullet(bullets, {
      copy: `CertScore observed session replay or behavioral analytics before a recorded consent action for ${sessionReplayVendors.join(", ")}.`,
      headline: "Session replay observed before recorded consent",
      id: "session_replay_before_consent_gap"
    });
  }

  if (rowIs(sessionReplayDisclosure, "Gap observed") && sessionReplayVendors.length > 0) {
    addBullet(bullets, {
      copy: `Observed session replay vendors were not clearly matched in reviewed disclosures: ${sessionReplayVendors.join(", ")}.`,
      headline: "Session replay disclosure mismatch observed",
      id: "session_replay_disclosure_gap"
    });
  }

  if (rowIs(sessionReplaySensitiveSurface, "Gap observed")) {
    addBullet(bullets, {
      copy: sessionReplayVendors.length > 0
        ? `CertScore observed session replay on a sensitive surface for ${sessionReplayVendors.join(", ")}.`
        : "CertScore observed session replay on a sensitive surface in the tested context.",
      headline: "Session replay observed on a sensitive surface",
      id: "session_replay_sensitive_surface_gap"
    });
  }

  if (rowIs(sessionReplayAfterRefusal, "Gap observed")) {
    addBullet(bullets, {
      copy: sessionReplayVendors.length > 0
        ? `CertScore observed session replay persistence after a confirmed refusal or opt-out action for ${sessionReplayVendors.join(", ")}.`
        : "CertScore observed session replay persistence after a confirmed refusal or opt-out action.",
      headline: "Session replay persisted after refusal",
      id: "session_replay_after_refusal_gap"
    });
  }

  const preferenceEvidence = getRetainedEvidence(preferenceControl);
  const preferenceCoverageUsable = getString(preferenceEvidence, ["coverageStatus"]) === "usable";
  const preferenceUnavailable =
    getBoolean(preferenceEvidence, ["cmpReopenControlObserved"]) === false ||
    getBoolean(preferenceEvidence, ["preferenceCenterReachableAfterInitialLayer"]) === false ||
    rowIs(preferenceControl, "Not observed");
  if (
    preferenceCoverageUsable &&
    preferenceUnavailable &&
    (rowIs(preferenceControl, "Gap observed") ||
      rowIs(preferenceControl, "Review signal") ||
      rowIs(preferenceControl, "Not observed") ||
      rowIs(preferenceControl, "Insufficient evidence"))
  ) {
    addBullet(bullets, {
      copy: rowIs(consentSurface, "Observed")
        ? "A banner was observed, but CertScore did not find a visible post-choice control to reopen or change preferences."
        : "CertScore did not find a visible post-choice Cookie Settings, Privacy Preferences, or equivalent withdrawal control in the tested context.",
      headline: "Post-choice consent controls may be hard to revisit",
      id: "post_choice_controls_hard_to_revisit"
    });
  }

  const sensitiveEvidence = getRetainedEvidence(sensitiveSurface);
  if (
    rowIs(sensitiveSurface, "Not observed") &&
    getNumber(sensitiveEvidence, ["eligibleSensitiveFieldCount"]) === 0 &&
    getString(sensitiveEvidence, ["sensitiveThirdPartyTrackingCorrelationStatus"]) === "ok"
  ) {
    addBullet(bullets, {
      copy: "CertScore did not observe eligible sensitive fields alongside 3rd party tracking in the tested context.",
      headline: "Sensitive form tracking was not observed in the tested path",
      id: "sensitive_surface_tracking_not_observed"
    });
  }

  if (rowIs(policyTextExtraction, "Not testable") && policyTextExtractionLimited(policyTextExtraction)) {
    addBullet(bullets, {
      copy: "GDPR Transparency disclosure checks were limited because CertScore found a privacy-policy surface but did not extract enough usable policy text to evaluate individual Article 13 disclosures.",
      headline: "Policy text extraction limited transparency review",
      id: "policy_text_extraction_limited"
    });
  }

  const inScopeRows = items.filter((item) => item.assessmentStatus !== "not_applicable");
  const usableRows = inScopeRows.filter((item) =>
    item.evidenceState !== "not_testable" && item.assessmentStatus !== "coverage_limitation"
  ).length;
  const technicalLimitCount = items.filter((item) =>
    getAssessmentDirection(item) === "technical_limitation"
  ).length;
  const gapCount = items.filter((item) => item.assessmentStatus === "gap_observed").length;
  const partialConcernCount = items.filter((item) =>
    item.assessmentStatus !== "gap_observed" &&
    item.status !== "Gap observed" &&
    getAssessmentDirection(item) === "potential_concern"
  ).length;
  const reviewSignalCount = items.filter((item) =>
    getAssessmentDirection(item) === "review_signal"
  ).length;
  const evidenceCards = items.map(deriveGdprEprivacyEvidenceCard);

  return {
    bullets,
    coverageText: `${usableRows} of ${inScopeRows.length} in-scope rows had usable automated evidence.${technicalLimitCount > 0 ? ` ${technicalLimitCount} technical limit${technicalLimitCount === 1 ? "" : "s"} recorded.` : ""}`,
    evidenceCards,
    limits: SUMMARY_LIMITS_COPY,
    priorityReviewText: formatPriorityReviewText({ gapCount, partialConcernCount, reviewSignalCount }),
    suggestedRemediation: [
      "Review CMP and tag sequencing so analytics, tag-management, and session-replay scripts are gated where consent is required.",
      "Confirm that Decline disables non-essential tracking.",
      "Add or expose a persistent Cookie Settings or Privacy Preferences control when appropriate.",
      "Review behavioral analytics configuration, masking, retention, and consent gating.",
      "Update privacy or cookie disclosures to clearly identify material runtime vendors and purposes if they are not already disclosed elsewhere."
    ],
    whatToVerify: [
      "Whether observed analytics, tag-management, and behavioral analytics vendors are strictly necessary.",
      "Whether consent mode or equivalent controls suppress storage and measurement before opt-in.",
      "Whether Decline disables non-essential vendors.",
      "Whether users can later reopen or withdraw consent.",
      "Whether privacy or cookie disclosures clearly identify material runtime vendors and purposes."
    ]
  };
}

function formatPriorityReviewText(input: {
  gapCount: number;
  partialConcernCount: number;
  reviewSignalCount: number;
}) {
  const parts = [
    `${input.gapCount} gap${input.gapCount === 1 ? "" : "s"} observed`,
    input.partialConcernCount > 0
      ? `${input.partialConcernCount} partial concern${input.partialConcernCount === 1 ? "" : "s"}`
      : null,
    `${input.reviewSignalCount} review signal${input.reviewSignalCount === 1 ? "" : "s"}`
  ].filter((part): part is string => Boolean(part));
  return `${parts.join(", ")}.`;
}
