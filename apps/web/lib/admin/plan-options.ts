import { PLAN_CODES } from "@website-signal-risk-scanner/shared/constants/plans";

export { PLAN_CODES };

export const ADMIN_PLAN_STATUSES = ["active", "trialing", "past_due", "paused"] as const;

export const ADMIN_PLAN_LABELS: Record<(typeof PLAN_CODES)[number], string> = {
  free: "Trial",
  individual: "Starter",
  pro: "Pro",
  team: "Custom"
};
