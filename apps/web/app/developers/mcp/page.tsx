import { PUBLIC_CERTSCORE_MCP_VERSION } from "../../../lib/public-integration-versions";
import { MCP_OAUTH_ELIGIBILITY, MCP_OAUTH_AUTHORIZATION, MCP_OAUTH_RECONNECT } from "../../../lib/mcp-public-copy";
import type { Metadata } from "next";
import Link from "next/link";
import { CopyMcpValue, McpLightTrackedLink } from "../../../components/developers/mcp-light-actions";
import { MCP_LIGHT_CURSOR_DIRECTORY_URL, MCP_LIGHT_CURSOR_INSTALL_URL, MCP_LIGHT_ROLE_PROMPTS } from "../../../lib/mcp-light-public-links";
import { createPageMetadata } from "../../../lib/seo";
import { ApiReadRatePolicyDetails, CodeBlock, DeveloperShell, Section, mcpTools } from "../developer-pages";

const description =
  "Connect agents to the free CertScore.ai website privacy scanner and cookie checker for evidence-backed cookies, trackers, consent and Reject Path observations, policy findings, regulatory review signals, and HTTPS/TLS observations.";
const lightEndpoint = "https://mcp.certscore.ai/mcp/light";
const openAiMcpDemoPath = "/videos/openai-mcp-certscore-demo.mp4";
const codexSetupCommand = "codex mcp add certscore --url https://mcp.certscore.ai/mcp/light";
const firstRunPrompt = "Scan https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html. If certscore_scan_site includes preConsentPreview, treat it as a partial preview and continue the workflow. Distinguish captured totals from bounded returned identities; use trackingVendorCount for non-operational tracking vendors and keep operationalVendors separate. Do not compare the compatibility preview trackerCount with the completed inventory's broader trackerCount. Never report preview counts as final totals. If certscore_scan_site returns a queued, running, or finalizing result, retain the returned scanId and poll certscore_get_scan_status using scanId only. If certscore_scan_site returns a retryable error without a scanId, wait for retryAfterSeconds and retry certscore_scan_site; do not call certscore_get_scan_status until a scanId exists. Once the scan reaches a terminal status, call certscore_get_scan_bundle with detail=findings and maxBytes=8000. Summarize whether the result was new or reused, the score, risk level, findings, evidence links, coverage limitations, and report URL. Explain truncation or omitted sections when present. Treat results as automated public-web observations, not legal conclusions, certifications, or compliance determinations.";
const verificationPrompt = "List the available CertScore tools and confirm that certscore_scan_site, certscore_get_scan_status, certscore_get_scan_bundle, and certscore_get_report_evidence_page are available. Then scan https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html and report whether the result was new or reused.";
const agentDisclaimer = "CertScore results are automated observations from a public-web scan. No-go, not-observed, and limited-coverage results are not proof of compliance, absence of risk, or legal status. Review the retained evidence and applicable context before relying on a finding.";

export const metadata: Metadata = createPageMetadata({
  description,
  path: "/developers/mcp",
  robots: {
    follow: true,
    index: true
  },
  title: "CertScore.ai MCP server"
});

export default function DeveloperMcpPage() {
  return (
    <DeveloperShell activePath="/developers/mcp" title="MCP server" description={description}>
      <div className="space-y-12">
        <aside aria-labelledby="marketplace-start" className="rounded-xl border border-sky-200 bg-sky-50 p-6">
          <h2 id="marketplace-start" className="text-xl font-semibold text-slate-950">Subscribed through AWS Marketplace?</h2>
          <p className="mt-2 text-sm leading-7 text-slate-700">Marketplace MCP Light uses a CertScore account, an active AWS subscription and a Marketplace API key. Follow its dedicated guide for the correct endpoint, client settings and first scan.</p>
          <Link href="/marketplace/light/guide" className="mt-3 inline-flex font-semibold text-sky-800 underline underline-offset-4">Open the Marketplace quick-start guide →</Link>
        </aside>
        <section aria-labelledby="route-choice" className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">Start here</p>
          <h2 className="mt-2 text-3xl font-semibold text-slate-950" id="route-choice">Which route should I choose?</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">Choose Hosted OAuth to scan public websites, retrieve reports and access previous scans in your workspace. Start the connection in your MCP client and follow its authorization prompts.</p>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            <article className="rounded-xl border-2 border-sky-400 bg-sky-50 p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-800">Recommended for agents</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">CertScore Hosted OAuth — scan and reports</h3>
              <p className="mt-3 text-sm leading-7 text-slate-700">Scan public websites, retrieve reports, access previous scans and check your connection through your authorized workspace.</p>
              <a className="mt-5 inline-flex rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800" href="#hosted-oauth-start">Connect Hosted OAuth</a>
            </article>
            <article className="rounded-xl border border-slate-200 bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Account-free preview</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-950">Light MCP</h3>
              <p className="mt-3 text-sm leading-7 text-slate-600">Public scanning and report retrieval with a shared limited allowance. No account or access to private workspace scans.</p>
              <Link className="mt-5 inline-flex rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 hover:border-sky-400 hover:text-sky-800" href="/mcp/light">Try Light MCP</Link>
            </article>
          </div>
          <a
            className="mt-6 inline-flex items-center rounded-md border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-800 hover:border-sky-500 hover:text-sky-950"
            href="#openai-mcp-demo"
          >
            Watch the OpenAI MCP integration demo
          </a>
          <p className="mt-4 text-sm text-slate-600">
            MCP Light release:{" "}
            <Link className="font-semibold text-sky-700 hover:text-sky-900" href="/releases/mcp-light">
              CertScore.ai MCP Light is now available
            </Link>
          </p>
        </section>

        <section
          aria-labelledby="openai-mcp-demo-title"
          className="overflow-hidden rounded-xl border border-slate-200 bg-white"
          id="openai-mcp-demo"
        >
          <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.55fr)] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">OpenAI integration path</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-950" id="openai-mcp-demo-title">
                See CertScore MCP tools run in ChatGPT
              </h2>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                This silent 2:47 recording demonstrates the OpenAI MCP integration path: a user asks ChatGPT for a public-site scan,
                ChatGPT invokes CertScore tools, presents the evidence-backed observations and tool-call details, and opens the full
                CertScore report.
              </p>
              <a
                className="mt-5 inline-flex rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                href={openAiMcpDemoPath}
                rel="noreferrer"
                target="_blank"
              >
                Open the standalone MP4
              </a>
            </div>
            <video
              aria-label="CertScore OpenAI MCP integration demonstration"
              className="w-full rounded-lg bg-slate-950 shadow-sm"
              controls
              playsInline
              preload="metadata"
            >
              <source src={openAiMcpDemoPath} type="video/mp4" />
              Your browser does not support embedded video. Open the standalone MP4 using the link beside the player.
            </video>
          </div>
        </section>

        <p className="text-sm text-sky-700"><Link href="/releases/mcp-hosted-oauth">New: connect your agent to your CertScore.ai workspace</Link></p>
        <Section id="hosted-oauth-start" eyebrow="Recommended setup" title="CertScore Hosted OAuth — scan and reports">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">Connect your agent to <code>https://mcp.certscore.ai/mcp</code> to scan public websites, retrieve reports and access previous scans. {MCP_OAUTH_ELIGIBILITY}</p>
          <ol className="mt-4 list-decimal space-y-2 pl-6 text-sm leading-7 text-slate-600">
            <li>Add the Hosted OAuth endpoint in your agent’s connectors settings. Use the Cursor configuration below when connecting Cursor.</li>
            <li>{MCP_OAUTH_AUTHORIZATION}</li>
            <li>Ask: <code>Use CertScore to scan https://your-site.com and summarize the score, coverage, findings and report link.</code></li>
          </ol>
          <p className="mt-4 text-sm leading-7 text-slate-600">The agent should call <code>certscore_scan_site</code>, poll <code>certscore_get_scan_status</code> at the returned interval, then read <code>certscore_get_scan_bundle</code>. Reuse your existing connection to this endpoint instead of installing duplicate namespaces.</p>
        </Section>

        <Section id="agent-workflows" eyebrow="Use again" title="Reusable agent workflows">
          <p className="text-sm leading-7 text-slate-600">Hosts that support MCP prompts and resources can discover these alongside the scan/report tools. If your host displays tools only, paste the instructions below into its chat.</p>
          <h3 className="mt-4 font-semibold">Optional project instructions</h3>
          <CodeBlock>{`When I request a launch or privacy review, use CertScore Hosted OAuth for the public URL I provide. Reuse a suitable retained result unless fresh observations are needed. Poll active scans at the returned interval, then summarize the bundle with findings, coverage and report link. Do not run unsolicited or scheduled scans.`}</CodeBlock>
          <p className="mt-3 text-sm text-slate-600">Save this in your project instructions only if you want that workflow. MCP resource: <code>certscore://project-instructions</code>; prompt: <code>certscore_launch_review</code>.</p>
          <h3 className="mt-4 font-semibold">Compare retained scans</h3>
          <CodeBlock>{`Compare CertScore scan [BEFORE_SCAN_ID] with [AFTER_SCAN_ID]. Fetch both bundles without creating a scan. Verify target, region, timestamps and coverage match. Summarize newly returned, persistent and no-longer-returned finding IDs. A finding missing from a later scan is not proof of resolution. Include both report links and limitations.`}</CodeBlock>
          <p className="text-sm text-slate-600">Prompt: <code>certscore_compare_scans</code>, with <code>beforeScanId</code> and <code>afterScanId</code>.</p>
          <h3 className="mt-4 font-semibold">Turn findings into a checklist</h3>
          <p className="text-sm leading-7 text-slate-600">Ask for a proposed remediation checklist for your scan ID, with finding IDs, evidence links, suggested owner roles and manual verification steps. The <code>certscore_remediation_checklist</code> prompt uses retained findings; it does not modify your website or certify that a fix worked.</p>
        </Section>
        <Section id="reconnect" eyebrow="Connection help" title="Check or reconnect your agent">
          <p className="text-sm leading-7 text-slate-600">Call <code>certscore_get_connection_status</code> (or read <code>certscore://connection</code>) for current credential status, workspace access, create permission, remaining rolling quota and a recovery action. It creates no scan. The equivalent authenticated API is <code>GET /api/v2/auth/check?diagnostics=1</code>. Quota is a snapshot, not reserved capacity.</p>
          <p className="mt-3 text-sm leading-7 text-slate-600">{MCP_OAUTH_RECONNECT}</p>
          <a className="mt-4 inline-flex rounded border border-sky-300 px-4 py-2 font-semibold text-sky-800" href="https://claude.ai/customize/connectors">Open Claude connectors to reconnect</a>
          <p className="mt-3 text-sm text-slate-600">Cursor: open MCP settings and use the existing CertScore entry. MCP recovery resource: <code>certscore://reconnect</code>. Workspace eligibility applies independently of host permission prompts.</p>
        </Section>
        <Section id="example-report" eyebrow="Preview the output" title="Read a retained example before scanning">
          <p className="text-sm leading-7 text-slate-600">This is an existing ErgoVeritas example, not a current scan of your website. The retained scan completed on September 12, 2026 at 20:26 UTC with partial coverage. Open the report for its score and detailed coverage limitations. It may be historical or unavailable; opening it does not request a fresh scan.</p>
          <a className="mt-4 inline-flex rounded border border-sky-300 px-4 py-2 font-semibold text-sky-800" href="/scan/9ba99a8c-b1ad-44c1-985f-92cef760ab40">View retained example report</a>
          <p className="mt-3 text-sm text-slate-600">MCP resource: <code>certscore://example-report</code>. Agents must preserve the report’s original timestamps and coverage and never substitute invented example results.</p>
        </Section>

        <Section eyebrow="Compare routes" title="Authentication is visible before setup">
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-[1240px] table-fixed w-full text-left text-sm">
              <colgroup>
                <col className="w-[15%]" /><col className="w-[14%]" /><col className="w-[11%]" /><col className="w-[8%]" /><col className="w-[14%]" /><col className="w-[14%]" /><col className="w-[11%]" /><col className="w-[14%]" /><col className="w-[14%]" />
              </colgroup>
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700"><tr><th className="px-4 py-3 font-semibold">Route</th><th className="px-4 py-3 font-semibold">Setup method</th><th className="px-4 py-3 font-semibold">Authentication</th><th className="px-4 py-3 font-semibold">Account</th><th className="px-4 py-3 font-semibold">Quota</th><th className="px-4 py-3 font-semibold">Available tools</th><th className="px-4 py-3 font-semibold">Intended user</th><th className="px-4 py-3 font-semibold">Website / access limits</th><th className="px-4 py-3 font-semibold">Upgrade path</th></tr></thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                <tr><td className="min-w-56 px-4 py-3 font-semibold text-slate-900">Light MCP — no authentication</td><td className="px-4 py-3">One Codex command or remote Streamable HTTP URL</td><td className="px-4 py-3">None</td><td className="px-4 py-3">Not required</td><td className="px-4 py-3">Up to 50 new scans per UTC day across Light and 5 per rolling 10 minutes; eligible reuse is free</td><td className="px-4 py-3">certscore_scan_site, certscore_get_scan_status, certscore_get_scan_bundle, certscore_get_report_evidence_page</td><td className="px-4 py-3">First-time users, testing, and discovery</td><td className="px-4 py-3">Public HTTP or HTTPS websites; public reports only</td><td className="px-4 py-3">Authenticate for volume, history, teams, or advanced tools</td></tr>
                <tr><td className="min-w-56 px-4 py-3 font-semibold text-slate-900">Hosted MCP — OAuth</td><td className="px-4 py-3">Connect the hosted endpoint from an OAuth-capable client</td><td className="px-4 py-3">OAuth authorization code with PKCE</td><td className="px-4 py-3">Required</td><td className="px-4 py-3">Higher-volume allowance based on access</td><td className="px-4 py-3">Scan/report tools, previous scans and connection status</td><td className="px-4 py-3">Recommended for agents, individuals and teams</td><td className="px-4 py-3">Active workspaces can start scans within their existing allowance</td><td className="px-4 py-3">Registered client and active workspace membership required; usage limits apply</td></tr>
                <tr><td className="min-w-56 px-4 py-3 font-semibold text-slate-900">Local MCP — scoped API key</td><td className="px-4 py-3">Install and run the local stdio server</td><td className="px-4 py-3">Scoped API key in the client environment</td><td className="px-4 py-3">Required</td><td className="px-4 py-3">Higher-volume allowance based on key access</td><td className="px-4 py-3">Tools permitted by the key scopes</td><td className="px-4 py-3">Backend, local, and controlled automation</td><td className="px-4 py-3">Protect and rotate keys; scan creation is support-gated</td><td className="px-4 py-3">Request more scopes, tools, or volume</td></tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="privacy-workpapers" eyebrow="Existing scans" title="Review CCPA evidence and export the inventory">
          <p className="text-sm leading-7 text-slate-600">Use a completed scan ID to review retained evidence. The scan bundle includes <code>privacyAuditSummary</code> and GPC facts when available. For an inventory or export request, retrieve the tracking workpaper with the same scan ID.</p>
          <CodeBlock>{`Review CertScore scan [SCAN_ID] with a CCPA/CPRA focus. Use the retained bundle. Lead with observed GPC delivery, site-recorded opt-out state and tracking activity where returned, including baseline/GPC request counts and their matched duration. Include observed Do Not Sell/Share controls and notice topics. Preserve the actual scan origin and existing score.`}</CodeBlock>
          <CodeBlock>{`Export the tracking inventory for CertScore scan [SCAN_ID]. Use certscore_get_report_evidence_page with workpaper="tracking" and return its JSON and CSV download links. Use the existing scan; preserve workpaper="tracking" with any pagination cursor.`}</CodeBlock>
          <p className="mt-3 text-sm leading-7 text-slate-600">The workpaper covers the starting page. <code>download.url</code> returns JSON and <code>download.csvUrl</code> returns the inventory CSV. Private links expire after five minutes; keep them confidential and request a fresh link after expiry. Existing workspace/public access rules and read quotas apply.</p>
          <p className="mt-3 text-sm leading-7 text-slate-600">GPC facts can remain available when the paired comparison is indeterminate. Completed Accept/Reject execution and confirmed consent are separate results. Summarize returned after-click facts, and use canonical findings for score effects.</p>
          <h3 className="mt-4 font-semibold">Refresh an older integration</h3>
          <p className="mt-2 text-sm leading-7 text-slate-600">Hosted users keep the same endpoint. If the client still shows an older tool definition, refresh its tool list or reconnect the existing connection. Local npm users can update the package below and restart their MCP process. SDK users can follow the <Link href="/developers/sdk" className="text-sky-700 underline">SDK examples</Link>.</p>
          <CodeBlock>{`npm install -g @certscore/mcp@${PUBLIC_CERTSCORE_MCP_VERSION}`}</CodeBlock>
        </Section>

        <Section id="forms-evidence" eyebrow="Forms & fields" title="Retrieve retained forms and screenshots">
          <p className="text-sm leading-7 text-slate-600">Use <code>certscore_get_report_evidence_page</code> for the completed, authorized report. Follow <code>pagination.nextCursor</code> or use the returned JSON download link. Form rows retain field metadata, evidence references, coverage and snapshot status; resolve <code>reportContentRef</code> JSON pointers within the exported document. Full-site reports include their retained additional-page forms after the crawl finishes.</p>
          <p className="mt-3 text-sm leading-7 text-slate-600">The underlying API is <code>GET /api/v2/scans/&#123;scanId&#125;/report-evidence</code>. Available snapshots are separate JPEG links returned with the evidence, subject to the report’s access rules. Images are not embedded in MCP JSON. Unavailable or withheld images must remain unavailable; do not infer a finding from their absence. The scanner does not fill or submit forms.</p>
          <p className="mt-3 text-sm leading-7 text-slate-600">Reports provide verified, masked form crops when screenshot capture succeeds; not every detected form has a screenshot. A declared/configured destination is the form action, not evidence that CertScore.ai submitted the form or observed a transfer.</p>
          <Link className="mt-4 inline-block text-sky-700 underline" href="/guides/website-form-scanning">Forms coverage and review guide</Link>
        </Section>
        <Section id="read-rate-limits" eyebrow="Read protection" title="MCP scan-resource limits">
          <ApiReadRatePolicyDetails />
          <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-600">
            Hosted MCP applies the policy before composite tool fan-out, so an over-limit bundle is rejected before it starts its
            internal API reads. Local MCP receives the same protection from the underlying CertScore API.
          </p>
        </Section>

        <Section eyebrow="Beginner workflow" title="Light MCP — no authentication">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            For account-free public scans, use the Light endpoint. Choose Hosted OAuth above to access previous scans in your workspace. Light uses Streamable HTTP and requires no signup, API key, bearer token, browser login, or OAuth,
            and provides the core workflow through <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">certscore_scan_site</code>,
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">certscore_get_scan_status</code>, and
            <code className="mx-1 rounded bg-slate-100 px-1 py-0.5">certscore_get_scan_bundle</code>, plus <code>certscore_get_report_evidence_page</code> for paginated report evidence.
          </p>
          <CodeBlock>{`Light:
${lightEndpoint}

Transport: Streamable HTTP
Authentication: None
Tools: certscore_scan_site, certscore_get_scan_status, certscore_get_scan_bundle, certscore_get_report_evidence_page`}</CodeBlock>
          <h3 className="mt-6 font-semibold text-slate-950">Cursor setup</h3>
          <div className="mt-3 flex flex-wrap gap-3">
            <McpLightTrackedLink
              className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800"
              href={MCP_LIGHT_CURSOR_INSTALL_URL}
              trackingTarget="cursor_install_developer_docs"
            >
              Add to Cursor
            </McpLightTrackedLink>
            <McpLightTrackedLink
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:border-sky-400 hover:text-sky-800"
              href={MCP_LIGHT_CURSOR_DIRECTORY_URL}
              trackingTarget="cursor_directory_developer_docs"
            >
              View Cursor Directory listing
            </McpLightTrackedLink>
          </div>
          <h3 className="mt-6 font-semibold text-slate-950">Codex setup</h3>
          <CodeBlock>{codexSetupCommand}</CodeBlock>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            Light allows up to 50 genuinely new scans per UTC day across the public Light surface and 5 per rolling 10 minutes. Reused eligible results do not consume quota.
          </p>
        </Section>

        <Section eyebrow="First run" title="Paste one prompt">
          <CodeBlock>{firstRunPrompt}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            ErgoVeritas provides stable, owned canary pages suited to demonstrating the complete scan, status, and bundle flow. The
            canary intentionally contains test signals, so its findings are useful for exercising the API rather than evaluating a production site.
          </p>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">{agentDisclaimer}</p>
        </Section>

        <Section eyebrow="Example prompts" title="Launch, vendor, and audit reviews">
          <div className="grid gap-4 lg:grid-cols-3">
            {MCP_LIGHT_ROLE_PROMPTS.map(({ label, prompt }) => (
              <article className="flex flex-col rounded-lg border border-slate-200 bg-white p-5" key={label}>
                <h3 className="font-semibold text-slate-950">{label}</h3>
                <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{prompt}</p>
                <div className="mt-5"><CopyMcpValue label={`${label} prompt`} value={prompt} /></div>
              </article>
            ))}
          </div>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Reject results distinguish confirmed post-refusal evidence from retained after-click observations. Unsupported or unavailable capture remains explicitly limited. Any finding or scoring effect comes from canonical evidence policy.
          </p>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Scan bundles may include three typed results: <code>postAcceptObservation</code> provides an ordinarily score-neutral comparison baseline, <code>postRefusalObservation</code> reports bounded Reject evidence, and <code>gpcResponse</code> is a jurisdiction-neutral comparison with <code>scoreEffect: none</code>. GPC v3 also includes <code>gpcResponse.observation</code>: bounded capture, current CMP-recorded sale/sharing state, and direct request findings. Its completion is independent of the paired comparison and does not mean GPC was honored. Count <code>execution.status</code> values <code>succeeded</code> and <code>succeeded_with_confirmation</code> as completed paths; report confirmation separately. Registered paths may omit <code>afterAction</code>. Accept/Reject <code>afterAction</code> summaries retain observed click and capture facts even when registration is unconfirmed. Request counts do not classify every request as tracking. A terminal scan status describes lifecycle only.
          </p>
        </Section>

        <Section eyebrow="JSON evidence" title="Retrieve every field of the scan report">
          <p className="text-sm leading-7 text-slate-600">OAuth and Light both expose <code>certscore_get_report_evidence_page</code>. Start with <code>scanId</code>, then pass <code>pagination.nextCursor</code> as <code>cursor</code> until <code>pagination.complete</code> is true. Entries carry JSON Pointer paths and values; oversized strings have numbered parts. Keep one snapshot and restart if it changes. Use the scan bundle for concise summaries.</p>
          <p className="mt-3 text-sm leading-7 text-slate-600">A complete export preserves the report’s findings, evidence tables and limitations; it does not mean the scan observed everything. Full-site exports also include additional-page forms and fields, page and resource inventories, services, and available snapshot download URLs. Full-report downloads may use confidential, short-lived report-only links returned by the tool; do not publish or log those links or attach OAuth credentials to them. If the host cannot download a file, continue via nextCursor. Separate workspace image downloads require the OAuth bearer credential. Raw artifacts outside the report and inline image bytes are excluded. Light reads eligible public scans; OAuth also reads reports in the authorized workspace.</p>
        </Section>

        <Section eyebrow="Light workflow" title="The canonical three-tool sequence">
          <ol className="max-w-3xl list-decimal space-y-2 pl-5 text-sm leading-7 text-slate-600">
            <li>Call <code>certscore_scan_site</code> with a public URL.</li>
            <li>If a retryable error has no <code>scanId</code>, wait <code>retryAfterSeconds</code> and retry <code>certscore_scan_site</code>.</li>
            <li>If <code>preConsentPreview</code> is present, summarize it only as preliminary passive observations. It is not a finding, score, or final result.</li>
            <li>If the result is queued, running, or finalizing, retain <code>scanId</code>.</li>
            <li>Poll <code>certscore_get_scan_status</code> using <code>scanId</code> only. Never poll until <code>scanId</code> exists.</li>
            <li>Stop polling at a terminal status, then call <code>certscore_get_scan_bundle</code>.</li>
            <li>Use <code>detail=findings</code> for a compact finding review.</li>
            <li>Use <code>detail=evidence</code> for evidence digests and references.</li>
            <li>If truncated, follow <code>recommendedNextAction</code> or increase <code>maxBytes</code>.</li>
            <li>Summarize findings together with coverage limitations and the report URL.</li>
          </ol>
          <CodeBlock>{`certscore_scan_site
→ retry certscore_scan_site if a retryable error has no scanId
→ summarize preConsentPreview only as preliminary context when present
→ certscore_get_scan_status with scanId if still running
→ certscore_get_scan_bundle after terminal status`}</CodeBlock>
          <CodeBlock>{`Recommended bundle budgets:
summary   maxBytes=5000
findings  maxBytes=8000
evidence  maxBytes=8000
full      maxBytes=12000 or higher`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            A 5,000-byte response prioritizes compact core finding rows over optional inventory and duplicate envelope fields. When repeated
            per-finding URLs are omitted, use <code>evidenceUrlTemplate</code> with <code>contentUrls.findings</code> and the returned finding ID.
            Inspect <code>actualBytes</code>, <code>truncated</code>, <code>omittedSections</code>,
            <code>canonicalFindingsComplete</code>, <code>nextRecommendedMaxBytes</code>, and returned report or evidence content URLs.
          </p>
          <p className="max-w-3xl text-sm font-semibold leading-7 text-slate-800">
            Call <code>certscore_get_scan_status</code> only after <code>certscore_scan_site</code> returns a <code>scanId</code>. A retryable response without
            one must return to <code>certscore_scan_site</code>.
          </p>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">{agentDisclaimer}</p>
        </Section>

        <Section eyebrow="Verify" title="Confirm the Light connection">
          <CodeBlock>{verificationPrompt}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Success means the tool list contains the four Light tools, no authorization page appears, and
            <code className="mx-1 rounded bg-white px-1">certscore_scan_site</code> returns a stable <code>scanId</code> plus an explicit
            new-or-reused decision. An eligible reused result reports that quota was not consumed.
          </p>
        </Section>

        <Section eyebrow="Troubleshooting" title="Light MCP — no authentication recovery">
          <div className="grid gap-3 text-sm md:grid-cols-2">
            {[
              ["OAuth appeared unexpectedly", <>Remove the connection and add the exact Light endpoint <code>{lightEndpoint}</code>. Do not configure a token.</>],
              ["No scanId was returned", <>Retry <code>certscore_scan_site</code> only when the error says <code>retryable: true</code>. Never poll status without <code>scanId</code>.</>],
              ["Rate limited", <>Wait for <code>retryAfterSeconds</code> or stop. Eligible recent-result reuse does not consume quota.</>],
              ["Result was reused", <>Report it as reused. The eligible prior result was returned and quota was not consumed.</>],
              ["Bundle was truncated", <>If <code>canonicalFindingsComplete</code> is true, retry only for omitted envelope detail. Otherwise follow <code>nextRecommendedMaxBytes</code>, increase <code>maxBytes</code>, or open a returned report or evidence URL.</>],
              ["Coverage was limited", <><code>completed_limited</code>, no-go, and not-observed are automated observations, not proof of compliance.</>]
            ].map(([title, guidance]) => (
              <div className="rounded-lg border border-slate-200 bg-white p-4" key={String(title)}>
                <h3 className="font-semibold text-slate-950">{title}</h3>
                <p className="mt-2 leading-6 text-slate-600">{guidance}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Light-to-Authenticated migration" title="Upgrade when Light becomes a constraint">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Upgrade when you need a dedicated higher-volume allowance, production or team access, backend automation,
            access to previous scans or advanced diagnostic tools with self-serve OAuth access.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="font-semibold text-slate-950">What changes</h3><p className="mt-2 text-sm leading-6 text-slate-600">Use the full endpoint and authenticate with hosted OAuth or a local scoped API key. Quota and tool availability follow the granted access.</p></div>
            <div className="rounded-lg border border-slate-200 bg-white p-4"><h3 className="font-semibold text-slate-950">What stays compatible</h3><p className="mt-2 text-sm leading-6 text-slate-600">Core identifiers and canonical response fields—including <code>scanId</code>, status, score, risk, coverage, and timestamps—remain compatible.</p></div>
          </div>
          <p className="max-w-3xl text-sm font-semibold leading-7 text-slate-900">Need more scans or advanced tools? Upgrade to Authenticated MCP.</p>
        </Section>

        <div id="authenticated-mcp">
        <Section eyebrow="Authenticated remote setup" title="Hosted MCP — OAuth">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">Use this route for an OAuth-capable remote MCP client in production or team workflows. A CertScore account is required. The authorization flow grants only the approved scopes.</p>
          <CodeBlock>{`MCP endpoint:
https://mcp.certscore.ai/mcp

Protected-resource metadata:
https://mcp.certscore.ai/.well-known/oauth-protected-resource/mcp

Authorization-server metadata:
https://certscore.ai/.well-known/oauth-authorization-server`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            {MCP_OAUTH_ELIGIBILITY} {MCP_OAUTH_RECONNECT}
          </p>
        </Section>
        </div>

        <p className="text-sm text-slate-600">Verified September 14, 2026: Claude web Hosted OAuth reconnect, authenticated tool discovery, scan reuse, completed status and bundle retrieval. Client-controlled tool approvals remain visible. Other client examples are configuration guidance, not blanket compatibility claims.</p>
        <Section eyebrow="Cursor configuration example" title="Hosted OAuth setup">
          <p className="text-sm leading-7 text-slate-600">This Cursor configuration is an example. End-to-end compatibility has not been verified for this release. Use one connection named CertScore Hosted OAuth. The public client ID is not a secret. Follow the connection prompts in your client and sign in to CertScore.ai if requested. Client support is verified separately from the model selected inside a host.</p>
          <CodeBlock>{`{
  "mcpServers": {
    "CertScore Hosted OAuth": {
      "url": "https://mcp.certscore.ai/mcp",
      "auth": {
        "CLIENT_ID": "certscore_cursor_hosted_oauth_v1",
        "scopes": ["scan:read", "scan:create", "mcp"]
      }
    }
  }
}`}</CodeBlock>
          <p className="text-sm leading-7 text-slate-600">Merge into .cursor/mcp.json or ~/.cursor/mcp.json. Reuse an existing connection to the same endpoint. Light at /mcp/light supports public scans but has no previous workspace scans. The canonical sequence is certscore_scan_site → certscore_get_scan_status while active → certscore_get_scan_bundle. Report score, coverage, finding IDs, pre-consent observations, and the report URL.</p>
          <p className="text-sm leading-7 text-slate-600">For dynamic registration, use a stable descriptive client_name identifying the host and integration. Names are client-declared labels, not verified identity. Independent hosts must use their documented configuration format; AddMcpServer is not a portable MCP protocol operation.</p>
        </Section>

        <Section eyebrow="Authenticated local setup" title="Local MCP — scoped API key">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">Use this route for local stdio clients, backend automation, or environments where you manage credentials directly. A CertScore account and a scoped key are required.</p>
          <CodeBlock>{`brew tap ergoveritas1-alt/certscore https://github.com/ergoveritas1-alt/certscore.ai
brew install --cask certscore-mcp`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The cask installs a persistent local MCP command for users who prefer Homebrew-managed tools.
          </p>
        </Section>

        <Section eyebrow="Local MCP access" title="Local MCP — scoped API key permissions">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The local stdio MCP server works with a self-serve <code className="rounded bg-white px-1">cs_ro_</code> key carrying{" "}
            <code className="rounded bg-white px-1">pulse:read</code> and <code className="rounded bg-white px-1">mcp</code>. Sign in,
            verify your email, then request the key from <code className="rounded bg-white px-1">/api/v2/keys/request</code>.
            Stdio tools that create scans require <code className="rounded bg-white px-1">pulse:scan</code>; hosted OAuth uses
            <code className="ml-1 rounded bg-white px-1">scan:create</code>. Active workspaces connecting through supported OAuth clients receive
            the hosted scope under the active-workspace OAuth policy. Local API keys remain grant-gated at{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-900" href="mailto:support@certscore.ai">
              support@certscore.ai
            </a>
            .
          </p>
          <CodeBlock>{`Self-serve read-only MCP key:
1. Sign in at https://certscore.ai/login and verify your email.
2. POST https://certscore.ai/api/v2/keys/request from the signed-in browser session.
3. Use the returned cs_ro_ key as CERTSCORE_API_KEY.`}</CodeBlock>
        </Section>

        <Section eyebrow="Local verification" title="Local MCP — scoped API key doctor check">
          <CodeBlock>{`certscore-mcp --version
certscore-mcp --help
CERTSCORE_API_KEY=<token> certscore-mcp doctor
CERTSCORE_API_KEY=<token> certscore-mcp doctor --check-auth`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The doctor command checks the installed binary, Node.js runtime compatibility, the configured CertScore.ai base URL, API v2
            health, and API key presence without printing the token. Add <code className="rounded bg-white px-1">--check-auth</code> to
            validate the credential against the API without creating a scan or inspecting raw scanner artifacts.
          </p>
        </Section>

        <Section eyebrow="Local verification" title="Local MCP — scoped API key release checksum">
          <CodeBlock>{`curl -LO https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v{version}/certscore-mcp-v{version}.tar.gz
curl -LO https://github.com/ergoveritas1-alt/certscore.ai/releases/download/certscore-mcp-v{version}/SHA256SUMS
sha256sum --check SHA256SUMS`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Release tarballs are built on Linux by GitHub Actions. The published SHA256SUMS file should match the cask checksum.
          </p>
        </Section>

        <Section eyebrow="Local client configuration" title="Local MCP — scoped API key installed command">
          <CodeBlock>{`{
  "mcpServers": {
    "certscore": {
      "command": "certscore-mcp",
      "env": {
        "CERTSCORE_API_KEY": "<token>",
        "CERTSCORE_BASE_URL": "https://certscore.ai"
      }
    }
  }
}`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            The server runs over stdio and reads the API key from the MCP client environment. Keep the token scoped and rotate it if it
            is shared outside your workspace.
          </p>
        </Section>

        <Section eyebrow="Local client configuration" title="Local MCP — scoped API key stdio config">
          <CodeBlock>{`{
  "mcpServers": {
    "certscore": {
      "command": "certscore-mcp",
      "env": {
        "CERTSCORE_API_KEY": "<token>",
        "CERTSCORE_BASE_URL": "https://certscore.ai"
      }
    }
  }
}`}</CodeBlock>
        </Section>

        <Section eyebrow="Advanced local troubleshooting" title="Local MCP — scoped API key checks">
          <ul className="max-w-3xl list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
            <li>If the command is not found, reinstall the cask or check that Homebrew&apos;s bin directory is on PATH.</li>
            <li>If Node.js is not found, make sure the MCP client inherits a PATH containing Node.js and Homebrew&apos;s bin directory.</li>
            <li>If the API key is missing, set CERTSCORE_API_KEY in the MCP client environment and rerun doctor --check-auth.</li>
            <li>If a token is rejected, run doctor --check-auth before rotating the key or requesting a scoped API/MCP key from support@certscore.ai.</li>
            <li>If API health is unreachable, check CERTSCORE_BASE_URL and verify that https://certscore.ai/api/v2/health loads.</li>
            <li>If Homebrew uses stale metadata, run brew update and reinstall the cask.</li>
            <li>If an old release is cached, run brew reinstall --cask certscore-mcp after updating the tap.</li>
          </ul>
        </Section>

        <Section eyebrow="Advanced local development" title="Local MCP — scoped API key repo setup">
          <CodeBlock>{`CERTSCORE_API_KEY=<token> pnpm mcp:certscore`}</CodeBlock>
        </Section>

        <Section eyebrow="Advanced local clients" title="Local MCP — scoped API key Claude Desktop config">
          <CodeBlock>{`{
  "mcpServers": {
    "certscore": {
      "command": "certscore-mcp",
      "env": {
        "CERTSCORE_API_KEY": "<token>",
        "CERTSCORE_BASE_URL": "https://certscore.ai"
      }
    }
  }
}`}</CodeBlock>
        </Section>

        <Section eyebrow="Advanced local clients" title="Local MCP — scoped API key contributor config">
          <CodeBlock>{`{
  "mcpServers": {
    "certscore": {
      "command": "pnpm",
      "args": ["mcp:certscore"],
      "cwd": "/path/to/WC01",
      "env": {
        "CERTSCORE_API_KEY": "<token>",
        "CERTSCORE_BASE_URL": "https://certscore.ai"
      }
    }
  }
}`}</CodeBlock>
        </Section>

        <Section eyebrow="Tools" title="Agent-facing tool surface">
          <p className="mb-4 max-w-3xl text-sm leading-7 text-slate-600">
            Several tools return or reference Pulse, CertScore.ai&apos;s compact public report projection for agents. See{" "}
            <a className="font-semibold text-sky-700 hover:text-sky-900" href="/developers/reference#what-is-pulse">
              What is Pulse?
            </a>{" "}
            for how it relates to scan resources and findings.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {mcpTools.map(([name, description]) => (
              <div key={name} className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="font-mono text-sm font-semibold text-slate-950">{name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Timing" title="Scan timing fields">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            API v2 MCP tools return <code className="rounded bg-white px-1">startedAt</code>,{" "}
            <code className="rounded bg-white px-1">completedAt</code>, and{" "}
            <code className="rounded bg-white px-1">scanTimeSeconds</code> when CertScore.ai has enough timing evidence. Treat{" "}
            <code className="rounded bg-white px-1">scanTimeSeconds: null</code> as unavailable rather than zero.
          </p>
          <CodeBlock>{`const scan = await certscore_get_scan({ scanId });
const status = await certscore_get_scan_status({ scanId });

// scan.scanTimeSeconds and status.scanTimeSeconds are numbers or null.`}</CodeBlock>
        </Section>

        <Section eyebrow="Completed with limited coverage" title="No-go results remain structured">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            Scan, status, report, export, and explanation tools preserve
            <code className="mx-1 rounded bg-white px-1">completed_limited</code>,
            <code className="rounded bg-white px-1">resultDisposition: no_go</code>, the stable reason code, customer-safe copy,
            target-site versus scanner-limitation attribution, retry guidance, and a bounded evidence excerpt when retained.
          </p>
        </Section>

        <Section eyebrow="Developer reference" title="Non-MCP integration options">
          <p className="max-w-3xl text-sm leading-7 text-slate-600">The beginner MCP path ends above. Use these separate developer sections only when you are building a direct HTTP or TypeScript integration.</p>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-[760px] table-fixed w-full text-left text-sm">
              <colgroup>
                <col className="w-[20%]" /><col className="w-[30%]" /><col className="w-[50%]" />
              </colgroup>
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <tr><th className="px-4 py-3 font-semibold">Integration</th><th className="px-4 py-3 font-semibold">Access</th><th className="px-4 py-3 font-semibold">Best for</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                <tr><td className="px-4 py-3 font-semibold text-slate-900"><Link className="text-sky-700 hover:text-sky-900" href="/developers/quickstart">REST API</Link></td><td className="px-4 py-3">Language-neutral HTTP resources</td><td className="px-4 py-3">Backend jobs, webhooks, and language-neutral integrations</td></tr>
                <tr><td className="px-4 py-3 font-semibold text-slate-900"><Link className="text-sky-700 hover:text-sky-900" href="/developers/sdk">TypeScript SDK</Link></td><td className="px-4 py-3">Typed resource clients and polling helpers</td><td className="px-4 py-3">Typed Node.js and TypeScript applications</td></tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section eyebrow="Workflow" title="Recommended agent sequence">
          <CodeBlock>{`1. certscore_scan_site with a public URL; a new scan returns its stable scanId and may include a partial preConsentPreview when the runtime lane completes or reaches its six-second checkpoint; otherwise it falls back to the stable scanId alone.
2. Treat preConsentPreview only as partial passive context. Distinguish captured totals from bounded returned identities; use trackingVendorCount for non-operational vendors and keep operationalVendors separate. Never treat it as a finding, score, or final result.
3. certscore_get_scan_status only when certscore_scan_site returns a non-terminal result containing scanId; poll with scanId only.
4. certscore_get_scan_bundle for canonical status, findings, bounded evidence, and pre-consent inventory.
5. certscore_get_report, certscore_get_evidence, certscore_list_findings, or cookie inventory only when a dedicated view is needed.
6. certscore_explain_finding for evidence summaries and caveats.
7. certscore_get_latest_domain_scan or certscore_get_latest_domain_pre_consent_cookies_trackers when the user asks for latest-domain data.`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            <code className="rounded bg-white px-1">certscore_scan_site</code> reports whether it reused a result, the freshness decision,
            whether anonymous quota was consumed, the remaining daily allowance, its UTC reset time, and the recommended next tool.
          </p>
          <CodeBlock>{`{
  "executionMode": "reused_scan",
  "reused": true,
  "reusedScanAgeSeconds": 90,
  "freshnessDecision": "reused_existing_scan",
  "quotaConsumed": false,
  "anonymousQuotaLimit": 20,
  "anonymousQuotaRemaining": 7,
  "anonymousQuotaResetAt": "2026-07-16T00:00:00.000Z",
  "upgradeSupportEmail": "support@certscore.ai",
  "upgradeMessage": "For a higher-volume allowance, contact support@certscore.ai.",
  "recommendedNextTool": "certscore_get_scan_bundle"
}`}</CodeBlock>
          <CodeBlock>{`certscore_get_pre_consent_cookies_trackers({
  scanId: "00000000-0000-4000-8000-000000000123"
})

certscore_get_latest_domain_pre_consent_cookies_trackers({
  domain: "ergoveritas.com",
  scanFrom: "eu_ie"
})`}</CodeBlock>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            MCP tools return compact public-safe JSON. They must not infer raw-signal findings or convert automated review signals into
            legal conclusions. CertScore.ai outputs are automated public-web observations for human and agentic review. They are not legal advice,
            certification, or a compliance determination. Group Cookies & Trackers rows by vendor, purpose, and host when the user wants
            a short review handoff.
          </p>
        </Section>

      </div>
    </DeveloperShell>
  );
}
