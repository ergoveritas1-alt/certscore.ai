import { getPrimaryCategoryDescription, getPrimaryCategoryLabel, mapSignalKeyToTaxonomy, type PrimaryScanCategoryId } from "./signal-taxonomy";

export type ScanDetailSupplementalSignalRecord = {
  category: string;
  primaryCategory: PrimaryScanCategoryId;
  primaryCategoryDescription: string;
  primaryCategoryLabel: string;
  key: string;
  label: string;
  subcategory: string | null;
  value: boolean | number | string | string[];
  valueType: string;
};

export type ScanDetailSupplementalEventRecord = {
  createdAt?: string;
  eventType: string;
  id?: string;
  message?: string;
  metadataJson: unknown;
};

type FamilyPacketFindingRecord = {
  findingId?: unknown;
};

function getFamilyPacketFindingIds(events: ScanDetailSupplementalEventRecord[]) {
  const findingIds = new Set<string>();

  for (const event of events) {
    if (event.eventType !== "runtime.build_phase_diagnostic" || !event.metadataJson || typeof event.metadataJson !== "object") {
      continue;
    }

    const metadata = event.metadataJson as Record<string, unknown>;
    if (metadata.phase !== "finding_family_packets" || !Array.isArray(metadata.packets)) {
      continue;
    }

    for (const packet of metadata.packets) {
      if (!packet || typeof packet !== "object") {
        continue;
      }

      const supportedUnifiedFindings = Array.isArray((packet as Record<string, unknown>).supportedUnifiedFindings)
        ? ((packet as Record<string, unknown>).supportedUnifiedFindings as FamilyPacketFindingRecord[])
        : [];

      for (const finding of supportedUnifiedFindings) {
        if (typeof finding.findingId === "string" && finding.findingId.trim().length > 0) {
          findingIds.add(finding.findingId);
        }
      }
    }
  }

  return findingIds;
}

function shouldSuppressWeakPrivacyContactMissingSignal(primaryPolicyEnrichment: Record<string, unknown> | null) {
  if (!primaryPolicyEnrichment) {
    return false;
  }

  const semanticConfidence =
    typeof primaryPolicyEnrichment.policy_semantic_confidence === "number"
      ? primaryPolicyEnrichment.policy_semantic_confidence
      : typeof primaryPolicyEnrichment.policySemanticConfidence === "number"
        ? primaryPolicyEnrichment.policySemanticConfidence
        : null;
  const dsarConfidence =
    typeof primaryPolicyEnrichment.policy_dsar_confidence === "number"
      ? primaryPolicyEnrichment.policy_dsar_confidence
      : typeof primaryPolicyEnrichment.policyDsarConfidence === "number"
        ? primaryPolicyEnrichment.policyDsarConfidence
        : null;
  const snippetCount =
    typeof primaryPolicyEnrichment.policy_snippet_count === "number"
      ? primaryPolicyEnrichment.policy_snippet_count
      : typeof primaryPolicyEnrichment.policySnippetCount === "number"
        ? primaryPolicyEnrichment.policySnippetCount
        : null;
  const noticeContactPresent =
    typeof primaryPolicyEnrichment.policy_notice_contact_present === "boolean"
      ? primaryPolicyEnrichment.policy_notice_contact_present
      : typeof primaryPolicyEnrichment.policyNoticeContactPresent === "boolean"
        ? primaryPolicyEnrichment.policyNoticeContactPresent
        : null;

  return (
    noticeContactPresent === null &&
    (semanticConfidence === null || semanticConfidence < 0.7) &&
    (dsarConfidence === null || dsarConfidence < 0.6) &&
    (snippetCount === null || snippetCount <= 3)
  );
}

export function deriveSupplementalSnapshotSignals(input: {
  existingSignals: Array<Pick<ScanDetailSupplementalSignalRecord, "key">>;
  events: ScanDetailSupplementalEventRecord[];
  primaryPolicyEnrichment: Record<string, unknown> | null;
  snapshot: Record<string, unknown> | null;
}): ScanDetailSupplementalSignalRecord[] {
  if (!input.snapshot) {
    return [];
  }

  const seenKeys = new Set(input.existingSignals.map((signal) => signal.key));
  const snapshot = input.snapshot;
  const supplementalSignals: Array<{
    category: "privacy" | "accessibility";
    key: string;
    label: string;
    value: true;
  }> = [];

  const pushBoolean = (category: "privacy" | "accessibility", key: string, label: string, value: boolean) => {
    if (!value || seenKeys.has(key)) {
      return;
    }

    supplementalSignals.push({
      category,
      key,
      label,
      value: true
    });
  };

  const childrenAudienceLikely = snapshot.children_audience_likely === true;
  const kidDirectedContentDetected = snapshot.kid_directed_content_detected === true;
  const privacyPolicyPresent = snapshot.privacy_policy_present === true;
  const privacyContactChannelType =
    typeof snapshot.privacy_contact_channel_type === "string" ? snapshot.privacy_contact_channel_type : null;
  const consentMechanismType =
    typeof snapshot.consent_mechanism_type === "string" ? snapshot.consent_mechanism_type : null;
  const cookieBannerPresent = snapshot.cookie_banner_present === true;
  const cmpVendorName = typeof snapshot.cmp_vendor_name === "string" ? snapshot.cmp_vendor_name : null;
  const consentInteractionModel =
    typeof snapshot.consent_interaction_model === "string" ? snapshot.consent_interaction_model : null;
  const doNotSellLinkPresent = snapshot.do_not_sell_link_present === true;
  const retargetingPixelDetected = snapshot.retargeting_pixel_detected === true;
  const familyPacketFindingIds = getFamilyPacketFindingIds(input.events);
  const accessibilitySupportPresent =
    familyPacketFindingIds.has("accessibility_support_path_present") ||
    seenKeys.has("accessibility.accessibility_contact_method_present");
  const privacyContactPresent =
    familyPacketFindingIds.has("privacy_contact_path_present") ||
    seenKeys.has("privacy.privacy_contact_path_present");
  const weakPrivacyContactMissingSignal = shouldSuppressWeakPrivacyContactMissingSignal(input.primaryPolicyEnrichment);

  pushBoolean(
    "privacy",
    "privacy.children_privacy_context_without_supporting_disclosure",
    "Child-directed context without supporting privacy disclosure",
    (childrenAudienceLikely || kidDirectedContentDetected) &&
      !privacyPolicyPresent &&
      privacyContactChannelType === "none"
  );
  pushBoolean(
    "privacy",
    "privacy.privacy_contact_channel_missing",
    "Privacy contact path missing",
    privacyContactChannelType === "none" && !privacyContactPresent && !weakPrivacyContactMissingSignal
  );
  pushBoolean(
    "privacy",
    "privacy.consent_surface_missing",
    "Consent surface missing",
    consentMechanismType === "none" &&
      !cookieBannerPresent &&
      !cmpVendorName &&
      (!consentInteractionModel || consentInteractionModel === "none")
  );
  pushBoolean(
    "privacy",
    "privacy.sale_sharing_controls_missing",
    "Sale/sharing controls missing",
    !doNotSellLinkPresent && retargetingPixelDetected
  );
  pushBoolean(
    "accessibility",
    "accessibility.accessibility_support_path_missing",
    "Accessibility support path missing",
    snapshot.accessibility_contact_method_present === false && !accessibilitySupportPresent
  );

  return supplementalSignals.map((signal) => {
    const taxonomy = mapSignalKeyToTaxonomy({
      category: signal.category,
      key: signal.key,
      label: signal.label
    });

    return {
      category: signal.category,
      primaryCategory: taxonomy.primaryCategory,
      primaryCategoryDescription: getPrimaryCategoryDescription(taxonomy.primaryCategory),
      primaryCategoryLabel: getPrimaryCategoryLabel(taxonomy.primaryCategory),
      key: signal.key,
      label: signal.label,
      subcategory: taxonomy.subcategory ?? null,
      value: signal.value,
      valueType: "boolean"
    } satisfies ScanDetailSupplementalSignalRecord;
  });
}
