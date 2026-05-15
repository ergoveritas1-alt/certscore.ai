function formatFrequency(value: string) {
  return value
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildMonitorSiteActivationEmailText(input: {
  activeFrequency: string;
  appUrl: string;
  hostname: string;
  normalizedUrl: string;
  statusUrl?: string | null;
}) {
  return [
    `Your CertScore.ai monitoring setup for ${input.hostname} has been confirmed.`,
    "",
    `Configured cadence: ${formatFrequency(input.activeFrequency)}`,
    `Site: ${input.normalizedUrl}`,
    "",
    "CertScore.ai monitors public-web observations over time and can help surface review signals when the observed website behavior changes.",
    "Automated observations are evidence for review, not legal advice, certification, or a compliance determination.",
    "",
    input.statusUrl
      ? `You can review the request status at ${input.statusUrl}.`
      : `You can review your CertScore.ai workspace at ${input.appUrl}/app/domains.`,
    "",
    "If this setup does not look right, reply to this email so we can review it."
  ].join("\n");
}
