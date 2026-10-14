import { insightsManifestSchema, INSIGHTS_LIVE_KEY, MAX_ASSET_BYTES, verifyArtifact, type InsightsManifest, type InsightArtifact } from "../../lib/insights/contract";

export type ReadInsightObject = (key: string, maxBytes: number) => Promise<Uint8Array>;
export function createInsightsReader(read: ReadInsightObject) {
  return {
    async manifest(): Promise<InsightsManifest> {
      const bytes = await read(INSIGHTS_LIVE_KEY, 512 * 1024);
      return insightsManifestSchema.parse(JSON.parse(Buffer.from(bytes).toString("utf8")));
    },
    async artifact(artifact: InsightArtifact) {
      const bytes = await read(artifact.key, Math.min(artifact.bytes, MAX_ASSET_BYTES));
      verifyArtifact(bytes, artifact);
      return bytes;
    }
  };
}

// The URL never becomes an S3 key. Only a verified manifest can select content.
export async function insightResponse(reader: ReturnType<typeof createInsightsReader>, path: string, request: Request) {
  try {
    const manifest = await reader.manifest();
    const entry = [...manifest.pages, ...manifest.assets].find((item) => item.path === path);
    if (!entry) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
    const bytes = await reader.artifact(entry.artifact);
    const etag = `"${entry.artifact.sha256}"`;
    const headers = {
      "Content-Type": entry.artifact.contentType,
      "Cache-Control": "no-store",
      "ETag": etag,
      "X-Content-Type-Options": "nosniff",
      "X-Insights-Release": manifest.release,
      "X-Insights-Content-SHA256": entry.artifact.sha256
    };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    return new Response(Buffer.from(bytes), { headers });
  } catch (error) {
    console.error("Insights content unavailable", { error: error instanceof Error ? error.name : "UnknownError" });
    return new Response("This article is temporarily unavailable. Please try again shortly.", {
      status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" }
    });
  }
}
