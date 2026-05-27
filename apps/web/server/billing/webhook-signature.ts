import type Stripe from "stripe";

export function constructVerifiedStripeWebhookEvent(input: {
  body: string;
  secret: string;
  signature: string;
  stripe: Stripe;
}) {
  return input.stripe.webhooks.constructEvent(input.body, input.signature, input.secret);
}
