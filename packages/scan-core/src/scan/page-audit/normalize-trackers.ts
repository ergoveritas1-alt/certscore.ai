import type { DetectedTracker } from "./detect-trackers";

export type NormalizedTracker = {
  category: "analytics" | "advertising" | "social" | "session_replay" | "tag_manager" | "accessibility_widget" | "payment" | "chat_support" | "marketing" | "fingerprinting" | "hosting" | "cmp" | "other";
  firstSeenHostname: string | null;
  key: string;
  matchedCount: number;
  matchedRequestUrls: string[];
  name: string;
  severity: "low" | "info" | "medium";
  weight: number;
};

export function normalizeTrackers(trackers: DetectedTracker[]): NormalizedTracker[] {
  return trackers.map((tracker) => ({
    key: tracker.signature.key,
    name: tracker.signature.displayName,
    category: tracker.signature.category,
    matchedCount: tracker.matchedCount,
    matchedRequestUrls: tracker.matchedRequestUrls.slice(0, 5),
    firstSeenHostname: tracker.matchedRequestUrls[0] ? new URL(tracker.matchedRequestUrls[0]).hostname : null,
    severity: tracker.signature.defaultSeverity as "low" | "info" | "medium",
    weight: tracker.signature.defaultWeight
  }));
}
