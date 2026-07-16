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
  "Discover the CertScore.ai API, TypeScript SDK, and MCP server for evidence-backed website risk API workflows, privacy scan API use cases, cookie compliance scan API checks, and AI agent integrations.";

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
  title: "CertScore.ai API developer hub"
});

export default function DevelopersPage() {
  return (
    <DeveloperShell activePath="/developers" title="CertScore.ai API" description={description}>
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
            Use a scoped bearer API key for the REST API, TypeScript SDK, or MCP server. Read-only + MCP access is self-serve for
            signed-in verified users through <code className="rounded bg-white px-1">POST /api/v2/keys/request</code>. Request{" "}
            <code className="rounded bg-white px-1">scan:create</code> preview access at{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-900" href="mailto:support@certscore.ai">
              support@certscore.ai
            </a>
            . Include your organization, intended workflow, expected request volume, and requested scopes.
          </p>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            Agents that do not have an account can use <code className="rounded bg-white px-1">POST /api/v2/scans</code> without a
            bearer token. New anonymous scans are limited to 20 per requester IP per UTC day; recent-result reuse does not consume
            that quota. Every response points higher-volume users to support@certscore.ai.
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
