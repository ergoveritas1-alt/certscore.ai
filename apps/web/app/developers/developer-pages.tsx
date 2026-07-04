import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { absoluteUrl, createBreadcrumbSchema, createPublicArticleSchema } from "../../lib/seo";

export const developerSearchTopics = [
  "CertScore API",
  "website risk API",
  "privacy scan API",
  "cookie compliance scan API",
  "MCP server for website compliance review",
  "automated public-web risk signals",
  "evidence-backed website scan API"
] as const;

export const developerPages = [
  {
    href: "/developers/quickstart",
    label: "Quickstart",
    description: "Create a scan, poll status, retrieve findings, and review public-safe scan resources."
  },
  {
    href: "/developers/reference",
    label: "API reference",
    description: "Resource routes, status behavior, error shape, rate limits, and public-safe evidence rules."
  },
  {
    href: "/developers/sdk",
    label: "TypeScript SDK",
    description: "Use ergonomic resource clients for scans, findings, and domains."
  },
  {
    href: "/developers/mcp",
    label: "MCP server",
    description: "Connect agents to CertScore tools for public website risk-signal review."
  },
  {
    href: "/developers/examples",
    label: "Examples",
    description: "Copyable curl, SDK, and agent workflows for common integration paths."
  }
] as const;

export const apiV2Routes = [
  ["POST", "/api/v2/scans", "Create or reuse a public scan through the resource API."],
  ["GET", "/api/v2/scans/{scanId}", "Retrieve the public-safe scan resource."],
  ["GET", "/api/v2/scans/{scanId}/status", "Check scan or job status without inferring from partial evidence."],
  ["GET", "/api/v2/scans/{scanId}/findings", "List already-projected public findings for a scan."],
  ["GET", "/api/v2/scans/{scanId}/findings/{findingId}", "Retrieve one public-safe finding and capped evidence summary."],
  ["GET", "/api/v2/scans/{scanId}/pulse", "Retrieve the Pulse projection wrapper for a completed public scan."],
  ["GET", "/api/v2/scans/{scanId}/pre-consent-cookies-trackers", "Retrieve Pre-consent Cookies & Trackers report table data as public-safe JSON."],
  ["GET", "/api/v2/domains/{domain}/latest", "Find the latest eligible public scan for a domain."],
  ["GET", "/api/v2/domains/{domain}/latest/pre-consent-cookies-trackers", "Retrieve the latest-domain Pre-consent Cookies & Trackers table projection."],
  ["GET", "/api/v2/health", "Check API v2 discovery health."]
] as const;

export const mcpTools = [
  ["create_scan", "Deprecated compatibility alias of scan_site. Start a CertScore Pulse scan for a public URL and return immediately with status, scan, and polling links."],
  ["scan_site", "Start or reuse a CertScore public-web scan for a public URL."],
  ["get_scan", "Retrieve the API v2 public-safe scan resource for a stable scan ID."],
  ["get_scan_status", "Pass scanId (preferred, API v2). Pass jobId only for a just-created scan that has not yet returned a scanId."],
  ["get_report", "Retrieve a summary CertScore Pulse report by stable scan ID. Use get_evidence for the larger bounded evidence packet."],
  ["get_evidence", "Retrieve the bounded structured Evidence JSON packet for a stable scan ID. Excludes raw cookie values, raw bodies, sensitive payloads, full DOM, and unredacted query values."],
  ["export_findings", "Return structured findings from a CertScore Pulse report for downstream review or ticketing workflows."],
  ["list_findings", "List API v2 public-safe findings already projected for a scan."],
  ["get_pre_consent_cookies_trackers", "Retrieve the public-safe Cookies & Trackers (Pre-consent) report table as compact JSON for a scan."],
  ["explain_finding", "Explain a single CertScore finding with public evidence, caveats, and reviewer next steps."],
  ["get_latest_domain_scan", "Retrieve the latest eligible API v2 public-safe scan for a domain."],
  ["get_latest_domain_pre_consent_cookies_trackers", "Retrieve the public-safe Cookies & Trackers (Pre-consent) table from the latest eligible scan for a domain."]
] as const;

export function DeveloperJsonLd({ path, title, description }: { path: string; title: string; description: string }) {
  const schemas = [
    createPublicArticleSchema({
      about: [...developerSearchTopics],
      description,
      path,
      title,
      type: "TechArticle"
    }),
    createBreadcrumbSchema([
      { name: "Home", path: "/" },
      { name: "Developers", path: "/developers" },
      ...(path === "/developers" ? [] : [{ name: title, path }])
    ]),
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "CertScore API",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      url: absoluteUrl("/developers"),
      description:
        "Public API, TypeScript SDK, and MCP server for evidence-backed website risk-signal review."
    },
    {
      "@context": "https://schema.org",
      "@type": "WebAPI",
      name: "CertScore API v2",
      url: absoluteUrl("/api/v2/openapi.json"),
      documentation: absoluteUrl("/developers/reference"),
      provider: {
        "@type": "Organization",
        name: "CertScore.ai",
        url: absoluteUrl("/")
      },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "developer support",
        email: "support@certscore.ai",
        url: "mailto:support@certscore.ai"
      },
      termsOfService: absoluteUrl("/terms"),
      description:
        "Resource-oriented API for automated public-web observations, scan status, public-safe findings, and pre-consent cookies/trackers."
    }
  ];

  return (
    <>
      {schemas.map((schema) => (
        <script key={JSON.stringify(schema)} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      ))}
    </>
  );
}

export function DeveloperShell({
  activePath,
  title,
  description,
  children
}: {
  activePath: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-50">
      <DeveloperJsonLd path={activePath} title={title} description={description} />
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="max-w-3xl space-y-4">
            <Badge tone="neutral">Developer docs</Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">{title}</h1>
            <p className="text-lg leading-8 text-slate-600">{description}</p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
              CertScore outputs are automated public-web observations for review. They are not legal advice, certification, or a
              compliance determination.
            </p>
          </div>
          <nav aria-label="Developer documentation" className="mt-8 flex flex-wrap gap-2">
            <Link
              className={navClass(activePath === "/developers")}
              href="/developers"
            >
              Overview
            </Link>
            {developerPages.map((page) => (
              <Link key={page.href} className={navClass(activePath === page.href)} href={page.href}>
                {page.label}
              </Link>
            ))}
          </nav>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="space-y-12">
          {children}
          <DeveloperSupportCallout />
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}

function navClass(active: boolean) {
  return [
    "inline-flex rounded-full border px-3 py-2 text-sm font-semibold transition",
    active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
  ].join(" ");
}

export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs leading-6 text-slate-100">
      <code>{children}</code>
    </pre>
  );
}

export function AgentQuickPath() {
  return (
    <section id="agent-quickstart" className="rounded-lg border border-sky-200 bg-sky-50 p-5">
      <div className="max-w-3xl space-y-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">For AI agents</p>
        <h2 className="text-xl font-semibold text-slate-950">Agent quick path</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
          <li>Read /llms.txt.</li>
          <li>Read /.well-known/certscore-ai.json.</li>
          <li>Fetch /api/v2/openapi.json.</li>
          <li>Check /api/v2/health before creating scan requests.</li>
          <li>Create or reuse a scan with POST /api/v2/scans.</li>
          <li>Poll status and honor Retry-After.</li>
          <li>Retrieve findings and pre-consent cookies/trackers.</li>
          <li>Treat outputs as automated public-web observations for review, not legal advice, certification, or a compliance determination.</li>
        </ol>
      </div>
    </section>
  );
}

export function DeveloperSupportCallout() {
  return (
    <section id="developer-support" className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="max-w-3xl space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Developer support</p>
        <h2 className="text-xl font-semibold text-slate-950">Need an API key, endpoint, SDK helper, MCP tool, or docs fix?</h2>
        <p className="text-sm leading-7 text-slate-600">
          Contact{" "}
          <a className="font-semibold text-sky-700 hover:text-sky-900" href="mailto:support@certscore.ai">
            support@certscore.ai
          </a>{" "}
          for preview API keys, feature requests, broken examples, schema questions, integration issues, or missing API coverage.
          Include the route, SDK method, MCP tool, scan ID, requested scopes, expected volume, or page URL when useful.
        </p>
      </div>
    </section>
  );
}

export function LinkCard({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Card className="border-slate-200 bg-white shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-base text-slate-950">
          <Link className="hover:text-sky-700" href={href}>
            {title}
          </Link>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-sm leading-6 text-slate-600">{description}</CardContent>
    </Card>
  );
}

export function Section({
  eyebrow,
  id,
  title,
  children
}: {
  eyebrow?: string;
  id?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="space-y-5">
      <div className="max-w-3xl space-y-2">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">{eyebrow}</p> : null}
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}
