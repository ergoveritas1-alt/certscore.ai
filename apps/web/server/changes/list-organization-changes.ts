"use server";

import {
  loadLegacyOrganizationChangeEvents,
  loadOrganizationChangeDomains,
  loadOrganizationComplianceChangeEvents,
  type LegacyOrganizationChangeEventRow,
  type OrganizationChangeDomainRow,
  type OrganizationChangeEventRow
} from "./repository";

export type OrganizationChangeItem = {
  id: string;
  domainHostname: string | null;
  domainId: string | null;
  scanId: string | null;
  eventType: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

function formatFieldLabel(fieldName: string | null) {
  if (!fieldName) {
    return "Field";
  }

  return fieldName
    .replace(/([A-Z])/g, " $1")
    .replace(/\./g, " ")
    .replace(/^./, (value) => value.toUpperCase());
}

function formatChangeMessage(event: OrganizationChangeEventRow) {
  switch (event.event_type) {
    case "privacy_policy_added":
      return "Privacy policy detected.";
    case "privacy_policy_removed":
      return "Privacy policy no longer detected.";
    case "privacy_policy_hash_changed":
      return "Privacy policy content changed.";
    case "cookie_banner_added":
      return "Cookie banner detected.";
    case "cookie_banner_removed":
      return "Cookie banner no longer detected.";
    case "cmp_vendor_changed":
      return `CMP vendor changed to ${event.new_value_text ?? "unknown"}.`;
    case "reject_all_added":
      return "Reject-all consent control detected.";
    case "tracker_vendor_added":
      return `Tracker vendor added: ${event.new_value_text ?? "unknown"}.`;
    case "tracker_vendor_removed":
      return `Tracker vendor removed: ${event.old_value_text ?? "unknown"}.`;
    case "session_replay_tracker_added":
      return `Session replay vendor detected: ${event.new_value_text ?? "unknown"}.`;
    case "wcag_missing_alt_count_increased":
      return "Missing alt text count increased.";
    case "wcag_missing_alt_count_decreased":
      return "Missing alt text count decreased.";
    case "accessibility_widget_added":
      return "Accessibility widget detected.";
    case "age_gate_added":
      return "Age gate detected.";
    case "do_not_sell_link_added":
      return "Do-not-sell link detected.";
    case "dsar_mechanism_added":
      return "DSAR request mechanism detected.";
    case "subprocessor_list_added":
      return "Subprocessor list detected.";
    case "security_txt_added":
      return "security.txt detected.";
    case "field_added":
      return `${formatFieldLabel(event.field_name)} added.`;
    case "field_removed":
      return `${formatFieldLabel(event.field_name)} removed.`;
    default:
      return `${formatFieldLabel(event.field_name)} changed.`;
  }
}

async function listLegacyOrganizationChanges(organizationId: string, limit: number) {
  const events = await loadLegacyOrganizationChangeEvents({
    limit,
    organizationId
  });
  const domainMap = await loadOrganizationChangeDomainMap(organizationId, events);

  return events.map((event) => ({
    id: event.id,
    domainHostname: event.domain_id ? domainMap.get(event.domain_id)?.hostname ?? null : null,
    domainId: event.domain_id,
    scanId: event.scan_id,
    eventType: event.event_type,
    message: event.message,
    metadata: event.metadata_json,
    createdAt: event.created_at
  }));
}

async function loadOrganizationChangeDomainMap(
  organizationId: string,
  events: Array<Pick<LegacyOrganizationChangeEventRow, "domain_id"> | Pick<OrganizationChangeEventRow, "domain_id">>
) {
  const domainIds = [...new Set(events.flatMap((event) => (event.domain_id ? [event.domain_id] : [])))];
  const domains = await loadOrganizationChangeDomains({
    domainIds,
    organizationId
  });

  return new Map<string, OrganizationChangeDomainRow>(domains.map((domain) => [domain.id, domain]));
}

export async function listOrganizationChanges(organizationId: string, limit = 30): Promise<OrganizationChangeItem[]> {
  const { events, missingTable } = await loadOrganizationComplianceChangeEvents({
    limit,
    organizationId
  });

  if (missingTable) {
    return listLegacyOrganizationChanges(organizationId, limit);
  }

  const domainMap = await loadOrganizationChangeDomainMap(organizationId, events);

  return events.map((event) => ({
    id: event.event_id,
    domainHostname: event.domain_id ? domainMap.get(event.domain_id)?.hostname ?? null : null,
    domainId: event.domain_id,
    scanId: event.scan_id_current,
    eventType: event.event_type,
    message: formatChangeMessage(event),
    metadata: {
      fieldName: event.field_name,
      oldValue: event.old_value_text,
      newValue: event.new_value_text,
      severity: event.severity,
      eventGroup: event.event_group
    },
    createdAt: event.event_timestamp
  }));
}
