import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import { EvidenceJsonBlock } from "../../components/scans/evidence-json-block";
import { getCertScoreGptUrl } from "../../lib/marketing/certscore-gpt";
import {
  PULSE_COVERAGE_LIMITATION_COPY,
  PULSE_FEEDBACK_EMAIL,
  PULSE_PURPOSE_STATEMENT,
  PULSE_SHORT_DISCLAIMER,
  PULSE_STANDARD_DISCLAIMER
} from "../../lib/pulse/constants";
import { createPageMetadata } from "../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "CertScore Pulse API Beta",
  description:
    "Agent-readable beta instructions for using the CertScore Pulse API to retrieve evidence-backed public-web scan summaries for URLs.",
  path: "/api-pulse",
  robots: {
    follow: true,
    index: true
  }
});

const copyPasteExamples = [
  {
    command: `curl "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io&detail=tiny"`,
    href: "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io&detail=tiny"
  },
  {
    command: `curl "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io"`,
    href: "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io"
  },
  {
    command: `curl "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io&detail=evidence"`,
    href: "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io&detail=evidence"
  },
  {
    command: `curl "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io&format=markdown"`,
    href: "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io&format=markdown"
  },
  {
    command: `curl "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io&freshness=refresh"`
  },
  {
    command: `curl "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io&forceNewScan=true"`
  },
  {
    command: `curl "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io&wait=35"`
  },
  {
    command: `curl "https://certscore.ai/api/v1/pulse/status/<jobId>"`
  },
  {
    command: `curl "https://certscore.ai/api/v1/pulse-self-test"`,
    href: "https://certscore.ai/api/v1/pulse-self-test"
  },
  {
    command: `curl "https://certscore.ai/api/v1/pulse-health"`,
    href: "https://certscore.ai/api/v1/pulse-health"
  }
];

const parameters = [
  ["url", "Public URL or domain to summarize. Use this for first-time or latest-domain lookup."],
  ["scanId", "Existing public eligible scan ID. Use this later for an immutable scan-backed Pulse response."],
  ["jobId", "Existing Pulse job ID. Use this to resolve or check an async Pulse request."],
  ["format", "`json` or `markdown`. Defaults to `json`."],
  ["detail", "`summary`, `evidence`, `tiny`, `quick`, `standard`, or `full`. Defaults to `summary`. `quick` is an alias for `tiny`."],
  ["freshness", "`latest` or `refresh`. Defaults to `latest`."],
  ["scanFrom", "`eu_ie` or `california`. Selects the geo execution context for newly queued public scans. Defaults to `eu_ie`."],
  ["geo", "Alias for `scanFrom`; accepts `eu_ie` or `california`."],
  ["forceNewScan", "`true` or `1` bypasses the 24-hour recent-scan reuse check. It does not bypass throttles or validation."],
  [
    "wait",
    "Integer seconds from 0 to 80. This is only the maximum HTTP hold window for the current request; total queue plus scan time can be longer when workers are busy."
  ]
] as const;

const detailLevels = [
  {
    name: "detail=summary",
    summary: "Default agent-friendly JSON artifact with executive metrics, surfaced results, key counts, and links."
  },
  {
    name: "detail=evidence",
    summary:
      "Bounded structured evidence packet for review. Includes projected findings, GDPR/ePrivacy checklist rows, tracker/cookie inventories, timing summaries, and safety notes without raw payloads."
  },
  {
    name: "detail=tiny",
    summary: "Quick compact summary for badges, CLI output, widgets, and simple agents."
  },
  {
    name: "detail=quick",
    summary: "Alias for `detail=tiny`. Responses normalize to the tiny shape."
  },
  {
    name: "detail=standard",
    summary: "Backward-compatible report projection for quick evidence-backed summaries."
  },
  {
    name: "detail=full",
    summary:
      "Structured public report projection with more findings, review lenses, vendor/domain summaries, policy surfaces, fingerprinting context, interruptions, coverage diagnostics, and benchmark context. It does not expose raw internal artifacts."
  }
] as const;

const mcpTools = [
  ["scan_site", "Start or reuse a CertScore scan for a public URL from an agent workflow."],
  ["create_scan", "Start a CertScore scan for a public URL from an agent or developer workflow."],
  ["get_scan", "Retrieve the API v2 public-safe scan resource for a stable scan ID."],
  ["get_scan_status", "Check a queued Pulse job or API v2 scan without inventing status from partial results."],
  ["get_report", "Retrieve the evidence-backed Pulse report for a stable scan ID."],
  ["export_findings", "Return structured findings for ticketing, review, or compliance workflows."],
  ["list_findings", "Return API v2 public-safe findings for ticketing, review, or compliance workflows."],
  ["explain_finding", "Explain one finding with public evidence, caveats, and reviewer next steps."],
  ["get_latest_domain_scan", "Find the latest eligible public scan for a domain."]
] as const;

const exampleMeta = {
  apiVersion: "v1",
  schemaVersion: "0.5.1",
  pulseVersion: "2026-05-18",
  projectionVersion: "pulse-public-v1",
  generatedAt: "2026-05-18T23:15:32Z",
  source: "certscore.ai"
};

const exampleFeedback = {
  prompt: "Was this Pulse useful?",
  email: PULSE_FEEDBACK_EMAIL,
  feedbackUrl: "https://certscore.ai/pulse/feedback?pulseRequestId=pulse_req_123",
  positiveUrl: "https://certscore.ai/pulse/feedback?pulseRequestId=pulse_req_123&rating=useful",
  negativeUrl: "https://certscore.ai/pulse/feedback?pulseRequestId=pulse_req_123&rating=not_useful"
};

const exampleCapabilities = {
  method: "automated_runtime_analysis",
  observes: [
    "pre_consent_tracking",
    "third_party_requests",
    "consent_enforcement_gaps",
    "cookie_activity",
    "accessibility_signals",
    "disclosure_inconsistencies"
  ],
  doesNotProvide: ["legal_advice", "certification", "compliance_determination"]
};

const completedAgentInterpretation = {
  responseClass: "completed_pulse",
  safeSummaryUse: true,
  requiresHumanReview: true,
  doNotCallThis: ["legal_advice", "certification", "compliance_determination"]
};

const pendingAgentInterpretation = {
  responseClass: "pending_pulse",
  safeSummaryUse: false,
  requiresHumanReview: true,
  doNotCallThis: ["legal_advice", "certification", "compliance_determination"]
};

const errorAgentInterpretation = {
  responseClass: "api_error",
  safeSummaryUse: false,
  requiresHumanReview: true,
  doNotCallThis: ["legal_advice", "certification", "compliance_determination"]
};

const exampleLinks = {
  canonicalPulseUrl: "https://certscore.ai/pulse/kbdlab.io",
  jsonUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_abc123",
  markdownUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_abc123&format=markdown",
  summaryJsonUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_abc123&detail=summary",
  evidenceJsonUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_abc123&detail=evidence",
  fullJsonUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_abc123&detail=full",
  fullReportUrl: "https://certscore.ai/scan/scan_abc123",
  docsUrl: "https://certscore.ai/api-pulse",
  findingsReferenceUrl: "https://certscore.ai/findings"
};

const exampleFinding = {
  id: "pre_consent_tracking_detected",
  label: "Tracking started before consent",
  criticality: "critical",
  confidence: "strong",
  plainEnglish: "Runtime evidence showed non-essential tracking activity before a consent choice was recorded.",
  evidence: {
    summary: "A non-essential third-party tracking request was observed before the scan recorded a consent choice.",
    observedPhase: "before_consent",
    exampleEvents: [
      {
        type: "request",
        vendor: "Example Analytics Vendor",
        urlHost: "analytics.example-vendor.test",
        timestampMs: 1137
      }
    ],
    fullEvidenceUrl: "https://certscore.ai/scan/scan_abc123#finding-pre_consent_tracking_detected"
  },
  evidenceDigest: {
    basis: "runtime_observation",
    phase: "before_consent",
    exampleCount: 2,
    examplesShown: 1,
    hasTimingAnchor: true,
    hasVendorAnchor: true,
    hasConsentContext: true
  },
  reviewLenses: ["GDPR / ePrivacy", "FTC"],
  anchorUrl: "https://certscore.ai/scan/scan_abc123#finding-pre_consent_tracking_detected",
  nextStep: "Review whether observed vendors are necessary before consent or should be consent-gated."
};

const responseExamples = [
  {
    title: "200 completed tiny JSON",
    language: "json",
    value: {
      type: "certscore_pulse",
      meta: { ...exampleMeta, format: "json", detail: "tiny" },
      domain: "kbdlab.io",
      scanId: "scan_abc123",
      scanStatus: "completed",
      summary: {
        headline: "Automated scan surfaced consent-timing and third-party collection review signals.",
        score: 72,
        riskLevel: "review_recommended"
      },
      topFindings: [
        {
          id: exampleFinding.id,
          label: exampleFinding.label,
          criticality: exampleFinding.criticality,
          confidence: exampleFinding.confidence
        }
      ],
      coverage: {
        status: "partial",
        summary: "Automated public-web scan completed with coverage limitations."
      },
      links: exampleLinks,
      feedback: exampleFeedback,
      capabilities: exampleCapabilities,
      agentInterpretation: completedAgentInterpretation,
      disclaimer: PULSE_STANDARD_DISCLAIMER
    }
  },
  {
    title: "200 completed standard JSON",
    language: "json",
    value: {
      type: "certscore_pulse",
      meta: { ...exampleMeta, format: "json", detail: "standard" },
      request: {
        pulseRequestId: "pulse_req_123",
        url: "https://kbdlab.io",
        normalizedUrl: "https://kbdlab.io/",
        domain: "kbdlab.io",
        detail: "standard",
        format: "json",
        freshness: "latest",
        waitSeconds: 0,
        resolutionMode: "reused_existing_scan"
      },
      scan: {
        scanId: "scan_abc123",
        scanStatus: "completed",
        completedAt: "2026-05-18T23:15:31Z"
      },
      timestamps: {
        createdAt: "2026-05-18T23:14:22Z",
        startedAt: "2026-05-18T23:14:31Z",
        completedAt: "2026-05-18T23:15:31Z",
        generatedAt: "2026-05-18T23:15:32Z",
        lastUpdatedAt: "2026-05-18T23:15:31Z"
      },
      freshness: {
        status: "fresh",
        ageSeconds: 4,
        ageHours: 0.001,
        maxRecommendedAgeHours: 168
      },
      summary: {
        headline: "Automated scan surfaced consent-timing and third-party collection review signals.",
        score: 72,
        riskLevel: "review_recommended",
        humanSummary: "Automated scan surfaced consent-timing and third-party collection review signals."
      },
      topFindings: [exampleFinding],
      coverage: {
        status: "partial",
        homepageObserved: true,
        summary: "Homepage findings are based on observable public-page evidence.",
        limitations: ["Automated public-web scan only.", PULSE_COVERAGE_LIMITATION_COPY]
      },
      links: exampleLinks,
      feedback: exampleFeedback,
      capabilities: exampleCapabilities,
      agentInterpretation: completedAgentInterpretation,
      disclaimer: PULSE_STANDARD_DISCLAIMER
    }
  },
  {
    title: "200 completed Evidence JSON",
    language: "json",
    value: {
      type: "certscore_pulse_evidence",
      meta: { ...exampleMeta, format: "json", detail: "evidence" },
      domain: "kbdlab.io",
      scanId: "scan_abc123",
      scanStatus: "completed",
      findings: [exampleFinding],
      reviewContext: {
        disclaimer: "Findings are organized by privacy, consumer protection, accessibility, and other review contexts. These are automated signals for review, not legal determinations.",
        lenses: [
          {
            name: "GDPR / ePrivacy",
            status: "needs_work",
            score: 28,
            contributingFindingIds: ["pre_consent_tracking_detected"]
          }
        ]
      },
      evidenceHighlights: {
        trackerFootprint: {
          thirdPartyDomainsObserved: 7,
          classifiedTrackerVendors: 2,
          summary: "7 third-party domains observed; 2 classified tracker vendors identified."
        },
        policySurfaces: {
          policyUrlCount: 2,
          covered: ["privacy_policy", "terms_of_service"]
        }
      },
      coverage: {
        status: "partial",
        interruptionCount: 1,
        interruptions: [
          {
            label: "Access limited",
            reason: "Protected route encountered outside the public homepage."
          }
        ],
        limitations: ["Full mode is still a public report projection; raw internal artifacts are not included."]
      },
      links: exampleLinks,
      feedback: exampleFeedback,
      capabilities: exampleCapabilities,
      agentInterpretation: completedAgentInterpretation,
      disclaimer: PULSE_STANDARD_DISCLAIMER
    }
  },
  {
    title: "202 pending/running response",
    language: "json",
    value: {
      type: "certscore_pulse_status",
      meta: { ...exampleMeta, format: "json", detail: "standard" },
      jobId: "pulse_job_123",
      scanId: "scan_abc123",
      domain: "kbdlab.io",
      status: "running",
      phase: "runtime_observation",
      message: "Observing public-page behavior and collecting automated evidence signals.",
      elapsedSeconds: 28,
      estimatedWaitSeconds: 45,
      statusUrl: "https://certscore.ai/api/v1/pulse/status/pulse_job_123",
      nextCheckUrl: "https://certscore.ai/api/v1/pulse/status/pulse_job_123",
      reportUrl: "https://certscore.ai/scan/scan_abc123",
      capabilities: exampleCapabilities,
      agentInterpretation: pendingAgentInterpretation,
      disclaimer: PULSE_STANDARD_DISCLAIMER
    }
  },
  {
    title: "200 completed status response",
    language: "json",
    value: {
      type: "certscore_pulse_status",
      jobId: "pulse_job_123",
      scanId: "scan_abc123",
      domain: "kbdlab.io",
      status: "completed",
      completedAt: "2026-05-18T23:15:31Z",
      resultUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_abc123",
      reportUrl: "https://certscore.ai/scan/scan_abc123",
      capabilities: exampleCapabilities,
      agentInterpretation: completedAgentInterpretation,
      disclaimer: PULSE_STANDARD_DISCLAIMER
    }
  },
  {
    title: "429 rate-limit response",
    language: "json",
    value: {
      type: "certscore_pulse_error",
      meta: exampleMeta,
      error: {
        code: "rate_limited",
        message: "This CertScore API key has reached its Pulse request limit. Try again after the retry window or manage your plan.",
        retryAfterSeconds: 240
      },
      resolution: {
        label: "Manage plan",
        url: "https://certscore.ai/app/modify-plan"
      },
      feedback: {
        email: PULSE_FEEDBACK_EMAIL
      },
      agentInterpretation: { ...errorAgentInterpretation, responseClass: "rate_limited" },
      disclaimer: PULSE_STANDARD_DISCLAIMER
    }
  },
  {
    title: "400 invalid URL response",
    language: "json",
    value: {
      type: "certscore_pulse_error",
      meta: exampleMeta,
      request: {
        url: "not-a-url",
        detail: "standard",
        format: "json"
      },
      error: {
        code: "invalid_url",
        message: "Enter a valid public website URL or domain.",
        retryAfterSeconds: null
      },
      feedback: {
        email: PULSE_FEEDBACK_EMAIL
      },
      agentInterpretation: errorAgentInterpretation,
      disclaimer: PULSE_STANDARD_DISCLAIMER
    }
  },
  {
    title: "Markdown response",
    language: "markdown",
    value:
      "# CertScore Pulse\n\n| Field | Value |\n|---|---|\n| Domain | kbdlab.io |\n| Score | 72/100 |\n| Risk level | Review recommended |\n| High-priority findings | 1 |\n| Total observations | 3 |\n| Scan completed | 2026-05-18T23:15:31Z |\n| Coverage status | Partial |\n\n## Summary\n\nAutomated scan surfaced consent-timing and third-party collection review signals.\n\n## Highest-priority findings\n\n1. Tracking started before consent\n\n## Privacy and consent signals\n\n- Tracker footprint: 7 third-party domains observed; 2 classified tracker vendors identified.\n\n## Cookie and third-party request activity\n\n- Vendor mix: cdn infra 1 · session replay 1\n\n## Accessibility signals\n\n- Accessibility-related findings: 0\n\n## Disclosure and trust signals\n\n- Policy surfaces: 2 policy URLs covered.\n\n## Coverage and limitations\n\nCoverage was limited; absence of findings should not be interpreted as absence of risk.\n\n## Links\n\nFull report: https://certscore.ai/scan/scan_abc123\n\n## Disclaimer\n\n" +
      PULSE_STANDARD_DISCLAIMER
  }
] as const;

function stringifyExample(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function CodeBlock({ children }: { children: string }) {
  return (
    <EvidenceJsonBlock
      payload={children}
      preClassName="overflow-x-auto whitespace-pre-wrap break-words p-4 pr-12 text-xs leading-5 text-slate-100"
    />
  );
}

export default function ApiPulsePage() {
  const certscoreGptUrl = getCertScoreGptUrl();
  return (
    <main className="min-h-screen bg-slate-50">
      <SiteHeader />
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="max-w-3xl space-y-4">
            <Badge tone="neutral">Agent API beta</Badge>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950">CertScore Pulse API beta</h1>
            <p className="text-lg leading-8 text-slate-600">
              Retrieve a quick, evidence-backed CertScore summary for a public URL. Pulse API beta is designed for AI agents, developer tools,
              CLIs, and humans that need a compact scan summary with links to the durable full report.
            </p>
            <p className="text-sm leading-6 text-slate-600">{PULSE_PURPOSE_STATEMENT}</p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
              {PULSE_STANDARD_DISCLAIMER}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-6 px-6 py-12">
        <Card className="border-sky-200 bg-sky-50 shadow-none">
          <CardHeader>
            <CardTitle>For AI agents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-slate-700">
            <div className="rounded-lg border border-sky-200 bg-white p-4">
              <h2 className="text-base font-semibold text-slate-950">Try CertScore GPT beta</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Paste a public website URL and get a CertScore Pulse summary inside ChatGPT. Automated observations for review, not legal advice or a compliance determination.
              </p>
              <a
                className="mt-3 inline-flex w-fit rounded-full border border-sky-300 bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                data-analytics-cta-location="api_pulse"
                data-analytics-destination-url={certscoreGptUrl}
                data-analytics-event="gpt_cta_clicked"
                href={certscoreGptUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Open CertScore GPT beta
              </a>
            </div>
            <p>
              If you are an agent with OpenAPI actions or HTTP tools, start here before trying ad hoc fetches. CertScore Pulse works
              best when agents call Summary JSON or markdown for user-facing summaries and reserve Evidence JSON for evidence-heavy review.
            </p>
            <CodeBlock>{`Basic HTTP agent quick start:
1. If you do not support OpenAPI actions, call:
   GET https://certscore.ai/api/v1/pulse?url=<public URL>&format=markdown&detail=standard
2. For a quick check, call:
   GET https://certscore.ai/api/v1/pulse?url=<public URL>&format=markdown&detail=tiny
3. For structured evidence, call:
   GET https://certscore.ai/api/v1/pulse?url=<public URL>&format=json&detail=evidence
4. If you receive HTTP 202, read the returned statusUrl or poll:
   GET https://certscore.ai/api/v1/pulse/status/<jobId>
5. If the request fails before status/body/headers are visible, open:
   https://certscore.ai/api-pulse-agent-guide.txt`}</CodeBlock>
            <CodeBlock>{`Recommended calls:
- User-facing summary: GET /api/v1/pulse?url=https://kbdlab.io&format=markdown&detail=standard
- Quick machine triage: GET /api/v1/pulse?url=https://kbdlab.io&detail=tiny
- Evidence/deeper review: GET /api/v1/pulse?url=https://kbdlab.io&detail=evidence
- Connectivity check: GET /api/v1/pulse-self-test
- Health check: GET /api/v1/pulse-health

Summary JSON is best for concise agent output. Markdown is best for conversational summaries. Tiny is best for badges, triage, and routing. Evidence JSON is best for evidence review and coverage diagnostics. Self-test is best for deployment and agent connectivity checks.`}</CodeBlock>
            <CodeBlock>{`OpenAPI / GPT Action beta quick start:
1. If you support OpenAPI actions/tools, import:
   https://certscore.ai/api/v1/openapi.chatgpt.json
2. Call getPulseForUrl with:
   url: <public URL>
   format: markdown
   detail: standard
   scanFrom: eu_ie | california
   wait: 35
3. Use detail=tiny for quick checks.
4. Public GPT Action beta access uses latest-mode summaries. Use Evidence JSON or the linked CertScore report when users need more support.
5. If API fetch fails before headers/body/status are visible, call checkPulseConnectivity once.
6. If checkPulseConnectivity succeeds, treat the scan failure as a transient client/action transport error and retry or use the markdown endpoint.
7. If checkPulseConnectivity also fails without CertScore diagnostic headers, do not infer CertScore returned an error. Report it as a client/network fetch limitation and read /api-pulse/agent and /api-pulse-agent-guide.txt.`}</CodeBlock>
            <p>
              Agent fetch limitations: Some agent environments may fail before receiving an HTTP response because of DNS, sandbox,
              TLS, proxy, or fetch-layer limitations. If a request fails before exposing an HTTP status, response body, or
              x-certscore-* diagnostic headers, do not conclude CertScore Pulse is unavailable. First try /api/v1/pulse-self-test,
              /api/v1/pulse-health, /api-pulse-agent-guide.txt, /.well-known/certscore-pulse, and /api/v1/openapi.chatgpt.json.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex w-fit rounded-full border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
                href="/api/v1/openapi.chatgpt.json"
              >
                Open ChatGPT Action beta schema
              </Link>
              <Link
                className="inline-flex w-fit rounded-full border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
                href="/api/v1/pulse/gpt?url=https://kbdlab.io&format=markdown&detail=standard&wait=35"
              >
                Open GPT Action beta example
              </Link>
              <a
                className="inline-flex w-fit rounded-full border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
                data-analytics-cta-location="api_pulse"
                data-analytics-destination-url={certscoreGptUrl}
                data-analytics-event="gpt_cta_clicked"
                href={certscoreGptUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Open CertScore GPT beta
              </a>
              <Link
                className="inline-flex w-fit rounded-full border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
                href="/api/v1/pulse-self-test"
              >
                Open self-test
              </Link>
              <Link
                className="inline-flex w-fit rounded-full border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
                href="/api-pulse/agent"
              >
                Open agent fallback
              </Link>
              <Link
                className="inline-flex w-fit rounded-full border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
                href="/api-pulse-agent-guide.txt"
              >
                Open plain text guide
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="border-emerald-200 bg-emerald-50 shadow-none">
          <CardHeader>
            <CardTitle>Developer hub</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-slate-700">
            <p>
              Pulse v1 remains the compatibility entry point. For the resource-oriented CertScore API v2, TypeScript SDK, MCP server,
              examples, and machine-readable discovery links, use the developer hub. For structured Cookies & Trackers (Pre-consent)
              table data, use API v2 instead of parsing Pulse prose or report HTML.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex w-fit rounded-full border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                href="/developers"
              >
                Open developer hub
              </Link>
              <Link
                className="inline-flex w-fit rounded-full border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                href="/developers/reference"
              >
                API v2 reference
              </Link>
              <Link
                className="inline-flex w-fit rounded-full border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                href="/developers/examples#pre-consent-cookies-trackers-json"
              >
                Cookies & Trackers JSON
              </Link>
              <Link
                className="inline-flex w-fit rounded-full border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                href="/developers/mcp"
              >
                MCP docs
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card id="mcp" className="border-violet-200 bg-violet-50 shadow-none">
          <CardHeader>
            <CardTitle>MCP preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-slate-700">
            <p>
              CertScore MCP is a developer-preview stdio server for teams that want to run Pulse checks inside AI development,
              security, and ops workflows. It uses the same evidence-backed Pulse surface: automated public-web observations for
              review, with stable scan and finding IDs.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {mcpTools.map(([name, description]) => (
                <div key={name} className="rounded-lg border border-violet-200 bg-white p-3">
                  <p className="font-semibold text-slate-950">{name}</p>
                  <p className="mt-1 text-slate-600">{description}</p>
                </div>
              ))}
            </div>
            <p>
              The first preview is intentionally narrow: create a scan, check status, retrieve a report, export findings, and explain
              a specific finding. Account browsing and drift comparison tools are not part of the initial MCP scope.
            </p>
            <CodeBlock>{`Local stdio preview:
CERTSCORE_API_KEY=<token> pnpm mcp:certscore

Optional:
CERTSCORE_BASE_URL=https://certscore.ai
CERTSCORE_REQUEST_TIMEOUT_MS=300000

Live smoke:
CERTSCORE_API_KEY=<token> pnpm mcp:certscore:smoke

Generate preview key:
pnpm db:migrate
pnpm mcp:certscore:generate-key -- --name "CertScore MCP preview"`}</CodeBlock>
            <CodeBlock>{`Example MCP client config:
{
  "mcpServers": {
    "certscore": {
      "command": "pnpm",
      "args": ["mcp:certscore"],
      "cwd": "/path/to/CertScore",
      "env": {
        "CERTSCORE_API_KEY": "YOUR_TOKEN",
        "CERTSCORE_BASE_URL": "https://certscore.ai"
      }
    }
  }
}`}</CodeBlock>
            <p>
              Recommended workflow: call `scan_site` with a public URL, poll `get_scan_status` when a job ID is returned, retrieve the
              stable scan with `get_scan`, then use `list_findings` or `explain_finding` for review and ticketing.
            </p>
            <p>
              Preview keys are scoped to `pulse:read`, `pulse:scan`, and `mcp`; CertScore validates bearer tokens before request
              attribution and rate-limit policy, without changing evidence, concern, finding, or projection logic.
            </p>
            <p>
              Operators should apply the integration-key migration, generate a scoped preview key, and run authenticated MCP smoke
              before promoting the preview beyond internal use.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                className="inline-flex w-fit rounded-full border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100"
                href={`mailto:${PULSE_FEEDBACK_EMAIL}?subject=CertScore%20MCP%20preview`}
              >
                Request MCP preview
              </a>
              <Link
                className="inline-flex w-fit rounded-full border border-violet-300 bg-white px-3 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100"
                href="/api-pulse#quick-start"
              >
                View Pulse API quick start
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle id="quick-start">Quick start</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-slate-600">
            <CodeBlock>GET https://certscore.ai/api/v1/pulse?url=https://kbdlab.io</CodeBlock>
            <a
              className="inline-flex w-fit rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-sky-700 hover:border-sky-300 hover:bg-sky-50"
              href="https://certscore.ai/api/v1/pulse?url=https://kbdlab.io"
            >
              Open quick-start endpoint
            </a>
            <p>
              If a completed eligible scan exists within the 24-hour reuse window, the API returns that completed Pulse. If no completed scan exists within that UTC-normalized window, the API may queue a new scan
              and return HTTP 202 with `jobId`, `statusUrl`, `nextCheckUrl`, and any `scanId` available for the queued scan.
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle>Copy/paste examples</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {copyPasteExamples.map((example) => (
              <div key={example.command} className="space-y-2">
                <CodeBlock>{example.command}</CodeBlock>
                {example.href ? (
                  <a
                    className="inline-flex w-fit rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-sky-700 hover:border-sky-300 hover:bg-sky-50"
                    href={example.href}
                  >
                    Open test URL
                  </a>
                ) : null}
              </div>
            ))}
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
              <CardTitle>Detail levels</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-slate-600">
              {detailLevels.map((level) => (
                <div key={level.name} className="rounded-lg border border-slate-200 p-3">
                  <p className="font-semibold text-slate-950">{level.name}</p>
                  <p>{level.summary}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle>Response examples</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {responseExamples.map((example) => (
              <details key={example.title} className="rounded-lg border border-slate-200 bg-white p-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-950">{example.title}</summary>
                <div className="mt-3">
                  <CodeBlock>{stringifyExample(example.value)}</CodeBlock>
                </div>
              </details>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle>Async and status behavior</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-slate-600">
            <p>
              Status lifecycle: queued to running to finalizing to completed. Edge or terminal statuses include completed_limited, failed,
              expired, and rate_limited.
            </p>
            <p>
              HTTP 202 means the scan or Pulse request is accepted but not complete. Clients should poll `statusUrl` or `nextCheckUrl`.
              `wait` accepts 0 to 80 seconds and may return a completed Pulse if the scan finishes during that window.
            </p>
            <p>
              Pending HTTP 202 responses include `Retry-After` when CertScore can recommend a polling delay. Throttled HTTP 429
              responses include `Retry-After` when retry timing is known.
            </p>
            <p>
              Estimated wait values are approximate. Queue backlog, worker availability, page load time, and scan finalization can make total
              completion take longer than 80 seconds.
            </p>
            <CodeBlock>{`queued -> running -> finalizing -> completed

Other statuses: completed_limited, failed, expired, rate_limited

Public-safe phase message:
"Observing public-page behavior and collecting automated evidence signals."`}</CodeBlock>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle>Freshness and throttling</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-7 text-slate-600">
              <p>
                `freshness=latest` returns the latest eligible completed Pulse when it was completed in the prior 24 hours. If no completed eligible scan exists within that UTC-normalized window, CertScore
                may queue a new scan.
              </p>
              <p>
                `freshness=refresh` requests a new scan when eligible and bypasses the 24-hour reuse check. `forceNewScan=true` is a compatibility override with the same reuse-bypass behavior. Scan generation is still limited to one new
                Pulse scan per normalized domain every one minute under the 1-minute normalized-domain throttle.
              </p>
              <p>
                If refresh is throttled but a completed scan exists, CertScore may return the latest completed Pulse with
                `refresh.requested=true`, `refresh.performed=false`, `refresh.reason="domain_throttle"`, and `refresh.retryAfterSeconds`.
                If no completed scan exists and scan creation is throttled, the API returns HTTP 429 with `Retry-After`, `error.code="pulse_throttled"`, and support contact guidance at support@certscore.ai.
              </p>
              <p>
                Pulse uses `freshness=latest` and `freshness=refresh`; there is no separate `refresh=true` parameter. Broad
                `X-RateLimit-*` headers are not emitted unless the route has accurate enforced bucket state.
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-none">
            <CardHeader>
              <CardTitle>Durable scan handles</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-7 text-slate-600">
              <p>
                `scanId` is the canonical field name. `scan_id` may appear as a compatibility alias, but new integrations should use `scanId`.
              </p>
              <CodeBlock>{`https://certscore.ai/scan/<scanId>
https://certscore.ai/api/v1/pulse?scanId=<scanId>
https://certscore.ai/api/v1/pulse?scanId=<scanId>&detail=summary
https://certscore.ai/api/v1/pulse?scanId=<scanId>&detail=evidence
https://certscore.ai/api/v1/pulse?scanId=<scanId>&format=markdown`}</CodeBlock>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle>Markdown structure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-slate-600">
            <p>
              Standard markdown starts with a compact summary table and stable headings so agents can parse it reliably without large JSON
              blocks.
            </p>
            <CodeBlock>{`# CertScore Pulse

| Field | Value |
|---|---|
| Domain | kbdlab.io |
| Score | 72/100 |
| Risk level | Review recommended |
| High-priority findings | 1 |
| Total observations | 3 |
| Scan completed | 2026-05-18T23:15:31Z |
| Coverage status | Partial |

## Summary
## Highest-priority findings
## Privacy and consent signals
## Cookie and third-party request activity
## Accessibility signals
## Disclosure and trust signals
## Coverage and limitations
## Links
## Disclaimer`}</CodeBlock>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle>Feedback</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-slate-600">
            <p>
              Pulse responses include feedback metadata when available. Direct comments can be sent to{" "}
              <a className="font-semibold text-sky-700" href={`mailto:${PULSE_FEEDBACK_EMAIL}`}>
                {PULSE_FEEDBACK_EMAIL}
              </a>
              . Feedback is private and used to improve CertScore Pulse. No star ratings are used.
            </p>
            <p>
              Supported ratings: `useful`, `not_useful`, `unclear`, `incorrect`, `too_limited`. Helpful reasons include incorrect finding,
              missing evidence, too much detail, not enough detail, coverage seemed limited, hard to understand, API issue, and other.
            </p>
            <CodeBlock>{`POST https://certscore.ai/api/v1/pulse/feedback
Content-Type: application/json

{
  "pulseRequestId": "pulse_req_123",
  "rating": "useful",
  "reason": "not_enough_detail",
  "comment": "Optional comment up to 2000 characters.",
  "email": "optional@kbdlab.io"
}`}</CodeBlock>
            <p>
              The feedback endpoint validates rating and reason values, caps comments at 2000 characters, accepts an optional email field, and
              may return HTTP 429 when feedback is submitted too frequently for the same Pulse request context.
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle>Interpreting findings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-7 text-slate-600">
            <p>
              Pulse summarizes already-surfaced public report findings and review context. It does not create findings from raw signals, and
              absence of findings should not be interpreted as absence of risk. If no major findings are surfaced, Pulse says:
              “No top automated findings were surfaced in this scan.”
            </p>
            <p>{PULSE_COVERAGE_LIMITATION_COPY}</p>
            <p>
              For finding definitions, evidence standards, and reviewer questions, use the{" "}
              <Link href="/findings" className="font-semibold text-sky-700">
                CertScore findings reference
              </Link>
              .
            </p>
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              {PULSE_SHORT_DISCLAIMER}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle>Links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3 text-sm">
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/api-pulse/agent">
              Agent fallback page
            </Link>
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/api-pulse#mcp">
              MCP preview
            </Link>
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/api-pulse-agent-guide.txt">
              Agent text guide
            </Link>
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/api/v1/openapi.json">
              OpenAPI JSON
            </Link>
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/api/v1/openapi.chatgpt.json">
              ChatGPT Action beta schema
            </Link>
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/.well-known/certscore-pulse">
              Discovery JSON
            </Link>
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/.well-known/certscore-ai.json">
              AI discovery manifest
            </Link>
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/llms.txt">
              llms.txt
            </Link>
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/llms-full.txt">
              llms-full.txt
            </Link>
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/findings">
              Findings reference
            </Link>
            <a className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href={`mailto:${PULSE_FEEDBACK_EMAIL}`}>
              {PULSE_FEEDBACK_EMAIL}
            </a>
          </CardContent>
        </Card>
      </section>
      <SiteFooter />
    </main>
  );
}
