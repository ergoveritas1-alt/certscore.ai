import type { ComplianceChangeEvent, ScanSnapshot, ScanTrackerVendor } from "@website-signal-risk-scanner/shared";

type SnapshotDiffSummary = {
  addedCount: number;
  changedCount: number;
  comparedToScanId: string | null;
  isBaseline: boolean;
  removedCount: number;
  trackerDetectedCount: number;
  trackerRemovedCount: number;
};

type SnapshotDiffResult = {
  events: ComplianceChangeEvent[];
  summary: SnapshotDiffSummary;
};

type DiffInput = {
  currentSnapshot: ScanSnapshot;
  currentTrackers: ScanTrackerVendor[];
  domain: string;
  eventTimestamp: string;
  previousScanId: string | null;
  previousSnapshot: ScanSnapshot | null;
  previousTrackers: ScanTrackerVendor[];
};

const EXCLUDED_FIELDS = new Set(["scanId", "organizationId", "domainId", "domain", "scanTimestamp"]);
const SEMANTIC_ONLY_FIELDS = new Set([
  "requestDomainSetChanged",
  "scriptDomainSetChanged",
  "securityHeaderPostureChanged",
  "infrastructureChangeDetected"
]);

function stringifyValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return String(value);
}

function isTruthyValue(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return Boolean(value);
}

function severityForField(fieldName: string, oldValue: unknown, newValue: unknown): ComplianceChangeEvent["severity"] {
  if (/preconsent|sessionReplay|securityTxt|doNotSell|dsar|ageGate/i.test(fieldName)) {
    return "high";
  }

  if (/cookieBanner|privacyPolicy|rejectAll|subprocessor|mixedContent|wcag/i.test(fieldName)) {
    return "medium";
  }

  if (typeof oldValue === "number" || typeof newValue === "number") {
    return "low";
  }

  return "info";
}

function groupForField(fieldName: string): ComplianceChangeEvent["eventGroup"] {
  if (/Policy|mentions|legal|dsar|doNotSell|subprocessor/i.test(fieldName)) {
    return "policy";
  }

  if (/cookie|consent|cmp|reject|accept|preconsent|darkPattern/i.test(fieldName)) {
    return "consent";
  }

  if (/tracker|adtech|tagManager/i.test(fieldName)) {
    return "tracker";
  }

  if (/form|emailInput|phoneInput|addressInput|paymentCard|ageGate/i.test(fieldName)) {
    return "forms";
  }

  if (/wcag|accessibility/i.test(fieldName)) {
    return "accessibility";
  }

  if (/security|https|hsts|mixedContent|transparency/i.test(fieldName)) {
    return "security";
  }

  if (/score/i.test(fieldName)) {
    return "score";
  }

  return "changed";
}

function fieldEventType(oldValue: unknown, newValue: unknown): ComplianceChangeEvent["eventType"] {
  const oldActive = isTruthyValue(oldValue);
  const newActive = isTruthyValue(newValue);

  if (!oldActive && newActive) {
    return "field_added";
  }

  if (oldActive && !newActive) {
    return "field_removed";
  }

  return "field_changed";
}

function buildEvent(input: {
  confidence?: number;
  currentSnapshot: ScanSnapshot;
  domain: string;
  eventGroup: ComplianceChangeEvent["eventGroup"];
  eventTimestamp: string;
  eventType: ComplianceChangeEvent["eventType"];
  fieldName: string | null;
  newValue: unknown;
  oldValue: unknown;
  previousScanId: string | null;
  severity: ComplianceChangeEvent["severity"];
}) {
  return {
    domain: input.domain,
    scanIdCurrent: input.currentSnapshot.scanId,
    scanIdPrevious: input.previousScanId,
    eventTimestamp: input.eventTimestamp,
    eventType: input.eventType,
    fieldName: input.fieldName,
    oldValueText: stringifyValue(input.oldValue),
    newValueText: stringifyValue(input.newValue),
    severity: input.severity,
    confidence: input.confidence ?? 0.88,
    eventGroup: input.eventGroup
  } satisfies ComplianceChangeEvent;
}

export function diffSnapshots(input: DiffInput): SnapshotDiffResult {
  if (!input.previousSnapshot || !input.previousScanId) {
    return {
      summary: {
        comparedToScanId: null,
        isBaseline: true,
        addedCount: 0,
        removedCount: 0,
        changedCount: 0,
        trackerDetectedCount: 0,
        trackerRemovedCount: 0
      },
      events: []
    };
  }

  const events: ComplianceChangeEvent[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let changedCount = 0;

  const currentEntries = Object.entries(input.currentSnapshot) as Array<[keyof ScanSnapshot, ScanSnapshot[keyof ScanSnapshot]]>;

  for (const [fieldName, newValue] of currentEntries) {
    if (EXCLUDED_FIELDS.has(fieldName) || SEMANTIC_ONLY_FIELDS.has(fieldName)) {
      continue;
    }

    const oldValue = input.previousSnapshot[fieldName];

    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) {
      continue;
    }

    const eventType = fieldEventType(oldValue, newValue);
    const event = buildEvent({
      currentSnapshot: input.currentSnapshot,
      domain: input.domain,
      eventGroup: groupForField(fieldName),
      eventTimestamp: input.eventTimestamp,
      eventType,
      fieldName,
      newValue,
      oldValue,
      previousScanId: input.previousScanId,
      severity: severityForField(fieldName, oldValue, newValue)
    });
    events.push(event);

    if (eventType === "field_added") {
      addedCount += 1;
    } else if (eventType === "field_removed") {
      removedCount += 1;
    } else {
      changedCount += 1;
    }
  }

  const previousTrackerNames = new Set(input.previousTrackers.map((tracker) => tracker.vendorName));
  const currentTrackerNames = new Set(input.currentTrackers.map((tracker) => tracker.vendorName));
  let trackerDetectedCount = 0;
  let trackerRemovedCount = 0;

  for (const tracker of input.currentTrackers) {
    if (previousTrackerNames.has(tracker.vendorName)) {
      continue;
    }

    const eventType =
      tracker.vendorCategory === "session_replay" ? "session_replay_tracker_added" : "tracker_vendor_added";
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "tracker",
        eventTimestamp: input.eventTimestamp,
        eventType,
        fieldName: "trackerVendors",
        oldValue: null,
        newValue: tracker.vendorName,
        previousScanId: input.previousScanId,
        severity: tracker.vendorCategory === "session_replay" ? "high" : "medium",
        confidence: tracker.confidence
      })
    );
    trackerDetectedCount += 1;
  }

  for (const tracker of input.previousTrackers) {
    if (currentTrackerNames.has(tracker.vendorName)) {
      continue;
    }

    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "tracker",
        eventTimestamp: input.eventTimestamp,
        eventType: "tracker_vendor_removed",
        fieldName: "trackerVendors",
        oldValue: tracker.vendorName,
        newValue: null,
        previousScanId: input.previousScanId,
        severity: "medium",
        confidence: tracker.confidence
      })
    );
    trackerRemovedCount += 1;
  }

  if (!input.previousSnapshot.privacyPolicyPresent && input.currentSnapshot.privacyPolicyPresent) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "policy",
        eventTimestamp: input.eventTimestamp,
        eventType: "privacy_policy_added",
        fieldName: "privacyPolicyPresent",
        oldValue: false,
        newValue: true,
        previousScanId: input.previousScanId,
        severity: "medium"
      })
    );
  }

  if (input.previousSnapshot.privacyPolicyPresent && !input.currentSnapshot.privacyPolicyPresent) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "policy",
        eventTimestamp: input.eventTimestamp,
        eventType: "privacy_policy_removed",
        fieldName: "privacyPolicyPresent",
        oldValue: true,
        newValue: false,
        previousScanId: input.previousScanId,
        severity: "high"
      })
    );
  }

  if (
    input.previousSnapshot.privacyPolicyHash &&
    input.currentSnapshot.privacyPolicyHash &&
    input.previousSnapshot.privacyPolicyHash !== input.currentSnapshot.privacyPolicyHash
  ) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "policy",
        eventTimestamp: input.eventTimestamp,
        eventType: "privacy_policy_hash_changed",
        fieldName: "privacyPolicyHash",
        oldValue: input.previousSnapshot.privacyPolicyHash,
        newValue: input.currentSnapshot.privacyPolicyHash,
        previousScanId: input.previousScanId,
        severity: "medium"
      })
    );
  }

  if (!input.previousSnapshot.cookieBannerPresent && input.currentSnapshot.cookieBannerPresent) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "consent",
        eventTimestamp: input.eventTimestamp,
        eventType: "cookie_banner_added",
        fieldName: "cookieBannerPresent",
        oldValue: false,
        newValue: true,
        previousScanId: input.previousScanId,
        severity: "medium"
      })
    );
  }

  if (input.previousSnapshot.cookieBannerPresent && !input.currentSnapshot.cookieBannerPresent) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "consent",
        eventTimestamp: input.eventTimestamp,
        eventType: "cookie_banner_removed",
        fieldName: "cookieBannerPresent",
        oldValue: true,
        newValue: false,
        previousScanId: input.previousScanId,
        severity: "high"
      })
    );
  }

  if (input.previousSnapshot.cmpVendorName !== input.currentSnapshot.cmpVendorName) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "consent",
        eventTimestamp: input.eventTimestamp,
        eventType: "cmp_vendor_changed",
        fieldName: "cmpVendorName",
        oldValue: input.previousSnapshot.cmpVendorName,
        newValue: input.currentSnapshot.cmpVendorName,
        previousScanId: input.previousScanId,
        severity: "medium"
      })
    );
  }

  if (!input.previousSnapshot.rejectAllPresent && input.currentSnapshot.rejectAllPresent) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "consent",
        eventTimestamp: input.eventTimestamp,
        eventType: "reject_all_added",
        fieldName: "rejectAllPresent",
        oldValue: false,
        newValue: true,
        previousScanId: input.previousScanId,
        severity: "low"
      })
    );
  }

  if (
    input.previousSnapshot.wcagMissingAltCount !== input.currentSnapshot.wcagMissingAltCount &&
    input.currentSnapshot.wcagMissingAltCount !== input.previousSnapshot.wcagMissingAltCount
  ) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "accessibility",
        eventTimestamp: input.eventTimestamp,
        eventType:
          input.currentSnapshot.wcagMissingAltCount > input.previousSnapshot.wcagMissingAltCount
            ? "wcag_missing_alt_count_increased"
            : "wcag_missing_alt_count_decreased",
        fieldName: "wcagMissingAltCount",
        oldValue: input.previousSnapshot.wcagMissingAltCount,
        newValue: input.currentSnapshot.wcagMissingAltCount,
        previousScanId: input.previousScanId,
        severity: "medium"
      })
    );
  }

  if (!input.previousSnapshot.accessibilityWidgetPresent && input.currentSnapshot.accessibilityWidgetPresent) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "accessibility",
        eventTimestamp: input.eventTimestamp,
        eventType: "accessibility_widget_added",
        fieldName: "accessibilityWidgetPresent",
        oldValue: false,
        newValue: true,
        previousScanId: input.previousScanId,
        severity: "low"
      })
    );
  }

  if (!input.previousSnapshot.ageGatePresent && input.currentSnapshot.ageGatePresent) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "forms",
        eventTimestamp: input.eventTimestamp,
        eventType: "age_gate_added",
        fieldName: "ageGatePresent",
        oldValue: false,
        newValue: true,
        previousScanId: input.previousScanId,
        severity: "medium"
      })
    );
  }

  if (!input.previousSnapshot.doNotSellLinkPresent && input.currentSnapshot.doNotSellLinkPresent) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "policy",
        eventTimestamp: input.eventTimestamp,
        eventType: "do_not_sell_link_added",
        fieldName: "doNotSellLinkPresent",
        oldValue: false,
        newValue: true,
        previousScanId: input.previousScanId,
        severity: "medium"
      })
    );
  }

  if (!input.previousSnapshot.dsarRequestMechanismPresent && input.currentSnapshot.dsarRequestMechanismPresent) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "policy",
        eventTimestamp: input.eventTimestamp,
        eventType: "dsar_mechanism_added",
        fieldName: "dsarRequestMechanismPresent",
        oldValue: false,
        newValue: true,
        previousScanId: input.previousScanId,
        severity: "medium"
      })
    );
  }

  if (!input.previousSnapshot.subprocessorListPresent && input.currentSnapshot.subprocessorListPresent) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "policy",
        eventTimestamp: input.eventTimestamp,
        eventType: "subprocessor_list_added",
        fieldName: "subprocessorListPresent",
        oldValue: false,
        newValue: true,
        previousScanId: input.previousScanId,
        severity: "medium"
      })
    );
  }

  if (!input.previousSnapshot.securityTxtPresent && input.currentSnapshot.securityTxtPresent) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "security",
        eventTimestamp: input.eventTimestamp,
        eventType: "security_txt_added",
        fieldName: "securityTxtPresent",
        oldValue: false,
        newValue: true,
        previousScanId: input.previousScanId,
        severity: "low"
      })
    );
  }

  if (input.previousSnapshot.requestDomainSetChanged !== true && input.currentSnapshot.requestDomainSetChanged === true) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "security",
        eventTimestamp: input.eventTimestamp,
        eventType: "request_domain_set_changed",
        fieldName: "requestDomainSetChanged",
        oldValue: input.previousSnapshot.requestDomainSetChanged,
        newValue: input.currentSnapshot.requestDomainSetChanged,
        previousScanId: input.previousScanId,
        severity: "medium"
      })
    );
  }
  if (input.previousSnapshot.requestDomainSetChanged === true && input.currentSnapshot.requestDomainSetChanged !== true) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "security",
        eventTimestamp: input.eventTimestamp,
        eventType: "request_domain_set_resolved",
        fieldName: "requestDomainSetChanged",
        oldValue: input.previousSnapshot.requestDomainSetChanged,
        newValue: input.currentSnapshot.requestDomainSetChanged,
        previousScanId: input.previousScanId,
        severity: "info"
      })
    );
  }

  if (input.previousSnapshot.scriptDomainSetChanged !== true && input.currentSnapshot.scriptDomainSetChanged === true) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "security",
        eventTimestamp: input.eventTimestamp,
        eventType: "script_domain_set_changed",
        fieldName: "scriptDomainSetChanged",
        oldValue: input.previousSnapshot.scriptDomainSetChanged,
        newValue: input.currentSnapshot.scriptDomainSetChanged,
        previousScanId: input.previousScanId,
        severity: "medium"
      })
    );
  }
  if (input.previousSnapshot.scriptDomainSetChanged === true && input.currentSnapshot.scriptDomainSetChanged !== true) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "security",
        eventTimestamp: input.eventTimestamp,
        eventType: "script_domain_set_resolved",
        fieldName: "scriptDomainSetChanged",
        oldValue: input.previousSnapshot.scriptDomainSetChanged,
        newValue: input.currentSnapshot.scriptDomainSetChanged,
        previousScanId: input.previousScanId,
        severity: "info"
      })
    );
  }

  if (input.previousSnapshot.securityHeaderPostureChanged !== true && input.currentSnapshot.securityHeaderPostureChanged === true) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "security",
        eventTimestamp: input.eventTimestamp,
        eventType: "security_header_posture_changed",
        fieldName: "securityHeaderPostureChanged",
        oldValue: input.previousSnapshot.securityHeaderPostureChanged,
        newValue: input.currentSnapshot.securityHeaderPostureChanged,
        previousScanId: input.previousScanId,
        severity: "medium"
      })
    );
  }
  if (input.previousSnapshot.securityHeaderPostureChanged === true && input.currentSnapshot.securityHeaderPostureChanged !== true) {
    events.push(
      buildEvent({
        currentSnapshot: input.currentSnapshot,
        domain: input.domain,
        eventGroup: "security",
        eventTimestamp: input.eventTimestamp,
        eventType: "security_header_posture_resolved",
        fieldName: "securityHeaderPostureChanged",
        oldValue: input.previousSnapshot.securityHeaderPostureChanged,
        newValue: input.currentSnapshot.securityHeaderPostureChanged,
        previousScanId: input.previousScanId,
        severity: "info"
      })
    );
  }

  return {
    summary: {
      comparedToScanId: input.previousScanId,
      isBaseline: false,
      addedCount,
      removedCount,
      changedCount,
      trackerDetectedCount,
      trackerRemovedCount
    },
    events
  };
}
