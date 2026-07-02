import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { PULSE_PURPOSE_STATEMENT, PULSE_STANDARD_DISCLAIMER } from "../../../lib/pulse/constants";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "CertScore Pulse API Beta Agent Fallback",
  description:
    "Plain, browser-readable CertScore Pulse API beta fallback instructions for agents whose fetch tools cannot retrieve JSON endpoints.",
  path: "/api-pulse/agent",
  robots: {
    follow: true,
    index: true
  }
});

const endpoints = [
  ["Self-test canary", "https://certscore.ai/api/v1/pulse-self-test"],
  ["Health canary", "https://certscore.ai/api/v1/pulse-health"],
  ["OpenAPI JSON", "https://certscore.ai/api/v1/openapi.json"],
  ["ChatGPT Action beta schema", "https://certscore.ai/api/v1/openapi.chatgpt.json"],
  ["Universal AI/API discovery JSON", "https://certscore.ai/.well-known/certscore-ai.json"],
  ["Discovery JSON", "https://certscore.ai/.well-known/certscore-pulse"],
  ["Full LLM guide", "https://certscore.ai/llms-full.txt"],
  ["Tiny Pulse JSON", "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io&detail=tiny"],
  ["Summary Pulse JSON", "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io&detail=summary"],
  ["Evidence Pulse JSON", "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io&detail=evidence"],
  ["Pulse markdown", "https://certscore.ai/api/v1/pulse?url=https://kbdlab.io&format=markdown"],
  ["Invalid URL contract", "https://certscore.ai/api/v1/pulse?url=%3A%3A%3A%3A"],
  ["Missing job contract", "https://certscore.ai/api/v1/pulse/status/pulse_job_nonexistent_test"]
] as const;

const expectedHeaders = [
  "x-certscore-pulse: v1",
  "x-certscore-route: pulse-self-test | pulse-health | openapi | openapi-chatgpt | discovery | pulse | pulse-status",
  "x-certscore-request-id: <uuid>"
];

const recommendedCalls = [
  ["GPT Action beta summary", "GET /api/v1/pulse/gpt?url=https://kbdlab.io&format=markdown&detail=standard&wait=35"],
  ["User-facing summary", "GET /api/v1/pulse?url=https://kbdlab.io&format=markdown&detail=standard"],
  ["Quick machine triage", "GET /api/v1/pulse?url=https://kbdlab.io&detail=tiny"],
  ["Evidence/deeper review", "GET /api/v1/pulse?url=https://kbdlab.io&detail=evidence"],
  ["Connectivity check", "GET /api/v1/pulse-self-test"],
  ["Health check", "GET /api/v1/pulse-health"]
] as const;

export default function PulseAgentFallbackPage() {
  return (
    <main className="min-h-screen bg-white">
      <SiteHeader />
      <section className="mx-auto max-w-4xl px-6 py-14">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">CertScore Pulse API beta</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">Agent-readable beta fallback</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
          This page is a plain browser-readable fallback for agents or review tools whose JSON fetch layer cannot retrieve API
          endpoints. This is beta software. The current Pulse API beta version is 0.5.1. The canonical Pulse API remains{" "}
          <code className="rounded bg-slate-100 px-1">/api/v1/pulse</code>.
        </p>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">{PULSE_PURPOSE_STATEMENT}</p>

        <section className="mt-8 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-slate-800">
          <h2 className="font-semibold text-slate-950">Agent quick start</h2>
          <h3 className="mt-3 font-semibold text-slate-950">Basic HTTP agents</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>
              If you do not support OpenAPI actions, call{" "}
              <a
                className="break-all font-semibold text-sky-700"
                href="https://certscore.ai/api/v1/pulse?url=https://kbdlab.io&format=markdown&detail=standard"
              >
                https://certscore.ai/api/v1/pulse?url=&lt;public URL&gt;&amp;format=markdown&amp;detail=standard
              </a>
              .
            </li>
            <li>
              Pulse reuses an eligible completed scan from the prior 24 hours before queueing a new scan when{" "}
              <code className="rounded bg-white px-1">freshness=latest</code>. Use{" "}
              <code className="rounded bg-white px-1">freshness=refresh</code> to request a new scan when eligible.{" "}
              <code className="rounded bg-white px-1">forceNewScan=true</code> is a compatibility override; neither option bypasses
              validation or throttles.
            </li>
            <li>
              Use <code className="rounded bg-white px-1">scanFrom</code> or{" "}
              <code className="rounded bg-white px-1">geo</code> to select the scan location. Accepted values are{" "}
              <code className="rounded bg-white px-1">eu_ie</code> and{" "}
              <code className="rounded bg-white px-1">california</code>.
            </li>
            <li>
              For a quick check, use <code className="rounded bg-white px-1">format=markdown</code> and{" "}
              <code className="rounded bg-white px-1">detail=tiny</code>.
            </li>
            <li>
              For structured evidence, use <code className="rounded bg-white px-1">format=json</code> and{" "}
              <code className="rounded bg-white px-1">detail=evidence</code>.
            </li>
            <li>
              If you receive HTTP 202, read the returned <code className="rounded bg-white px-1">statusUrl</code> or poll{" "}
              <code className="rounded bg-white px-1">/api/v1/pulse/status/&lt;jobId&gt;</code>.
            </li>
            <li>If API fetch fails before headers, body, or status are visible, do not infer CertScore returned an error.</li>
          </ol>
          <h3 className="mt-5 font-semibold text-slate-950">Recommended calls</h3>
          <div className="mt-3 divide-y divide-sky-100 rounded-lg border border-sky-100 bg-white">
            {recommendedCalls.map(([label, call]) => (
              <div key={call} className="grid gap-2 p-3 md:grid-cols-[12rem_1fr]">
                <p className="font-semibold text-slate-900">{label}</p>
                <code className="break-all rounded bg-slate-50 px-2 py-1 text-slate-800">{call}</code>
              </div>
            ))}
          </div>
          <p className="mt-3">
            Summary JSON is best for concise agent output. Markdown is best for conversational summaries. Tiny is best for badges,
            triage, and routing. Evidence JSON is best for evidence review and coverage diagnostics. Self-test is best for deployment
            and agent connectivity checks.
          </p>
          <h3 className="mt-5 font-semibold text-slate-950">OpenAPI / GPT Action beta agents</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>
              If you support OpenAPI actions or tools, import{" "}
              <a
                className="break-all font-semibold text-sky-700"
                href="https://certscore.ai/api/v1/openapi.chatgpt.json"
              >
                https://certscore.ai/api/v1/openapi.chatgpt.json
              </a>
              .
            </li>
            <li>
              Call <code className="rounded bg-white px-1">getPulseForUrl</code> with <code className="rounded bg-white px-1">url</code>,{" "}
              <code className="rounded bg-white px-1">format=markdown</code>, and{" "}
              <code className="rounded bg-white px-1">detail=standard</code>, optional{" "}
              <code className="rounded bg-white px-1">scanFrom</code>, and <code className="rounded bg-white px-1">wait=35</code>.
            </li>
            <li>
              Use <code className="rounded bg-white px-1">detail=tiny</code> for quick checks.
            </li>
            <li>
              Public GPT Action beta access uses latest-mode summaries. Use Evidence JSON or link users to the CertScore report when
              they need more support.
            </li>
          </ol>
        </section>

        <section className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
          <h2 className="font-semibold">How to interpret fetch failures</h2>
          <p className="mt-2">
            A successful CertScore Pulse response includes the diagnostic headers below. If a checker reports an internal fetch error
            and cannot show these headers, it did not successfully evaluate the CertScore application response.
          </p>
          <p className="mt-2">
            Agent fetch limitations: Some agent environments may fail before receiving an HTTP response because of DNS, sandbox, TLS,
            proxy, or fetch-layer limitations. If a request fails before exposing an HTTP status, response body, or x-certscore-*
            diagnostic headers, do not conclude CertScore Pulse is unavailable. First try /api/v1/pulse-self-test,
            /api/v1/pulse-health, /api-pulse-agent-guide.txt, /.well-known/certscore-pulse, and
            /api/v1/openapi.chatgpt.json. If those also fail without HTTP status or CertScore diagnostic headers, report it as a
            client/network fetch limitation rather than a CertScore API result.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {expectedHeaders.map((header) => (
              <li key={header}>
                <code className="rounded bg-white/70 px-1">{header}</code>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="text-xl font-semibold text-slate-950">Canonical endpoints</h2>
          <div className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200">
            <div className="grid gap-2 p-4 md:grid-cols-[12rem_1fr]">
              <p className="text-sm font-semibold text-slate-900">Plain text guide</p>
              <a className="break-all text-sm font-semibold text-sky-700" href="https://certscore.ai/api-pulse-agent-guide.txt">
                https://certscore.ai/api-pulse-agent-guide.txt
              </a>
            </div>
            {endpoints.map(([label, href]) => (
              <div key={href} className="grid gap-2 p-4 md:grid-cols-[12rem_1fr]">
                <p className="text-sm font-semibold text-slate-900">{label}</p>
                <a className="break-all text-sm font-semibold text-sky-700" href={href}>
                  {href}
                </a>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-lg border border-slate-200 p-4">
          <h2 className="text-xl font-semibold text-slate-950">Expected public contract</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-700">
            <li>Health, OpenAPI, and discovery endpoints return HTTP 200 with JSON.</li>
            <li>Valid Pulse URL requests return a documented 200, 202, or 429 response.</li>
            <li>Markdown requests may return HTTP 200 with text/markdown, or a documented JSON status/error shape.</li>
            <li>Invalid URL input returns HTTP 400 JSON with error code invalid_url.</li>
            <li>Unknown status jobs return HTTP 404 JSON with error code not_found.</li>
          </ul>
        </section>

        <section className="mt-10 rounded-lg border border-slate-200 p-4">
          <h2 className="text-xl font-semibold text-slate-950">Fallback workflow</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-7 text-slate-700">
            <li>Open the health canary first and confirm the CertScore diagnostic headers.</li>
            <li>If the health canary is unavailable only inside one tool, treat that as a tool fetch/DNS failure.</li>
            <li>Use the Pulse markdown endpoint when a tool prefers readable text over JSON.</li>
            <li>Use the ChatGPT Action beta schema when configuring a Custom GPT beta action.</li>
            <li>Use the Evidence JSON endpoint when structured finding, evidence, and review context are needed.</li>
          </ol>
        </section>

        <p className="mt-10 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
          {PULSE_STANDARD_DISCLAIMER}
        </p>

        <div className="mt-8 flex flex-wrap gap-3 text-sm">
          <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/api-pulse">
            Pulse API docs
          </Link>
          <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/api-pulse-agent-guide.txt">
            Plain text guide
          </Link>
          <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/api/v1/openapi.chatgpt.json">
            ChatGPT Action beta schema
          </Link>
          <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/llms.txt">
            llms.txt
          </Link>
          <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/llms-full.txt">
            llms-full.txt
          </Link>
          <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/.well-known/certscore-ai.json">
            AI discovery manifest
          </Link>
          <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/findings">
            Findings reference
          </Link>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
