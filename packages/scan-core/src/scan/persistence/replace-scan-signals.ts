import { createAdminClient } from "@website-signal-risk-scanner/db";

export type PersistedSignalInsert = {
  category: string;
  domain_id: string;
  organization_id: string | null;
  scan_id: string;
  signal_key: string;
  signal_label: string;
  signal_value_json: boolean | number | string | string[];
  value_type: "boolean" | "number" | "text" | "string_array";
};

export async function replaceScanSignals(input: { scanId: string; signals: PersistedSignalInsert[] }) {
  const supabase = createAdminClient();
  const { error: deleteError } = await supabase.from("scan_signals").delete().eq("scan_id", input.scanId);

  if (deleteError) {
    throw new Error(`Failed to clear scan signals: ${deleteError.message}`);
  }

  if (input.signals.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from("scan_signals").insert(input.signals);

  if (insertError) {
    throw new Error(`Failed to persist scan signals: ${insertError.message}`);
  }
}
