import type { Metadata } from "next";
import { createPageMetadata } from "../../../lib/seo";
import { CodeBlock, DeveloperShell, Section } from "../developer-pages";

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
        <Section eyebrow="Health" title="Check the public API surface">
          <CodeBlock>{`curl https://certscore.ai/api/v2/health
curl https://certscore.ai/api/v2/openapi.json`}</CodeBlock>
        </Section>

        <Section eyebrow="Create" title="Create or reuse a public scan">
          <CodeBlock>{`curl -X POST https://certscore.ai/api/v2/scans \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY" \\
  -d '{
    "url": "https://example.com",
    "detail": "standard",
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
            Findings are sourced from already-projected public report/Pulse artifacts. Evidence examples are compact and capped for
            public API use.
          </p>
        </Section>

        <Section eyebrow="Latest domain" title="Find the latest eligible scan">
          <CodeBlock>{`curl https://certscore.ai/api/v2/domains/example.com/latest \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY"`}</CodeBlock>
        </Section>
      </div>
    </DeveloperShell>
  );
}
