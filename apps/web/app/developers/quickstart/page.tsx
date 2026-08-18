import type { Metadata } from "next";
import Link from "next/link";
import { createPageMetadata } from "../../../lib/seo";
import { AgentQuickPath, CodeBlock, DeveloperShell, LightMcpCallout, Section } from "../developer-pages";

const description =
  "Start using the CertScore.ai API v2 with curl: create a public website scan, poll status, list public-safe findings, and retrieve latest-domain scan resources.";

export const metadata: Metadata = createPageMetadata({
  description,
  path: "/developers/quickstart",
  robots: {
    follow: true,
    index: true
  },
  title: "CertScore.ai API quickstart"
});

export default function DeveloperQuickstartPage() {
  return (
    <DeveloperShell activePath="/developers/quickstart" title="API quickstart" description={description}>
      <div className="space-y-12">
        <LightMcpCallout />
        <AgentQuickPath />

        <section className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Already know you want an MCP connection?</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">Skip the API key setup</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">Light MCP is the fastest route for a first scan. It uses the same public-safe scan pipeline without account creation, OAuth, or credentials.</p>
          <Link className="mt-5 inline-flex rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800" href="/mcp/light#quickstart">
            Go to Light MCP setup
          </Link>
        </section>

        <Section id="api-key-access" eyebrow="Access" title="Get a scoped API key">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            CertScore.ai API, SDK, and MCP integrations use bearer API keys. Read-only report retrieval and MCP read tools can use a
            self-serve key after sign-in and email verification. Scan creation keys remain developer-preview and are issued by
            emailing{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-900" href="mailto:support@certscore.ai">
              support@certscore.ai
            </a>
            .
          </p>
          <CodeBlock>{`Self-serve read-only key:
1. Sign in at https://certscore.ai/login and verify your email.
2. POST https://certscore.ai/api/v2/keys/request from the signed-in browser session.
3. Store the returned cs_ro_ key and use it as CERTSCORE_API_KEY.

curl -X POST https://certscore.ai/api/v2/keys/request \\
  -H "Content-Type: application/json" \\
  --data '{"name":"Read-only MCP key"}'`}</CodeBlock>
          <CodeBlock>{`Recommended scopes by integration:
- REST API read-only: scan:read
- REST API scan creation: scan:read, scan:create
- TypeScript SDK: scan:read, scan:create
- MCP read tools: scan:read, mcp
- MCP scan creation: scan:read, scan:create, mcp`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Self-serve keys are prefixed <code className="rounded bg-white px-1">cs_ro_</code>, expire after 90 days, and are limited
            to read-only report/API access plus MCP. For <code className="rounded bg-white px-1">scan:create</code>, include your
            organization, integration type, expected volume, callback or contact email, and requested scopes when emailing support.
          </p>
        </Section>

        <Section id="no-account-scan" eyebrow="No account" title="Run a low-volume scan without signup">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            For discovery and evaluation, an agent can create a scan without an account or bearer token. New anonymous scans are limited
            to 20 per requester IP per UTC day; an eligible recent-result reuse does not consume the quota. Contact support@certscore.ai for a higher-volume allowance. Poll the returned status
            resource and then retrieve findings. Use a scoped key or hosted OAuth for repeated or higher-volume workflows.
          </p>
          <CodeBlock>{`curl -X POST https://certscore.ai/api/v2/scans \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html","freshness":"latest","scanFrom":"eu_ie"}'`}</CodeBlock>
        </Section>

        <Section eyebrow="Health" title="Check the public API surface">
          <CodeBlock>{`curl https://certscore.ai/api/v2/health
curl https://certscore.ai/api/v2/openapi.json`}</CodeBlock>
        </Section>

        <Section id="complete-curl-workflow" eyebrow="Complete curl workflow" title="Create, poll, and retrieve review data">
          <CodeBlock>{`export CERTSCORE_API_KEY="cs_live_..."
TARGET_URL="https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html"

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
    "url": "https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html",
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
          <CodeBlock>{`curl https://certscore.ai/api/v2/domains/ergoveritas.com/latest \\
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
