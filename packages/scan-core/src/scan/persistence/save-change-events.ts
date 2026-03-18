import { createAdminClient } from "@website-signal-risk-scanner/db";
import type { ComplianceChangeEvent } from "@website-signal-risk-scanner/shared";
import { camelToSnakeRecord } from "../snapshot/case";

export async function saveComplianceChangeEvents(input: {
  domainId: string;
  events: ComplianceChangeEvent[];
  organizationId: string;
  scanIdCurrent: string;
}) {
  const supabase = createAdminClient();
  const { error: deleteError } = await supabase
    .from("compliance_change_events")
    .delete()
    .eq("scan_id_current", input.scanIdCurrent);

  if (deleteError) {
    throw new Error(`Failed to clear existing compliance change events: ${deleteError.message}`);
  }

  if (input.events.length === 0) {
    return;
  }

  const rows = input.events.map((event) => ({
    ...camelToSnakeRecord(event),
    organization_id: input.organizationId,
    domain_id: input.domainId
  }));
  const { error } = await supabase.from("compliance_change_events").insert(rows);

  if (error) {
    throw new Error(`Failed to persist compliance change events: ${error.message}`);
  }
}
