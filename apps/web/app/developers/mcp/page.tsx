import type { Metadata } from "next";
import { createPageMetadata } from "../../../lib/seo";
import { CodeBlock, DeveloperShell, Section, mcpTools } from "../developer-pages";

const description =
  "Connect agents to the CertScore MCP server for website compliance review workflows using scan, status, finding, explanation, and latest-domain tools.";

export const metadata: Metadata = createPageMetadata({
  description,
  path: "/developers/mcp",
  robots: {
    follow: true,
    index: true
  },
  title: "CertScore MCP server"
});

export default function DeveloperMcpPage() {
  return (
    <DeveloperShell activePath="/developers/mcp" title="MCP server" description={description}>
      <div className="space-y-12">
        <Section eyebrow="Install" title="Run the stdio server locally">
          <CodeBlock>{`CERTSCORE_API_KEY=<token> pnpm mcp:certscore`}</CodeBlock>
        </Section>

        <Section eyebrow="Client config" title="Example MCP configuration">
          <CodeBlock>{`{
  "mcpServers": {
    "certscore": {
      "command": "pnpm",
      "args": ["mcp:certscore"],
      "env": {
        "CERTSCORE_API_KEY": "<token>"
      }
    }
  }
}`}</CodeBlock>
        </Section>

        <Section eyebrow="Tools" title="Agent-facing tool surface">
          <div className="grid gap-4 md:grid-cols-2">
            {mcpTools.map(([name, description]) => (
              <div key={name} className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="font-mono text-sm font-semibold text-slate-950">{name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Workflow" title="Recommended agent sequence">
          <CodeBlock>{`1. scan_site with a public URL.
2. get_scan_status when a job is pending.
3. get_scan after a stable scanId is available.
4. list_findings for compact structured review.
5. get_pre_consent_cookies_trackers when the user asks for the Cookies & Trackers (Pre-consent) table as JSON.
6. explain_finding for evidence summaries and caveats.
7. get_latest_domain_scan or get_latest_domain_pre_consent_cookies_trackers when the user asks for latest-domain data.`}</CodeBlock>
          <CodeBlock>{`get_pre_consent_cookies_trackers({
  scanId: "00000000-0000-4000-8000-000000000123"
})

get_latest_domain_pre_consent_cookies_trackers({
  domain: "example.com",
  scanFrom: "eu_ie"
})`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            MCP tools return compact public-safe JSON. They must not infer raw-signal findings or convert automated review signals into
            legal conclusions. Group Cookies & Trackers rows by vendor, purpose, and host when the user wants a short review handoff.
          </p>
        </Section>
      </div>
    </DeveloperShell>
  );
}
