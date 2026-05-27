import "server-only";

import type { PlanCode } from "@website-signal-risk-scanner/shared";
import { z } from "zod";
import {
  getPublicCheckoutPlanCode,
  normalizeCheckoutPlan,
  paidPlanCodes,
  type PaidPlanCode,
  type PublicCheckoutPlanCode
} from "./plan-mapping";

const stripeBillingEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  STRIPE_BILLING_PORTAL_CONFIGURATION_ID: z.string().optional(),
  STRIPE_BILLING_PORTAL_RETURN_PATH: z.string().optional(),
  STRIPE_PRICE_INDIVIDUAL_MONTHLY: z.string().optional(),
  STRIPE_PRICE_STARTER_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional()
});

export { getPublicCheckoutPlanCode, normalizeCheckoutPlan, type PaidPlanCode, type PublicCheckoutPlanCode };

export function getStripeBillingEnv(env: NodeJS.ProcessEnv = process.env) {
  return stripeBillingEnvSchema.parse(env);
}

export function isPaidPlanCode(plan: PlanCode): plan is PaidPlanCode {
  return paidPlanCodes.includes(plan as PaidPlanCode);
}

export function getStripePriceIdForPlan(plan: PaidPlanCode, env: NodeJS.ProcessEnv = process.env) {
  const values = getStripeBillingEnv(env);
  const priceId =
    plan === "individual"
      ? values.STRIPE_PRICE_STARTER_MONTHLY ?? values.STRIPE_PRICE_INDIVIDUAL_MONTHLY
      : values.STRIPE_PRICE_PRO_MONTHLY;
  return priceId?.trim() || null;
}

export function getPlanForStripePriceId(priceId: string | null | undefined, env: NodeJS.ProcessEnv = process.env): PaidPlanCode | null {
  if (!priceId) {
    return null;
  }

  const values = getStripeBillingEnv(env);
  if (priceId === values.STRIPE_PRICE_STARTER_MONTHLY || priceId === values.STRIPE_PRICE_INDIVIDUAL_MONTHLY) {
    return "individual";
  }

  if (priceId === values.STRIPE_PRICE_PRO_MONTHLY) {
    return "pro";
  }

  return null;
}

export function getBillingReturnUrl(path = "/app/modify-plan", env: NodeJS.ProcessEnv = process.env) {
  return new URL(path, getStripeBillingEnv(env).NEXT_PUBLIC_APP_URL).toString();
}

export function getStripeBillingMode(env: NodeJS.ProcessEnv = process.env) {
  const values = getStripeBillingEnv(env);
  const missing = [
    values.STRIPE_SECRET_KEY ? null : "STRIPE_SECRET_KEY",
    values.STRIPE_PRICE_INDIVIDUAL_MONTHLY ? null : "STRIPE_PRICE_INDIVIDUAL_MONTHLY",
    values.STRIPE_PRICE_PRO_MONTHLY ? null : "STRIPE_PRICE_PRO_MONTHLY"
  ].filter((value): value is string => Boolean(value));

  return {
    enabled: missing.length === 0,
    missing
  };
}

export function getPlanBillingIntent(plan: PlanCode, currentPlan: PlanCode) {
  if (plan === currentPlan) {
    return "current" as const;
  }

  if (isPaidPlanCode(plan)) {
    return "checkout" as const;
  }

  if (plan === "free") {
    return "portal" as const;
  }

  return "contact_sales" as const;
}
