import type { Metadata } from "next";
import { createPageMetadata } from "../../../lib/seo";
import { CodeBlock, DeveloperShell, Section } from "../developer-pages";

const description =
  "Use the CertScore TypeScript SDK for scan, status, finding, and domain latest workflows with resource clients.";

export const metadata: Metadata = createPageMetadata({
  description,
  path: "/developers/sdk",
  robots: {
    follow: true,
    index: true
  },
  title: "CertScore TypeScript SDK"
});

export default function DeveloperSdkPage() {
  return (
    <DeveloperShell activePath="/developers/sdk" title="TypeScript SDK" description={description}>
      <div className="space-y-12">
        <Section eyebrow="Preview" title="Use the SDK source package">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The TypeScript SDK is available as a source preview while package distribution remains private. Source and examples live in{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-900" href="https://github.com/ergoveritas1-alt/certscore.ai/tree/main/packages/certscore-sdk">
              packages/certscore-sdk
            </a>
            . Use the REST API v2 contract directly for production integrations until a public SDK package channel is announced. The MCP
            server is distributed separately as <code className="rounded bg-slate-100 px-1">@certscore/mcp</code> and through the remote
            endpoint at <code className="rounded bg-slate-100 px-1">https://mcp.certscore.ai/mcp</code>.
          </p>
        </Section>

        <Section eyebrow="Access" title="API keys and scopes">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The SDK sends <code className="rounded bg-slate-100 px-1">Authorization: Bearer &lt;token&gt;</code>. Read-only workflows need{" "}
            <code className="rounded bg-slate-100 px-1">scan:read</code>. Creating scans requires{" "}
            <code className="rounded bg-slate-100 px-1">scan:create</code>, which is support-gated for launch. New scan requests may use{" "}
            <code className="rounded bg-slate-100 px-1">scanFrom</code> values <code className="rounded bg-slate-100 px-1">eu_ie</code>,{" "}
            <code className="rounded bg-slate-100 px-1">eu_de</code>, or{" "}
            <code className="rounded bg-slate-100 px-1">california</code>.
          </p>
        </Section>

        <Section eyebrow="Resource clients" title="Create a scan and wait for completion">
          <CodeBlock>{`import { CertScoreClient } from "@certscore/sdk";

const certscore = new CertScoreClient({
  apiKey: process.env.CERTSCORE_API_KEY
});

const created = await certscore.scans.create("https://example.com", {
  freshness: "latest",
  scanFrom: "eu_ie"
});

const completed = await certscore.scans.wait(created);
const scanId = completed.scanId;

const status = await certscore.scans.status(scanId);
const findings = await certscore.findings.list(scanId);
const preConsentTable = await certscore.scans.preConsentCookiesTrackers(scanId);
const pulseProjection = await certscore.pulse.get(scanId);
const pulseEvidence = await certscore.pulse.evidence(scanId);
const latest = await certscore.domains.latest("example.com");
const latestPreConsentTable = await certscore.domains.latestPreConsentCookiesTrackers("example.com");

console.log(
  status.status,
  findings.findings.length,
  preConsentTable.summary.rowCount,
  pulseProjection.type,
  pulseEvidence.type,
  latest.scan?.scanId,
  latestPreConsentTable.summary.rowCount
);`}</CodeBlock>
        </Section>

        <Section eyebrow="Available clients" title="SDK surface">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              "certscore.scans.create()",
              "certscore.scans.get()",
              "certscore.scans.preConsentCookiesTrackers()",
              "certscore.scans.status()",
              "certscore.scans.wait()",
              "certscore.findings.list()",
              "certscore.findings.get()",
              "certscore.findings.explain()",
              "certscore.pulse.get()",
              "certscore.pulse.evidence()",
              "certscore.domains.latest()",
              "certscore.domains.latestPreConsentCookiesTrackers()",
              "certscore.scan()"
            ].map((client) => (
              <code key={client} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800">
                {client}
              </code>
            ))}
          </div>
        </Section>
      </div>
    </DeveloperShell>
  );
}
