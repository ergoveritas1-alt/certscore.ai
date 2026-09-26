import type { Metadata } from "next";
import { PUBLIC_CERTSCORE_SDK_VERSION } from "../../../lib/public-integration-versions";
import { createPageMetadata } from "../../../lib/seo";
import { CodeBlock, DeveloperShell, Section } from "../developer-pages";

const description =
  "Use the CertScore.ai TypeScript SDK for scan, status, finding, and domain latest workflows with resource clients.";

export const metadata: Metadata = createPageMetadata({
  description,
  path: "/developers/sdk",
  robots: {
    follow: true,
    index: true
  },
  title: "CertScore.ai TypeScript SDK"
});

export default function DeveloperSdkPage() {
  return (
    <DeveloperShell activePath="/developers/sdk" title="TypeScript SDK" description={description}>
      <div className="space-y-12">
        <Section eyebrow="Package" title="Install the TypeScript SDK">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The TypeScript SDK is published as{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-900" href="https://www.npmjs.com/package/@certscore/sdk">
              @certscore/sdk
            </a>
            . Use version <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">{PUBLIC_CERTSCORE_SDK_VERSION}</code> or newer for typed privacy workpapers, GPC observations and activity comparisons, and Accept/Reject after-click summaries on Pulse and API v2 scan resources, plus API v2 scan creation in EU-Germany, EU-Ireland, and California. Source and examples live in{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-900" href="https://github.com/ergoveritas1-alt/certscore.ai/tree/main/packages/certscore-sdk">
              packages/certscore-sdk
            </a>
            .
          </p>
          <CodeBlock>{`npm install @certscore/sdk`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            SDK requests identify themselves with <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">X-CertScore-Client: sdk</code> by default. The optional <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">clientName</code> setting is reserved for trusted integrations that share the SDK runtime with MCP.
          </p>
        </Section>

        <Section eyebrow="Completed with limited coverage" title="Handle no-go results as usable outcomes">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            A scan that reached a blocked, placeholder, prelaunch, error, or otherwise unusable page resolves normally with
            <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">status: completed_limited</code>.
            Inspect the typed noGo object for customer-safe messaging, attribution, retry guidance, and a bounded evidence excerpt.
          </p>
          <CodeBlock>{`const scan = await certscore.scans.wait(created);

if (scan.resultDisposition === "no_go" && scan.noGo) {
  console.log(scan.noGo.title);
  console.log(scan.noGo.explanation);
  console.log(scan.noGo.limitationKind);
  console.log(scan.noGo.recommendedNextAction);
  console.log(scan.noGo.evidenceExcerpt ?? "No excerpt retained");
}`}</CodeBlock>
        </Section>

        <Section eyebrow="Resource clients" title="Create a scan and wait for completion">
          <CodeBlock>{`import { CertScoreClient } from "@certscore/sdk";

const certscore = new CertScoreClient({
  apiKey: process.env.CERTSCORE_API_KEY
});

const created = await certscore.scans.create("https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html", {
  freshness: "latest",
  scanFrom: "eu_ie"
});

const completed = await certscore.scans.wait(created);
const scanId = completed.scanId;

console.log(
  completed.gpcResponse?.observation?.status, // capture completion
  completed.gpcResponse?.status, // paired response
  completed.postAcceptObservation?.execution, // path completion, separate from confirmation
  completed.postAcceptObservation?.afterAction,
  completed.postRefusalObservation?.execution,
  completed.postRefusalObservation?.afterAction,
  completed.postAcceptObservation?.verdict,
  completed.postRefusalObservation?.verdict
);

const status = await certscore.scans.status(scanId);
const findings = await certscore.findings.list(scanId);
const preConsentTable = await certscore.scans.preConsentCookiesTrackers(scanId);
const latest = await certscore.domains.latest("ergoveritas.com");
const latestPreConsentTable = await certscore.domains.latestPreConsentCookiesTrackers("ergoveritas.com");

console.log(status.status, findings.findings.length, preConsentTable.summary.rowCount, latest.scan?.scanId, latestPreConsentTable.summary.rowCount);`}</CodeBlock>
        </Section>

        <Section eyebrow="Existing scans" title="Read privacy evidence and download the tracking workpaper">
          <p className="text-sm leading-7 text-slate-600">Read a completed scan without creating another. Use the observation fields even when the paired GPC comparison is indeterminate; keep the matched duration with activity counts.</p>
          <CodeBlock>{`const scan = await certscore.scans.get(scanId);
console.log(scan.privacyAuditEvidence?.controls);
console.log(scan.privacyAuditEvidence?.notices);
console.log(scan.gpcResponse?.observation);
console.log(scan.gpcResponse?.activityComparison);

// Request this follow-up when inventory or downloads are needed.
const page = await certscore.getReportEvidencePage(scanId, {
  workpaper: "tracking"
});
console.log(page.download?.url);    // JSON workpaper
console.log(page.download?.csvUrl); // inventory CSV

// Preserve the selector when continuing a paginated export.
if (page.pagination.nextCursor) {
  const nextPage = await certscore.getReportEvidencePage(scanId, {
    workpaper: "tracking",
    cursor: page.pagination.nextCursor
  });
  console.log(nextPage.entries);
}`}</CodeBlock>
          <p className="mt-3 text-sm leading-7 text-slate-600">Workpapers cover the starting page. Download links use the existing report access rules; private links expire after five minutes. Keep those links confidential. Old records can omit newer evidence fields. Control presence and notice passages are observations; use canonical findings for score effects.</p>
          <CodeBlock>{`npm install @certscore/sdk@${PUBLIC_CERTSCORE_SDK_VERSION}`}</CodeBlock>
        </Section>

        <Section eyebrow="Path outcomes" title="Count completed Accept and Reject paths">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Count both <code>succeeded</code> and <code>succeeded_with_confirmation</code> from <code>execution.status</code>.
            A completed click and bounded observation establish success; confirmation is a separate subset.
            Registered paths may omit <code>afterAction</code>. Missing historical <code>execution</code> means unavailable.
          </p>
        </Section>

        <Section eyebrow="Timing" title="Read scan runtime fields">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            API v2 scan resources and status responses include <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">startedAt</code>,{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">completedAt</code>, and{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">scanTimeSeconds</code> when timing evidence is available. Treat{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">null</code> as unavailable rather than zero.
          </p>
          <CodeBlock>{`const scan = await certscore.scans.get(scanId);
const status = await certscore.scans.status(scanId);

console.log(scan.startedAt, scan.completedAt, scan.scanTimeSeconds);
console.log(status.startedAt, status.completedAt, status.scanTimeSeconds);`}</CodeBlock>
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
              "certscore.domains.latest()",
              "certscore.domains.latestPreConsentCookiesTrackers()"
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
