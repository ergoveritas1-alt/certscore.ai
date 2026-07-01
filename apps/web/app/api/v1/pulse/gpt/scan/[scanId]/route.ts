import { GET as pulseGET } from "../../../route";
import { pulseOptionsResponse } from "../../../../../../../lib/pulse/cors";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, context: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await context.params;
  const url = new URL(request.url);
  url.searchParams.set("scanId", scanId);
  url.searchParams.set("channel", "gpt_action");
  return pulseGET(new Request(url, request));
}

export function OPTIONS(request: Request) {
  return pulseOptionsResponse(request);
}
