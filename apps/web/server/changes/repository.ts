"use server";

import { query } from "@website-signal-risk-scanner/db";
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
  try {
    const result = await query<OrganizationChangeEventRow>(
      `select event_id, scan_id_current, domain_id, event_type, field_name, old_value_text, new_value_text, severity, event_group, event_timestamp
         from compliance_change_events
        where organization_id = $1
        order by event_timestamp desc
        limit $2`,
      [input.organizationId, input.limit],
      { readOnly: true }
    );

    return {
      events: result.rows,
      missingTable: false
    };
  } catch (error) {
    const queryError = error instanceof Error ? { message: error.message } : { message: "Unknown database error." };

    if (isMissingComplianceChangeEventsTable(queryError)) {
      return {
        events: [],
        missingTable: true
      };
    }

    throw new Error(`Failed to load organization changes: ${queryError.message}`);
  }
}

export async function loadLegacyOrganizationChangeEvents(input: {
  limit: number;
  organizationId: string;
}): Promise<LegacyOrganizationChangeEventRow[]> {
  try {
    const result = await query<LegacyOrganizationChangeEventRow>(
      `select id, scan_id, domain_id, event_type, message, metadata_json, created_at
         from scan_events
        where organization_id = $1
          and event_type = any($2::text[])
        order by created_at desc
        limit $3`,
      [input.organizationId, [...LEGACY_CHANGE_EVENT_TYPES], input.limit],
      { readOnly: true }
    );

    return result.rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load organization changes: ${message}`);
  }
}

export async function loadOrganizationChangeDomains(input: {
  domainIds: string[];
  organizationId: string;
}): Promise<OrganizationChangeDomainRow[]> {
  if (!input.domainIds.length) {
    return [];
  }

  try {
    const result = await query<OrganizationChangeDomainRow>(
      `select id, hostname
         from domains
        where organization_id = $1
          and id = any($2::uuid[])`,
      [input.organizationId, input.domainIds],
      { readOnly: true }
    );

    return result.rows;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown database error.";
    throw new Error(`Failed to load change event domains: ${message}`);
  }
}
