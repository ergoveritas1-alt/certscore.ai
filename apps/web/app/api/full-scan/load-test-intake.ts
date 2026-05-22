import { isProductionLoadTestBatchId } from "@website-signal-risk-scanner/shared";

export type FullScanRequestProvenance = {
  githubActor?: string | null;
  githubRunId?: string | null;
  githubSha?: string | null;
  githubWorkflow?: string | null;
  host?: string | null;
  originIp?: string | null;
  source?: string | null;
  userAgent?: string | null;
};

function sourceHasManifestMetadata(source: string, batchId: string) {
  return (
    source.startsWith(`${batchId};`) &&
    /(?:^|;)manifest_row=\d+(?:;|$)/.test(source) &&
    /(?:^|;)tranco_rank=\d+(?:;|$)/.test(source) &&
    /(?:^|;)tranco_list=[^;]+(?:;|$)/.test(source) &&
    /(?:^|;)tranco_generated=\d{4}-\d{2}-\d{2}(?:;|$)/.test(source) &&
    /(?:^|;)domain=[^;]+(?:;|$)/.test(source)
  );
}

export function shouldBypassDnsValidationForProductionLoadTest(provenance: FullScanRequestProvenance) {
  if (process.env.FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS !== "true") {
    return false;
  }

  const batchId = provenance.githubRunId ?? "";
  const source = provenance.source ?? "";

  return (
    provenance.githubWorkflow === "production-load-test" &&
    provenance.githubActor === "codex-ops" &&
    provenance.githubSha === "manual" &&
    isProductionLoadTestBatchId(batchId) &&
    sourceHasManifestMetadata(source, batchId)
  );
}
