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

        <Section eyebrow="Auth" title="API keys, scopes, and rate limits">
          <CodeBlock>{`Authorization: Bearer <token>

Current scopes:
- pulse:read
- pulse:scan
- mcp`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Public Pulse beta requests may be unauthenticated with throttling. Scoped integrations use bearer API keys. HTTP 202
            pending responses and HTTP 429 throttled responses may include <code className="rounded bg-white px-1">Retry-After</code>;
            agents and SDKs should honor that value rather than tight polling.
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
            and Pulse projections. It does not expose raw DOM, raw request bodies, internal scanner artifacts, internal reasoning, or
            display-only findings.
          </p>
        </Section>
      </div>
    </DeveloperShell>
  );
}
