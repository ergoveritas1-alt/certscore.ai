import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../../components/layout/site-footer";
import { SiteHeader } from "../../../components/layout/site-header";
import { PULSE_STANDARD_DISCLAIMER } from "../../../lib/pulse/constants";
import { createPageMetadata } from "../../../lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "CertScore Pulse Agent Fallback",
  description:
    "Plain, browser-readable CertScore Pulse fallback instructions for agents whose fetch tools cannot retrieve JSON endpoints.",
  path: "/api-pulse/agent",
  robots: {
    follow: true,
    index: true
  }
});

const endpoints = [
  ["Health canary", "https://certscore.ai/api/v1/pulse-health"],
  ["OpenAPI JSON", "https://certscore.ai/api/v1/openapi.json"],
  ["ChatGPT Action schema", "https://certscore.ai/api/v1/openapi.chatgpt.json"],
  ["Discovery JSON", "https://certscore.ai/.well-known/certscore-pulse"],
  ["Tiny Pulse JSON", "https://certscore.ai/api/v1/pulse?url=https://example.com&detail=tiny"],
  ["Full Pulse JSON", "https://certscore.ai/api/v1/pulse?url=https://example.com&detail=full"],
  ["Pulse markdown", "https://certscore.ai/api/v1/pulse?url=https://example.com&format=markdown"],
  ["Invalid URL contract", "https://certscore.ai/api/v1/pulse?url=%3A%3A%3A%3A"],
  ["Missing job contract", "https://certscore.ai/api/v1/pulse/status/pulse_job_nonexistent_test"]
] as const;

const expectedHeaders = [
  "x-certscore-pulse: v1",
  "x-certscore-route: pulse-health | openapi | openapi-chatgpt | discovery | pulse | pulse-status",
  "x-certscore-request-id: <uuid>"
];

export default function PulseAgentFallbackPage() {
  return (
    <main className="min-h-screen bg-white">
      <SiteHeader />
      <section className="mx-auto max-w-4xl px-6 py-14">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">CertScore Pulse</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">Agent-readable fallback</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
          This page is a plain browser-readable fallback for agents or review tools whose JSON fetch layer cannot retrieve API
          endpoints. The canonical Pulse API remains <code className="rounded bg-slate-100 px-1">/api/v1/pulse</code>.
        </p>

        <section className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
          <h2 className="font-semibold">How to interpret fetch failures</h2>
          <p className="mt-2">
            A successful CertScore Pulse response includes the diagnostic headers below. If a checker reports an internal fetch error
            and cannot show these headers, it did not successfully evaluate the CertScore application response.
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
            <li>Use the ChatGPT Action schema when configuring a Custom GPT action.</li>
            <li>Use the full JSON endpoint when structured finding, evidence, and review context are needed.</li>
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
            ChatGPT Action schema
          </Link>
          <Link className="rounded-full border border-slate-300 px-3 py-2 font-semibold text-slate-700" href="/llms.txt">
            llms.txt
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
