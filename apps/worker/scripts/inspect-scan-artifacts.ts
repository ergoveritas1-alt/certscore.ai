import { createAdminClient } from "@website-signal-risk-scanner/db";

async function main() {
  const scanId = process.argv[2]?.trim();

  if (!scanId) {
    throw new Error("Usage: inspect-scan-artifacts.ts <scan-id>");
  }

  const supabase = createAdminClient();
  const [{ data: snapshot, error: snapshotError }, { data: pages, error: pagesError }, { data: runtimeArtifacts, error: runtimeArtifactsError }] = await Promise.all([
    supabase
      .from("scan_snapshots")
      .select(
        [
          "scan_id",
          "privacy_policy_present",
          "terms_of_service_present",
          "cookie_policy_present",
          "contact_page_present",
          "privacy_policy_hash",
          "privacy_policy_word_count",
          "legal_coverage_score",
          "timeout_flag",
          "blocked_flag",
          "scan_confidence"
        ].join(", ")
      )
      .eq("scan_id", scanId)
      .maybeSingle(),
    supabase
      .from("scan_pages")
      .select("page_type, page_url, fetch_status, fetched_via, page_language, normalized_content_hash, title_hash")
      .eq("scan_id", scanId)
      .order("page_type", { ascending: true }),
    supabase
      .from("scan_runtime_artifacts")
      .select("*")
      .eq("scan_id", scanId)
      .maybeSingle()
  ]);

  if (snapshotError) {
    throw new Error(`Failed to load snapshot: ${snapshotError.message}`);
  }

  if (pagesError) {
    throw new Error(`Failed to load pages: ${pagesError.message}`);
  }

  if (runtimeArtifactsError) {
    throw new Error(`Failed to load runtime artifacts: ${runtimeArtifactsError.message}`);
  }

  console.log(
    JSON.stringify(
      {
        snapshot,
        pages,
        runtimeArtifacts
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
