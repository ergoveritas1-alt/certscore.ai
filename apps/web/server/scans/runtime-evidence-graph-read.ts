import { apiRuntimeEvidenceGraphProjectionSchema } from "@certscore/api-contracts";
import { choiceInventoryCounts } from "../../lib/scans/choice-inventory-counts";
import { projectGpcResourceInventory } from "../../lib/scans/gpc-resource-inventory";
import type { ScanDetailResponse } from "./get-scan-by-id";

/** The protection boundary precedes both report and artifact reads. No creation or API Activity writes. */
export async function handleRuntimeGraphRead(request: Request, scanId: string, dependencies: {
  throttle: (request: Request, scanId: string) => Promise<Response | null>;
  loadAuthorized: (scanId: string) => Promise<ScanDetailResponse | null>;
  hydrate: (record: ScanDetailResponse) => Promise<ScanDetailResponse>;
}) {
  const error = (status: number, message: string) => Response.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(scanId)) return error(400, "Invalid scan ID.");
  try {
    const throttled = await dependencies.throttle(request, scanId);
    if (throttled) return throttled;
    const record = await dependencies.loadAuthorized(scanId);
    if (!record || record.scan.id !== scanId || record.scan.status !== "completed") return error(404, "Relationship evidence is unavailable.");
    const hydrated = await dependencies.hydrate(record);
    const graph = apiRuntimeEvidenceGraphProjectionSchema.safeParse(hydrated.runtimeArtifacts?.runtimeEvidenceGraphProjection);
    if (!graph.success || graph.data.scanId !== scanId) return error(404, "Relationship evidence is unavailable.");
    const view = new URL(request.url).searchParams.get("view");
    const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
    const inventory = () => projectGpcResourceInventory({
      scanId, projection: graph.data, measurementInventory: record.runtimeArtifacts?.gpcMeasurementInventory,
      pageUrl: record.scan.domainHostname ? `https://${record.scan.domainHostname}/` : "",
    });
    if (view === "gpc-flagged-items") {
      const reference = apiRuntimeEvidenceGraphProjectionSchema.safeParse(record.runtimeArtifacts?.runtimeEvidenceGraphProjection);
      const capture = inventory();
      return Response.json(capture && reference.success && reference.data.details ? {
        scanId, graphHash: reference.data.details.sha256, ...choiceInventoryCounts(capture),
      } : null, { headers });
    }
    const body = view === "gpc-inventory" ? inventory() : graph.data;
    return Response.json(body, { headers });
  } catch { return error(503, "Relationship evidence is temporarily unavailable. Try again later."); }
}
