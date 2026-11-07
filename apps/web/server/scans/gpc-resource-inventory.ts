import "server-only";
import type {ScanDetailResponse} from "./get-scan-by-id";
import {hydrateRuntimeGraphForRead} from "./runtime-evidence-graph-storage";
import {projectGpcResourceInventory} from "../../lib/scans/gpc-resource-inventory";

/** Call after the report's existing authorization/quota boundary. No new scan. */
export async function loadGpcResourceInventory(record: ScanDetailResponse) {
  const hydrated = await hydrateRuntimeGraphForRead(record, {includeGpcForInventory:true});
  return projectGpcResourceInventory({scanId:record.scan.id, projection:hydrated.runtimeArtifacts?.runtimeEvidenceGraphProjection,
    pageUrl:record.scan.domainHostname ? `https://${record.scan.domainHostname}/` : ""});
}
