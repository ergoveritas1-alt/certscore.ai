import type { FullSiteReportResponse } from "./full-site-report";

export function buildScanCompletionEmail(input: {
  summary: FullSiteReportResponse["summary"];
  domain: string;
  reportUrl: string;
}) {
  const { state, counts, totals } = input.summary;
  const limited =
    state.status !== "completed" ||
    counts.partial > 0 ||
    counts.blockedFailed > 0 ||
    !!state.robotsRestriction;
  const elapsed = state.completedAt
    ? Math.max(
        0,
        Math.round(
          (Date.parse(state.completedAt) - Date.parse(state.startedAt)) / 1000,
        ),
      )
    : null;
  return {
    subject: `Your CertScore.ai scan ${limited ? "finished with limited coverage" : "is complete"}`,
    text: [
      `Your scan of ${input.domain} ${limited ? "finished with limited coverage" : "is complete"}.`,
      "",
      "Scan summary:",
      `• Page visits: ${counts.completed} complete, ${counts.partial} partial; ${counts.blockedFailed} blocked or failed.`,
      `• Distinct services observed: ${totals.services}.`,
      `• Distinct cookies observed: ${totals.cookies}.`,
      `• Request events observed: ${totals.requestEvents}.`,
      ...(elapsed === null
        ? []
        : [`• Total elapsed time: ${elapsed} seconds.`]),
      "",
      ...(state.robotsRestriction ? [state.robotsRestriction, ""] : []),
      ...(counts.excluded
        ? [
            `${counts.excluded} discovered pages were excluded or left unvisited.`,
            "",
          ]
        : []),
      "Counts combine independent page visits. Missing or unvisited pages are not evidence of absence. Any score in the report applies to the homepage audit only.",
      "",
      `View your report: ${input.reportUrl}`,
      "",
      "CertScore.ai",
    ].join("\n"),
  };
}
