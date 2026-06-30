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
  ["GET", "/api/v2/scans/{scanId}/pre-consent-cookies-trackers", "Retrieve Cookies & Trackers (Pre-consent) report table data as public-safe JSON."],
  ["GET", "/api/v2/domains/{domain}/latest", "Find the latest eligible public scan for a domain."],
  ["GET", "/api/v2/domains/{domain}/latest/pre-consent-cookies-trackers", "Retrieve the latest-domain Cookies & Trackers (Pre-consent) table projection."],
  ["GET", "/api/v2/openapi.json", "Fetch the machine-readable API v2 contract."],
  ["GET", "/api/v2/health", "Check API v2 discovery health."]
] as const;

export const mcpTools = [
  ["scan_site", "Start or reuse a CertScore scan for a public URL."],
  ["get_scan", "Retrieve an API v2 public-safe scan resource."],
  ["get_scan_status", "Check a queued scan job or a stable API v2 scan ID."],
  ["list_findings", "Return API v2 public-safe findings for handoff or review."],
  ["get_pre_consent_cookies_trackers", "Retrieve the public-safe Cookies & Trackers (Pre-consent) table as compact JSON."],
  ["explain_finding", "Explain one finding with evidence summaries, caveats, and next steps."],
  ["get_latest_domain_scan", "Find the latest eligible public scan for a domain."],
  ["get_latest_domain_pre_consent_cookies_trackers", "Retrieve the latest-domain Cookies & Trackers (Pre-consent) table projection."]
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
      <div className="mx-auto max-w-6xl px-6 py-12">{children}</div>
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
  title,
  children
}: {
  eyebrow?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="max-w-3xl space-y-2">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">{eyebrow}</p> : null}
        <h2 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}
