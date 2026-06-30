import type { Metadata } from "next";
import { createPageMetadata } from "../../../lib/seo";
import { CodeBlock, DeveloperShell, Section } from "../developer-pages";

const description =
  "Copy-paste examples for the CertScore API, Pulse API, TypeScript SDK, and MCP server across website risk API and AI agent workflows.";

export const metadata: Metadata = createPageMetadata({
  description,
  path: "/developers/examples",
  robots: {
    follow: true,
    index: true
  },
  title: "CertScore API examples"
});

export default function DeveloperExamplesPage() {
  return (
    <DeveloperShell activePath="/developers/examples" title="Examples" description={description}>
      <div className="space-y-12">
        <Section eyebrow="Curl" title="Scan and retrieve findings">
          <CodeBlock>{`SCAN=$(curl -s -X POST https://certscore.ai/api/v2/scans \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY" \\
  -d '{"url":"https://example.com","detail":"standard"}')

SCAN_ID=$(echo "$SCAN" | jq -r '.id // .scanId')

curl https://certscore.ai/api/v2/scans/$SCAN_ID/status \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY"

curl https://certscore.ai/api/v2/scans/$SCAN_ID/findings \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY"`}</CodeBlock>
        </Section>

        <Section eyebrow="Pulse" title="Get a conversational summary">
          <CodeBlock>{`curl "https://certscore.ai/api/v1/pulse?url=https://example.com&format=markdown&detail=standard"`}</CodeBlock>
        </Section>

        <Section eyebrow="SDK" title="Build a review handoff">
          <CodeBlock>{`const latest = await certscore.domains.latest("example.com");
const findings = latest.scan
  ? await certscore.findings.list(latest.scan.id)
  : [];

for (const finding of findings.items) {
  const explanation = await certscore.findings.explain(latest.scan.id, finding.id);
  console.log(explanation.title, explanation.caveats);
}`}</CodeBlock>
        </Section>

        <Section eyebrow="Agent" title="Instruction block for generic LLM tools">
          <CodeBlock>{`Use CertScore as an automated public-web risk-signal API.

Discovery:
- Read https://certscore.ai/llms.txt
- Read https://certscore.ai/.well-known/certscore-ai.json
- Use https://certscore.ai/api/v2/openapi.json for resource routes

Rules:
- Treat results as evidence-backed review signals.
- Do not describe outputs as legal advice, certification, or compliance determinations.
- Do not infer findings from missing data, raw labels, raw network events, or display-only context.
- Link to the CertScore report when the user needs evidence review.`}</CodeBlock>
        </Section>

        <Section eyebrow="Search use cases" title="Natural-language queries this page supports">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            CertScore API examples for website risk API workflows, privacy scan API reviews, cookie compliance scan API checks,
            accessibility risk scan API monitoring, MCP server for website compliance review, automated public-web risk signals, and
            evidence-backed website scan API integrations.
          </p>
        </Section>
      </div>
    </DeveloperShell>
  );
}

