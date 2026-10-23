export const museGuide = {
  title: "CertScore.ai for Muse",
  description: "Scan website cookies, trackers, consent and accessibility in Muse with CertScore.ai. Download the free skill, inspect evidence and recheck fixes. No API key.",
  intro: "Find out what a website loads before consent, what remains after Reject, and what needs a closer look. Ask Muse, then open the evidence in CertScore.ai.",
  overview: "Review a launch, investigate tracking, or check a vendor. Get clearly labeled EU and California scores, the findings behind them, and a full report you can return to after a fix.",
  legal: "Results are automated observations of public pages. They are not legal advice, certification, or a compliance determination.",
  endpoint: "https://mcp.certscore.ai/mcp/light",
  limitsUrl: "https://certscore.ai/developers/mcp#light-usage-limits",
  oauthUrl: "https://certscore.ai/releases/mcp-hosted-oauth",
  details: [
    ["Service", "CertScore.ai MCP Light"],
    ["Transport", "Streamable HTTP"],
    ["Authentication", "None. No account, API key, OAuth flow, or Authorization header."],
    ["Hosted release", "0.2.30 (verified October 22, 2026)"],
    ["Registry identity", "ai.certscore/mcp-light"],
    ["Cost", "Free to use, with a scoped daily allowance."],
    ["Scope", "Public websites only. The scanner cannot sign in to login-protected pages."]
  ],
  useCases: [
    ["Before launch", "Find consent, tracking, policy and accessibility issues on a public page before you share it widely."],
    ["After a change", "Keep a baseline, update the banner or tags, then compare a fresh scan from the same location."],
    ["For a vendor review", "Inspect a vendor's public website and take the evidence into your review."],
    ["Across client sites", "Review the URLs you choose, with separate reports and a consistent comparison."]
  ],
  examples: ["What loads before consent?", "What remains after Reject?", "Compare these two sites.", "Did the banner fix work?"],
  connectIntro: "For Muse setups that support custom MCP connectors, use this prompt. The downloadable skill also includes a helper when native tools are unavailable:",
  connectPrompt: "Connect CertScore.ai MCP Light at https://mcp.certscore.ai/mcp/light using Streamable HTTP with no authentication. Reuse an existing connection if available. List its tools to verify the connection; do not start a scan until I ask.",
  agentConnect: "If you are an agent that can add MCP servers, use the endpoint above as a remote Streamable HTTP server with no auth headers.",
  firstAsk: "Use CertScore.ai to review https://ergoveritas.com/test1.html. Give me the top three things to check, their evidence, the labeled scores and coverage, and the full report link. Keep this scan as a baseline.",
  scanSteps: [
    { name: "Start the scan", tool: "certscore_scan_site", text: "Call certscore_scan_site with the site URL. Declare a purpose when one fits: prelaunch_review, vendor_review, tracking_check, consent_gpc_check, policy_review, recheck." },
    { name: "Wait for completion", tool: "certscore_get_scan_status", text: "Poll the returned scan ID only while queued, running or finalizing. Honor retry guidance, wait at least five seconds between polls, and stop at a terminal state." },
    { name: "Get the report", tool: "certscore_get_scan_bundle", text: "Retrieve findings with maxBytes=8000. Label EU and California scores and their coverage separately. Preserve truncation notices and the returned report links; use a suggested larger budget or evidence pages if the core cannot fit." },
    { name: "Check the evidence", tool: "certscore_get_report_evidence_page", text: "Call certscore_get_report_evidence_page when a finding needs its underlying evidence." }
  ],
  reuse: "By default, the service reuses a recent result for the same site. Request a fresh scan only when the user asks for one or wants a recheck after a change.",
  reportItems: [
    ["Score and date", "Label EU (GDPR/ePrivacy) and California (CCPA/CPRA) scores clearly, with their coverage and scan date."],
    ["Review focus", "Open the EU or California report view using the same scan. Changing the view does not run another visit."],
    ["Scan location", "Ask for Ireland, Germany, or California when you need a new visit from that location."],
    ["Findings and evidence", "Show the findings that matter most, with the evidence for each."],
    ["Coverage and report link", "Say what was captured and what remains unknown. Link the full report for its findings, tables and available screenshots."],
    ["Scan ID", "Keep the scan ID as the baseline for a later recheck."]
  ],
  reportRule: "Never present a finding as a legal violation or describe a site as compliant or non-compliant. These are observations for human review.",
  rateLimit: "If a call returns rate_limited, tell the user and stop. Do not retry in a loop.",
  skill: "Save the skill once. Then ask Muse to review a site, inspect a finding, or compare a recheck with your baseline. It uses native MCP tools when available and includes a Python helper for other setups.",
  skillDownloadPath: "/resources/certscore-muse-skill-1.0.3.zip",
  skillDownloadLabel: "Download the Muse skill package",
  skillVersion: "Version 1.0.3 · ZIP · No Python packages to install",
  skillInstallPrompt: "Save the attached CertScore.ai skill for future website reviews and read its SKILL.md. Reuse an existing CertScore.ai MCP Light connection if available; otherwise use the included helper. Do not start a scan yet.",
  skillInstallSteps: [
    "Download the ZIP and attach it to a Muse conversation.",
    "Ask Muse to save the contained skill for future website reviews and reuse your existing CertScore.ai connection.",
    "When you're ready, ask for a scan. Saving the skill does not start one."
  ],
  followUpIntro: "You do not need another scan to understand the one you already have. Ask a narrower question, or open the full report to inspect the evidence yourself.",
  followUps: [
    { label: "Inspect the evidence", copyLabel: "evidence prompt", text: "See the cookies, trackers and timing behind a finding.", prompt: "Show me the cookies and trackers found on this page. Use the existing scan and keep it brief." },
    { label: "Hand it to a developer", copyLabel: "checklist prompt", text: "Turn the priority findings into a practical checklist.", prompt: "Give me the top three fixes, with the evidence and a way to verify each. Use this scan." },
    { label: "Switch report focus", copyLabel: "report view prompt", text: "Read the same visit through EU or California topics.", prompt: "Show the EU and California scores with their coverage and a link to each report view. Do not scan again." }
  ],
  compareRule: "Compare the same review focus and equivalent coverage. Check which page has the lower score in each view before describing the ranking; changing a page's own score between views does not reverse the pages' order.",
  recheckPrompt: "The banner fix is live. Run a fresh CertScore.ai scan of the same URL from the baseline location. Compare the same review focus in a short table, explain the main evidence changes and coverage limits, and link both reports.",
  recheckIntro: "Keep the first scan as a baseline. After you change the site, ask Muse for a fresh scan and compare the results.",
  recheckSteps: [
    "Keep the scan ID from the first scan.",
    "After the site changes, run a fresh scan with purpose recheck from the same location.",
    "Compare the same review focus and equivalent coverage against the baseline scan ID.",
    "Report what changed. A finding missing from a later scan is a change to note, not proof of a fix; say so."
  ],
  recheckFlow: [
    ["Scan", "Keep the baseline scan ID."],
    ["Make changes", "Update the site, banner, tags, or policy."],
    ["Recheck", "Request a fresh scan with purpose recheck."],
    ["Compare", "Review changed findings and their evidence."]
  ],
  repeatPatterns: [
    ["Before launch", "Scan a public staging or production URL before a launch or redesign."],
    ["After consent changes", "Rescan when the banner, CMP, or tag setup changes."],
    ["New vendors", "Review a vendor or partner's site before signing."],
    ["Periodic checks", "With the user's approval, repeat a scan and compare it with the previous result."],
    ["Agency portfolios", "Run the same review across client sites, with a separate report for each."]
  ],
  scanPermission: "Only run scans the user has asked for or approved as a recurring pattern. Never scan sites on your own initiative.",
  oauth: "With MCP Light, keep a scan ID or report link to revisit that result. For saved workspace history, access across conversations, or team work, connect Hosted MCP OAuth. It links Muse to your CertScore.ai workspace without copying an API key. A CertScore.ai account and workspace authorization are required.",
  faqs: [
    ["Do I need an account or API key?", "No. MCP Light works without an account, API key or OAuth sign-in, within its scoped daily allowance. The skill download is free."],
    ["Does switching to the California view create a scan?", "No. EU and California report views use the same visit's evidence. To test a visit from Ireland, Germany or California, request a new scan from that location."],
    ["Can I return to a report later?", "Yes. Keep its report link or scan ID. Ask Muse to retrieve that existing result; request a fresh scan when you want to check a later site change."],
    ["Does a high score mean the site is compliant?", "No. Scores summarize the returned findings and coverage. Unknown checks remain unknown; automated observations are not a legal determination."]
  ],
  quickReference: [
    ["First scan", "Connect, scan, poll, then present the bundle with evidence, coverage limits, and the report link."],
    ["Recheck", "Request a fresh scan with purpose recheck and compare it with the baseline scan ID."],
    ["Rate limited", "Tell the user and stop. Do not loop."],
    ["Need to verify a finding?", "Retrieve its evidence page before reporting it."]
  ]
} as const;

export function museGuideMarkdown() {
  const bullets = (items: readonly string[]) => items.map((text) => `- ${text}`).join("\n");
  const pairs = (items: readonly (readonly [string, string])[]) => bullets(items.map(([label, text]) => `${label}: ${text}`));
  const numbered = (items: readonly string[]) => items.map((text, index) => `${index + 1}. ${text}`).join("\n");
  return [
    `# ${museGuide.title}`, museGuide.intro, museGuide.overview, museGuide.legal,
    "## Connection details", `Endpoint: ${museGuide.endpoint}`, pairs(museGuide.details),
    `Current limits: ${museGuide.limitsUrl}`, `Tools: ${museGuide.scanSteps.map((step) => step.tool).join(", ")}`,
    "## Download and save the Muse skill", museGuide.skill,
    `[${museGuide.skillDownloadLabel}](https://certscore.ai${museGuide.skillDownloadPath})`, museGuide.skillVersion, numbered(museGuide.skillInstallSteps),
    `\`\`\`text\n${museGuide.skillInstallPrompt}\n\`\`\``,
    "## When to use CertScore.ai", pairs(museGuide.useCases),
    "## Connect Muse and run your first scan", "### Connect Muse", museGuide.connectIntro,
    `\`\`\`text\n${museGuide.connectPrompt}\n\`\`\``, museGuide.agentConnect,
    "### Ask for a scan", `\`\`\`text\n${museGuide.firstAsk}\n\`\`\``,
    "### The four-tool workflow", numbered(museGuide.scanSteps.map((step) => step.text)), museGuide.reuse,
    "### Share the results", pairs(museGuide.reportItems), museGuide.reportRule, museGuide.rateLimit,
    "## Go deeper with the same scan", museGuide.followUpIntro,
    ...museGuide.followUps.flatMap(({ label, text, prompt }) => [`### ${label}`, text, `\`\`\`text\n${prompt}\n\`\`\``]),
    "## Use CertScore.ai after the first scan",
    "### Recheck after changes", museGuide.recheckIntro, numbered(museGuide.recheckSteps),
    `\`\`\`text\n${museGuide.recheckPrompt}\n\`\`\``, museGuide.compareRule,
    "### When to scan again", pairs(museGuide.repeatPatterns), museGuide.scanPermission,
    "### Connect to a workspace with Hosted MCP OAuth", museGuide.oauth, `Setup guide: ${museGuide.oauthUrl}`,
    "## Questions about CertScore.ai in Muse", pairs(museGuide.faqs),
    "## Quick reference", pairs(museGuide.quickReference)
  ].join("\n\n") + "\n";
}
