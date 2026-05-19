import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import {
  PULSE_COVERAGE_LIMITATION_COPY,
  PULSE_STANDARD_DISCLAIMER
} from "../../lib/pulse/constants";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "CertScore Pulse API",
  description:
    "Agent-readable instructions for using the CertScore Pulse API to retrieve evidence-backed public-web scan summaries for URLs.",
  path: "/api-pulse",
  robots: {
    follow: true,
    index: true
  }
});

const examples = [
  {
    label: "Standard JSON",
    href: "https://certscore.ai/api/v1/pulse?url=https://example.com"
  },
  {
    label: "Markdown",
    href: "https://certscore.ai/api/v1/pulse?url=https://example.com&format=markdown"
  },
  {
    label: "Tiny JSON",
    href: "https://certscore.ai/api/v1/pulse?url=https://example.com&detail=tiny"
  },
  {
    label: "Full public projection",
    href: "https://certscore.ai/api/v1/pulse?url=https://example.com&detail=full"
  },
  {
    label: "Refresh scan request",
    href: "https://certscore.ai/api/v1/pulse?url=https://example.com&freshness=refresh"
  },
  {
    label: "Wait up to 60 seconds",
    href: "https://certscore.ai/api/v1/pulse?url=https://example.com&wait=60"
  },
  {
    label: "Immutable scan-backed Pulse",
    href: "https://certscore.ai/api/v1/pulse?scanId=<scan_id>&detail=full"
  },
  {
    label: "Job status",
    href: "https://certscore.ai/api/v1/pulse/status/<jobId>"
  }
];

const parameters = [
  ["url", "Public URL or domain to summarize. Use this for first-time or latest-domain lookup."],
  ["scanId", "Existing public eligible scan ID. Use this later for an immutable scan-backed Pulse response."],
  ["jobId", "Existing Pulse job ID. Use this to resolve or check an async Pulse request."],
  ["format", "`json` or `markdown`. Defaults to `json`."],
  ["detail", "`tiny`, `standard`, or `full`. Defaults to `standard`."],
  ["freshness", "`latest` or `refresh`. Defaults to `latest`."],
  ["wait", "Integer seconds from 0 to 80. If a new scan is queued, CertScore may hold the request up to this window."]
] as const;

const responseExpectations = [
  "HTTP 200 means a completed Pulse response was returned.",
  "HTTP 202 means scan work is queued, running, or finalizing. Store `jobId`, `statusUrl`, and any `scanId` if present.",
  "HTTP 429 means expensive scan creation is throttled. Use `Retry-After` and the response body retry metadata.",
  "HTTP 400 means the URL or input could not be accepted.",
  "HTTP 404 means the requested scan or job was not found or is not public eligible.",
  "Completed Pulse responses include `scanId`, `scan_id`, `links.fullReportUrl`, and immutable scan-backed Pulse URLs."
];

export default function ApiPulsePage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="max-w-3xl space-y-4">
            <Badge tone="neutral">Agent API</Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">CertScore Pulse API</h1>
            <p className="text-lg leading-8 text-slate-600">
              Retrieve a quick, evidence-backed CertScore summary for a public URL. Pulse is designed for AI agents, developer tools,
              CLIs, and humans that need a compact scan summary with links to the durable full report.
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              {PULSE_STANDARD_DISCLAIMER}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 py-12">
        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle>One request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-slate-600">
            <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
              GET https://certscore.ai/api/v1/pulse?url=https://example.com
            </pre>
            <p>
              If a completed eligible scan exists, the API returns a completed Pulse. If no completed scan exists, the API may queue a new scan
              and return a pending status response with `jobId`, `statusUrl`, and `nextCheckUrl`.
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle>Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
              {parameters.map(([name, description]) => (
                <div key={name} className="rounded-lg border border-slate-200 p-3">
                  <p className="font-semibold text-slate-950">{name}</p>
                  <p>{description}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle>What to expect</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
              {responseExpectations.map((item) => (
                <p key={item} className="rounded-lg border border-slate-200 p-3">
                  {item}
                </p>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle>Examples</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm md:grid-cols-2">
            {examples.map((example) => (
              <div key={example.label} className="rounded-lg border border-slate-200 p-3">
                <p className="font-semibold text-slate-950">{example.label}</p>
                <code className="mt-2 block break-all text-xs leading-5 text-slate-600">{example.href}</code>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle>Throttling and wait behavior</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-7 text-slate-600">
              <p>
                Retrieving an existing completed Pulse is cheap and should remain available under normal abuse protections. Creating or refreshing
                scan work is more expensive and is limited to one new Pulse scan per normalized domain every five minutes.
              </p>
              <p>
                If refresh is throttled but a completed scan exists, CertScore may return the latest completed Pulse with `refresh.performed=false`.
                If no completed scan exists and scan creation is throttled, the API returns HTTP 429 with `Retry-After`.
              </p>
              <p>
                `wait` accepts 0 to 80 seconds. If work finishes during the wait window, the API can return the completed Pulse. Otherwise, expect
                HTTP 202 and poll the status URL.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle>Durable report handles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-7 text-slate-600">
              <p>
                Store `scanId` from any completed or pending Pulse response when present. Use it later to retrieve the usual full report page:
              </p>
              <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                https://certscore.ai/scan/&lt;scan_id&gt;
              </pre>
              <p>For structured API retrieval from the same scan, use:</p>
              <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-100">
                https://certscore.ai/api/v1/pulse?scanId=&lt;scan_id&gt;&amp;detail=full
              </pre>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle>Interpreting findings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-slate-600">
            <p>
              Pulse summarizes already-surfaced public report findings and review context. It does not create findings from raw signals, and
              absence of findings should not be interpreted as absence of risk.
            </p>
            <p>{PULSE_COVERAGE_LIMITATION_COPY}</p>
            <p>
              For finding definitions, evidence standards, and reviewer questions, use the{" "}
              <Link href="/findings" className="font-semibold text-sky-700">
                CertScore findings reference
              </Link>
              .
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle>Reference links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm">
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/api/v1/openapi.json">
              OpenAPI JSON
            </Link>
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/.well-known/certscore-pulse">
              Discovery JSON
            </Link>
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/findings">
              Findings reference
            </Link>
            <a className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="mailto:support@certscore.ai">
              support@certscore.ai
            </a>
          </CardContent>
        </Card>
      </section>
      <SiteFooter />
    </main>
  );
}
