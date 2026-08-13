import type { Metadata } from "next";
import { createPageMetadata } from "../../../lib/seo";
import { AgentQuickPath, CodeBlock, DeveloperShell, Section } from "../developer-pages";

const description =
  "Copy-paste examples for the CertScore.ai API, TypeScript SDK, and MCP server across website risk API and AI agent workflows.";

export const metadata: Metadata = createPageMetadata({
  description,
  path: "/developers/examples",
  robots: {
    follow: true,
    index: true
  },
  title: "CertScore.ai API examples"
});

export default function DeveloperExamplesPage() {
  return (
    <DeveloperShell activePath="/developers/examples" title="Examples" description={description}>
      <div className="space-y-12">
        <AgentQuickPath />

        <Section id="generic-agent-instructions" eyebrow="Agent prompts" title="Copy-paste instructions for agents">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-950">Prompt for coding agents</h3>
              <CodeBlock>{`Use CertScore.ai's public developer docs. Read /llms.txt, then /.well-known/certscore-ai.json, then /api/v2/openapi.json. Create a scan for the target domain, poll until complete, fetch findings and pre-consent cookies/trackers, and summarize only evidence-backed public-web observations. Do not provide legal advice or call the result a compliance determination.`}</CodeBlock>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-950">Prompt for MCP agents</h3>
              <CodeBlock>{`Scan these public URLs with CertScore.ai. For each one, wait for completion when possible. If a scan remains active, poll certscore_get_scan_status with the returned scanId. For completed scans, call certscore_get_scan_bundle with detail=findings. If truncated, follow recommendedNextAction or increase maxBytes. Report score, risk level, coverage status, findings, limitations, report URL, and whether quota was consumed. Never treat no-go, not-detected, or insufficient-evidence results as proof of compliance.`}</CodeBlock>
            </div>
          </div>
        </Section>

        <Section id="complete-curl-workflow" eyebrow="Curl" title="Scan and retrieve findings">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            For a no-account evaluation, omit the bearer header from scan creation. The anonymous path allows 20 new scans per requester
            IP per UTC day; recent-result reuse does not consume that quota.
          </p>
          <CodeBlock>{`curl -X POST https://certscore.ai/api/v2/scans \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html","freshness":"latest","scanFrom":"eu_ie"}'`}</CodeBlock>
          <CodeBlock>{`SCAN=$(curl -s -X POST https://certscore.ai/api/v2/scans \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY" \\
  -d '{"url":"https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html","freshness":"latest","scanFrom":"eu_ie"}')

SCAN_ID=$(echo "$SCAN" | jq -r '.id // .scanId')

curl https://certscore.ai/api/v2/scans/$SCAN_ID/status \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY"

curl https://certscore.ai/api/v2/scans/$SCAN_ID/findings \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY"`}</CodeBlock>
        </Section>

        <Section id="pre-consent-cookies-trackers" eyebrow="Curl" title="Retrieve Pre-consent Cookies & Trackers as JSON">
          <div id="pre-consent-cookies-trackers-json" className="space-y-4">
            <CodeBlock>{`SCAN=$(curl -s -X POST https://certscore.ai/api/v2/scans \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY" \\
  -d '{"url":"https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html","freshness":"latest","scanFrom":"eu_ie"}')

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
  "https://certscore.ai/api/v2/domains/ergoveritas.com/latest/pre-consent-cookies-trackers"`}</CodeBlock>
            <p className="max-w-3xl text-sm leading-7 text-slate-600">
              CertScore.ai outputs are automated public-web observations for review. They are not legal advice, certification, or a compliance determination.
            </p>
          </div>
        </Section>

        <Section eyebrow="SDK" title="Build a review handoff">
          <CodeBlock>{`const latest = await certscore.domains.latest("ergoveritas.com");

if (latest.scan) {
  const findings = await certscore.findings.list(latest.scan.scanId);

  for (const finding of findings.findings) {
    const explanation = await certscore.findings.explain(latest.scan.scanId, finding.id);
    console.log(explanation.label, explanation.detail?.caveats);
  }
}`}</CodeBlock>
        </Section>

        <Section eyebrow="SDK" title="Read the pre-consent cookie and tracker table">
          <CodeBlock>{`const created = await certscore.scans.create("https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html", {
  freshness: "latest",
  scanFrom: "eu_ie"
});

const completed = await certscore.scans.wait(created);
const scanId = completed.scanId;

await certscore.scans.status(scanId);
const table = await certscore.scans.preConsentCookiesTrackers(scanId);

const grouped = new Map();
for (const row of table.rows) {
  const key = [row.vendor, row.purpose, row.host].join("|");
  grouped.set(key, [...(grouped.get(key) ?? []), row]);
}

const latestTable = await certscore.domains.latestPreConsentCookiesTrackers("ergoveritas.com");
console.log(grouped, latestTable.summary.rowCount);`}</CodeBlock>
        </Section>

        <Section id="mcp-agent-workflow" eyebrow="MCP" title="Agent tool call for the pre-consent table">
          <CodeBlock>{`certscore_get_pre_consent_cookies_trackers({ scanId: "00000000-0000-4000-8000-000000000123" })

certscore_get_latest_domain_pre_consent_cookies_trackers({
  domain: "ergoveritas.com",
  scanFrom: "eu_ie"
})`}</CodeBlock>
        </Section>

        <Section id="evidence-boundaries" eyebrow="Boundaries" title="Evidence boundaries">
          <CodeBlock>{`Use CertScore.ai as an automated public-web risk-signal API.

Discovery:
- Read https://certscore.ai/llms.txt
- Read https://certscore.ai/.well-known/certscore-ai.json
- Use https://certscore.ai/api/v2/openapi.json for resource routes

Rules:
- Treat results as evidence-backed review signals.
- Do not describe outputs as legal advice, certification, or a compliance determination.
- Do not infer findings from missing data, raw labels, raw network events, or display-only context.
- Link to the CertScore.ai report when the user needs evidence review.`}</CodeBlock>
        </Section>

        <Section eyebrow="Search use cases" title="Natural-language queries this page supports">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            CertScore.ai API examples for website risk API workflows, privacy scan API reviews, cookie compliance scan API checks,
            Pre-consent Cookies & Trackers JSON retrieval, MCP server for website compliance review, automated public-web risk
            signals, and evidence-backed website scan API integrations.
          </p>
        </Section>
      </div>
    </DeveloperShell>
  );
}
