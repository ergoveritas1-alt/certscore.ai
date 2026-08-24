export function buildReportEmailText(input: {
  domainLabel: string;
  executiveSummary: string[];
  pdfUrl: string | null;
  reportUrl: string;
}) {
  const lines = [
    `Here is the CertScore.ai report for ${input.domainLabel}:`,
    "",
    input.reportUrl,
  ];
  if (input.executiveSummary.length > 0) {
    lines.push("", "Executive summary", ...input.executiveSummary);
  }
  if (input.pdfUrl) {
    lines.push("", "Download the detailed PDF report:", input.pdfUrl);
  }
  lines.push(
    "",
    "Automated public-web observations. Review the retained evidence before relying on findings. This is not a determination of legal compliance or legal advice.",
  );
  return lines.join("\n");
}
