import "server-only";

import Stripe from "stripe";
import { getStripeBillingEnv } from "./stripe-config";

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  if (stripeClient) {
    return stripeClient;
  }

  const secretKey = getStripeBillingEnv().STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("Stripe billing is not configured. Set STRIPE_SECRET_KEY.");
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia"
  });

  return stripeClient;
}
