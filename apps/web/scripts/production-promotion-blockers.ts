export type PromotionBlockerFindingId = "missing_dsar_mechanism" | "preconsent_tracking";

export type PromotionBlockerAssessment = {
  blockers: string[];
  evidence: Record<string, boolean | number | string | string[] | null>;
  findingId: PromotionBlockerFindingId;
  promotionReady: boolean;
};

export type PromotionBlockerInput = {
  consentBaselineTrackerEvidenceUrls?: string[] | null;
  domain?: string | null;
  hybridRuntimeEvidence?: Record<string, unknown> | null;
  policyCoverageRatio?: number | null;
  policyDsarMechanism?: string | null;
  policyExtractionStatus?: string | null;
  policyPageUrl?: string | null;
  policyRightsSignals?: string[] | null;
  policySemanticConfidence?: number | null;
  policySnippetCount?: number | null;
  policyStructurallyWeak?: boolean | null;
  preconsentTrackingDetected?: boolean | null;
  preconsentViolationEvidenceUrls?: string[] | null;
  scanId?: string | null;
  sectionReviewNoDsarMechanism?: boolean | null;
  trackingBeforeConsentDetected?: boolean | null;
};

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getObjectArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim()))]
    : [];
}

function isPromotionGradeCookieCategory(value: string | null | undefined) {
  return Boolean(value && /analytics|advertising|marketing|retargeting|session_replay/i.test(value));
}

function classifyCookieName(name: string) {
  if (/(^_ga|^_gid|^_gat|ga_|goog|gtm|plausible|analytics|amplitude|segment|mixpanel|posthog|ajs_anonymous_id)/i.test(name)) {
    return "analytics";
  }
  if (/(^_fbp|^_fbc|gcl_|ttclid|ttp|li_sugr|bcookie|lidc|uuid2|xandr|adnxs|anusercookie|rtmark|doubleclick|criteo|_mkto_trk|muid|fr\b|demdex|amcvs?_|adobeorg|kndctr_.*adobeorg|mbox|mboxedgecluster|at_check)/i.test(name)) {
    return "advertising";
  }
  if (/(qsi_replaysession|qualtrics|hotjar|fullstory|clarity|contentsquare|mouseflow)/i.test(name)) {
    return "session_replay";
  }
  if (/^(__cf_bm|cf_clearance|awsalb|awsalbcors|jsessionid|phpsessid|csrftoken|xsrf|session|sid$)/i.test(name)) {
    return "necessary";
  }
  return "unknown";
}

function getPreconsentCookieRows(hybridRuntimeEvidence: Record<string, unknown> | null | undefined) {
  const hybrid = getRecord(hybridRuntimeEvidence);
  const rows = [
    ...getObjectArray(hybrid?.cookieWriteObservations ?? hybrid?.cookie_write_observations),
    ...getObjectArray(hybrid?.preconsentCookieEvidence ?? hybrid?.preconsent_cookie_evidence)
  ];

  return rows.map((row) => {
    const name = getString(row.cookieName) ?? getString(row.cookie_name) ?? getString(row.name);
    const explicitCategory = getString(row.category) ?? getString(row.cookieCategory) ?? getString(row.cookie_category);
    const inferredCategory = name ? classifyCookieName(name) : "unknown";
    const timingEvidence = getString(row.timingEvidence) ?? getString(row.timing_evidence);
    const beforeConsent =
      row.beforeConsent === true ||
      row.before_consent === true ||
      row.consentState === "pre_consent" ||
      row.consent_state === "pre_consent" ||
      timingEvidence === "before_consent_cookie_write" ||
      timingEvidence === "initial_cookie_snapshot";
    const category = explicitCategory ?? inferredCategory;
    const nonEssential =
      row.nonEssential === true ||
      row.non_essential === true ||
      isPromotionGradeCookieCategory(category);

    return {
      beforeConsent,
      category,
      name,
      nonEssential,
      timingEvidence
    };
  }).filter((row) => row.name);
}

export function classifyPreconsentPromotionBlockers(input: PromotionBlockerInput): PromotionBlockerAssessment {
  const concreteRequestUrls = [
    ...(input.consentBaselineTrackerEvidenceUrls ?? []),
    ...(input.preconsentViolationEvidenceUrls ?? [])
  ].filter((url) => /^https?:\/\//i.test(url));
  const cookieRows = getPreconsentCookieRows(input.hybridRuntimeEvidence);
  const beforeConsentCookieRows = cookieRows.filter((row) => row.beforeConsent);
  const nonEssentialCookieRows = beforeConsentCookieRows.filter((row) => row.nonEssential);
  const necessaryOnly = beforeConsentCookieRows.length > 0 && nonEssentialCookieRows.length === 0;
  const hasSequence =
    input.preconsentTrackingDetected === true ||
    input.trackingBeforeConsentDetected === true ||
    beforeConsentCookieRows.length > 0 ||
    concreteRequestUrls.length > 0;
  const blockers: string[] = [];

  if (!hasSequence) {
    blockers.push("missing_preconsent_sequence");
  }
  if (concreteRequestUrls.length === 0) {
    blockers.push("missing_concrete_tracker_request_url");
  }
  if (cookieRows.length === 0) {
    blockers.push("missing_cookie_observation_artifacts");
  } else if (beforeConsentCookieRows.length === 0) {
    blockers.push("missing_cookie_before_consent_timing");
  } else if (necessaryOnly) {
    blockers.push("necessary_cookie_only");
  } else if (nonEssentialCookieRows.length === 0) {
    blockers.push("missing_nonessential_cookie_classification");
  }

  const promotionReady = hasSequence && (concreteRequestUrls.length > 0 || nonEssentialCookieRows.length > 0);
  return {
    blockers: promotionReady ? [] : blockers,
    evidence: {
      concreteRequestUrlCount: concreteRequestUrls.length,
      cookieObservationCount: cookieRows.length,
      firstConcreteRequestUrl: concreteRequestUrls[0] ?? null,
      nonEssentialCookieNames: nonEssentialCookieRows.map((row) => row.name).filter(Boolean) as string[],
      preconsentCookieNames: beforeConsentCookieRows.map((row) => row.name).filter(Boolean) as string[],
      sequenceEvidence: hasSequence
    },
    findingId: "preconsent_tracking",
    promotionReady
  };
}

export function classifyDsarPromotionBlockers(input: PromotionBlockerInput): PromotionBlockerAssessment {
  const mechanism = input.policyDsarMechanism?.trim() || null;
  const rightsSignals = input.policyRightsSignals ?? [];
  const hasExplicitAbsence =
    /^(absent|none|missing|not_found)$/i.test(mechanism ?? "") ||
    input.sectionReviewNoDsarMechanism === true;
  const hasPolicyAnchor = Boolean(input.policyPageUrl && /^https?:\/\//i.test(input.policyPageUrl));
  const confidence = input.policySemanticConfidence ?? null;
  const blockers: string[] = [];

  if (!hasPolicyAnchor) {
    blockers.push("missing_policy_anchor_url");
  }
  if (input.policyExtractionStatus !== "fetched") {
    blockers.push(input.policyExtractionStatus ? "policy_extraction_incomplete" : "missing_policy_extraction_status");
  }
  if (input.policyStructurallyWeak === true) {
    blockers.push("policy_structurally_weak");
  }
  if (typeof confidence !== "number" || confidence < 0.75) {
    blockers.push("low_policy_semantic_confidence");
  }
  if (!hasExplicitAbsence) {
    blockers.push("missing_explicit_dsar_absence");
  }
  if (mechanism && !/^(absent|none|missing|not_found|unknown|null)$/i.test(mechanism)) {
    blockers.push("dsar_mechanism_present");
  }
  if (rightsSignals.length > 0) {
    blockers.push("rights_signals_present");
  }

  const promotionReady = blockers.length === 0;
  return {
    blockers,
    evidence: {
      policyCoverageRatio: input.policyCoverageRatio ?? null,
      policyDsarMechanism: mechanism,
      policyExtractionStatus: input.policyExtractionStatus ?? null,
      policyPageUrl: input.policyPageUrl ?? null,
      policyRightsSignals: rightsSignals,
      policySemanticConfidence: confidence,
      policySnippetCount: input.policySnippetCount ?? null,
      sectionReviewNoDsarMechanism: input.sectionReviewNoDsarMechanism === true
    },
    findingId: "missing_dsar_mechanism",
    promotionReady
  };
}

export function summarizePromotionBlockers(assessments: PromotionBlockerAssessment[]) {
  const blockerCounts = new Map<string, number>();
  const readyCount = assessments.filter((assessment) => assessment.promotionReady).length;

  for (const assessment of assessments) {
    for (const blocker of assessment.blockers) {
      blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
    }
  }

  return {
    blockerCounts: [...blockerCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
    candidateCount: assessments.length,
    readyCount
  };
}
