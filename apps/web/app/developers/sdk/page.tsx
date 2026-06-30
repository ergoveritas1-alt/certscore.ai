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
        <Section eyebrow="Install" title="Add the SDK">
          <CodeBlock>{`npm install @certscore/sdk`}</CodeBlock>
        </Section>

        <Section eyebrow="Resource clients" title="Create a scan and wait for completion">
          <CodeBlock>{`import { CertScoreClient } from "@certscore/sdk";

const certscore = new CertScoreClient({
  apiKey: process.env.CERTSCORE_API_KEY
});

const scanOrJob = await certscore.scans.create({
  url: "https://example.com",
  detail: "standard",
  scanFrom: "eu_ie"
});

const scan = scanOrJob.type === "certscore_api_scan_job"
  ? await certscore.scans.wait(scanOrJob.id)
  : scanOrJob;

const findings = await certscore.findings.list(scan.id);
const latest = await certscore.domains.latest("example.com");`}</CodeBlock>
        </Section>

        <Section eyebrow="Available clients" title="SDK surface">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              "certscore.scans.create()",
              "certscore.scans.get()",
              "certscore.scans.status()",
              "certscore.scans.wait()",
              "certscore.findings.list()",
              "certscore.findings.get()",
              "certscore.findings.explain()",
              "certscore.domains.latest()"
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
