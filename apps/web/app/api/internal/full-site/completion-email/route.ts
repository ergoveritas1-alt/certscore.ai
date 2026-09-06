import { z } from "zod";
import { sendScanCompletionEmail } from "../../../../../server/scans/send-completion-email";
const schema = z
  .object({
    scanId: z.string().uuid(),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export async function POST(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  let body: unknown;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return new Response(null, { status: 400 });
  await sendScanCompletionEmail(parsed.data.scanId, parsed.data.token);
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
