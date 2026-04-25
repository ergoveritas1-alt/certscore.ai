export type RegulatoryRiskLevel = "low" | "moderate" | "high";

export type RegulatoryRiskDriver = {
  key: string;
  label: string;
  impact: number;
};

export type RegulatoryRiskTrend = {
  delta: number | null;
  direction: "up" | "down" | "stable" | "unknown";
  label: string;
};

export type RegulatoryRiskAssessment = {
  overallScore: number;
  riskLevel: RegulatoryRiskLevel;
  confidence: number;
  topRiskDrivers: RegulatoryRiskDriver[];
  topMitigatingControls: RegulatoryRiskDriver[];
  trendVsPreviousScan: RegulatoryRiskTrend;
  privacyEnforcementRiskScore: number;
  consentEnforcementRiskScore: number;
  consumerProtectionRiskScore: number;
  accessibilityEnforcementRiskScore: number;
  dataExposureRiskScore: number;
};

export type RegulatoryRiskSource = {
  homepageFetchStatus?: "ok" | "error" | "blocked" | "forbidden" | "timeout" | "redirected" | "not_found" | null;
  pagesScanned?: number | null;
  partialScan?: boolean | null;
  finalUrl?: string | null;
  registeredDomain?: string | null;
  trackingBeforeConsentDetected?: boolean | null;
  thirdPartyCookieSetBeforeConsent?: boolean | null;
  cookieBannerPresent?: boolean | null;
  rejectAllPresent?: boolean | null;
  granularPreferencesPresent?: boolean | null;
  dsarRequestMechanismPresent?: boolean | null;
  dataAccessRequestPresent?: boolean | null;
  dataDeletionRequestPresent?: boolean | null;
  privacyContactChannelType?: "email" | "form" | "portal" | "none" | null;
  mentionsDataRetention?: boolean | null;
  dataRetentionSpecificPeriodDetected?: boolean | null;
  retentionDisclosureQuality?: "none" | "vague" | "specific" | null;
  policyClaimNoSale?: boolean | null;
  policyClaimNoTracking?: boolean | null;
  policyClaimPrivacyProtective?: boolean | null;
  policyBehaviorConflictDetected?: boolean | null;
  sessionReplayWithoutDisclosureDetected?: boolean | null;
  mentionsSensitiveData?: boolean | null;
  mentionsHealthData?: boolean | null;
  mentionsBiometricData?: boolean | null;
  mentionsFinancialData?: boolean | null;
  mentionsUnder13?: boolean | null;
  mentionsUnder16?: boolean | null;
  californiaExposureLikely?: boolean | null;
  doNotSellLinkPresent?: boolean | null;
  advertisingTrackerCount?: number | null;
  sessionReplayTrackerCount?: number | null;
  consumerProtectionScore?: number | null;
  wcagErrorCountTotal?: number | null;
  wcagMissingAltCount?: number | null;
  wcagFormLabelErrorCount?: number | null;
  accessibilityStatementPresent?: boolean | null;
  accessibilityClaimMismatchDetected?: boolean | null;
  accessibilityLitigationRiskScore?: number | null;
  ecommerceSiteLikely?: boolean | null;
  trackerRegulatoryRiskScore?: number | null;
  thirdPartyDataFlowRiskScore?: number | null;
  thirdPartyRequestCount?: number | null;
  thirdPartyRequestDomainCount?: number | null;
  sensitiveContextTrackingDetected?: boolean | null;
  highRiskIdentityVendorDetected?: boolean | null;
  highRiskDataBrokerDetected?: boolean | null;
  healthAdtechVendorDetected?: boolean | null;
  deviceSignalVendorDetected?: boolean | null;
  highRiskTrackingVendorNames?: string[] | null;
};

type ScoredBucket = {
  score: number;
  drivers: RegulatoryRiskDriver[];
  mitigations: RegulatoryRiskDriver[];
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function riskLevelFromScore(score: number): RegulatoryRiskLevel {
  if (score >= 67) {
    return "high";
  }
  if (score >= 34) {
    return "moderate";
  }
  return "low";
}

function pushIf(condition: boolean, list: RegulatoryRiskDriver[], item: RegulatoryRiskDriver) {
  if (condition) {
    list.push(item);
  }
}

function numberOrZero(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function hostnameFromUrl(value: string | null | undefined) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeDomain(value: string | null | undefined) {
  return typeof value === "string" && value.length > 0 ? value.toLowerCase().replace(/^www\./, "") : null;
}

function finalUrlRedirectsOffDomain(source: RegulatoryRiskSource) {
  const finalHostname = normalizeDomain(hostnameFromUrl(source.finalUrl));
  const registeredDomain = normalizeDomain(source.registeredDomain);
  if (!finalHostname || !registeredDomain) {
    return false;
  }
  return finalHostname !== registeredDomain;
}

function buildPrivacyBucket(source: RegulatoryRiskSource): ScoredBucket {
  const drivers: RegulatoryRiskDriver[] = [];
  const mitigations: RegulatoryRiskDriver[] = [];
  pushIf(source.dsarRequestMechanismPresent === false, drivers, { key: "missing_dsar", label: "No clear DSAR mechanism", impact: 24 });
  pushIf(source.dataAccessRequestPresent === false, drivers, { key: "missing_access_right", label: "No clear access-request path", impact: 16 });
  pushIf(source.dataDeletionRequestPresent === false, drivers, { key: "missing_deletion_right", label: "No clear deletion-request path", impact: 16 });
  pushIf(source.privacyContactChannelType === "none", drivers, { key: "missing_privacy_contact", label: "No clear privacy contact channel", impact: 12 });
  pushIf(source.policyBehaviorConflictDetected === true, drivers, { key: "policy_behavior_conflict", label: "Policy and observed behavior conflict", impact: 22 });
  pushIf(source.mentionsSensitiveData === true, drivers, { key: "sensitive_data", label: "Sensitive data disclosures surfaced", impact: 10 });
  pushIf(source.sensitiveContextTrackingDetected === true, drivers, {
    key: "sensitive_context_tracking",
    label: "Sensitive-context tracking before consent",
    impact: 26
  });
  pushIf(source.highRiskDataBrokerDetected === true, drivers, { key: "data_broker_present", label: "Data broker integration observed", impact: 16 });
  pushIf(source.californiaExposureLikely === true && source.doNotSellLinkPresent === false, drivers, { key: "missing_opt_out", label: "California-style opt-out signal missing", impact: 14 });

  pushIf(source.dsarRequestMechanismPresent === true, mitigations, { key: "dsar_present", label: "DSAR mechanism present", impact: 16 });
  pushIf(source.dataAccessRequestPresent === true, mitigations, { key: "access_present", label: "Access request path present", impact: 10 });
  pushIf(source.dataDeletionRequestPresent === true, mitigations, { key: "deletion_present", label: "Deletion request path present", impact: 10 });
  pushIf(source.privacyContactChannelType === "email" || source.privacyContactChannelType === "form" || source.privacyContactChannelType === "portal", mitigations, {
    key: "privacy_contact_present",
    label: "Privacy contact channel present",
    impact: 8
  });
  pushIf(source.policyClaimPrivacyProtective === true, mitigations, { key: "privacy_protective_claim", label: "Protective privacy language present", impact: 5 });

  const raw = drivers.reduce((sum, item) => sum + item.impact, 0) - mitigations.reduce((sum, item) => sum + item.impact, 0);
  return { score: clampScore(raw + 20), drivers, mitigations };
}

function buildConsentBucket(source: RegulatoryRiskSource): ScoredBucket {
  const drivers: RegulatoryRiskDriver[] = [];
  const mitigations: RegulatoryRiskDriver[] = [];
  pushIf(source.trackingBeforeConsentDetected === true, drivers, { key: "tracking_before_consent", label: "Tracking before consent", impact: 30 });
  pushIf(source.thirdPartyCookieSetBeforeConsent === true, drivers, { key: "third_party_cookies_before_consent", label: "Third-party cookies before consent", impact: 26 });
  pushIf(source.sensitiveContextTrackingDetected === true, drivers, {
    key: "sensitive_context_preconsent",
    label: "Sensitive-context tracking before consent",
    impact: 24
  });
  pushIf(source.highRiskIdentityVendorDetected === true, drivers, { key: "identity_resolution_vendor", label: "Identity-resolution vendor observed", impact: 14 });
  pushIf(source.cookieBannerPresent === true && source.rejectAllPresent === false, drivers, { key: "reject_all_missing", label: "Reject-all control missing", impact: 16 });
  pushIf(source.cookieBannerPresent === true && source.granularPreferencesPresent === false, drivers, {
    key: "granular_prefs_missing",
    label: "Granular consent controls missing",
    impact: 14
  });

  pushIf(source.cookieBannerPresent === true, mitigations, { key: "banner_present", label: "Consent surface detected", impact: 8 });
  pushIf(source.rejectAllPresent === true, mitigations, { key: "reject_all_present", label: "Reject-all control present", impact: 18 });
  pushIf(source.granularPreferencesPresent === true, mitigations, { key: "granular_prefs_present", label: "Granular consent controls present", impact: 16 });
  pushIf(source.trackingBeforeConsentDetected === false, mitigations, { key: "no_preconsent_tracking", label: "No pre-consent tracking detected", impact: 10 });

  const raw = drivers.reduce((sum, item) => sum + item.impact, 0) - mitigations.reduce((sum, item) => sum + item.impact, 0);
  return { score: clampScore(raw + 18), drivers, mitigations };
}

function buildConsumerBucket(source: RegulatoryRiskSource): ScoredBucket {
  const drivers: RegulatoryRiskDriver[] = [];
  const mitigations: RegulatoryRiskDriver[] = [];
  pushIf(
    numberOrZero(source.pagesScanned) === 0 &&
      (source.homepageFetchStatus === "error" || source.homepageFetchStatus === "timeout" || source.homepageFetchStatus === "not_found"),
    drivers,
    { key: "site_unreachable", label: "Homepage unreachable during scan", impact: 26 }
  );
  pushIf(
    numberOrZero(source.pagesScanned) === 0 &&
      (source.homepageFetchStatus === "forbidden" || source.homepageFetchStatus === "blocked"),
    drivers,
    { key: "access_blocked", label: "Homepage blocked during scan", impact: 18 }
  );
  pushIf(finalUrlRedirectsOffDomain(source), drivers, {
    key: "off_domain_redirect",
    label: "Domain redirected to a different site",
    impact: 30
  });
  pushIf(source.policyBehaviorConflictDetected === true, drivers, { key: "policy_behavior_conflict", label: "Policy and behavior conflict", impact: 28 });
  pushIf(source.sessionReplayWithoutDisclosureDetected === true, drivers, { key: "session_replay_undisclosed", label: "Session replay without disclosure", impact: 22 });
  pushIf(source.sensitiveContextTrackingDetected === true, drivers, {
    key: "sensitive_context_consumer_risk",
    label: "Sensitive-context data flow to third parties",
    impact: 24
  });
  pushIf(numberOrZero(source.advertisingTrackerCount) > 0 && source.policyClaimNoSale === true, drivers, { key: "no_sale_vs_adtech", label: "No-sale claim conflicts with adtech", impact: 18 });
  pushIf(numberOrZero(source.consumerProtectionScore) >= 65, drivers, { key: "consumer_score_elevated", label: "Elevated consumer-protection score", impact: 16 });

  pushIf(source.policyClaimPrivacyProtective === true, mitigations, { key: "protective_language", label: "Protective disclosure language present", impact: 6 });
  pushIf(source.doNotSellLinkPresent === true, mitigations, { key: "do_not_sell_present", label: "Do-not-sell control present", impact: 10 });

  const raw = drivers.reduce((sum, item) => sum + item.impact, 0) - mitigations.reduce((sum, item) => sum + item.impact, 0);
  return { score: clampScore(raw + 16), drivers, mitigations };
}

function buildAccessibilityBucket(source: RegulatoryRiskSource): ScoredBucket {
  const drivers: RegulatoryRiskDriver[] = [];
  const mitigations: RegulatoryRiskDriver[] = [];
  const wcag = numberOrZero(source.wcagErrorCountTotal);
  pushIf(wcag >= 20, drivers, { key: "high_wcag_errors", label: "High automated WCAG issue volume", impact: 30 });
  pushIf(numberOrZero(source.wcagMissingAltCount) >= 5, drivers, { key: "missing_alt", label: "Multiple missing alt issues", impact: 12 });
  pushIf(numberOrZero(source.wcagFormLabelErrorCount) >= 3, drivers, { key: "form_label_issues", label: "Form labeling issues", impact: 12 });
  pushIf(source.accessibilityClaimMismatchDetected === true, drivers, { key: "claim_mismatch", label: "Accessibility claim mismatch", impact: 18 });
  pushIf(numberOrZero(source.accessibilityLitigationRiskScore) >= 60, drivers, { key: "litigation_proxy", label: "Elevated accessibility risk proxy", impact: 18 });
  pushIf(source.ecommerceSiteLikely === true, drivers, { key: "public_facing_commerce", label: "Public-facing commerce flow", impact: 8 });

  pushIf(source.accessibilityStatementPresent === true, mitigations, { key: "accessibility_statement", label: "Accessibility statement present", impact: 10 });
  pushIf(wcag > 0 && wcag < 10, mitigations, { key: "lower_wcag_error_count", label: "Lower automated WCAG issue count", impact: 10 });

  const raw = drivers.reduce((sum, item) => sum + item.impact, 0) - mitigations.reduce((sum, item) => sum + item.impact, 0);
  return { score: clampScore(raw + 12), drivers, mitigations };
}

function buildDataExposureBucket(source: RegulatoryRiskSource): ScoredBucket {
  const drivers: RegulatoryRiskDriver[] = [];
  const mitigations: RegulatoryRiskDriver[] = [];
  pushIf(source.mentionsSensitiveData === true, drivers, { key: "sensitive_data", label: "Sensitive data categories disclosed", impact: 16 });
  pushIf(source.mentionsHealthData === true, drivers, { key: "health_data", label: "Health data references surfaced", impact: 12 });
  pushIf(source.sensitiveContextTrackingDetected === true, drivers, {
    key: "sensitive_context_tracking",
    label: "Sensitive-context tracking evidence",
    impact: 22
  });
  pushIf(source.highRiskDataBrokerDetected === true, drivers, { key: "data_broker_present", label: "Data broker integration observed", impact: 16 });
  pushIf(source.healthAdtechVendorDetected === true, drivers, { key: "health_adtech_present", label: "Health-contextual adtech observed", impact: 14 });
  pushIf(source.highRiskIdentityVendorDetected === true, drivers, { key: "identity_resolution_vendor", label: "Identity-resolution vendor observed", impact: 12 });
  pushIf(source.deviceSignalVendorDetected === true, drivers, { key: "device_signal_vendor", label: "Device-signal vendor observed", impact: 8 });
  pushIf(source.mentionsBiometricData === true, drivers, { key: "biometric_data", label: "Biometric data references surfaced", impact: 12 });
  pushIf(source.mentionsFinancialData === true, drivers, { key: "financial_data", label: "Financial data references surfaced", impact: 10 });
  pushIf(source.mentionsUnder13 === true || source.mentionsUnder16 === true, drivers, { key: "children_data", label: "Children-related data references surfaced", impact: 14 });
  pushIf(numberOrZero(source.trackerRegulatoryRiskScore) >= 50, drivers, { key: "tracker_reg_risk", label: "Elevated tracker regulatory risk", impact: 10 });
  pushIf(numberOrZero(source.thirdPartyDataFlowRiskScore) >= 50, drivers, { key: "third_party_data_flows", label: "Elevated third-party data-flow risk", impact: 14 });
  pushIf(numberOrZero(source.thirdPartyRequestDomainCount) >= 20, drivers, { key: "broad_third_party_domain_footprint", label: "Broad third-party domain footprint", impact: 10 });

  pushIf(source.retentionDisclosureQuality === "specific", mitigations, { key: "specific_retention", label: "Specific retention language present", impact: 10 });
  pushIf(source.policyClaimPrivacyProtective === true, mitigations, { key: "protective_claim", label: "Protective privacy commitments disclosed", impact: 4 });

  const raw = drivers.reduce((sum, item) => sum + item.impact, 0) - mitigations.reduce((sum, item) => sum + item.impact, 0);
  return { score: clampScore(raw + 10), drivers, mitigations };
}

function buildTrend(currentOverallScore: number, previousOverallScore?: number | null): RegulatoryRiskTrend {
  if (typeof previousOverallScore !== "number" || !Number.isFinite(previousOverallScore)) {
    return { delta: null, direction: "unknown", label: "No prior risk baseline" };
  }

  const delta = clampScore(currentOverallScore - previousOverallScore);
  if (Math.abs(currentOverallScore - previousOverallScore) < 4) {
    return { delta: currentOverallScore - previousOverallScore, direction: "stable", label: "Stable versus previous scan" };
  }

  return currentOverallScore > previousOverallScore
    ? { delta: currentOverallScore - previousOverallScore, direction: "up", label: "Higher than previous scan" }
    : { delta: currentOverallScore - previousOverallScore, direction: "down", label: "Lower than previous scan" };
}

export function buildRegulatoryRiskAssessment(input: {
  source: RegulatoryRiskSource;
  previousOverallScore?: number | null;
}): RegulatoryRiskAssessment {
  const privacy = buildPrivacyBucket(input.source);
  const consent = buildConsentBucket(input.source);
  const consumer = buildConsumerBucket(input.source);
  const accessibility = buildAccessibilityBucket(input.source);
  const dataExposure = buildDataExposureBucket(input.source);

  const overallScore = clampScore(
    privacy.score * 0.25 +
      consent.score * 0.25 +
      consumer.score * 0.2 +
      accessibility.score * 0.15 +
      dataExposure.score * 0.15
  );

  const observedFields = [
    input.source.homepageFetchStatus,
    input.source.pagesScanned,
    input.source.finalUrl,
    input.source.trackingBeforeConsentDetected,
    input.source.rejectAllPresent,
    input.source.dsarRequestMechanismPresent,
    input.source.privacyContactChannelType,
    input.source.policyClaimNoSale,
    input.source.policyBehaviorConflictDetected,
    input.source.sessionReplayWithoutDisclosureDetected,
    input.source.wcagErrorCountTotal,
    input.source.retentionDisclosureQuality
  ].filter((value) => value !== null && value !== undefined).length;

  const confidence = Math.max(
    numberOrZero(input.source.pagesScanned) === 0 ? 0.2 : 0.45,
    Math.min(0.96, observedFields / 10)
  );
  const topRiskDrivers = [...privacy.drivers, ...consent.drivers, ...consumer.drivers, ...accessibility.drivers, ...dataExposure.drivers]
    .sort((left, right) => right.impact - left.impact)
    .slice(0, 3);
  const topMitigatingControls = [...privacy.mitigations, ...consent.mitigations, ...consumer.mitigations, ...accessibility.mitigations, ...dataExposure.mitigations]
    .sort((left, right) => right.impact - left.impact)
    .slice(0, 3);

  return {
    overallScore,
    riskLevel: riskLevelFromScore(overallScore),
    confidence: Number(confidence.toFixed(2)),
    topRiskDrivers,
    topMitigatingControls,
    trendVsPreviousScan: buildTrend(overallScore, input.previousOverallScore),
    privacyEnforcementRiskScore: privacy.score,
    consentEnforcementRiskScore: consent.score,
    consumerProtectionRiskScore: consumer.score,
    accessibilityEnforcementRiskScore: accessibility.score,
    dataExposureRiskScore: dataExposure.score
  };
}
