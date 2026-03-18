"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";
import { LEGACY_CHANGE_EVENT_TYPES, isMissingComplianceChangeEventsTable } from "./legacy-change-events";

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

type EventRow = {
  domain_id: string | null;
  event_group: string;
  event_id: string;
  event_timestamp: string;
  event_type: string;
  field_name: string | null;
  new_value_text: string | null;
  old_value_text: string | null;
  scan_id_current: string | null;
  severity: string;
};

type DomainRow = {
  hostname: string;
  id: string;
};

type LegacyEventRow = {
  created_at: string;
  domain_id: string | null;
  event_type: string;
  id: string;
  message: string;
  metadata_json: Record<string, unknown> | null;
  scan_id: string | null;
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

function formatChangeMessage(event: EventRow) {
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
  const supabase = createAdminClient();
  const { data: events, error } = await supabase
    .from("scan_events")
    .select("id, scan_id, domain_id, event_type, message, metadata_json, created_at")
    .eq("organization_id", organizationId)
    .in("event_type", [...LEGACY_CHANGE_EVENT_TYPES])
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load organization changes: ${error.message}`);
  }

  const domainIds = [...new Set(((events ?? []) as LegacyEventRow[]).flatMap((event) => (event.domain_id ? [event.domain_id] : [])))];
  let domainMap = new Map<string, DomainRow>();

  if (domainIds.length > 0) {
    const { data: domains } = await supabase
      .from("domains")
      .select("id, hostname")
      .eq("organization_id", organizationId)
      .in("id", domainIds);

    domainMap = new Map(((domains ?? []) as DomainRow[]).map((domain) => [domain.id, domain]));
  }

  return ((events ?? []) as LegacyEventRow[]).map((event) => ({
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

export async function listOrganizationChanges(organizationId: string, limit = 30): Promise<OrganizationChangeItem[]> {
  const supabase = createAdminClient();
  const { data: events, error } = await supabase
    .from("compliance_change_events")
    .select("event_id, scan_id_current, domain_id, event_type, field_name, old_value_text, new_value_text, severity, event_group, event_timestamp")
    .eq("organization_id", organizationId)
    .order("event_timestamp", { ascending: false })
    .limit(limit);

  if (error) {
    if (isMissingComplianceChangeEventsTable(error)) {
      return listLegacyOrganizationChanges(organizationId, limit);
    }

    throw new Error(`Failed to load organization changes: ${error.message}`);
  }

  const domainIds = [...new Set(((events ?? []) as EventRow[]).flatMap((event) => (event.domain_id ? [event.domain_id] : [])))];
  let domainMap = new Map<string, DomainRow>();

  if (domainIds.length > 0) {
    const { data: domains } = await supabase
      .from("domains")
      .select("id, hostname")
      .eq("organization_id", organizationId)
      .in("id", domainIds);

    domainMap = new Map(((domains ?? []) as DomainRow[]).map((domain) => [domain.id, domain]));
  }

  return ((events ?? []) as EventRow[]).map((event) => ({
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
