import { GET as pulseGET } from "../route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  url.searchParams.set("channel", "gpt_action");
  return pulseGET(new Request(url, request));
}
