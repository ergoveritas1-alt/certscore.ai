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
            CertScore API, SDK, and MCP integrations use bearer API keys. Signed-in verified users can request self-serve keys after
            email verification: <code className="rounded bg-white px-1">cs_ro_</code> for read-only + MCP access, or{" "}
            <code className="rounded bg-white px-1">cs_rw_</code> for low-volume scan creation. Higher-volume scan creation is available
            by emailing{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-900" href="mailto:support@certscore.ai">
              support@certscore.ai
            </a>
            .
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="font-semibold text-slate-950">Dashboard path</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Sign in, verify email, then open{" "}
                <a className="font-semibold text-sky-700 hover:text-sky-900" href="/app/settings">
                  Settings &gt; Developer API keys
                </a>{" "}
                and choose read-only or read + create scans.
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="font-semibold text-slate-950">Automation path</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Use <code className="rounded bg-white px-1">POST /api/v2/keys/request</code> from a signed-in browser session when you
                want to script key creation.
              </p>
            </div>
          </div>
          <CodeBlock>{`Self-serve read-only key:
1. Sign in at https://certscore.ai/login and verify your email.
2. Open https://certscore.ai/app/settings and create a read-only key.
3. Store the returned cs_ro_ key and use it as CERTSCORE_API_KEY.

curl -X POST https://certscore.ai/api/v2/keys/request \\
  -H "Content-Type: application/json" \\
  --data '{"name":"Read-only MCP key"}'

Self-serve scan-creation key:
curl -X POST https://certscore.ai/api/v2/keys/request \\
  -H "Content-Type: application/json" \\
  --data '{"name":"SDK trial scan key","access":"scan_create"}'`}</CodeBlock>
          <CodeBlock>{`Recommended scopes by integration:
- cs_ro_: scan:read, mcp
- cs_rw_: scan:read, scan:create, mcp
- REST/SDK read-only: use cs_ro_
- REST/SDK scan creation: use cs_rw_
- Claude/remote MCP read tools: OAuth grants scan:read + mcp by default
- Claude/remote MCP scan creation: grant-gated scan:create per OAuth client`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Self-serve keys expire after 90 days. <code className="rounded bg-white px-1">cs_rw_</code> keys include{" "}
            <code className="rounded bg-white px-1">scan:create</code> and are limited to 5 fresh scan creations per day for launch.
            Include your organization, integration type, expected volume, callback or contact email, and requested scopes when emailing
            support for higher volume.
          </p>
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
