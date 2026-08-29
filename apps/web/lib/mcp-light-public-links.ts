export const MCP_LIGHT_CURSOR_INSTALL_URL =
  "https://cursor.com/link/mcp/install?name=certscore&config=eyJ1cmwiOiJodHRwczovL21jcC5jZXJ0c2NvcmUuYWkvbWNwL2xpZ2h0In0%3D";

export const MCP_LIGHT_CURSOR_DIRECTORY_URL = "https://cursor.directory/plugins/certscoreai-mcp-light";

export const MCP_LIGHT_ROLE_PROMPTS = [
  {
    label: "Launch review",
    prompt:
      "Use CertScore.ai to scan [PUBLIC URL] before launch. Report the CertScore score and evidence-backed findings for pre-consent cookies and trackers, consent controls, Reject Path post-refusal observations when available, privacy-policy transparency, and HTTPS/TLS. Separate observed evidence from coverage limitations and do not present the result as legal advice, certification, or a compliance determination."
  },
  {
    label: "Vendor review",
    prompt:
      "Use CertScore.ai to review [VENDOR PUBLIC URL]. Summarize the observed third-party tracking technologies, cookies and storage, CMP and consent-management signals, Reject Path post-refusal observations when available, policy and transparency findings, regulatory review signals, and HTTPS/TLS observations. Include supporting evidence, the report URL, and all material coverage limitations."
  },
  {
    label: "Audit diagnostics",
    prompt:
      "Use CertScore.ai to scan [PUBLIC URL] for audit diagnostics. Follow the scan through a terminal status, retrieve the findings bundle, and prioritize evidence-backed privacy, cookie, tracker, consent, Reject Path, policy, GDPR/ePrivacy, CCPA/CPRA, and transport observations. Explain what was observed, what remains unknown or limited, and which evidence a human reviewer should inspect next."
  }
] as const;
