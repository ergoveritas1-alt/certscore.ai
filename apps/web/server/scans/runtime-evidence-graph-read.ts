import { apiRuntimeEvidenceGraphProjectionSchema } from "@certscore/api-contracts";
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
    return Response.json(graph.data, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return error(503, "Relationship evidence is temporarily unavailable. Try again later."); }
}
