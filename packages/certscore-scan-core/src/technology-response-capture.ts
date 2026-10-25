import { technologyCaptureSchema, type TechnologyCapture, type TechnologyObservation } from "@certscore/contracts";

/** Read an already available response header map. Retain declarations, never header identifiers or cookie values. */
export function retainTechnologyResponse(capture: TechnologyCapture, headers: Record<string, string>, requestId: string, documentToken: string): TechnologyCapture {
  const observations: TechnologyObservation[] = [];
  const server = headers.server;
  // Bound before regex work; do not preserve arbitrary banner contents.
  if (server && server.length <= 160) {
    const product = /^(nginx|Apache|Microsoft-IIS)(?:\/([0-9]+(?:\.[0-9]+){1,3}))?(?=\s|$)/i.exec(server);
    if (product) observations.push({ kind: "header", value: `server: ${product[1]}${product[2] ? `/${product[2]}` : ""}` });
    const cdn = /^(cloudflare|AkamaiGHost|Fastly)$/i.exec(server.trim());
    if (cdn) observations.push({ kind: "header", value: `server: ${{ cloudflare: "cloudflare", akamaighost: "AkamaiGHost", fastly: "Fastly" }[cdn[1]!.toLowerCase()]}` });
  }
  if (headers["x-powered-by"]?.trim() === "Next.js") observations.push({ kind: "header", value: "x-powered-by: Next.js" });
  const poweredBy = headers["x-powered-by"];
  if (poweredBy && poweredBy.length <= 80 && /^PHP(?:\/[0-9]+(?:\.[0-9]+){1,3})?$/i.test(poweredBy.trim()))
    observations.push({ kind: "header", value: `x-powered-by: ${poweredBy.trim()}` });
  const via = headers.via;
  if (via && via.length <= 256 && /(?:^|,\s*)[12](?:\.[01])? [a-z0-9]+\.cloudfront\.net \(CloudFront\)(?:,|$)/i.test(via) && headers["x-amz-cf-id"])
    observations.push({ kind: "header", value: "via: CloudFront; x-amz-cf-id: present" });
  let result = capture;
  for (const row of observations) {
    const next = technologyCaptureSchema.safeParse({ ...result, observations: [...result.observations, row], responseRequestId: requestId, responseDocumentToken: documentToken });
    if (next.success) result = next.data;
    else result = { ...result, truncated: true };
  }
  return result;
}
