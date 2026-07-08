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
        <Section eyebrow="Install" title="Add the SDK package">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Install the official TypeScript SDK from npm, then use a scoped CertScore API key for REST-style scan, finding, report, and
            latest-domain workflows.
          </p>
          <CodeBlock>{`npm install @certscore/sdk`}</CodeBlock>
        </Section>

        <Section eyebrow="First run" title="Scan a site, wait, and list findings">
          <CodeBlock>{`npm install @certscore/sdk
export CERTSCORE_API_KEY="cs_rw_..."

node --input-type=module <<'JS'
import { CertScore } from "@certscore/sdk";

const certscore = new CertScore({
  apiKey: process.env.CERTSCORE_API_KEY
});

const created = await certscore.scans.create("https://example.com", {
  freshness: "latest",
  scanFrom: "eu_ie"
});

console.log("Queued scan:", created.scanId, created.status);

const completed = await certscore.scans.wait(created);
const findings = await certscore.findings.list(completed.scanId);

console.log({
  scanId: completed.scanId,
  status: completed.status,
  findings: findings.findings.length,
  report: completed.links?.report
});
JS`}</CodeBlock>
        </Section>

        <Section eyebrow="Bot workflow" title="Track submission separately from scan runtime">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Browser scans create a job quickly and watch progress separately. Bots should use the same resource flow instead of measuring
            the wall time of the blocking Pulse helper as scanner runtime.
          </p>
          <CodeBlock>{`import { CertScoreClient } from "@certscore/sdk";

const certscore = new CertScoreClient({
  apiKey: process.env.CERTSCORE_API_KEY
});

const submittedAtMs = Date.now();
const created = await certscore.scans.create("https://example.com", {
  freshness: "latest",
  scanFrom: "eu_ie",
  metadata: { source: "bot" }
});

const submitLatencyMs = Date.now() - submittedAtMs;
await saveScanRow({
  scanId: created.scanId,
  status: created.status,
  submitLatencyMs
});

const completed = await certscore.scans.wait(created, {
  pollIntervalMs: 5_000,
  onStatusUpdate(status) {
    void updateScanRow(status.scanId ?? created.scanId, {
      status: status.status,
      phase: status.phase
    });
  }
});

const timings = {
  sdkWallSeconds: (Date.now() - submittedAtMs) / 1000,
  queuedSeconds: secondsBetween(completed.createdAt, completed.startedAt),
  scannerRuntimeSeconds: secondsBetween(completed.startedAt, completed.completedAt)
};

const [findings, preConsentTable] = await Promise.all([
  certscore.findings.list(completed.scanId),
  certscore.scans.preConsentCookiesTrackers(completed.scanId)
]);

await updateScanRow(completed.scanId, {
  status: completed.status,
  findingCount: findings.findings.length,
  trackerCount: preConsentTable.summary.trackerCount,
  cookieCount: preConsentTable.summary.cookieCount,
  requestCount: preConsentTable.summary.requestCount,
  timings
});

function secondsBetween(start, end) {
  if (!start || !end) return null;
  return Math.max(0, (Date.parse(end) - Date.parse(start)) / 1000);
}`}</CodeBlock>
        </Section>

        <Section eyebrow="Access" title="API keys and scopes">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The SDK sends <code className="rounded bg-slate-100 px-1">Authorization: Bearer &lt;token&gt;</code>. Read-only workflows need{" "}
            <code className="rounded bg-slate-100 px-1">scan:read</code>. Creating scans requires{" "}
            <code className="rounded bg-slate-100 px-1">scan:create</code>. Signed-in verified users can create{" "}
            <code className="rounded bg-slate-100 px-1">cs_ro_</code> and <code className="rounded bg-slate-100 px-1">cs_rw_</code> keys
            from <a className="font-semibold text-sky-700 hover:text-sky-900" href="/app/settings">Settings &gt; Developer API keys</a>.
            Automation can also use <code className="rounded bg-slate-100 px-1">POST /api/v2/keys/request</code> from a signed-in session.
            Higher-volume scan creation is available through{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-900" href="mailto:support@certscore.ai">
              support@certscore.ai
            </a>
            . New scan requests may use{" "}
            <code className="rounded bg-slate-100 px-1">scanFrom</code> values <code className="rounded bg-slate-100 px-1">eu_ie</code>,{" "}
            <code className="rounded bg-slate-100 px-1">eu_de</code>, or{" "}
            <code className="rounded bg-slate-100 px-1">california</code>.
          </p>
          <div className="grid gap-4 pt-2 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="font-semibold text-slate-950">cs_ro_</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">Read existing scans, findings, reports, latest-domain resources, and MCP read tools.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="font-semibold text-slate-950">cs_rw_</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">Everything in cs_ro_, plus 5 fresh scan creations/day for SDK and REST trials.</p>
            </div>
          </div>
        </Section>

        <Section eyebrow="Resource clients" title="Create a scan and wait for completion">
          <CodeBlock>{`import { CertScoreClient } from "@certscore/sdk";

const certscore = new CertScoreClient({
  apiKey: process.env.CERTSCORE_API_KEY
});

const submittedAtMs = Date.now();
const created = await certscore.scans.create("https://example.com", {
  freshness: "latest",
  scanFrom: "eu_ie",
  metadata: { source: "sdk-example" }
});

const completed = await certscore.scans.wait(created, {
  pollIntervalMs: 5_000,
  onStatusUpdate(status) {
    console.log("scan status", status.scanId ?? created.scanId, status.status, status.phase ?? "");
  }
});
const scanId = completed.scanId;

const status = await certscore.scans.status(scanId);
const findings = await certscore.findings.list(scanId);
const preConsentTable = await certscore.scans.preConsentCookiesTrackers(scanId);
const latest = await certscore.domains.latest("example.com");
const latestPreConsentTable = await certscore.domains.latestPreConsentCookiesTrackers("example.com");
const timings = {
  sdkWallSeconds: Math.round((Date.now() - submittedAtMs) / 100) / 10,
  queuedSeconds: secondsBetween(completed.createdAt, completed.startedAt),
  scannerRuntimeSeconds: secondsBetween(completed.startedAt, completed.completedAt)
};

console.log(status.status, findings.findings.length, preConsentTable.summary.rowCount, latest.scan?.scanId, latestPreConsentTable.summary.rowCount, timings);

function secondsBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  return Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, Math.round((endMs - startMs) / 100) / 10) : null;
}`}</CodeBlock>
        </Section>

        <Section eyebrow="Smoke test" title="Check your SDK setup without creating a scan">
          <CodeBlock>{`CERTSCORE_API_KEY="cs_ro_or_cs_rw_..." npx -y @certscore/sdk@latest certscore-sdk-doctor

# Machine-readable output:
CERTSCORE_API_KEY="cs_ro_or_cs_rw_..." npx -y @certscore/sdk@latest certscore-sdk-doctor --json`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The doctor command checks API v2 health and a read request using your key. It does not create scans or verify scan-create quota.
          </p>
        </Section>

        <Section eyebrow="Errors" title="Handle the common cases">
          <CodeBlock>{`import {
  CertScore,
  CertScoreApiError,
  CertScoreScanFailedError,
  CertScoreTimeoutError,
  ThrottledError
} from "@certscore/sdk";

const certscore = new CertScore({ apiKey: process.env.CERTSCORE_API_KEY });

try {
  const created = await certscore.scans.create("https://example.com", { scanFrom: "eu_ie" });
  const completed = await certscore.scans.wait(created, { maxWaitMs: 300_000 });
  console.log(completed.scanId);
} catch (error) {
  if (error instanceof ThrottledError) {
    console.log("Retry after", error.retryAfterSeconds ?? "a short delay");
  } else if (error instanceof CertScoreTimeoutError) {
    console.log("Resume with", error.scanId ?? error.jobId);
  } else if (error instanceof CertScoreScanFailedError) {
    console.log("Scan ended before completion", error.scanId ?? error.jobId);
  } else if (error instanceof CertScoreApiError && error.status === 401) {
    console.log("Check CERTSCORE_API_KEY and scopes.");
  } else {
    throw error;
  }
}`}</CodeBlock>
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
