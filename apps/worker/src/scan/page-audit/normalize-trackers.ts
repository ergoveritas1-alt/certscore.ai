import type { DetectedTracker } from "./detect-trackers";

export type NormalizedTracker = {
  firstSeenHostname: string | null;
  key: string;
  matchedCount: number;
  matchedRequestUrls: string[];
  name: string;
  severity: "low" | "info";
  weight: number;
};

export function normalizeTrackers(trackers: DetectedTracker[]): NormalizedTracker[] {
  return trackers.map((tracker) => ({
    key: tracker.signature.key,
    name: tracker.signature.displayName,
    matchedCount: tracker.matchedCount,
    matchedRequestUrls: tracker.matchedRequestUrls.slice(0, 5),
    firstSeenHostname: tracker.matchedRequestUrls[0] ? new URL(tracker.matchedRequestUrls[0]).hostname : null,
    severity: tracker.signature.defaultSeverity as "low" | "info",
    weight: tracker.signature.defaultWeight
  }));
}
