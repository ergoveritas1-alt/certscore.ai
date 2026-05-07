import type { PreviewSampleFinding } from "@website-signal-risk-scanner/shared";

function getSnapshotBoolean(snapshot: Record<string, unknown>, key: string) {
  return snapshot[key] === true;
}

function getRecordBoolean(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return false;
  }

  return (record as Record<string, unknown>)[key] === true;
}

function getRecordNumber(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  const value = (record as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRecordStringArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function getRecordObjectArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    : [];
}

function hasStructuredPostRejectTrackingEvidence(runtimeArtifacts: Record<string, unknown> | null) {
  const suppressionChecks =
    runtimeArtifacts?.consent_reject_suppression_checks &&
    typeof runtimeArtifacts.consent_reject_suppression_checks === "object" &&
    !Array.isArray(runtimeArtifacts.consent_reject_suppression_checks)
      ? runtimeArtifacts.consent_reject_suppression_checks as Record<string, unknown>
      : null;
  const postRejectRequests = getRecordObjectArray(runtimeArtifacts, "consent_reject_post_reject_non_essential_requests");

  return (
    suppressionChecks?.non_essential_vendor_after_reject === true ||
    postRejectRequests.some((row) => {
      const vendor = typeof row.vendor === "string" ? row.vendor.trim() : "";
      const url = typeof row.url === "string" ? row.url : "";
      const category = typeof row.category === "string" ? row.category : "";
      return (
        vendor.length > 0 &&
        /^https?:\/\//i.test(url) &&
        /^(advertising|analytics|session_replay|marketing_automation|tag_manager)$/i.test(category)
      );
    })
  );
}

export function deriveConsentAuditFindings(
  snapshot: Record<string, unknown> | null,
  runtimeArtifacts: Record<string, unknown> | null
) {
  if (!getRecordBoolean(runtimeArtifacts, "consent_audit_completed")) {
    return [] as PreviewSampleFinding[];
  }

  const findings: PreviewSampleFinding[] = [];
  const rejectWorked = getRecordBoolean(runtimeArtifacts, "consent_reject_interaction_succeeded");
  const acceptWorked = getRecordBoolean(runtimeArtifacts, "consent_accept_interaction_succeeded");
  const rejectReducedTracking = runtimeArtifacts?.consent_reject_reduced_tracking;
  const rejectReducedThirdPartyCookies = runtimeArtifacts?.consent_reject_reduced_third_party_cookies;
  const baselineTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_baseline_tracker_vendor_names");
  const baselineTrackerEvidenceUrls = getRecordStringArray(runtimeArtifacts, "consent_baseline_tracker_evidence_urls");
  const postRejectTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_post_reject_tracker_vendor_names");
  const rejectPersistedTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_reject_persisted_tracker_vendor_names");
  const rejectNewTrackerVendors = getRecordStringArray(runtimeArtifacts, "consent_reject_new_tracker_vendor_names");
  const structuredPostRejectTrackingEvidence = hasStructuredPostRejectTrackingEvidence(runtimeArtifacts);

  if ((getRecordNumber(runtimeArtifacts, "consent_preconsent_violation_count") ?? 0) > 0) {
    findings.push({
      affectedPage: "Homepage",
      category: "privacy",
      severity: "high",
      title: "Trackers fired before consent interaction",
      description:
        baselineTrackerVendors.length > 0
          ? baselineTrackerEvidenceUrls.length > 0
            ? `The first page render triggered tracker vendors before consent interaction: ${baselineTrackerVendors.join(", ")}. Evidence URLs were captured for ${baselineTrackerEvidenceUrls.length} request${baselineTrackerEvidenceUrls.length === 1 ? "" : "s"}.`
            : `The first page render triggered tracker vendors before consent interaction: ${baselineTrackerVendors.join(", ")}.`
          : "The first page render triggered tracking activity before a consent interaction was completed."
    });
  }

  if (rejectWorked && (rejectReducedTracking === false || structuredPostRejectTrackingEvidence)) {
    findings.push({
      affectedPage: "Homepage",
      category: "privacy",
      severity: "high",
      title: "Reject interaction did not reduce tracking",
      description:
        rejectNewTrackerVendors.length > 0
          ? `The consent audit completed a reject interaction, but new tracker vendors still appeared after rejection: ${rejectNewTrackerVendors.join(", ")}.`
          : rejectPersistedTrackerVendors.length > 0
            ? `The consent audit completed a reject interaction, but these tracker vendors still remained after rejection: ${rejectPersistedTrackerVendors.join(", ")}.`
            : postRejectTrackerVendors.length > baselineTrackerVendors.length
              ? `The consent audit completed a reject interaction, but tracking vendors increased from ${baselineTrackerVendors.length} to ${postRejectTrackerVendors.length} after rejection.`
              : "The consent audit completed a reject interaction, but tracking activity still remained after rejection."
    });
  }

  if (rejectWorked && rejectReducedThirdPartyCookies === false) {
    const baselineCookieCount = getRecordNumber(runtimeArtifacts, "consent_baseline_third_party_cookie_count");
    const postRejectCookieCount = getRecordNumber(runtimeArtifacts, "consent_post_reject_third_party_cookie_count");

    findings.push({
      affectedPage: "Homepage",
      category: "privacy",
      severity: "medium",
      title: "Reject interaction did not reduce third-party cookies",
      description:
        baselineCookieCount !== null && postRejectCookieCount !== null
          ? `Third-party cookies changed from ${baselineCookieCount} before interaction to ${postRejectCookieCount} after reject, indicating reject did not suppress that cookie activity.`
          : "Third-party cookie activity was still present after the reject interaction completed."
    });
  }

  if (!getSnapshotBoolean(snapshot ?? {}, "cookie_banner_present") && rejectWorked) {
    findings.push({
      affectedPage: "Homepage",
      category: "privacy",
      severity: "medium",
      title: "Consent surface required deeper interaction sweep",
      description:
        "The initial homepage pass did not surface a banner clearly, but the consent interaction audit later found and used a working consent control."
    });
  }

  if (rejectWorked && acceptWorked === false) {
    findings.push({
      affectedPage: "Homepage",
      category: "privacy",
      severity: "low",
      title: "Accept flow was unavailable after reject in-session",
      description:
        "The audit could complete a reject interaction, but an accept path was not available afterward in the same session, limiting direct within-session comparison."
    });
  }

  return findings;
}

function getFindingTopicKey(finding: PreviewSampleFinding) {
  const haystack = `${finding.title} ${finding.description}`.toLowerCase();

  if (haystack.includes("before consent") || haystack.includes("pre-consent")) {
    return "preconsent_tracking";
  }

  if (haystack.includes("contradiction") || haystack.includes("conflicts with runtime behavior")) {
    return "policy_behavior_contradiction";
  }

  if (haystack.includes("reject interaction")) {
    return "reject_interaction";
  }

  if (haystack.includes("session replay")) {
    return "session_replay";
  }

  if (haystack.includes("advertising stack") || haystack.includes("tracker")) {
    return "tracker_stack";
  }

  if (haystack.includes("accessibility")) {
    return "accessibility";
  }

  return finding.title.toLowerCase();
}

export function dedupeHeadlineFindings(findings: PreviewSampleFinding[]) {
  const seen = new Set<string>();
  const deduped: PreviewSampleFinding[] = [];

  for (const finding of findings) {
    const key = `${finding.category}:${getFindingTopicKey(finding)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(finding);
  }

  return deduped;
}
