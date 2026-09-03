export const MCP_LIGHT_CURSOR_INSTALL_URL =
  "https://cursor.com/link/mcp/install?name=CertScore.ai&config=eyJ1cmwiOiJodHRwczovL21jcC5jZXJ0c2NvcmUuYWkvbWNwL2xpZ2h0In0%3D";

export const MCP_LIGHT_CURSOR_DIRECTORY_URL = "https://cursor.directory/plugins/certscoreai-mcp-light";

const cursorPromptUrl = (prompt: string) => `https://cursor.com/link/prompt?text=${encodeURIComponent(prompt)}`;

const rolePrompts = [
  {
    label: "Launch review",
    prompt:
      "Use CertScore.ai to scan [PUBLIC URL] before launch. Report the CertScore score and evidence-backed findings for pre-consent cookies and trackers, consent controls, the jurisdiction-neutral GPC response, Accept and Reject Path post-action observations when available, privacy-policy transparency, and HTTPS/TLS. Treat Accept as a score-neutral baseline and non-confirmed choice-path results as limited coverage. Do not present the result as legal advice, certification, or a compliance determination."
  },
  {
    label: "Vendor review",
    prompt:
      "Use CertScore.ai to review [VENDOR PUBLIC URL]. Summarize the observed third-party tracking technologies, cookies and storage, CMP and consent-management signals, the jurisdiction-neutral GPC response, Accept and Reject Path post-action observations when available, policy and transparency findings, regulatory review signals, and HTTPS/TLS observations. Treat Accept as a score-neutral baseline. Include supporting evidence, the report URL, and all material coverage limitations."
  },
  {
    label: "Audit diagnostics",
    prompt:
      "Use CertScore.ai to scan [PUBLIC URL] for audit diagnostics. Follow the scan through a terminal status, retrieve the findings bundle, and prioritize evidence-backed privacy, cookie, tracker, consent, jurisdiction-neutral GPC response, Accept Path, Reject Path, policy, GDPR/ePrivacy, CCPA/CPRA, and transport observations. Treat Accept as a score-neutral baseline and non-confirmed choice-path results as limited coverage. Explain what was observed, what remains unknown or limited, and which evidence a human reviewer should inspect next."
  }
] as const;

export const MCP_LIGHT_ROLE_PROMPTS = rolePrompts.map((entry) => ({
  ...entry,
  cursorUrl: cursorPromptUrl(entry.prompt)
}));
