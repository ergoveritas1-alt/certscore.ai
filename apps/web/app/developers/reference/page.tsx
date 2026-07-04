import type { Metadata } from "next";
import { createPageMetadata } from "../../../lib/seo";
import { CodeBlock, DeveloperShell, Section, apiV2Routes } from "../developer-pages";

const description =
  "Reference for the CertScore API v2 resource model, OpenAPI contract, status lifecycle, public-safe evidence summaries, errors, throttling, and legal posture.";

export const metadata: Metadata = createPageMetadata({
  description,
  path: "/developers/reference",
  robots: {
    follow: true,
    index: true
  },
  title: "CertScore API reference"
});

export default function DeveloperReferencePage() {
  return (
    <DeveloperShell activePath="/developers/reference" title="API reference" description={description}>
      <div className="space-y-12">
        <Section eyebrow="Routes" title="API v2 resources">
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

        <Section eyebrow="Contract" title="OpenAPI and operation IDs">
          <CodeBlock>{`GET https://certscore.ai/api/v2/openapi.json`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The OpenAPI contract uses stable operation IDs, explicit status examples, error examples, retry guidance, and public-safe
            evidence language for generic AI agents and developer tools.
          </p>
        </Section>

        <Section id="what-is-pulse" eyebrow="Projection" title="What is Pulse?">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Pulse is CertScore&apos;s compact public projection for agents and developer workflows. It packages the scan summary,
            top findings, evidence highlights, caveats, links, and disclaimer text derived from the same already-projected public scan
            resources and findings. API v2 exposes the scan resource as the durable object, while the Pulse wrapper is useful when an
            agent needs the report-style projection in one response. Response types such as{" "}
            <code className="rounded bg-white px-1">certscore_pulse</code> and{" "}
            <code className="rounded bg-white px-1">certscore_pulse_evidence</code> refer to that projection.
          </p>
        </Section>

        <Section eyebrow="Examples" title="Small response shapes">
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-950">Scan creation</h3>
              <CodeBlock>{`{
  "type": "certscore_scan_job",
  "jobId": "job_123",
  "scanId": "00000000-0000-4000-8000-000000000123",
  "domain": "example.com",
  "status": "queued",
  "retryAfterSeconds": 30
}`}</CodeBlock>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-950">Pending or running status</h3>
              <CodeBlock>{`{
  "type": "certscore_scan_job",
  "jobId": "job_123",
  "scanId": "00000000-0000-4000-8000-000000000123",
  "status": "running",
  "phase": "runtime_observation",
  "retryAfterSeconds": 30
}`}</CodeBlock>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-950">Completed scan</h3>
              <CodeBlock>{`{
  "type": "certscore_scan",
  "scanId": "00000000-0000-4000-8000-000000000123",
  "domain": "example.com",
  "status": "completed",
  "score": 72,
  "links": {
    "findings": "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/findings",
    "preConsentCookiesTrackers": "https://certscore.ai/api/v2/scans/00000000-0000-4000-8000-000000000123/pre-consent-cookies-trackers",
    "report": "https://certscore.ai/scan/00000000-0000-4000-8000-000000000123"
  }
}`}</CodeBlock>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-950">Partial or failed scan</h3>
              <CodeBlock>{`{
  "type": "certscore_scan",
  "scanId": "00000000-0000-4000-8000-000000000123",
  "status": "completed_limited",
  "coverage": {
    "status": "partial",
    "summary": "Automated public-web scan completed with coverage limitations."
  }
}`}</CodeBlock>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-950">Findings</h3>
              <CodeBlock>{`{
  "type": "certscore_finding_list",
  "scanId": "00000000-0000-4000-8000-000000000123",
  "findings": [
    {
      "id": "pre_consent_tracking_detected",
      "label": "Third-party tracking observed before recorded consent",
      "criticality": "high",
      "evidence": {
        "basis": "public_report_projection",
        "exampleCount": 3,
        "examplesShown": 2
      }
    }
  ]
}`}</CodeBlock>
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-slate-950">Pre-consent cookies/trackers</h3>
              <CodeBlock>{`{
  "type": "certscore_pre_consent_cookies_trackers",
  "summary": {
    "rowCount": 28,
    "trackerCount": 24,
    "cookieCount": 4,
    "requestCount": 14
  },
  "rows": [
    {
      "kind": "tracker",
      "vendor": "LinkedIn Insight Tag",
      "host": "snap.licdn.com",
      "purpose": "Advertising",
      "evidenceBasis": "public_report_projection"
    }
  ]
}`}</CodeBlock>
            </div>
          </div>
        </Section>

        <Section eyebrow="Runtime inventory" title="Pre-consent Cookies & Trackers JSON">
          <CodeBlock>{`GET /api/v2/scans/{scanId}/pre-consent-cookies-trackers
GET /api/v2/domains/{domain}/latest/pre-consent-cookies-trackers

{
  "type": "certscore_pre_consent_cookies_trackers",
  "summary": {
    "rowCount": 12,
    "trackerCount": 6,
    "cookieCount": 8,
    "requestCount": 10
  },
  "rows": [
    {
      "kind": "cookie",
      "vendor": "Google",
      "host": "doubleclick.net",
      "purpose": "Advertising",
      "phase": "pre_consent",
      "evidenceBasis": "public_report_projection"
    }
  ]
}`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            This endpoint exposes the public report projection used for the Pre-consent Cookies & Trackers table. It strips cookie
            values, raw request bodies, full request URLs, sensitive query strings, internal artifacts, and scanner-only details.
            The initial version returns the complete table; server-side filters are deferred while integrations validate usage. Clients
            can group or filter rows by kind, priority, party, vendor, purpose, and host.
          </p>
        </Section>

        <Section eyebrow="Auth" title="API keys, scopes, and rate limits">
          <CodeBlock>{`Authorization: Bearer <token>

Current scopes:
- scan:read
- scan:create
- mcp`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Scoped integrations use bearer API keys. Request developer-preview keys at{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-900" href="mailto:support@certscore.ai">
              support@certscore.ai
            </a>{" "}
            with your organization, integration type, expected volume, and requested scopes. HTTP 202 pending responses and HTTP 429
            throttled responses may include <code className="rounded bg-white px-1">Retry-After</code>; agents and SDKs should honor
            that value rather than tight polling.
          </p>
        </Section>

        <Section eyebrow="Errors" title="Public-safe error envelope">
          <CodeBlock>{`{
  "type": "certscore_api_error",
  "error": {
    "code": "not_found",
    "message": "Scan not found."
  },
  "links": {
    "docs": "https://certscore.ai/developers/reference"
  }
}`}</CodeBlock>
          <div className="grid gap-5 pt-2 lg:grid-cols-3">
            <CodeBlock>{`HTTP 401
{
  "type": "certscore_api_error",
  "error": {
    "code": "unauthorized",
    "message": "Missing or invalid API key."
  }
}`}</CodeBlock>
            <CodeBlock>{`HTTP 429
Retry-After: 60
{
  "type": "certscore_api_error",
  "error": {
    "code": "rate_limited",
    "message": "Retry later.",
    "retryAfterSeconds": 60
  }
}`}</CodeBlock>
            <CodeBlock>{`HTTP 500
{
  "type": "certscore_api_error",
  "error": {
    "code": "internal_error",
    "message": "CertScore API v2 is temporarily unavailable."
  }
}`}</CodeBlock>
          </div>
        </Section>

        <Section eyebrow="Status" title="Polling and retry behavior">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              ["completed", "The scan resource and public-safe projections are ready."],
              ["pending/running/finalizing", "Poll the status resource and honor Retry-After when present."],
              ["failed/not_found/throttled", "Use the public error envelope and do not infer missing findings from failed work."]
            ].map(([title, body]) => (
              <div key={title} className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Evidence discipline" title="What API v2 exposes">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            API v2 exposes scan resources, status, already-projected findings, public-safe evidence summaries, latest-domain lookup,
            and report-ready review context. It does not expose raw DOM, raw request bodies, internal scanner artifacts, internal reasoning, or
            display-only findings.
            Failed or partial scans should be surfaced as incomplete evidence, not compliance failures. Do not infer legal conclusions from
            scan output.
          </p>
        </Section>
      </div>
    </DeveloperShell>
  );
}
