import { museGuideMarkdown } from "../muse/content";

export const dynamic = "force-static";

export function GET() {
  return new Response(museGuideMarkdown(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: '<https://certscore.ai/muse>; rel="canonical", <https://certscore.ai/llms.txt>; rel="describedby"'
    }
  });
}
