import { createAdminClient } from "@website-signal-risk-scanner/db";
import type { DerivedSignalInsert } from "../signals/derive-scan-signals";

export type PersistedScanSignal = Pick<
  DerivedSignalInsert,
  "category" | "signal_key" | "signal_label" | "signal_value_json" | "value_type"
>;

export async function getScanSignals(scanId: string): Promise<PersistedScanSignal[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("scan_signals")
    .select("category, signal_key, signal_label, signal_value_json, value_type")
    .eq("scan_id", scanId)
    .order("signal_key", { ascending: true });

  if (error) {
    throw new Error(`Failed to load scan signals: ${error.message}`);
  }

  return (data ?? []) as PersistedScanSignal[];
}
