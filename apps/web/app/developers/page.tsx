import type { Metadata } from "next";
import Link from "next/link";
import { createPageMetadata } from "../../lib/seo";
import {
  AgentQuickPath,
  CodeBlock,
  DeveloperShell,
  LinkCard,
  Section,
  apiV2Routes,
  developerPages,
  developerSearchTopics
} from "./developer-pages";

const description =
  "Discover the CertScore API, TypeScript SDK, and MCP server for evidence-backed website risk API workflows, privacy scan API use cases, cookie compliance scan API checks, and AI agent integrations.";

const discoveryLinks = [
  ["API v2 OpenAPI", "/api/v2/openapi.json"],
  ["Universal AI manifest", "/.well-known/certscore-ai.json"],
  ["LLM guide", "/llms.txt"],
  ["Full LLM guide", "/llms-full.txt"],
  ["Sitemap", "/sitemap.xml"]
] as const;

export const metadata: Metadata = createPageMetadata({
  description,
  path: "/developers",
  robots: {
    follow: true,
    index: true
  },
  title: "CertScore API developer hub"
});

export default function DevelopersPage() {
  return (
    <DeveloperShell activePath="/developers" title="CertScore API" description={description}>
      <div className="space-y-12">
        <AgentQuickPath />

        <Section eyebrow="Start here" title="One public integration surface for humans and agents.">
          <div className="grid gap-5 md:grid-cols-2">
            {developerPages.map((page) => (
              <LinkCard key={page.href} href={page.href} title={page.label} description={page.description} />
            ))}
          </div>
        </Section>

        <Section eyebrow="Canonical links" title="Machine-readable discovery">
          <div className="grid gap-4 md:grid-cols-2">
            {discoveryLinks.map(([label, href]) => (
              <Link key={href} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:border-sky-300 hover:text-sky-700" href={href}>
                {label}
              </Link>
            ))}
          </div>
        </Section>

        <Section eyebrow="API key access" title="Get an API key">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Use a scoped bearer API key for the REST API, TypeScript SDK, or MCP server. Keys with{" "}
            <code className="rounded bg-white px-1">scan:read</code>, <code className="rounded bg-white px-1">scan:create</code>, and{" "}
            <code className="rounded bg-white px-1">mcp</code> are self-serve for signed-in verified users through{" "}
            <code className="rounded bg-white px-1">POST /api/v2/keys/request</code>. For higher limits, email{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-900" href="mailto:support@certscore.ai">
              support@certscore.ai
            </a>
            . Include your organization, intended workflow, expected request volume, contact email, and requested scopes.
          </p>
        </Section>

        <Section eyebrow="Inline quickstart" title="Three-request curl round trip">
          <CodeBlock>{`export CERTSCORE_API_KEY="cs_live_..."

curl https://certscore.ai/api/v2/health

SCAN_RESPONSE=$(curl -sS -X POST https://certscore.ai/api/v2/scans \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $CERTSCORE_API_KEY" \\
  --data '{"url":"https://example.com","freshness":"latest","scanFrom":"eu_ie"}')

SCAN_ID=$(printf '%s' "$SCAN_RESPONSE" | jq -r '.scanId // .scan.scanId // empty')

curl -H "Authorization: Bearer $CERTSCORE_API_KEY" \\
  "https://certscore.ai/api/v2/scans/$SCAN_ID/findings"`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Scan creation requires a key with <code className="rounded bg-white px-1">scan:create</code>. If the create response
            returns a queued job instead of a scan ID, poll the returned status link or use the fuller quickstart.
          </p>
        </Section>

        <Section eyebrow="API v2" title="Resource-oriented routes">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-[0.14em] text-slate-600">
                <tr>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {apiV2Routes.map(([method, route, purpose]) => (
                  <tr key={`${method}-${route}`}>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-950">{method}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-800">{route}</td>
                    <td className="px-4 py-3 leading-6 text-slate-600">{purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section eyebrow="Agent workflow" title="Recommended request sequence">
          <CodeBlock>{`1. GET https://certscore.ai/api/v2/health
2. GET https://certscore.ai/api/v2/openapi.json
3. POST https://certscore.ai/api/v2/scans
4. GET https://certscore.ai/api/v2/scans/{scanId}/status
5. GET https://certscore.ai/api/v2/scans/{scanId}/findings
6. GET https://certscore.ai/api/v2/domains/{domain}/latest`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The API, SDK, and MCP server expose already-projected public-safe artifacts. They do not create findings from raw scanner
            evidence or turn display text into policy conclusions.
          </p>
        </Section>

        <Section eyebrow="Search phrases" title="How this surface should be described">
          <div className="flex flex-wrap gap-2">
            {developerSearchTopics.map((topic) => (
              <span key={topic} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                {topic}
              </span>
            ))}
          </div>
        </Section>
      </div>
    </DeveloperShell>
  );
}
