import type { FullSiteReportResponse } from "./full-site-report";

export function buildScanCompletionEmail(input: {
  summary: FullSiteReportResponse["summary"];
  domain: string;
  reportUrl: string;
}) {
  const { state, counts, totals, excludedByReason = {} } = input.summary;
  const robotsExcluded = excludedByReason.robots_disallowed ?? 0;
  const robotsStopped = state.stopReason?.startsWith("robots_") ?? false;
  const exclusionLabels: Array<[string, string]> = [
    ["section_trap_limit", "section safety limit"],
    ["query_variant_limit", "query variant limit"],
    ["outside_validated_hostname_scope", "out-of-scope hosts"],
    ["non_page_download", "non-page files"],
    ["robots_disallowed", "robots.txt"],
    ["malformed_path", "malformed links"],
  ];
  const described = exclusionLabels.reduce(
    (sum, [reason]) => sum + (excludedByReason[reason] ?? 0),
    0,
  );
  const excludedDetails = [
    ...exclusionLabels.flatMap(([reason, label]) =>
      excludedByReason[reason] ? [`${excludedByReason[reason]} ${label}`] : [],
    ),
    ...(counts.excluded > described ? [`${counts.excluded - described} other`] : []),
  ];
  const limited =
    state.status !== "completed" ||
    counts.partial > 0 ||
    counts.blockedFailed > 0 ||
    counts.excluded > 0 ||
    state.stopReason === "sitemap_discovery_limited" ||
    robotsStopped;
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
      ...(state.robotsRestriction && (robotsExcluded > 0 || robotsStopped)
        ? [state.robotsRestriction, ""]
        : []),
      ...(state.stopReason === "sitemap_discovery_limited"
        ? ["Sitemap discovery was limited; some pages may not have been found.", ""]
        : []),
      ...(counts.excluded
        ? [
            `${counts.excluded} discovered links were excluded or left unvisited${excludedDetails.length ? `: ${excludedDetails.join(", ")}` : ""}.`,
            "",
          ]
        : []),
      "Counts combine independent page visits. Missing or unvisited pages are not evidence of absence. The report score combines the homepage audit with eligible evidence from scanned pages; other page-level assessments may remain unassessed.",
      "",
      `View your report: ${input.reportUrl}`,
      "",
      "CertScore.ai",
    ].join("\n"),
  };
}
