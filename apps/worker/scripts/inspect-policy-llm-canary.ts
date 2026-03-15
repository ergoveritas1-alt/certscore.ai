import { createAdminClient } from "@website-signal-risk-scanner/db";

function confidenceBand(value: number | null) {
  if (value === null) {
    return "none";
  }

  if (value >= 0.75) {
    return "high";
  }

  if (value >= 0.5) {
    return "medium";
  }

  return "low";
}

async function main() {
  const limit = Number.parseInt(process.argv[2] ?? "20", 10);
  const supabase = createAdminClient();

  const { data: scans, error: scansError } = await supabase
    .from("scans")
    .select("id, domain_id, status, error_message, completed_at, created_at, scan_config_json")
    .contains("scan_config_json", { profile: "policy-llm-canary" })
    .order("created_at", { ascending: false })
    .limit(Number.isFinite(limit) ? limit : 20);

  if (scansError) {
    throw new Error(`Failed to load canary scans: ${scansError.message}`);
  }

  const scanIds = (scans ?? []).map((row) => row.id);
  const domainIds = [...new Set((scans ?? []).map((row) => row.domain_id).filter(Boolean))];

  const [{ data: domains, error: domainsError }, { data: enrichments, error: enrichmentsError }, { data: diagnostics, error: diagnosticsError }] =
    await Promise.all([
      supabase.from("domains").select("id, hostname").in("id", domainIds),
      supabase
        .from("policy_enrichment")
        .select("scan_id, page_type, page_url, policy_actionable_flags, policy_semantic_confidence, policy_ai_model")
        .in("scan_id", scanIds)
        .order("created_at", { ascending: true }),
      supabase
        .from("scan_events")
        .select("scan_id, event_type, metadata_json")
        .in("scan_id", scanIds)
        .eq("event_type", "legal.policy_llm_chunk_diagnostic")
    ]);

  if (domainsError) {
    throw new Error(`Failed to load canary domains: ${domainsError.message}`);
  }

  if (enrichmentsError) {
    throw new Error(`Failed to load canary enrichments: ${enrichmentsError.message}`);
  }

  if (diagnosticsError) {
    throw new Error(`Failed to load canary diagnostics: ${diagnosticsError.message}`);
  }

  const domainMap = new Map((domains ?? []).map((row) => [row.id, row.hostname]));
  const enrichmentsByScan = new Map<string, Array<Record<string, unknown>>>();
  const diagnosticsByScan = new Map<string, Array<Record<string, unknown>>>();

  for (const row of (enrichments ?? []) as unknown as Array<Record<string, unknown> & { scan_id: string }>) {
    enrichmentsByScan.set(row.scan_id, [...(enrichmentsByScan.get(row.scan_id) ?? []), row]);
  }

  for (const row of (diagnostics ?? []) as unknown as Array<Record<string, unknown> & { scan_id: string }>) {
    diagnosticsByScan.set(row.scan_id, [...(diagnosticsByScan.get(row.scan_id) ?? []), row]);
  }

  const detailed = (scans ?? []).map((scan) => {
    const privacyRows = (enrichmentsByScan.get(scan.id) ?? []).filter((row) => row.page_type === "privacy_policy");
    return {
      scanId: scan.id,
      hostname: scan.domain_id ? domainMap.get(scan.domain_id) ?? null : null,
      status: scan.status,
      createdAt: scan.created_at,
      completedAt: scan.completed_at,
      errorMessage: scan.error_message,
      repetition: typeof scan.scan_config_json?.repetition === "number" ? scan.scan_config_json.repetition : null,
      privacyRows,
      diagnostics: diagnosticsByScan.get(scan.id) ?? []
    };
  });

  const byHost = new Map<string, typeof detailed>();
  for (const item of detailed) {
    const key = item.hostname ?? "unknown";
    byHost.set(key, [...(byHost.get(key) ?? []), item]);
  }

  const stability = [...byHost.entries()].map(([hostname, runs]) => {
    const completedRuns = runs.filter((run) => run.status === "completed");
    const flagSets = completedRuns.map((run) => [...new Set(run.privacyRows.flatMap((row) => (row.policy_actionable_flags as string[] | null) ?? []))].sort());
    const confidenceBands = completedRuns.map((run) => confidenceBand((run.privacyRows[0]?.policy_semantic_confidence as number | null) ?? null));
    const models = completedRuns.map((run) => (run.privacyRows[0]?.policy_ai_model as string | null) ?? null);

    return {
      hostname,
      totalRuns: runs.length,
      completedRuns: completedRuns.length,
      stableFlags: flagSets.length > 1 ? flagSets.every((flags) => JSON.stringify(flags) === JSON.stringify(flagSets[0])) : null,
      stableConfidenceBand:
        confidenceBands.length > 1 ? confidenceBands.every((band) => band === confidenceBands[0]) : null,
      stableModel: models.length > 1 ? models.every((model) => model === models[0]) : null,
      flagSets,
      confidenceBands,
      models
    };
  });

  console.log(JSON.stringify({ detailed, stability }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
