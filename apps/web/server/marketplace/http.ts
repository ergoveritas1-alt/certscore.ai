import "server-only";

export async function boundedText(request: Request, limit: number) {
  if (Number(request.headers.get("content-length") ?? 0) > limit) throw new Error("Request too large.");
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error("Request too large."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}

// Bounded process-local admission control supplements the existing edge controls.
const admissions = new Map<string, { count: number; reset: number }>();
export function admitMarketplaceRequest(bucket: string, max: number) {
  const now = Date.now();
  for (const [key, value] of admissions) if (value.reset <= now) admissions.delete(key);
  const prior = admissions.get(bucket);
  if (!prior && admissions.size >= 2000) return false;
  const entry = prior ?? { count: 0, reset: now + 60_000 };
  entry.count++;
  admissions.set(bucket, entry);
  return entry.count <= max;
}
