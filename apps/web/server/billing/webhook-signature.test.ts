import assert from "node:assert/strict";
import test from "node:test";
import Stripe from "stripe";
import { constructVerifiedStripeWebhookEvent } from "./webhook-signature";

const stripe = new Stripe("sk_test_123", {
  apiVersion: "2025-02-24.acacia"
});

test("constructVerifiedStripeWebhookEvent rejects an invalid signature", () => {
  assert.throws(
    () =>
      constructVerifiedStripeWebhookEvent({
        body: JSON.stringify({ id: "evt_test", type: "checkout.session.completed" }),
        secret: "whsec_test",
        signature: "t=1,v1=invalid",
        stripe
      }),
    /signature/i
  );
});

test("constructVerifiedStripeWebhookEvent accepts a valid Stripe test signature", () => {
  const body = JSON.stringify({ id: "evt_test", object: "event", type: "checkout.session.completed" });
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: "whsec_test"
  });

  const event = constructVerifiedStripeWebhookEvent({
    body,
    secret: "whsec_test",
    signature,
    stripe
  });

  assert.equal(event.id, "evt_test");
  assert.equal(event.type, "checkout.session.completed");
});
