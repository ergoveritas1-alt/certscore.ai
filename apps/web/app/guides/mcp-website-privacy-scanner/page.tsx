import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@website-signal-risk-scanner/ui";
import {
  createBreadcrumbSchema,
  createFaqPageSchema,
  createPageMetadata,
  createPublicArticleSchema
} from "../../../lib/seo";

const path = "/guides/mcp-website-privacy-scanner";
const title = "How to run a website privacy scan through MCP";
const description =
  "A technical guide to the CertScore.ai MCP Light three-tool workflow, evidence boundaries, privacy-minimized telemetry, and tested asynchronous scan behavior.";

export const metadata: Metadata = createPageMetadata({
  description,
  path,
  robots: { follow: true, index: true },
  socialImage: {
    alt: "CertScore.ai MCP Light website privacy scanner",
    height: 630,
    path: "/images/releases/mcp-light-social-card.png",
    width: 1200
  },
  title
});

const sections = [
  {
    title: "Use one public endpoint and three tools",
    paragraphs: [
      "CertScore.ai MCP Light is a no-account Streamable HTTP server at https://mcp.certscore.ai/mcp/light. A compatible agent discovers exactly three tools: certscore_scan_site, certscore_get_scan_status, and certscore_get_scan_bundle.",
      "The small tool surface keeps the first run explicit: request or reuse a scan, check status only while work is active, then retrieve a bounded completed result. No API key, bearer token, browser login, or OAuth is required for the Light route."
    ]
  },
  {
    title: "Why the workflow is asynchronous",
    paragraphs: [
      "A browser-based website scan can outlive a normal interactive tool-call window. certscore_scan_site therefore returns a stable scanId with a new, reused, queued, running, or finalizing decision instead of holding the connection until every evidence lane finishes.",
      "The client should retain that scanId, honor retryAfterSeconds, poll certscore_get_scan_status only for active work, and stop at a terminal status. It should call certscore_get_scan_bundle only after completed or completed_limited."
    ]
  },
  {
    title: "Keep preliminary and final evidence separate",
    paragraphs: [
      "A preConsentPreview is partial checkpoint context, not a finding, score, or final inventory. Final summaries should come from the completed bundle, which carries canonical public-safe findings, evidence references, coverage limitations, and report links where available.",
      "A completed_limited or no-go result is still an observation with explicit limitations. It is not proof that a site is compliant, free of risk, or fully tested."
    ]
  },
  {
    title: "Reject Path evidence fails closed",
    paragraphs: [
      "CertScore describes Reject Path behavior only when an eligible scan confirms a deterministic refusal action and retains qualifying post-refusal evidence. Unsupported, unavailable, unconfirmed, stale, or unverifiable outcomes remain neutral and must not be turned into findings.",
      "This boundary matters for agents: a missing Reject Path finding must never be rewritten as proof that rejection worked or failed."
    ]
  },
  {
    title: "Measure use without recording scan content",
    paragraphs: [
      "The hosted service measures bounded activation stages and tool outcomes using HMAC-derived opaque session or actor identifiers. It excludes prompts, target URLs, raw IP addresses, tokens, tool arguments, response bodies, and scan evidence from the growth funnel.",
      "Consented landing-page analytics remain separate from essential MCP telemetry. The two systems are not joined into a cross-site user profile."
    ]
  },
  {
    title: "What the production benchmark established",
    paragraphs: [
      "In a 25-case sequential production benchmark completed on August 29, 2026, MCP initialization succeeded in 25 of 25 cases. The initial certscore_scan_site call had a measured p95 of 4.896 seconds and a maximum of 4.897 seconds, with no unexpected MCP failures.",
      "That bounded benchmark validates the tested async path; it is not a service-level guarantee. Full scan completion still depended on the target and reached roughly 39 seconds in the tested cohort."
    ]
  }
] as const;

const schemas = [
  {
    ...createPublicArticleSchema({
      about: [
        "Model Context Protocol",
        "website privacy scanning",
        "cookie scanning",
        "consent management",
        "privacy engineering"
      ],
      description,
      path,
      title,
      type: "TechArticle"
    }),
    datePublished: "2026-08-30",
    dateModified: "2026-08-30",
    mainEntityOfPage: { "@id": `https://certscore.ai${path}`, "@type": "WebPage" }
  },
  createFaqPageSchema([
    {
      question: "Does CertScore.ai MCP Light require authentication?",
      answer: "No. The Light endpoint requires no account, API key, bearer token, browser login, or OAuth."
    },
    {
      question: "Which tools does MCP Light expose?",
      answer: "It exposes certscore_scan_site, certscore_get_scan_status, and certscore_get_scan_bundle."
    },
    {
      question: "Does an MCP privacy scan determine legal compliance?",
      answer: "No. Results are automated public-web observations with evidence and coverage limitations, not legal advice, certification, or a compliance determination."
    }
  ]),
  createBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Guides", path: "/guides" },
    { name: title, path }
  ])
];

export default function McpWebsitePrivacyScannerGuidePage() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      {schemas.map((schema) => (
        <script key={JSON.stringify(schema)} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      ))}

      <div className="max-w-3xl space-y-4">
        <Badge tone="neutral">Technical guide</Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="text-lg leading-8 text-slate-600">
          Connect a compatible agent to CertScore.ai MCP Light, preserve the scan lifecycle, and report only evidence the completed public-safe bundle supports.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800" href="/mcp/light">
            Connect MCP Light
          </Link>
          <Link className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:border-sky-400 hover:text-sky-800" href="/developers/mcp">
            Read the MCP reference
          </Link>
        </div>
      </div>

      <Card className="mt-8 border-slate-800 bg-slate-950 text-slate-100 shadow-none">
        <CardHeader>
          <CardTitle className="text-xl text-white">Canonical Light sequence</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto whitespace-pre-wrap text-sm leading-7 text-sky-100"><code>{`certscore_scan_site
→ certscore_get_scan_status while active
→ certscore_get_scan_bundle after terminal completion`}</code></pre>
        </CardContent>
      </Card>

      <div className="mt-8 grid gap-5">
        {sections.map((section) => (
          <Card className="border-slate-200 bg-white shadow-none" key={section.title}>
            <CardHeader>
              <CardTitle className="text-xl text-slate-950">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-7 text-slate-600">
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-5 border-amber-200 bg-amber-50 shadow-none">
        <CardContent className="p-5 text-sm leading-7 text-slate-700">
          CertScore.ai can make mistakes. Review retained evidence and applicable context before relying on a finding. Results are not legal advice, certification, or a compliance determination.
        </CardContent>
      </Card>
    </section>
  );
}
