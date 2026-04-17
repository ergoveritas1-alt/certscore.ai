"use server";

import { createDatabaseClient } from "@website-signal-risk-scanner/db";
import { LEGACY_CHANGE_EVENT_TYPES, isMissingComplianceChangeEventsTable } from "./legacy-change-events";

export type OrganizationChangeEventRow = {
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

export type OrganizationChangeDomainRow = {
  hostname: string;
  id: string;
};

export type LegacyOrganizationChangeEventRow = {
  created_at: string;
  domain_id: string | null;
  event_type: string;
  id: string;
  message: string;
  metadata_json: Record<string, unknown> | null;
  scan_id: string | null;
};

export async function loadOrganizationComplianceChangeEvents(input: {
  limit: number;
  organizationId: string;
}): Promise<{
  events: OrganizationChangeEventRow[];
  missingTable: boolean;
}> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("compliance_change_events")
    .select("event_id, scan_id_current, domain_id, event_type, field_name, old_value_text, new_value_text, severity, event_group, event_timestamp")
    .eq("organization_id", input.organizationId)
    .order("event_timestamp", { ascending: false })
    .limit(input.limit);

  if (error) {
    if (isMissingComplianceChangeEventsTable(error)) {
      return {
        events: [],
        missingTable: true
      };
    }

    throw new Error(`Failed to load organization changes: ${error.message}`);
  }

  return {
    events: (data ?? []) as OrganizationChangeEventRow[],
    missingTable: false
  };
}

export async function loadLegacyOrganizationChangeEvents(input: {
  limit: number;
  organizationId: string;
}): Promise<LegacyOrganizationChangeEventRow[]> {
  const db = createDatabaseClient();
  const { data, error } = await db
    .from("scan_events")
    .select("id, scan_id, domain_id, event_type, message, metadata_json, created_at")
    .eq("organization_id", input.organizationId)
    .in("event_type", [...LEGACY_CHANGE_EVENT_TYPES])
    .order("created_at", { ascending: false })
    .limit(input.limit);

  if (error) {
    throw new Error(`Failed to load organization changes: ${error.message}`);
  }

  return (data ?? []) as LegacyOrganizationChangeEventRow[];
}

export async function loadOrganizationChangeDomains(input: {
  domainIds: string[];
  organizationId: string;
}): Promise<OrganizationChangeDomainRow[]> {
  if (!input.domainIds.length) {
    return [];
  }

  const db = createDatabaseClient();
  const { data, error } = await db
    .from("domains")
    .select("id, hostname")
    .eq("organization_id", input.organizationId)
    .in("id", input.domainIds);

  if (error) {
    throw new Error(`Failed to load change event domains: ${error.message}`);
  }

  return (data ?? []) as OrganizationChangeDomainRow[];
}
