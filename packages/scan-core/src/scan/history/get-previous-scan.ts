import { createAdminClient } from "@website-signal-risk-scanner/db";

export type PreviousCompletedScan = {
  completed_at: string | null;
  id: string;
};

export async function getPreviousCompletedScan(input: {
  currentScanId: string;
  domainId: string;
  organizationId: string | null;
}): Promise<PreviousCompletedScan | null> {
  const supabase = createAdminClient();
  const query = supabase
    .from("scans")
    .select("id, completed_at")
    .eq("domain_id", input.domainId)
    .eq("status", "completed")
    .neq("id", input.currentScanId)
    .order("completed_at", { ascending: false })
    .limit(1);

  const scopedQuery =
    input.organizationId === null ? query.is("organization_id", null) : query.eq("organization_id", input.organizationId);

  const { data, error } = await scopedQuery.maybeSingle();

  if (error) {
    throw new Error(`Failed to load previous completed scan: ${error.message}`);
  }

  return (data as PreviousCompletedScan | null) ?? null;
}
