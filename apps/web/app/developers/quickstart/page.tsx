import type { Metadata } from "next";
import { createPageMetadata } from "../../../lib/seo";
import { AgentQuickPath, CodeBlock, DeveloperShell, Section } from "../developer-pages";

const description =
  "Start using the CertScore API v2 with curl: create a public website scan, poll status, list public-safe findings, and retrieve latest-domain scan resources.";

export const metadata: Metadata = createPageMetadata({
  description,
  path: "/developers/quickstart",
  robots: {
    follow: true,
    index: true
  },
  title: "CertScore API quickstart"
});

export default function DeveloperQuickstartPage() {
  return (
    <DeveloperShell activePath="/developers/quickstart" title="API quickstart" description={description}>
      <div className="space-y-12">
        <AgentQuickPath />

        <Section id="api-key-access" eyebrow="Access" title="Get a scoped API key">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            CertScore API, SDK, and MCP integrations use bearer API keys. During the developer-preview period, request a scoped key by
            emailing{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-900" href="mailto:support@certscore.ai">
              support@certscore.ai
            </a>
            . Include your organization, integration type, expected volume, callback or contact email, and the scopes you need.
          </p>
          <CodeBlock>{`Recommended scopes by integration:
- REST API read-only: scan:read
- REST API scan creation: scan:read, scan:create
- TypeScript SDK: scan:read, scan:create
- MCP server: scan:read, scan:create, mcp`}</CodeBlock>
        </Section>

        <Section eyebrow="Health" title="Check the public API surface">
          <CodeBlock>{`curl https://certscore.ai/api/v2/health
curl https://certscore.ai/api/v2/openapi.json`}</CodeBlock>
        </Section>

        <Section id="complete-curl-workflow" eyebrow="Complete curl workflow" title="Create, poll, and retrieve review data">
          <CodeBlock>{`export CERTSCORE_API_KEY="cs_live_..."
TARGET_URL="https://example.com"

SCAN_RESPONSE=$(curl -sS -D /tmp/certscore-create-headers.txt \\
  -X POST https://certscore.ai/api/v2/scans \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY" \\
  --data @- <<JSON
{"url":"$TARGET_URL","freshness":"latest","scanFrom":"eu_ie"}
JSON
)

SCAN_ID=$(printf '%s' "$SCAN_RESPONSE" | jq -r '.scanId // .scan.scanId // empty')
JOB_ID=$(printf '%s' "$SCAN_RESPONSE" | jq -r '.jobId // empty')

if [ -z "$SCAN_ID" ] && [ -n "$JOB_ID" ]; then
  echo "Scan queued as job $JOB_ID; poll the returned status link until a scanId is available."
  exit 1
fi

while true; do
  curl -sS -D /tmp/certscore-status-headers.txt \\
    -H "Authorization: Bearer $CERTSCORE_API_KEY" \\
    "https://certscore.ai/api/v2/scans/$SCAN_ID/status" \\
    -o /tmp/certscore-status.json

  STATUS=$(jq -r '.status // "unknown"' /tmp/certscore-status.json)
  case "$STATUS" in
    completed|completed_limited) break ;;
    failed|expired|rate_limited)
      cat /tmp/certscore-status.json
      exit 1
      ;;
  esac

  RETRY_AFTER=$(awk 'BEGIN{IGNORECASE=1} /^Retry-After:/ {print $2}' /tmp/certscore-status-headers.txt | tr -d '\\r')
  sleep "\${RETRY_AFTER:-10}"
done

curl -sS -H "Authorization: Bearer $CERTSCORE_API_KEY" \\
  "https://certscore.ai/api/v2/scans/$SCAN_ID/findings" \\
  -o certscore-findings.json

curl -sS -H "Authorization: Bearer $CERTSCORE_API_KEY" \\
  "https://certscore.ai/api/v2/scans/$SCAN_ID/pre-consent-cookies-trackers" \\
  -o certscore-pre-consent-cookies-trackers.json

jq '.findings | length' certscore-findings.json
jq '.summary' certscore-pre-consent-cookies-trackers.json`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            This example uses jq to extract fields and print summaries. jq is optional; any JSON parser can read the same fields.
            Honor Retry-After on pending or throttled responses.
          </p>
        </Section>

        <Section eyebrow="Create" title="Create or reuse a public scan">
          <CodeBlock>{`curl -X POST https://certscore.ai/api/v2/scans \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY" \\
  -d '{
    "url": "https://example.com",
    "freshness": "latest",
    "scanFrom": "eu_ie"
  }'`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Scan creation may return a completed scan resource or a queued job resource.
          </p>
        </Section>

        <Section eyebrow="Poll" title="Poll status when work is pending">
          <CodeBlock>{`curl https://certscore.ai/api/v2/scans/{scanId}/status \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY"`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Honor <code className="rounded bg-white px-1">Retry-After</code> on pending or throttled responses. Queue time and page
            runtime can exceed the current HTTP request hold window.
          </p>
        </Section>

        <Section eyebrow="Review" title="Retrieve findings">
          <CodeBlock>{`curl https://certscore.ai/api/v2/scans/{scanId}/findings \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY"`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Findings are sourced from already-projected public report artifacts. Evidence examples are compact and capped for
            public API use.
          </p>
        </Section>

        <Section eyebrow="Latest domain" title="Find the latest eligible scan">
          <CodeBlock>{`curl https://certscore.ai/api/v2/domains/example.com/latest \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY"`}</CodeBlock>
        </Section>

        <Section eyebrow="Runtime inventory" title="Retrieve pre-consent cookies and trackers">
          <CodeBlock>{`curl https://certscore.ai/api/v2/scans/{scanId}/pre-consent-cookies-trackers \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY"`}</CodeBlock>
        </Section>
      </div>
    </DeveloperShell>
  );
}
