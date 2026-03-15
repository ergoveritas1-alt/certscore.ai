import type { ScanSnapshot } from "@website-signal-risk-scanner/shared";

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function weightedIssueCost(count: number, weight: number, cap: number) {
  if (count <= 0) {
    return 0;
  }

  return Math.min(cap, Math.sqrt(count) * weight);
}

export function deriveSecurityHeadersScore(input: Pick<
  ScanSnapshot,
  "cspHeaderPresent" | "xFrameOptionsPresent" | "referrerPolicyPresent" | "permissionsPolicyPresent" | "hstsEnabled"
>) {
  return [
    input.cspHeaderPresent,
    input.xFrameOptionsPresent,
    input.referrerPolicyPresent,
    input.permissionsPolicyPresent,
    input.hstsEnabled
  ].filter(Boolean).length * 20;
}

export function deriveTrackingBeforeConsentDetected(input: {
  browserSessionUsable: boolean;
  firstPartyCookieSetBeforeConsent: boolean;
  thirdPartyCookieSetBeforeConsent: boolean;
  trackerCount: number;
}) {
  if (!input.browserSessionUsable) {
    return null;
  }

  return input.firstPartyCookieSetBeforeConsent || input.thirdPartyCookieSetBeforeConsent || input.trackerCount > 0;
}

export function derivePolicyBehaviorConflictDetected(input: Pick<
  ScanSnapshot,
  | "advertisingTrackerCount"
  | "californiaExposureLikely"
  | "doNotSellLinkPresent"
  | "mentionsDataSaleOrSharing"
  | "preconsentTrackingDetected"
  | "privacyPolicyPresent"
  | "sessionReplayTrackerCount"
>) {
  const observedMeaningfulTracking =
    input.preconsentTrackingDetected || input.advertisingTrackerCount > 0 || input.sessionReplayTrackerCount > 0;

  return (
    (input.mentionsDataSaleOrSharing && !input.doNotSellLinkPresent && input.californiaExposureLikely) ||
    (!input.privacyPolicyPresent && observedMeaningfulTracking)
  );
}

export function deriveInfrastructureChangeSignals(input: {
  currentRequestDomains: string[];
  currentScriptDomains: string[];
  currentResponseHeaders: Record<string, string>;
  previousRequestDomains: string[] | null;
  previousScriptDomains: string[] | null;
  previousResponseHeaders: Record<string, string> | null;
}) {
  function changed(current: string[], previous: string[] | null) {
    if (!previous) {
      return null;
    }

    const currentSet = new Set(current);
    const previousSet = new Set(previous);

    if (currentSet.size === 0 && previousSet.size === 0) {
      return false;
    }

    const additions = [...currentSet].filter((value) => !previousSet.has(value));
    const removals = [...previousSet].filter((value) => !currentSet.has(value));
    return additions.length > 0 || removals.length > 0;
  }

  const currentHeaderMarkers = [
    input.currentResponseHeaders.server ?? "",
    input.currentResponseHeaders["x-powered-by"] ?? "",
    input.currentResponseHeaders["content-security-policy"] ? "csp" : "",
    input.currentResponseHeaders["strict-transport-security"] ? "hsts" : "",
    input.currentResponseHeaders["permissions-policy"] ? "permissions-policy" : ""
  ].filter(Boolean);
  const previousHeaderMarkers = input.previousResponseHeaders
    ? [
        input.previousResponseHeaders.server ?? "",
        input.previousResponseHeaders["x-powered-by"] ?? "",
        input.previousResponseHeaders["content-security-policy"] ? "csp" : "",
        input.previousResponseHeaders["strict-transport-security"] ? "hsts" : "",
        input.previousResponseHeaders["permissions-policy"] ? "permissions-policy" : ""
      ].filter(Boolean)
    : null;

  const requestDomainSetChanged = changed(input.currentRequestDomains, input.previousRequestDomains);
  const scriptDomainSetChanged = changed(input.currentScriptDomains, input.previousScriptDomains);
  const securityHeaderPostureChanged = changed(currentHeaderMarkers, previousHeaderMarkers);

  return {
    requestDomainSetChanged,
    scriptDomainSetChanged,
    securityHeaderPostureChanged,
    infrastructureChangeDetected:
      requestDomainSetChanged === null && scriptDomainSetChanged === null && securityHeaderPostureChanged === null
        ? null
        : Boolean(requestDomainSetChanged || scriptDomainSetChanged || securityHeaderPostureChanged)
  };
}

export function scoreSnapshot(snapshot: ScanSnapshot) {
  const privacyScore = clamp(
    85 -
      (snapshot.privacyPolicyPresent ? 0 : 20) -
      (snapshot.doNotSellLinkPresent ? 0 : snapshot.californiaExposureLikely ? 8 : 0) -
      (snapshot.subprocessorListPresent ? 0 : 6) -
      (snapshot.mentionsDataRetention ? 0 : 6) -
      (snapshot.mentionsDataSaleOrSharing ? 6 : 0)
  );

  const consentScore = clamp(
    85 -
      (snapshot.cookieBannerPresent ? 0 : snapshot.trackerCountTotal > 0 ? 25 : 0) -
      (snapshot.rejectAllPresent ? 0 : snapshot.cookieBannerPresent ? 12 : 0) -
      (snapshot.granularPreferencesPresent ? 0 : snapshot.cookieBannerPresent ? 8 : 0) -
      (snapshot.consentInteractionModel === "accept_only" ? 10 : 0) -
      (snapshot.consentInteractionModel === "dismiss_only" ? 8 : 0) -
      (snapshot.preconsentTrackingDetected ? 20 : 0) -
      (snapshot.darkPatternAcceptEmphasis ? 6 : 0) -
      (snapshot.darkPatternRejectHidden ? 6 : 0)
  );

  const trackerRiskScore = clamp(
    snapshot.analyticsTrackerCount * 6 +
      snapshot.advertisingTrackerCount * 10 +
      snapshot.sessionReplayTrackerCount * 15 +
      (snapshot.preconsentTrackingDetected ? 18 : 0) +
      (snapshot.fingerprintingOrIdentityVendorDetected ? 20 : 0)
  );

  const accessibilityScore = clamp(
    100 -
      weightedIssueCost(snapshot.wcagMissingAltCount, 6, 18) -
      weightedIssueCost(snapshot.wcagContrastFailuresCount, 6, 20) -
      weightedIssueCost(snapshot.wcagFormLabelErrorCount, 8, 20) -
      weightedIssueCost(snapshot.wcagAriaErrorCount, 4, 12) -
      weightedIssueCost(snapshot.wcagHeadingStructureErrorCount, 4, 12) -
      weightedIssueCost(snapshot.wcagLinkNameErrorCount, 6, 20) -
      weightedIssueCost(snapshot.wcagKeyboardNavigationIssueCount, 8, 18) -
      weightedIssueCost(snapshot.wcagFocusIndicatorIssueCount, 8, 18) -
      weightedIssueCost(snapshot.wcagLandmarkIssueCount, 4, 12)
  );

  const dataCollectionRiskScore = clamp(
    snapshot.formCountTotal * 4 +
      (snapshot.emailInputPresent ? 8 : 0) +
      (snapshot.phoneInputPresent ? 8 : 0) +
      (snapshot.addressInputPresent ? 10 : 0) +
      (snapshot.dateOfBirthInputPresent ? 12 : 0) +
      (snapshot.paymentCardInputPresent ? 16 : 0) +
      (snapshot.sensitiveDataFormHintsPresent ? 16 : 0)
  );

  const consumerProtectionScore = clamp(
    85 -
      (snapshot.subscriptionOfferDetected && !snapshot.autoRenewalDisclosurePresent ? 18 : 0) -
      (snapshot.freeTrialDetected && !snapshot.cancellationPolicyPresent ? 12 : 0) -
      (snapshot.unsubscribeMechanismPresent ? 0 : snapshot.newsletterSignupPresent ? 8 : 0) -
      (snapshot.refundOrReturnWindowDetected ? 0 : snapshot.ecommerceSiteLikely ? 10 : 0)
  );

  const childrenPrivacyRiskScore = clamp(
    (snapshot.childrenAudienceLikely ? 20 : 0) +
      (snapshot.mentionsCoppa ? 10 : 0) +
      (snapshot.mentionsUnder13 ? 15 : 0) +
      (snapshot.ageGatePresent ? 0 : snapshot.childrenAudienceLikely ? 18 : 0) +
      (snapshot.parentalConsentReferencePresent ? 0 : snapshot.childrenAudienceLikely ? 10 : 0)
  );

  const regulatoryExposureScore = clamp(
    (snapshot.euExposureLikely ? 18 : 0) +
      (snapshot.californiaExposureLikely ? 18 : 0) +
      (snapshot.healthcareSiteLikely ? 16 : 0) +
      (snapshot.financialServicesSiteLikely ? 16 : 0) +
      (snapshot.childrenAudienceLikely ? 16 : 0) +
      (snapshot.preconsentTrackingDetected ? 12 : 0) +
      (snapshot.mentionsSensitiveData ? 8 : 0)
  );

  const certscoreOverall = clamp(
    (privacyScore + consentScore + accessibilityScore + consumerProtectionScore) / 4 -
      trackerRiskScore * 0.12 -
      dataCollectionRiskScore * 0.08 -
      regulatoryExposureScore * 0.08
  );

  return {
    certscoreOverall,
    privacyScore,
    consentScore,
    trackerRiskScore,
    accessibilityScore,
    dataCollectionRiskScore,
    consumerProtectionScore,
    childrenPrivacyRiskScore,
    regulatoryExposureScore,
    accessibilityScoreAutomated: accessibilityScore,
    piiCollectionRiskScore: dataCollectionRiskScore,
    transparencyScore: clamp(
      (snapshot.securityTxtPresent ? 25 : 0) +
        (snapshot.responsibleDisclosurePresent ? 25 : 0) +
        (snapshot.bugBountyProgramPresent ? 25 : 0) +
        (snapshot.transparencyReportPresent ? 25 : 0)
    ),
    securityHeadersScore: deriveSecurityHeadersScore(snapshot)
  };
}
