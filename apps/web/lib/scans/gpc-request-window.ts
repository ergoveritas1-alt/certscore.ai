import type { GpcActivityComparison } from "@certscore/contracts";

export type GpcRequestWindow = Pick<GpcActivityComparison, "activity" | "durationMs">;

export const gpcRequestCategories = [
  ["advertisingMarketing", "Advertising / marketing"],
  ["analyticsReplay", "Analytics / session replay"],
] as const;

export function gpcWindowDuration(ms: number) {
  if (ms === 1000) return "second";
  return ms < 1000 ? `${ms} milliseconds` : `${ms / 1000} seconds`;
}
