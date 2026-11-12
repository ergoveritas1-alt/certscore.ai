import { HOW_IT_WORKS_HIGHLIGHTS } from "./how-it-works-walkthrough";

export const PRODUCT_GROUPS = [
  { id: "review", label: "Privacy review", description: "GDPR/ePrivacy + California", icon: "shield" },
  { id: "behavior", label: "Website behavior", description: "Cookies, tracking + consent", icon: "activity" },
  { id: "evidence", label: "Evidence to action", description: "Inspect, explain + remediate", icon: "evidence" },
  { id: "connect", label: "Scan your way", description: "Browser, MCP, API + SDK", icon: "connect" }
] as const;

export type ProductGroup = (typeof PRODUCT_GROUPS)[number]["id"];
export type ShowcaseSlide = {
  id: string;
  group: ProductGroup;
  label: string;
  title: string;
  description: string;
  highlights: [string, string];
  result: string;
  href: string;
  linkLabel: string;
} & (
  | { kind: "report"; image: { src: string; width: number; height: number; alt: string }; source: { date: string; label: string; href: string } }
  | { kind: "code"; code: { label: string; content: string } }
  | { kind: "workflow"; workflow: { title: string; steps: [string, string][]; output: string } }
);

type Copy = Omit<Extract<ShowcaseSlide, { kind: "report" }>, "kind" | "image" | "source">;
function report(captureId: string, copy: Copy): ShowcaseSlide {
  const capture = HOW_IT_WORKS_HIGHLIGHTS.find((item) => item.id === captureId);
  if (!capture) throw new Error(`Missing product overview capture: ${captureId}`);
  return { ...copy, kind: "report", image: { src: capture.src, width: capture.width, height: capture.height, alt: capture.alt }, source: capture.source };
}

export const HOMEPAGE_SHOWCASE: ShowcaseSlide[] = [
  report("overview", {
    id: "overview", group: "review", label: "Report overview", title: "One website. Evidence you can act on.",
    description: "Give your DPO, developer and agency a shared picture of website privacy. Move from the report overview to the cookies, services, consent behavior and disclosures behind each finding.",
    highlights: ["Priorities, scores and scan context in one view", "Supporting evidence a technical team can investigate"],
    result: "A practical starting point for deciding what to review, who should act and what to retest.", href: "/sample-report", linkLabel: "Explore a sample report"
  }),
  report("policy-checklist", {
    id: "gdpr", group: "review", label: "GDPR / ePrivacy", title: "Put GDPR/ePrivacy concerns into focus.",
    description: "Review pre-consent activity, non-essential cookies, Reject behavior and privacy disclosures together. Help DPOs and agencies connect technical observations with the questions that need closer review.",
    highlights: ["Consent behavior and cookie-purpose evidence", "Controller, purpose, rights and disclosure checks"],
    result: "Build a GDPR/ePrivacy review workflow around what the website actually exposed during the scan.", href: "/gdpr", linkLabel: "Explore GDPR/ePrivacy review"
  }),
  report("california-overview", {
    id: "california", group: "review", label: "CCPA / California", title: "A distinct California privacy perspective.",
    description: "Review California posture, GPC response, sale/sharing choices and collection notices. Keep CCPA/CPRA questions distinct from the EU consent review while working from retained website evidence.",
    highlights: ["California findings alongside the EU perspective", "Rights, notices and opt-out evidence in context"],
    result: "Give teams a CCPA review workflow without treating every privacy framework as the same checklist.", href: "/ccpa", linkLabel: "Explore California privacy review"
  }),
  report("gpc", {
    id: "gpc", group: "review", label: "GPC response", title: "See how a site responds to GPC.",
    description: "Inspect Global Privacy Control delivery and compare retained activity with a separate baseline. Review advertising and analytics observations with their comparison window and coverage.",
    highlights: ["Signal-delivery evidence and observed recipients", "Baseline-versus-GPC activity where comparable"],
    result: "Move from “does it have an opt-out?” to an evidence-led review of the site’s response.", href: "/guides/test-global-privacy-control", linkLabel: "Explore GPC testing"
  }),
  report("california-notices", {
    id: "notices", group: "review", label: "Notices & rights", title: "Connect privacy promises to collection.",
    description: "Inspect notice topics, rights language, collection-purpose wording and named opt-out routes. See which passages were retained and which functionality still needs investigation.",
    highlights: ["Sale/sharing, retention and rights disclosures", "Collection notices and choice-route inspection"],
    result: "Help privacy teams locate the disclosure gaps and unresolved questions worth following up.", href: "/solutions/privacy-policy-risk-scanner", linkLabel: "Explore disclosure review"
  }),
  report("cmp-audit", {
    id: "cmp", group: "review", label: "CMP implementation", title: "Your CMP manages choices. Check the behavior.",
    description: "A consent banner is part of the implementation. Inspect its controls and the observed activity around a choice to help diagnose tag configuration, vendor loading and consent-flow issues.",
    highlights: ["Individual CMP implementation checks", "Control visibility and after-choice observations"],
    result: "Give agencies an independent view when reviewing a client’s existing consent setup.", href: "/guides/consent-enforcement-testing", linkLabel: "Review consent implementation"
  }),
  report("resource-evidence", {
    id: "cookies", group: "behavior", label: "Cookies & storage", title: "Look inside the stored evidence.",
    description: "Inspect retained cookies and browser storage with purpose, domain and service context. Open the technical details behind a resource to understand what triggered further review.",
    highlights: ["Cookie and storage observations with attribution", "Structured resource evidence for developers"],
    result: "Go beyond a cookie count to the details your team can investigate.", href: "/guides/third-party-cookie-checker", linkLabel: "Explore cookie and tracker review"
  }),
  report("inventory", {
    id: "services", group: "behavior", label: "Services & requests", title: "Meet the third parties behind your page.",
    description: "Explore observed services, purposes, requests and storage together. Follow a vendor into its resource evidence and policy mentions instead of reviewing disconnected lists.",
    highlights: ["Advertising, analytics and other service identities", "Requests, storage and disclosure context"],
    result: "Make the website’s third-party footprint easier to explain to a developer or client.", href: "/how-it-works#walkthrough", linkLabel: "Inspect the report walkthrough"
  }),
  report("timeline", {
    id: "timeline", group: "behavior", label: "Before consent", title: "See what starts before the visitor chooses.",
    description: "Put observed requests, storage and consent events in order. Use timing and the captured page context to investigate activity that appears before a consent choice.",
    highlights: ["First-seen activity within the scan window", "Consent-surface timing beside browser events"],
    result: "Give your team a sequence to investigate, not just a list of technologies.", href: "/guides/detect-tracking-before-consent", linkLabel: "Explore pre-consent tracking"
  }),
  report("reject", {
    id: "choice-paths", group: "behavior", label: "Accept & Reject", title: "What really happens after Reject?",
    description: "Review retained cookies and requests after eligible Accept or Reject clicks in separate fresh sessions. Distinguish the completed action, consent confirmation and observed activity.",
    highlights: ["Separate Accept and Reject observations", "After-click request timing and retained cookies"],
    result: "Help developers investigate consent gating, then retest after changing the configuration.", href: "/guides/reject-consent-tracking-test", linkLabel: "Explore the Reject review workflow"
  }),
  report("session-replay", {
    id: "session-replay", group: "behavior", label: "Session replay", title: "Bring session-replay signals into view.",
    description: "Inspect detected session-recording technology and its supporting evidence. Use correction steps to guide a review of vendor settings, consent gating and disclosures.",
    highlights: ["Observed session-replay technology signals", "Evidence and correction steps in the same view"],
    result: "A detected signal guides investigation; it does not establish what a vendor recorded.", href: "/releases/session-replay-detection", linkLabel: "Read the session-replay research"
  }),
  report("fingerprinting", {
    id: "fingerprinting", group: "behavior", label: "Fingerprinting", title: "Privacy review beyond the cookie jar.",
    description: "Inspect browser-API activity associated with device-identification and fingerprinting review. Open the retained evidence to understand the signal and investigate the script behind it.",
    highlights: ["Browser-API observations beyond stored cookies", "Expandable technical evidence packets"],
    result: "Help your team investigate identification behavior that a cookie-only inventory can miss.", href: "/how-it-works#walkthrough", linkLabel: "Explore the evidence walkthrough"
  }),
  report("policy-excerpts", {
    id: "policy-evidence", group: "evidence", label: "Policy passages", title: "Read the passage behind the finding.",
    description: "Open the retained policy viewer to inspect highlighted wording and its source. Keep the captured disclosure attached to the review, even when the live policy later changes.",
    highlights: ["Highlighted policy text captured at scan time", "Source-linked evidence for disclosure review"],
    result: "Give a DPO or client the passage to inspect, not just a generated summary.", href: "/releases/privacy-policy-evidence", linkLabel: "Explore retained policy evidence"
  }),
  report("destinations", {
    id: "destinations", group: "evidence", label: "Data-flow context", title: "Follow the observed network destinations.",
    description: "Review endpoint, country and network context beside a service identity. Distinguish observed server locations from company headquarters when preparing a data-flow investigation.",
    highlights: ["Observed endpoint and network context", "Vendor identity alongside destination evidence"],
    result: "Provide concrete technical inputs for your team’s broader privacy review.", href: "/how-it-works#walkthrough", linkLabel: "Inspect destination evidence"
  }),
  report("form-screenshots", {
    id: "forms", group: "evidence", label: "Forms & fields", title: "See what your website asks people to share.",
    description: "Inspect field labels, data categories and required states, with verified masked form screenshots when available. Review collection surfaces without filling or submitting forms.",
    highlights: ["Field-level inventory and privacy review cues", "Masked visual evidence alongside form details"],
    result: "Make data-minimization and collection-notice reviews more concrete.", href: "/guides/website-form-scanning", linkLabel: "Explore forms and screenshots"
  }),
  report("accessibility", {
    id: "accessibility", group: "evidence", label: "Accessibility", title: "Find the element that needs attention.",
    description: "Review automated accessibility observations with affected elements, measured values and WCAG references. Give developers specific evidence to support fixes and a broader manual accessibility review.",
    highlights: ["Element-level evidence and WCAG context", "Accessibility findings beside privacy evidence"],
    result: "Support accessibility and ADA-related review without presenting an automated scan as a legal determination.", href: "/how-it-works#walkthrough", linkLabel: "Inspect accessibility evidence"
  }),
  report("connection-security", {
    id: "security", group: "evidence", label: "Connection security", title: "Check the connections carrying the page.",
    description: "Review HTTPS, certificates, redirects, mixed content and observed form destinations. Bring the available transport evidence into the same website review.",
    highlights: ["Five individual connection checks", "Supported observations and coverage in context"],
    result: "Give developers a focused view of connection settings that deserve attention.", href: "/methodology", linkLabel: "Explore scan coverage"
  }),
  report("share-export", {
    id: "handoff", group: "evidence", label: "Share & remediate", title: "Turn findings into a shared next step.",
    description: "Share the report and its evidence with developers, DPOs or agency clients. Use correction steps to plan the investigation, assign work and review a new scan after changes.",
    highlights: ["Shareable reports and Word report export", "Evidence-led remediation and retesting"],
    result: "Keep the conversation connected to the observed website behavior.", href: "/contact-sales", linkLabel: "Discuss your agency workflow"
  }),
  {
    id: "free-browser", group: "connect", label: "Free browser scan", title: "Start with a URL. See the evidence.",
    description: "Run a free browser-based scan to start reviewing a public website. No code access or script installation on the target website is needed. Choose the scan route that fits your review.",
    highlights: ["A free starting point for website privacy review", "Public-page observations with clear coverage"],
    result: "Try CertScore.ai on a website you want to understand.", href: "/how-it-works#free-scan", linkLabel: "Start a free scan",
    kind: "workflow", workflow: { title: "From public URL to reviewable evidence", steps: [["Choose a website", "Start with the public page you want to review."], ["Observe the page", "Capture supported browser and disclosure signals."], ["Inspect the report", "Explore findings, retained evidence and coverage."]], output: "A concrete starting point for your next privacy review." }
  },
  {
    id: "full-site", group: "connect", label: "Multi-page reviews", title: "Take the review beyond the homepage.",
    description: "Use plan-dependent full-site scans to extend the review across more public pages. Inspect page coverage and prioritize the findings that matter to your website or client engagement.",
    highlights: ["Multi-page coverage and report summaries", "A shared review workflow for larger websites"],
    result: "Match scan scope and page allowance to the work your team needs to do.", href: "/pricing", linkLabel: "Explore plans and page allowances",
    kind: "workflow", workflow: { title: "A broader website review", steps: [["Set the scope", "Choose the website and available page allowance."], ["Review page coverage", "See which pages contributed retained observations."], ["Prioritize the work", "Bring page findings into the team’s review."]], output: "Full-site scanning is available on eligible plans." }
  },
  {
    id: "monitoring", group: "connect", label: "Ongoing reviews", title: "Make privacy review a repeatable service.",
    description: "Agencies can use repeat scans to review client websites after tag, CMP or policy changes. Discuss monitoring options to establish an appropriate cadence and scope for ongoing work.",
    highlights: ["Repeat reviews after website changes", "Monitoring setup and cadence agreed before activation"],
    result: "Give clients a reason to keep reviewing website behavior after the initial audit.", href: "/monitor-site", linkLabel: "Discuss monitoring options",
    kind: "workflow", workflow: { title: "Review. Improve. Retest.", steps: [["Keep a baseline", "Retain the report and its original scan context."], ["Investigate changes", "Review tags, consent settings and disclosures."], ["Retest the website", "Compare new observations with the earlier evidence."]], output: "A repeatable process for developers, DPOs and agencies." }
  },
  {
    id: "mcp", group: "connect", label: "MCP for agents", title: "Give your AI agent website evidence.",
    description: "Connect an MCP-compatible agent to CertScore.ai. Start with Light MCP for public scans, or connect Hosted OAuth for authorized workspace reports and history.",
    highlights: ["Public scanning through Light MCP without an account", "Hosted OAuth for authorized workspace access"],
    result: "Let an agent retrieve retained findings and evidence to support a meaningful review.", href: "/developers/mcp", linkLabel: "Connect an agent with MCP", kind: "code",
    code: { label: "MCP · example workflow", content: 'Light MCP endpoint\nhttps://mcp.certscore.ai/mcp/light\n\n1. certscore_scan_site\n   { "url": "https://example.com" }\n\n2. certscore_get_scan_status\n   { "scanId": "<returned scanId>" }\n\n3. certscore_get_scan_bundle\n   {\n     "scanId": "<returned scanId>",\n     "detail": "findings",\n     "maxBytes": 8000\n   }\n\n// Follow the returned polling interval.\n// Usage and evidence-access limits apply.' }
  },
  {
    id: "api", group: "connect", label: "REST API", title: "Bring website review into your application.",
    description: "Create scans, follow their status and retrieve findings through the REST API. Use structured results to connect website privacy observations with your own review tools and workflows.",
    highlights: ["Scan creation, status, findings and evidence resources", "EU-Germany, EU-Ireland and California scan origins"],
    result: "Start with eligible anonymous scans; use authorized access for workspace and higher-volume workflows.", href: "/developers/quickstart", linkLabel: "Explore the API quickstart", kind: "code",
    code: { label: "REST API · example requests", content: 'POST https://certscore.ai/api/v2/scans\nContent-Type: application/json\n\n{\n  "url": "https://example.com",\n  "freshness": "latest",\n  "scanFrom": "eu_ie"\n}\n\n// Use the returned scan ID and status link.\nGET /api/v2/scans/<scanId>/status\nGET /api/v2/scans/<scanId>/findings\nGET /api/v2/scans/<scanId>/report-evidence\n\n// Preserve coverage with displayed findings.' }
  },
  {
    id: "sdk", group: "connect", label: "TypeScript SDK", title: "Build with typed scan results.",
    description: "Use the CertScore.ai TypeScript SDK to create a scan, wait for completion and work with structured results. Bring EU and California posture, consent observations and evidence into your application.",
    highlights: ["Typed resource clients and scan lifecycle helpers", "Documented integration examples for developers"],
    result: "Use an appropriately scoped API key and retain coverage context with every result.", href: "/developers/sdk", linkLabel: "Explore the TypeScript SDK", kind: "code",
    code: { label: "TypeScript SDK · example integration", content: 'import { CertScoreClient } from "@certscore/sdk";\n\nconst client = new CertScoreClient({\n  apiKey: process.env.CERTSCORE_API_KEY\n});\n\nconst scan = await client.scans.create(\n  "https://example.com",\n  { freshness: "latest", scanFrom: "eu_ie" }\n);\n\nconst completed = await client.scans.wait(scan);\n\nconsole.log(completed.postAcceptObservation);\nconsole.log(completed.postRefusalObservation);\nconsole.log(completed.gpcResponse);\n\n// Inspect completion and coverage before use.' }
  }
];
