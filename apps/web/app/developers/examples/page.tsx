import type { Metadata } from "next";
import { createPageMetadata } from "../../../lib/seo";
import { CodeBlock, DeveloperShell, Section } from "../developer-pages";

const description =
  "Copy-paste examples for the CertScore API, TypeScript SDK, and MCP server across website risk API and AI agent workflows.";

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

        <Section eyebrow="Curl" title="Retrieve Cookies & Trackers (Pre-consent) as JSON">
          <div id="pre-consent-cookies-trackers-json" className="space-y-4">
            <CodeBlock>{`SCAN=$(curl -s -X POST https://certscore.ai/api/v2/scans \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY" \\
  -d '{"url":"https://example.com","freshness":"latest","scanFrom":"eu_ie"}')

SCAN_ID=$(echo "$SCAN" | jq -r '.scanId // .id')

curl -H "Authorization: Bearer $CERTSCORE_API_KEY" \\
  "https://certscore.ai/api/v2/scans/$SCAN_ID/status"

curl -H "Authorization: Bearer $CERTSCORE_API_KEY" \\
  "https://certscore.ai/api/v2/scans/$SCAN_ID/pre-consent-cookies-trackers" \\
  | jq '.rows | group_by([.vendor, .purpose, .host]) | map({
      vendor: .[0].vendor,
      purpose: .[0].purpose,
      host: .[0].host,
      count: length
    })'`}</CodeBlock>
            <CodeBlock>{`curl -H "Authorization: Bearer $CERTSCORE_API_KEY" \\
  "https://certscore.ai/api/v2/domains/example.com/latest/pre-consent-cookies-trackers"`}</CodeBlock>
            <p className="max-w-3xl text-sm leading-7 text-slate-600">
              Rows are automated public-web observations for review. They are not legal advice, certification, or compliance determinations.
            </p>
          </div>
        </Section>

        <Section eyebrow="SDK" title="Build a review handoff">
          <CodeBlock>{`const latest = await certscore.domains.latest("example.com");

if (latest.scan) {
  const findings = await certscore.findings.list(latest.scan.scanId);

  for (const finding of findings.findings) {
    const explanation = await certscore.findings.explain(latest.scan.scanId, finding.id);
    console.log(explanation.label, explanation.detail?.caveats);
  }
}`}</CodeBlock>
        </Section>

        <Section eyebrow="SDK" title="Read the pre-consent cookie and tracker table">
          <CodeBlock>{`const created = await certscore.scans.create("https://example.com", {
  freshness: "latest",
  scanFrom: "eu_ie"
});

const completed = created.type === "certscore_scan_job"
  ? await certscore.scans.wait(created)
  : created;

const scanId = typeof completed === "string"
  ? undefined
  : completed.scanId;

if (!scanId) {
  throw new Error("Scan did not return a durable scanId.");
}

await certscore.scans.status(scanId);
const table = await certscore.scans.preConsentCookiesTrackers(scanId);

const grouped = new Map();
for (const row of table.rows) {
  const key = [row.vendor, row.purpose, row.host].join("|");
  grouped.set(key, [...(grouped.get(key) ?? []), row]);
}

const latestTable = await certscore.domains.latestPreConsentCookiesTrackers("example.com");
console.log(grouped, latestTable.summary.rowCount);`}</CodeBlock>
        </Section>

        <Section eyebrow="MCP" title="Agent tool call for the pre-consent table">
          <CodeBlock>{`get_pre_consent_cookies_trackers({ scanId: "00000000-0000-4000-8000-000000000123" })

get_latest_domain_pre_consent_cookies_trackers({
  domain: "example.com",
  scanFrom: "eu_ie"
})`}</CodeBlock>
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
            Cookies & Trackers (Pre-consent) JSON retrieval, MCP server for website compliance review, automated public-web risk
            signals, and evidence-backed website scan API integrations.
          </p>
        </Section>
      </div>
    </DeveloperShell>
  );
}
