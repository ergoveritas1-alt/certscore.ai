import { getPulseRequesterContext } from "../../lib/pulse/request";
import { createPulseRequest } from "../pulse/repository";
import { parseBearerToken, validateIntegrationApiKey } from "./api-keys";

type RecordApiV2McpUsageInput = {
  normalizedDomain?: string | null;
  normalizedUrl?: string | null;
  requestedUrl?: string | null;
  responseStatus: number;
  routeName: string;
  scanId?: string | null;
  toolHint?: string | null;
  request: Request;
};

export async function recordApiV2McpUsage(input: RecordApiV2McpUsageInput) {
  const bearer = parseBearerToken(input.request);
  if (!bearer.token) {
    return;
  }

  try {
    const auth = await validateIntegrationApiKey(bearer.token, ["mcp"]);
    if (!auth.ok) {
      return;
    }

    const requester = getPulseRequesterContext(input.request);
    const url = new URL(input.request.url);
    await createPulseRequest({
      context: {
        ...requester,
        accountId: auth.key.organizationId,
        apiKeyId: auth.key.publicId,
        channel: "mcp",
        detail: "standard",
        format: "json",
        freshness: "latest",
        mode: input.scanId ? "scanId" : "url",
        method: input.request.method,
        path: url.pathname,
        responseStatus: input.responseStatus,
        routeName: input.routeName,
        source: "mcp",
        toolHint: input.toolHint ?? null,
        userId: auth.key.ownerUserId,
        waitSeconds: 0
      },
      normalizedDomain: input.normalizedDomain ?? null,
      normalizedUrl: input.normalizedUrl ?? null,
      requestedUrl: input.requestedUrl ?? null,
      requestChannel: "mcp",
      resolutionMode: "api_v2_mcp_read",
      scanId: input.scanId ?? null,
      status: input.responseStatus >= 400 ? "failed" : "completed"
    });
  } catch (error) {
    console.error("[api-v2-mcp-usage] failed to record MCP API v2 usage", {
      error,
      routeName: input.routeName
    });
  }
}
