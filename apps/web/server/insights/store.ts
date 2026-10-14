import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client, getStorageBucketName } from "@website-signal-risk-scanner/db";
import { createInsightsReader, insightResponse } from "./reader";

export const insightsReader = createInsightsReader(async (key, maxBytes) => {
  const object = await getS3Client().send(new GetObjectCommand({ Bucket: getStorageBucketName(), Key: key }), {
    abortSignal: AbortSignal.timeout(5000)
  });
  if (!object.Body || object.ContentLength === undefined || object.ContentLength > maxBytes) throw new Error("Invalid Insights object size");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
    length += chunk.byteLength;
    if (length > maxBytes) throw new Error("Insights object exceeded its limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
});

export function serveInsight(path: string, request: Request) {
  return insightResponse(insightsReader, path, request);
}

export async function getPublishedInsightPages() {
  try {
    return (await insightsReader.manifest()).pages;
  } catch {
    // Keep the existing index and sitemap available during a storage outage.
    console.error("Published Insights list unavailable; retaining bundled links");
    return [];
  }
}
