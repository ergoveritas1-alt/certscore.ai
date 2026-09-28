import evidence from "./showcase-evidence.json";
import { AUTHENTIC_SAMPLE_REPORT_URL } from "./sample-report";

export type ShowcaseSlide = {
  id: string;
  label: string;
  category: string;
  title: string;
  description: string;
  highlights: string[];
  result: string;
  image?: { name: string; width: number; height: number; alt: string };
  code?: { label: string; content: string };
  json?: unknown;
  href: string;
  linkLabel: string;
};

const report = (anchor = "") => `${AUTHENTIC_SAMPLE_REPORT_URL}?reviewFocus=ccpa_cpra${anchor}`;
const image = (name: string, width: number, height: number, alt: string) => ({ name, width, height, alt });
const overview = image("overview", 449, 439, "Fresh test2 report: score 42, four priority issues, OneTrust and the consent, policy and transport signal snapshot.");

export const HOMEPAGE_SHOWCASE: ShowcaseSlide[] = [
  {
    id: "overview", label: "Overview", category: "Your report", title: "Know where to look first.",
    description: "Start with the page score, priority issues and a snapshot of the technologies your website uses. Open each finding to inspect its supporting evidence.",
    highlights: ["Prioritized findings and evidence ratings", "Consent, policy and resource summaries"],
    result: "This scan: 4 priority issues, 8 services and 10 cookie/storage items.", image: overview,
    json: { scan: evidence.scan, projection: evidence.projection }, href: report(), linkLabel: "Explore the report"
  },
  {
    id: "consent", label: "Consent paths", category: "Visitor choice", title: "Look beyond the cookie banner.",
    description: "Identify the CMP and visible Accept, Reject and Options controls. Separate after-click observations show what happened along eligible Accept and Reject paths.",
    highlights: ["First-layer control visibility", "Click execution and consent confirmation shown separately"],
    result: "This scan: activity remained after a confirmed Reject, including a Google request and a storage write.",
    image: image("consent", 624, 541, "Test2 consent panel with OneTrust, observed Accept and Reject controls, and separate after-action results."),
    json: { postRefusalObservation: evidence.postRefusalObservation }, href: report("#consent-review-evidence"), linkLabel: "Inspect consent evidence"
  },
  {
    id: "storage", label: "Cookies & storage", category: "Browser activity", title: "See what is stored—and when.",
    description: "Review cookies, local storage and session storage alongside their purpose, classification and first-seen timing. Follow a resource to its retained JSON evidence.",
    highlights: ["Essential, non-essential and review classifications", "Cookie names, domains and service attribution"],
    result: "This scan: _ga_TEST2 and _gat_TEST2 were classified as non-essential analytics cookies.",
    image: image("cookies", 1170, 465, "Expanded Google Analytics service with two non-essential cookie rows and a retained request."),
    href: report("#report-resource-inventory"), linkLabel: "Explore stored resources"
  },
  {
    id: "services", label: "Services & requests", category: "Browser activity", title: "Connect requests to the services behind them.",
    description: "Explore advertising, analytics and session-replay services, their requests and embedded resources. Review first- or third-party relationships, policy mentions and available destination evidence.",
    highlights: ["Vendor, product, purpose and request details", "Session replay and fingerprinting review signals"],
    result: "This scan: Google Analytics, Meta, Clarity, Hotjar, FullStory and Mixpanel activity was retained.",
    image: image("inventory", 1170, 614, "Actual service inventory with purpose, policy disclosure, timing, domains and site relationships."),
    href: report("#report-resource-inventory"), linkLabel: "Inspect services and requests"
  },
  {
    id: "timing", label: "Timeline", category: "Browser activity", title: "Put consent and tracking in order.",
    description: "A shared timeline places the consent surface, requests, storage and tracking signals in the observed page visit. Scan location and capture scope give the sequence context.",
    highlights: ["First-seen activity relative to scan start", "Consent-surface timing and observation end"],
    result: "This scan: the first third-party request appeared 1.88 seconds before the consent surface.",
    image: image("timeline", 1170, 165, "Test2 timeline showing a third-party request at 0.67 seconds and the consent banner at 2.55 seconds."),
    href: report(), linkLabel: "Follow the timeline"
  },
  {
    id: "gpc", label: "GPC", category: "California privacy", title: "See what changes with GPC.",
    description: "Verify delivery of Global Privacy Control, then compare classified activity with a separate passive baseline. The report distinguishes a completed observation from a measurable response.",
    highlights: ["Page-request and browser signal evidence", "Matched baseline-versus-GPC request counts"],
    result: "This scan: advertising fell from 1 request to 0; analytics/replay stayed at 5 in the matched 250 ms window.",
    image: image("gpc", 532, 517, "GPC report: response observed, advertising requests reduced from one to zero, analytics and replay stayed at five."),
    json: { gpcResponse: evidence.gpcResponse }, href: report("#gpc-evidence"), linkLabel: "Inspect the GPC comparison"
  },
  {
    id: "california", label: "CCPA / CPRA", category: "California privacy", title: "Bring privacy choices and notices into view.",
    description: "Review Do Not Sell/Share, privacy-choice and cookie-settings evidence alongside retained notice passages on sale/sharing, purposes, retention, rights and opt-out methods.",
    highlights: ["Evidence-backed choice links when verified", "Notice passages linked to their source policy"],
    result: "This scan: 5 notice topics retained. Choice-link visibility was not verified; opt-out functionality was not tested.",
    image: image("california", 532, 430, "Retained California notice passages from the test2 privacy policy, including sale/sharing and collection purposes."),
    json: { privacyAuditEvidence: evidence.privacyAuditEvidence }, href: report("#california-privacy-evidence"), linkLabel: "Review California evidence"
  },
  {
    id: "policy", label: "Policies", category: "Disclosures", title: "Follow disclosures back to their source.",
    description: "Locate privacy and cookie policies, then review retained disclosure evidence for purposes, legal basis, retention, recipients, transfers and rights. Compare directly comparable policy promises with runtime facts where supported.",
    highlights: ["Source-linked policy and transparency checks", "Observed evidence separated from unconfirmed coverage"],
    result: "This scan: the privacy-policy surface was observed; several disclosure checks remain unconfirmed.",
    image: image("policy", 624, 543, "Policy and transparency checklist showing the observed privacy-policy surface and unconfirmed disclosure checks."),
    href: report(), linkLabel: "Review disclosure evidence"
  },
  {
    id: "transport", label: "Transport", category: "Page safeguards", title: "Check how the page communicates.",
    description: "Review HTTPS delivery, certificate validation, HTTP redirects, mixed content and observed form transport alongside the privacy findings.",
    highlights: ["Retained TLS and certificate observations", "Individual results for five transport checks"],
    result: "This scan: 4 positive transport checks. Form transport was limited because no form was observed.",
    image: image("transport", 532, 492, "Transport checklist with four positive checks and a limited form-transport result."),
    href: report(), linkLabel: "Inspect transport checks"
  },
  {
    id: "collection", label: "Forms & embeds", category: "Page safeguards", title: "Understand the page’s collection surfaces.",
    description: "Inspect forms and field structure, checkbox settings and masked form captures when available. Resource inventories also expose embedded frames and hidden outbound links for review.",
    highlights: ["Read-only form inspection—no submissions", "Field details and capture coverage"],
    result: "This scan: no forms, embedded frames or hidden links were observed. The JSON retains the completed form-inventory result.",
    image: image("collection", 690, 204, "Actual resource summary showing zero forms, hidden links and embedded frames, alongside eight requests and ten cookie or storage items."), json: { appendix: evidence.appendix }, href: "/methodology", linkLabel: "Explore collection coverage"
  },
  {
    id: "exports", label: "Share & monitor", category: "Team workflows", title: "Take the evidence into your workflow.",
    description: "Share a report or export JSON, PDF and tracking CSV for your review. Plan-dependent full-site scans and monitoring extend the workflow to more pages and repeat checks.",
    highlights: ["Shareable reports and structured exports", "Full-site coverage and recurring monitoring options"],
    result: "This example covers one starting page. Its export keeps the scan identity, location and completion time.",
    code: { label: "Actual report export · selected fields", content: JSON.stringify({ scan: evidence.scan }, null, 2) },
    href: report(), linkLabel: "Open report and exports"
  },
  {
    id: "mcp", label: "MCP", category: "Developer interfaces", title: "Give your AI tools website evidence.",
    description: "Connect an MCP-compatible assistant to CertScore. Create or reuse an eligible scan, follow its status, then retrieve findings and paginated report evidence.",
    highlights: ["Light MCP for public scanning", "Authenticated tools for workspace access"],
    result: "Example workflow for test2.html. Tool access and scan allowances depend on the connection.",
    code: { label: "MCP · example tool workflow", content: 'certscore_scan_site\n{\n  "url": "https://ergoveritas.com/test2.html"\n}\n\n// While the returned scan is active\ncertscore_get_scan_status\n{ "scanId": "<returned scanId>" }\n\n// Once completed\ncertscore_get_scan_bundle\n{\n  "scanId": "<returned scanId>",\n  "detail": "findings",\n  "maxBytes": 8000\n}' },
    href: "/developers/mcp", linkLabel: "Explore MCP setup"
  },
  {
    id: "api", label: "API & SDK", category: "Developer interfaces", title: "Build the report into your application.",
    description: "Use the REST API or TypeScript SDK to create scans, poll status and retrieve findings and evidence. Keep scan identity and coverage with the results you display.",
    highlights: ["Structured scan and evidence contracts", "Documented endpoints and TypeScript SDK"],
    result: "Switch to JSON for selected fields from this scan’s real export. The request below is an API usage example.",
    code: { label: "REST API · example scan request", content: 'POST https://certscore.ai/api/v2/scans\nContent-Type: application/json\n\n{\n  "url": "https://ergoveritas.com/test2.html",\n  "freshness": "latest",\n  "scanFrom": "california"\n}\n\nGET /api/v2/scans/<scanId>/status\nGET /api/v2/scans/<scanId>/findings\nGET /api/v2/scans/<scanId>/report-evidence' },
    json: { scan: { id: evidence.scan.id, status: evidence.scan.status }, gpcResponse: evidence.gpcResponse },
    href: "/developers/quickstart", linkLabel: "Explore API and SDK"
  }
];
