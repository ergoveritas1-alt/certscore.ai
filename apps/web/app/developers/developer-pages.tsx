import Link from "next/link";
import React, { type ReactNode } from "react";
import {
  API_READ_RATE_POLICY,
  apiReadRateWindow
} from "@website-signal-risk-scanner/shared";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { absoluteUrl, createBreadcrumbSchema, createPublicArticleSchema } from "../../lib/seo";

export const developerSearchTopics = [
  "CertScore.ai API",
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
    description: "Connect agents to CertScore.ai tools for public website risk-signal review."
  },
  {
    href: "/mcp/light",
    label: "Light MCP",
    description: "Start no-account website scans from any remote MCP client."
  },
  {
    href: "/developers/examples",
    label: "Examples",
    description: "Copyable curl, SDK, and agent workflows for common integration paths."
  }
] as const;

export const apiV2Routes = [
  ["POST", "/api/v2/keys/request", "Issue a self-serve read-only + MCP key for a signed-in verified user."],
  ["GET", "/api/v2/auth/check", "Validate a bearer credential and return its granted scopes without creating a scan."],
  ["POST", "/api/v2/scans", "Create or reuse a public scan; authentication is optional for 20 new anonymous scans per requester IP per UTC day."],
  ["GET", "/api/v2/scans/{scanId}", "Retrieve the public-safe scan resource."],
  ["GET", "/api/v2/scans/{scanId}/diagnostics", "Retrieve bounded scan timing and collection diagnostics."],
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
  ["certscore_scan_site", "First call. Starts or reuses a public-web scan and waits up to 45 seconds by default. If status is queued, running, or finalizing, retain scanId and poll certscore_get_scan_status using only that scanId. Stop polling at completed, completed_limited, failed, expired, or rate_limited. For usable completion, call certscore_get_scan_bundle. No-go and limited coverage are observations, never proof of compliance."],
  ["certscore_get_scan", "Retrieve the API v2 public-safe scan resource, including completed-limited no-go disposition, reason-specific guidance, and timing when available."],
  ["certscore_get_scan_status", "Poll with only the stable scanId returned by certscore_scan_site. Active responses include phase, heartbeat, estimated progress, stalled state, and retry delay. Terminal responses include the CertScore score, risk, coverage, timestamps, report URL, and an explicit next action. Stop polling at any terminal status."],
  ["certscore_get_report", "Focused follow-up: retrieve a bounded Pulse report with high-signal TextContent and typed structuredContent, including customer-safe no-go messaging. For broad privacy questions, use certscore_get_scan_bundle first because it combines canonical findings, limitations, and pre-consent rows without redundant calls."],
  ["certscore_get_evidence", "Focused follow-up: retrieve a bounded public-safe evidence packet with a concise TextContent digest and typed structuredContent. For broad privacy questions, use certscore_get_scan_bundle first. Excludes raw cookie values, raw bodies, sensitive payloads, full DOM, and unredacted query values."],
  ["certscore_get_scan_bundle", "Call after completed or completed_limited status. Every usable completed bundle returns a self-contained concise TextContent digest plus matching structuredContent. The default summary includes the canonical report overview, up to five compact public-safe projected findings across the scan's observed domains, and bounded row-level pre-consent cookie/tracker evidence; detail=findings increases the default finding allowance, evidence adds bounded evidence digests and references, and full adds all available bounded sections. Every response declares finding and evidence total/returned/truncated counts, byte-budget metadata, omittedSections, retrieval URLs, and nextRecommendedMaxBytes when truncated. Enumerate only returned observations and projected findings. The CertScore score covers observable scan signals only; do not infer unobserved technologies or legal compliance status, and never interpret no-go, not-observed, or limited coverage as proof of compliance."],
  ["certscore_export_findings", "Return structured findings plus completed-limited no-go disposition and guidance for downstream review or ticketing workflows."],
  ["certscore_list_findings", "Focused follow-up: list bounded API v2 public-safe findings already projected by the canonical pipeline, with matching high-signal TextContent and typed structuredContent. For broad privacy questions, use certscore_get_scan_bundle first."],
  ["certscore_get_pre_consent_cookies_trackers", "Focused follow-up: retrieve bounded row-level public-safe pre-consent cookie/tracker evidence with matching TextContent and typed structuredContent. For a new broad request such as checking a site for pre-consent tracking, use certscore_scan_site then certscore_get_scan_bundle first."],
  ["certscore_explain_finding", "Explain one projected finding with public evidence, caveats, reviewer next steps, and reason-specific no-go context when applicable."],
  ["certscore_get_latest_domain_scan", "Retrieve the latest eligible API v2 public-safe scan for a domain."],
  ["certscore_get_latest_domain_pre_consent_cookies_trackers", "Focused follow-up: retrieve bounded row-level public-safe pre-consent cookie/tracker evidence from the latest eligible scan for a domain, with matching TextContent and typed structuredContent. For a broad current-site review, use certscore_scan_site then certscore_get_scan_bundle first."]
] as const;

const terminalBurstReadPolicy = apiReadRateWindow("terminal", "burst");
const terminalDailyReadPolicy = apiReadRateWindow("terminal", "daily");
const statusBurstReadPolicy = apiReadRateWindow("status", "burst");

export function ApiReadRatePolicyDetails() {
  const heavyReadWeight = API_READ_RATE_POLICY.weights.bundle;
  const heavyReadsPerBurstWindow = Math.floor(terminalBurstReadPolicy.limits.callerTarget / heavyReadWeight);
  const heavyReadsPerDailyWindow = Math.floor(terminalDailyReadPolicy.limits.callerTarget / heavyReadWeight);
  const terminalRows = [
    ["Caller + scan/resource", terminalBurstReadPolicy.limits.callerTarget, terminalDailyReadPolicy.limits.callerTarget],
    ["Scan/resource across callers", terminalBurstReadPolicy.limits.target, "—"],
    ["Caller across scans/resources", terminalBurstReadPolicy.limits.caller, "—"]
  ] as const;
  const statusRows = [
    ["Caller + scan", statusBurstReadPolicy.limits.callerTarget],
    ["Scan across callers", statusBurstReadPolicy.limits.target],
    ["Caller across scans", statusBurstReadPolicy.limits.caller]
  ] as const;

  return (
    <div
      className="space-y-5"
      data-api-read-rate-policy-version={API_READ_RATE_POLICY.version}
      data-terminal-burst-window-seconds={terminalBurstReadPolicy.windowSeconds}
      data-terminal-daily-window-seconds={terminalDailyReadPolicy.windowSeconds}
    >
      <p className="max-w-3xl text-sm leading-7 text-slate-600">
        Completed scan and domain resources use weighted, rolling limits. These protections apply in addition to account, API-key,
        and scan-creation quotas. Policy version <code className="rounded bg-white px-1">{API_READ_RATE_POLICY.version}</code>.
      </p>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
            <tr>
              <th className="px-4 py-3 font-semibold">Terminal-read scope</th>
              <th className="px-4 py-3 font-semibold">Rolling 10 minutes</th>
              <th className="px-4 py-3 font-semibold">Rolling 24 hours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-600">
            {terminalRows.map(([scope, burst, daily]) => (
              <tr key={scope}>
                <td className="px-4 py-3 font-semibold text-slate-900">{scope}</td>
                <td className="px-4 py-3">{burst} units</td>
                <td className="px-4 py-3">{typeof daily === "number" ? `${daily} units` : daily}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-950">Read weights</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            <li>Ordinary scan, finding, inventory, or domain read: {API_READ_RATE_POLICY.weights.ordinary} unit.</li>
            <li>Evidence, full report, diagnostics, export, or composite bundle: {API_READ_RATE_POLICY.weights.bundle} units.</li>
            <li>
              That permits {heavyReadsPerBurstWindow} direct heavy reads per caller and resource in 10 minutes, and{" "}
              {heavyReadsPerDailyWindow} in a rolling 24 hours.
            </li>
          </ul>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-950">Status polling</h3>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
            {statusRows.map(([scope, limit]) => <li key={scope}>{scope}: {limit} units per rolling 10 minutes.</li>)}
          </ul>
        </div>
      </div>
      <p className="max-w-3xl text-sm leading-7 text-slate-600">
        HTTP 429 and MCP rate-limit errors include <code className="rounded bg-white px-1">Retry-After</code> when a retry time is
        available, plus machine-readable policy version, profile, scope, window, limit, usage, and requested-unit fields. Wait for
        that delay. Poll only active status resources and stop polling when a scan becomes terminal.
      </p>
    </div>
  );
}

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
      name: "CertScore.ai API",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      url: absoluteUrl("/developers"),
      description:
        "Public API, TypeScript SDK, and MCP server for evidence-backed website risk-signal review."
    },
    {
      "@context": "https://schema.org",
      "@type": "WebAPI",
      name: "CertScore.ai API v2",
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
              CertScore.ai outputs are automated public-web observations for review. They are not legal advice, certification, or a
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
          <li>Create or reuse a scan with POST /api/v2/scans; authentication is optional for up to 20 new scans per requester IP per UTC day. Contact support@certscore.ai for higher volume.</li>
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
