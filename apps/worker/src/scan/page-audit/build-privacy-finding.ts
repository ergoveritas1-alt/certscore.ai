import type { FindingSeverity } from "@website-signal-risk-scanner/shared";
import type { DerivedFindingRecord } from "../types/finding";
import type { CookieSignals } from "./detect-cookie-signals";
import type { NormalizedTracker } from "./normalize-trackers";

function getSeverityWeight(severity: FindingSeverity) {
  if (severity === "high") {
    return 10;
  }
  if (severity === "medium") {
    return 5;
  }
  if (severity === "low") {
    return 2;
  }
  return 0;
}

function createPrivacyFinding(input: {
  description: string;
  evidence: Record<string, unknown>;
  remediationBusiness: string;
  remediationTechnical: string;
  ruleKey: string;
  scanId: string;
  scanPageId: string;
  severity: FindingSeverity;
  subtype: "tracker" | "cookie_banner" | "consent_controls" | "consent_behavior";
  title: string;
}): DerivedFindingRecord {
  return {
    scan_id: input.scanId,
    scan_page_id: input.scanPageId,
    category: "privacy",
    subtype: input.subtype,
    rule_key: input.ruleKey,
    title: input.title,
    description: input.description,
    severity: input.severity,
    weight: getSeverityWeight(input.severity),
    status: "open",
    evidence_json: input.evidence,
    remediation_business: input.remediationBusiness,
    remediation_technical: input.remediationTechnical
  };
}

export function buildTrackerFinding(input: {
  pageUrl: string;
  scanId: string;
  scanPageId: string;
  tracker: NormalizedTracker;
}): DerivedFindingRecord {
  return createPrivacyFinding({
    scanId: input.scanId,
    scanPageId: input.scanPageId,
    subtype: "tracker",
    ruleKey: `privacy.tracker.${input.tracker.key}`,
    title: `${input.tracker.name} observed`,
    description: `${input.tracker.name} requests were observed during the initial page load. This is informational only and may indicate analytics or advertising technology is active on the page.`,
    severity: input.tracker.severity,
    evidence: {
      page_url: input.pageUrl,
      tracker_key: input.tracker.key,
      tracker_name: input.tracker.name,
      first_seen_hostname: input.tracker.firstSeenHostname,
      matched_count: input.tracker.matchedCount
    },
    remediationBusiness: "Confirm whether this tracker is necessary for the page experience and whether it aligns with your cookie and privacy disclosures.",
    remediationTechnical: "Review the matched tracker integration, document its purpose, and verify it is loaded according to your intended consent and privacy flow."
  });
}

export function buildBannerMissingWithTrackersFinding(input: {
  cookieSignals: CookieSignals;
  pageUrl: string;
  scanId: string;
  scanPageId: string;
  trackers: NormalizedTracker[];
}): DerivedFindingRecord {
  return createPrivacyFinding({
    scanId: input.scanId,
    scanPageId: input.scanPageId,
    subtype: "cookie_banner",
    ruleKey: "privacy.cookie.banner_missing_with_trackers",
    title: "Trackers observed without obvious consent UI",
    description:
      "Tracker requests were observed during the initial page load, but no obvious cookie or consent banner was detected.",
    severity: "high",
    evidence: {
      page_url: input.pageUrl,
      tracker_keys: input.trackers.map((tracker) => tracker.key),
      matched_selectors: input.cookieSignals.matchedSelectors
    },
    remediationBusiness: "Review whether visitors are given a clear consent choice before non-essential trackers load.",
    remediationTechnical: "Audit your tag loading conditions and confirm the consent banner is rendered consistently before non-essential tracking scripts fire."
  });
}

export function buildRejectControlMissingFinding(input: {
  cookieSignals: CookieSignals;
  pageUrl: string;
  scanId: string;
  scanPageId: string;
}): DerivedFindingRecord {
  return createPrivacyFinding({
    scanId: input.scanId,
    scanPageId: input.scanPageId,
    subtype: "consent_controls",
    ruleKey: "privacy.cookie.reject_control_missing",
    title: "Consent UI may lack a visible reject option",
    description:
      "A cookie or consent banner was detected, but no obvious reject or decline control was observed in the initial interface.",
    severity: "medium",
    evidence: {
      page_url: input.pageUrl,
      matched_selectors: input.cookieSignals.matchedSelectors,
      accept_present: input.cookieSignals.acceptPresent,
      preferences_present: input.cookieSignals.preferencesPresent
    },
    remediationBusiness: "Review whether visitors can decline non-essential tracking as clearly as they can accept it.",
    remediationTechnical: "Verify the consent component exposes a visible reject or decline control on the initial banner or in an immediately accessible preferences flow."
  });
}

export function buildTrackersObservedBeforeConsentFinding(input: {
  cookieSignals: CookieSignals;
  pageUrl: string;
  scanId: string;
  scanPageId: string;
  trackers: NormalizedTracker[];
}): DerivedFindingRecord {
  return createPrivacyFinding({
    scanId: input.scanId,
    scanPageId: input.scanPageId,
    subtype: "consent_behavior",
    ruleKey: "privacy.cookie.trackers_observed_before_consent",
    title: "Trackers observed before any consent interaction",
    description:
      "Tracker requests were observed during the initial page load while an apparent consent banner was present.",
    severity: "medium",
    evidence: {
      page_url: input.pageUrl,
      tracker_keys: input.trackers.map((tracker) => tracker.key),
      matched_selectors: input.cookieSignals.matchedSelectors
    },
    remediationBusiness: "Confirm whether non-essential tracking is deferred until a visitor gives the intended consent signal.",
    remediationTechnical: "Review your consent manager or tag manager conditions to ensure non-essential trackers do not execute during the initial load before consent is recorded."
  });
}
