export const museGuide = {
  title: "CertScore.ai for Muse Agents",
  description: "Connect CertScore.ai to Muse and scan any public website's privacy posture from the conversation. No account or API key needed. Setup, first scan, and repeat-use guide for Muse agents.",
  intro: "Connect Muse to CertScore.ai, scan a public website, and review the score, findings, and evidence in your conversation.",
  overview: "CertScore.ai checks public websites for privacy and consent risk signals. Its reports cover cookies and trackers before consent, activity after Accept and Reject, consent banner behavior, fingerprinting and session replay signals, form collection, and policy wording. Reports include a score and retained evidence.",
  legal: "Results are automated observations of public pages. They are not legal advice, certification, or a compliance determination.",
  endpoint: "https://mcp.certscore.ai/mcp/light",
  limitsUrl: "https://certscore.ai/developers/mcp#light-usage-limits",
  oauthUrl: "https://certscore.ai/releases/mcp-hosted-oauth",
  details: [
    ["Service", "CertScore.ai MCP Light"],
    ["Transport", "Streamable HTTP"],
    ["Authentication", "None. No account, API key, OAuth flow, or Authorization header."],
    ["Hosted release", "0.2.30 (verified October 21, 2026)"],
    ["Registry identity", "ai.certscore/mcp-light"],
    ["Cost", "Free to use, with a scoped daily allowance."],
    ["Scope", "Public websites only. The scanner cannot sign in to login-protected pages."]
  ],
  useCases: [
    ["Before a launch", "Check a public site before a launch or redesign goes live."],
    ["After consent changes", "Review changes to a cookie banner, consent tool, tag manager, or analytics setup."],
    ["Vendor reviews", "Check a vendor, partner, or acquisition target's website."],
    ["Tracking questions", "Find out what loads before consent or what fires after Reject."],
    ["Policy updates", "Check the wording of a rewritten privacy policy."],
    ["Client reviews", "Gather evidence for a review, renewal, or client report."],
    ["Site comparisons", "Review two or more sites on the same basis."]
  ],
  examples: ["Is our banner OK?", "What does this site track?", "Check this vendor.", "We launch next week.", "Did the fix work?"],
  listings: "You can check the service's identity in the Official MCP Registry (ai.certscore/mcp-light), Smithery, Glama, Cursor Directory, and mcpservers.org.",
  connectIntro: "Paste this prompt into Muse to set up the connection and save the scanning workflow:",
  connectPrompt: "Connect the CertScore.ai MCP Light server as a custom connector. The endpoint is https://mcp.certscore.ai/mcp/light and it needs no authentication. Then save a skill so I can ask you to scan a website's privacy posture and show me the score, the findings, and the evidence.",
  agentConnect: "If you are an agent that can add MCP servers, use the endpoint above as a remote Streamable HTTP server with no auth headers.",
  firstAsk: "Use CertScore.ai to scan https://ergoveritas.com/test1.html. Show me the score, the main findings with evidence, any coverage limits, and the report link. Keep the scan ID for a later recheck.",
  scanSteps: [
    { name: "Start the scan", tool: "certscore_scan_site", text: "Call certscore_scan_site with the site URL. Declare a purpose when one fits: prelaunch_review, vendor_review, tracking_check, consent_gpc_check, policy_review, recheck." },
    { name: "Wait for completion", tool: "certscore_get_scan_status", text: "Poll certscore_get_scan_status until the scan completes. Scans are asynchronous; allow a few minutes." },
    { name: "Get the report", tool: "certscore_get_scan_bundle", text: "Call certscore_get_scan_bundle for the scored results: overall score, findings, coverage, and the report link." },
    { name: "Check the evidence", tool: "certscore_get_report_evidence_page", text: "Call certscore_get_report_evidence_page when a finding needs its underlying evidence." }
  ],
  reuse: "By default, the service reuses a recent result for the same site. Request a fresh scan only when the user asks for one or wants a recheck after a change.",
  reportItems: [
    ["Score and date", "Lead with the overall score and the scan date."],
    ["Findings and evidence", "Show the findings that matter most, with the evidence for each."],
    ["Coverage and report link", "State any reported coverage limits, such as completed_limited. Always include the report link."],
    ["Scan ID", "Keep the scan ID as the baseline for a later recheck."]
  ],
  reportRule: "Never present a finding as a legal violation or describe a site as compliant or non-compliant. These are observations for human review.",
  rateLimit: "If a call returns rate_limited, tell the user and stop. Do not retry in a loop.",
  skill: "Save a skill during setup so Muse has the workflow available in later conversations. Include when to scan, the four steps above, how to present results, and how to compare a recheck with an earlier scan.",
  skillPlaceholder: "[Skill package link to be added.]",
  recheckIntro: "Keep the first scan as a baseline. After you change the site, ask Muse for a fresh scan and compare the results.",
  recheckSteps: [
    "Keep the scan ID from the first scan.",
    "After the site changes, run a fresh scan with purpose recheck.",
    "Compare findings against the baseline scan ID.",
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
  oauth: "MCP Light is anonymous and stateless. Use Hosted MCP OAuth when you want Muse to return to earlier scans, compare results across sessions, or work inside a CertScore.ai workspace. The agent connects to your workspace with OAuth, so there is no API key to copy. A CertScore.ai account is required.",
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
    "## When to use CertScore.ai", pairs(museGuide.useCases), "Ask Muse:", bullets(museGuide.examples), museGuide.listings,
    "## Connect Muse and run your first scan", "### Connect Muse", museGuide.connectIntro,
    `\`\`\`text\n${museGuide.connectPrompt}\n\`\`\``, museGuide.agentConnect,
    "### Ask for a scan", `\`\`\`text\n${museGuide.firstAsk}\n\`\`\``,
    "### The four-tool workflow", numbered(museGuide.scanSteps.map((step) => step.text)), museGuide.reuse,
    "### Share the results", pairs(museGuide.reportItems), museGuide.reportRule, museGuide.rateLimit,
    "## Use CertScore.ai after the first scan", "### Save a skill", museGuide.skill, museGuide.skillPlaceholder,
    "### Recheck after changes", museGuide.recheckIntro, numbered(museGuide.recheckSteps),
    "### When to scan again", pairs(museGuide.repeatPatterns), museGuide.scanPermission,
    "### Connect to a workspace with Hosted MCP OAuth", museGuide.oauth, `Setup guide: ${museGuide.oauthUrl}`,
    "## Quick reference", pairs(museGuide.quickReference)
  ].join("\n\n") + "\n";
}
