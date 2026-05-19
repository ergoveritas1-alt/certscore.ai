import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import { SiteFooter } from "../../components/layout/site-footer";
import { SiteHeader } from "../../components/layout/site-header";
import {
  PULSE_COVERAGE_LIMITATION_COPY,
  PULSE_FEEDBACK_EMAIL,
  PULSE_SHORT_DISCLAIMER,
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

const copyPasteExamples = [
  {
    command: `curl "https://certscore.ai/api/v1/pulse?url=https://example.com&detail=tiny"`,
    href: "https://certscore.ai/api/v1/pulse?url=https://example.com&detail=tiny"
  },
  {
    command: `curl "https://certscore.ai/api/v1/pulse?url=https://example.com"`,
    href: "https://certscore.ai/api/v1/pulse?url=https://example.com"
  },
  {
    command: `curl "https://certscore.ai/api/v1/pulse?url=https://example.com&detail=full"`,
    href: "https://certscore.ai/api/v1/pulse?url=https://example.com&detail=full"
  },
  {
    command: `curl "https://certscore.ai/api/v1/pulse?url=https://example.com&format=markdown"`,
    href: "https://certscore.ai/api/v1/pulse?url=https://example.com&format=markdown"
  },
  {
    command: `curl "https://certscore.ai/api/v1/pulse?url=https://example.com&freshness=refresh"`
  },
  {
    command: `curl "https://certscore.ai/api/v1/pulse?url=https://example.com&wait=60"`
  },
  {
    command: `curl "https://certscore.ai/api/v1/pulse/status/<jobId>"`
  }
];

const parameters = [
  ["url", "Public URL or domain to summarize. Use this for first-time or latest-domain lookup."],
  ["scanId", "Existing public eligible scan ID. Use this later for an immutable scan-backed Pulse response."],
  ["jobId", "Existing Pulse job ID. Use this to resolve or check an async Pulse request."],
  ["format", "`json` or `markdown`. Defaults to `json`."],
  ["detail", "`tiny`, `quick`, `standard`, or `full`. Defaults to `standard`. `quick` is an alias for `tiny`."],
  ["freshness", "`latest` or `refresh`. Defaults to `latest`."],
  [
    "wait",
    "Integer seconds from 0 to 80. This is only the maximum HTTP hold window for the current request; total queue plus scan time can be longer when workers are busy."
  ]
] as const;

const detailLevels = [
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
    summary: "Default mode. Best for agent use and quick evidence-backed summaries."
  },
  {
    name: "detail=full",
    summary:
      "Structured public report projection with more findings, review lenses, vendor/domain summaries, policy surfaces, fingerprinting context, interruptions, coverage diagnostics, and benchmark context. It does not expose raw internal artifacts."
  }
] as const;

const exampleMeta = {
  apiVersion: "v1",
  schemaVersion: "1.0.0",
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

const exampleLinks = {
  canonicalPulseUrl: "https://certscore.ai/pulse/example.com",
  jsonUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_abc123",
  markdownUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_abc123&format=markdown",
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
      domain: "example.com",
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
        url: "https://example.com",
        normalizedUrl: "https://example.com/",
        domain: "example.com",
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
      disclaimer: PULSE_STANDARD_DISCLAIMER
    }
  },
  {
    title: "200 completed full JSON",
    language: "json",
    value: {
      type: "certscore_pulse",
      meta: { ...exampleMeta, format: "json", detail: "full" },
      domain: "example.com",
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
        diagnostics: {
          interruptionCount: 1,
          interruptions: { shown: 1, total: 1, truncated: false }
        },
        limitations: ["Full mode is still a public report projection; raw internal artifacts are not included."]
      },
      links: exampleLinks,
      feedback: exampleFeedback,
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
      domain: "example.com",
      status: "running",
      phase: "runtime_observation",
      message: "Observing public-page behavior and collecting automated evidence signals.",
      elapsedSeconds: 28,
      estimatedWaitSeconds: 45,
      statusUrl: "https://certscore.ai/api/v1/pulse/status/pulse_job_123",
      nextCheckUrl: "https://certscore.ai/api/v1/pulse/status/pulse_job_123",
      reportUrl: "https://certscore.ai/scan/scan_abc123",
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
      domain: "example.com",
      status: "completed",
      completedAt: "2026-05-18T23:15:31Z",
      resultUrl: "https://certscore.ai/api/v1/pulse?scanId=scan_abc123",
      reportUrl: "https://certscore.ai/scan/scan_abc123",
      disclaimer: PULSE_STANDARD_DISCLAIMER
    }
  },
  {
    title: "429 throttled response",
    language: "json",
    value: {
      type: "certscore_pulse_error",
      meta: exampleMeta,
      error: {
        code: "pulse_throttled",
        message: "A Pulse scan for this domain was requested recently. Try again in a few minutes.",
        retryAfterSeconds: 240
      },
      feedback: {
        email: PULSE_FEEDBACK_EMAIL
      },
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
      disclaimer: PULSE_STANDARD_DISCLAIMER
    }
  },
  {
    title: "Markdown response",
    language: "markdown",
    value:
      "# CertScore Pulse: example.com\n\nStatus: Completed\nScore: 72/100\nRisk level: Review recommended\n\n## Quick readout\n\nAutomated scan surfaced consent-timing and third-party collection review signals.\n\n## Coverage\n\nCoverage was limited; absence of findings should not be interpreted as absence of risk.\n\n## Disclaimer\n\n" +
      PULSE_STANDARD_DISCLAIMER
  }
] as const;

function stringifyExample(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs leading-5 text-slate-100">
      <code>{children}</code>
    </pre>
  );
}

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
        <Card className="border-sky-200 bg-sky-50 shadow-none">
          <CardHeader>
            <CardTitle>For AI agents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-slate-700">
            <p>
              If you are an agent with OpenAPI actions or HTTP tools, start here before trying ad hoc fetches. CertScore Pulse works
              best when agents call the markdown response for user-facing summaries and reserve full JSON for evidence-heavy review.
            </p>
            <CodeBlock>{`Basic HTTP agent quick start:
1. If you do not support OpenAPI actions, call:
   GET https://certscore.ai/api/v1/pulse?url=<public URL>&format=markdown&detail=standard
2. For a quick check, call:
   GET https://certscore.ai/api/v1/pulse?url=<public URL>&format=markdown&detail=tiny
3. For structured evidence, call:
   GET https://certscore.ai/api/v1/pulse?url=<public URL>&format=json&detail=full
4. If you receive HTTP 202, read the returned statusUrl or poll:
   GET https://certscore.ai/api/v1/pulse/status/<jobId>
5. If the request fails before status/body/headers are visible, open:
   https://certscore.ai/api-pulse-agent-guide.txt`}</CodeBlock>
            <CodeBlock>{`OpenAPI / GPT Action quick start:
1. If you support OpenAPI actions/tools, import:
   https://certscore.ai/api/v1/openapi.chatgpt.json
2. Call getPulseForUrl with:
   url: <public URL>
   format: markdown
   detail: standard
3. Use detail=tiny for quick checks.
4. Use detail=full only when the user asks for evidence or deeper review context.
5. If API fetch fails before headers/body/status are visible, do not infer CertScore returned an error. Read /api-pulse/agent and /api-pulse-agent-guide.txt.`}</CodeBlock>
            <div className="flex flex-wrap gap-3">
              <Link
                className="inline-flex w-fit rounded-full border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
                href="/api/v1/openapi.chatgpt.json"
              >
                Open ChatGPT Action schema
              </Link>
              <Link
                className="inline-flex w-fit rounded-full border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
                href="/api/v1/pulse?url=https://example.com&format=markdown&detail=standard"
              >
                Open basic HTTP example
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

        <Card className="border-slate-200 bg-white shadow-none">
          <CardHeader>
            <CardTitle>Quick start</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-7 text-slate-600">
            <CodeBlock>GET https://certscore.ai/api/v1/pulse?url=https://example.com</CodeBlock>
            <a
              className="inline-flex w-fit rounded-full border border-slate-300 px-3 py-2 text-sm font-semibold text-sky-700 hover:border-sky-300 hover:bg-sky-50"
              href="https://certscore.ai/api/v1/pulse?url=https://example.com"
            >
              Open quick-start endpoint
            </a>
            <p>
              If a completed eligible scan exists, the API returns a completed Pulse. If no completed scan exists, the API may queue a new scan
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
                `freshness=latest` returns the latest eligible completed Pulse when available. If no completed eligible scan exists, CertScore
                may queue a first-time scan.
              </p>
              <p>
                `freshness=refresh` requests a new scan even if an older completed scan exists. Scan generation is limited to one new Pulse scan
                per normalized domain every five minutes.
              </p>
              <p>
                If refresh is throttled but a completed scan exists, CertScore may return the latest completed Pulse with
                `refresh.requested=true`, `refresh.performed=false`, `refresh.reason="domain_throttle"`, and `refresh.retryAfterSeconds`.
                If no completed scan exists and scan creation is throttled, the API returns HTTP 429 with `Retry-After`.
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
https://certscore.ai/api/v1/pulse?scanId=<scanId>&detail=full
https://certscore.ai/api/v1/pulse?scanId=<scanId>&format=markdown`}</CodeBlock>
            </CardContent>
          </Card>
        </div>

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
  "email": "optional@example.com"
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
              “No major automated review signals were surfaced in this scan.”
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
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/api-pulse-agent-guide.txt">
              Agent text guide
            </Link>
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/api/v1/openapi.json">
              OpenAPI JSON
            </Link>
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/api/v1/openapi.chatgpt.json">
              ChatGPT Action schema
            </Link>
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/.well-known/certscore-pulse">
              Discovery JSON
            </Link>
            <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/llms.txt">
              llms.txt
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
