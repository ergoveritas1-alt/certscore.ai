import { robotsAllows, type RobotsPolicy } from "@website-signal-risk-scanner/shared/full-site-urls";

/** Coverage of retained discovered URLs, not an estimate of the site's total size. */
export function summarizeDiscoveredCoverage(urls: string[], policy: RobotsPolicy | null) {
  const unique = new Set(urls);
  let allowed = 0, blocked = 0, unknown = 0;
  for (const url of unique) {
    try {
      const hostname = new URL(url).hostname;
      const hostPolicy = policy?.byHost ? policy.byHost[hostname] : policy;
      if (!hostPolicy || !Array.isArray(hostPolicy.rules)) { unknown++; continue; }
      if (robotsAllows(url, hostPolicy)) allowed++;
      else blocked++;
    } catch { unknown++; }
  }
  return { discovered: unique.size, allowed, blocked, unknown };
}
