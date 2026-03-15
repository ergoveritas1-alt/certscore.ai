import { createAdminClient } from "@website-signal-risk-scanner/db";

async function main() {
  const scanId = process.argv[2]?.trim();

  if (!scanId) {
    throw new Error("Usage: inspect-policy-enrichment.ts <scan-id>");
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("policy_enrichment")
    .select(
      [
        "scan_id",
        "page_url",
        "page_type",
        "policy_ai_model",
        "policy_ai_model_version",
        "policy_ai_prompt_version",
        "policy_ai_run_at",
        "policy_actionable_flags",
        "policy_semantic_confidence"
      ].join(",")
    )
    .eq("scan_id", scanId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load policy enrichment rows: ${error.message}`);
  }

  console.log(JSON.stringify(data ?? [], null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
