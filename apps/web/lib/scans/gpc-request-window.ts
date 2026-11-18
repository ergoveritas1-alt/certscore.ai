import type { GpcActivityComparison } from "@certscore/contracts";

export type GpcRequestWindow = Pick<GpcActivityComparison, "activity" | "durationMs">;

export const gpcRequestCategories = [
  ["advertisingMarketing", "Advertising / marketing"],
  ["analyticsReplay", "Analytics / session replay"],
] as const;
