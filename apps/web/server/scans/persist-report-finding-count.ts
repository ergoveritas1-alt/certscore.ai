"use server";

import { createAdminClient } from "@website-signal-risk-scanner/db";

export async function persistReportFindingCount(input: {
  count: number;
  scanId: string;
}) {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("scan_snapshots")
      .update({
        report_finding_count: input.count
      })
      .eq("scan_id", input.scanId);

    if (error) {
      console.error("Failed to persist report finding count", {
        error: error.message,
        scanId: input.scanId
      });
    }
  } catch (error) {
    console.error("Failed to persist report finding count", {
      error: error instanceof Error ? error.message : String(error),
      scanId: input.scanId
    });
  }
}
