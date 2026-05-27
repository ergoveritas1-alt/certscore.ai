import type { PlanCode } from "@website-signal-risk-scanner/shared";

export const paidPlanCodes = ["individual", "pro"] as const satisfies readonly PlanCode[];
export const publicCheckoutPlanCodes = ["starter", "pro"] as const;

export type PaidPlanCode = (typeof paidPlanCodes)[number];
export type PublicCheckoutPlanCode = (typeof publicCheckoutPlanCodes)[number];

export function normalizeCheckoutPlan(value: unknown): PaidPlanCode | null {
  if (value === "starter" || value === "individual") {
    return "individual";
  }

  if (value === "pro") {
    return "pro";
  }

  return null;
}

export function getPublicCheckoutPlanCode(plan: PaidPlanCode): PublicCheckoutPlanCode {
  return plan === "individual" ? "starter" : "pro";
}

export function parseSelfServeCheckoutPlan(value: unknown) {
  const plan = normalizeCheckoutPlan(value);
  if (!plan) {
    throw new Error("Choose Starter or Pro to start self-serve checkout.");
  }

  return plan;
}

export function getCheckoutCancelPath(plan: PlanCode) {
  const publicPlan = plan === "individual" ? "starter" : plan;
  return `/pricing?checkout=cancelled&plan=${encodeURIComponent(publicPlan)}`;
}
