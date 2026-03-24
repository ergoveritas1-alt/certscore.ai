import { buildAgencyMappings, buildRegulatoryRiskAssessment } from "@website-signal-risk-scanner/shared";
import { createAdminClient } from "@website-signal-risk-scanner/db";
import { buildPreviewPayloadFromSnapshot } from "./build-preview-payload";
import { buildAgencyMappingSource } from "../../lib/scans/agency-mapping-source";
import { buildRegulatoryRiskSource } from "../../lib/scans/regulatory-risk-source";
import {
  getAllPreviewScanEvents,
  getLatestPreviewScanEvent,
  getRecentPreviewScanEvents,
  getPreviewScanRecord,
  getPreviewRuntimeArtifacts,
  getPreviewScanSnapshot,
  serializePreviewScan
} from "./preview-scan-repository";

export async function getPreviewScan(scanId: string) {
  const record = await getPreviewScanRecord(scanId);

  if (!record || record.scan.scan_type !== "preview") {
    return null;
  }

  const [latestEvent, recentEvents, events, runtimeArtifacts] = await Promise.all([
    getLatestPreviewScanEvent(scanId),
    getRecentPreviewScanEvents(scanId),
    getAllPreviewScanEvents(scanId),
    getPreviewRuntimeArtifacts(scanId)
  ]);
  const response = serializePreviewScan({
    ...record,
    events,
    latestEvent,
    recentEvents,
    runtimeArtifacts
  });
  const snapshot = await getPreviewScanSnapshot(scanId);

  if (!snapshot) {
    return response;
  }

  const supabase = createAdminClient();
  const { data: policyEnrichment } = await supabase
    .from("policy_enrichment")
    .select("*")
    .eq("scan_id", scanId)
    .order("created_at", { ascending: true });
  const primaryPolicyEnrichment =
    ((policyEnrichment ?? []) as Array<Record<string, unknown>>).find((row) => row.page_type === "privacy_policy") ??
    ((policyEnrichment ?? []) as Array<Record<string, unknown>>)[0] ??
    null;
  const regulatoryRisk = buildRegulatoryRiskAssessment({
    source: buildRegulatoryRiskSource({
      snapshot: snapshot as unknown as Record<string, unknown>,
      primaryPolicyEnrichment
    })
  });

  return {
    ...response,
    regulatoryRisk,
    agencyMappings: buildAgencyMappings(buildAgencyMappingSource(snapshot as unknown as Record<string, unknown>), regulatoryRisk),
    previewPayload: buildPreviewPayloadFromSnapshot({
      hostname: response.hostname,
      normalizedUrl: response.normalizedUrl,
      snapshot
    })
  };
}
