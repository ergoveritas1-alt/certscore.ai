import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { buildBillingAlertEmail, buildBillingAlertInput } from "./billing-alert-email-content";

test("buildBillingAlertInput maps completed checkout sessions to purchase alerts", () => {
  const alert = buildBillingAlertInput({
    id: "evt_checkout",
    type: "checkout.session.completed",
    data: {
      object: {
        amount_total: 4000,
        client_reference_id: "org_123",
        currency: "usd",
        customer: "cus_123",
        customer_details: { email: "buyer@example.com" },
        id: "cs_123",
        metadata: {
          certscore_organization_id: "org_123",
          certscore_plan: "individual"
        },
        subscription: "sub_123"
      }
    }
  } as unknown as Stripe.Event);

  assert.equal(alert?.kind, "checkout_completed");
  assert.equal(alert?.organizationId, "org_123");
  assert.equal(alert?.plan, "individual");
  assert.equal(alert?.customerEmail, "buyer@example.com");
  assert.equal(alert?.subscriptionId, "sub_123");
});

test("buildBillingAlertInput maps subscription deletion to cancellation alerts", () => {
  const alert = buildBillingAlertInput({
    id: "evt_deleted",
    type: "customer.subscription.deleted",
    data: {
      object: {
        customer: "cus_123",
        id: "sub_123",
        metadata: {
          certscore_organization_id: "org_123",
          certscore_plan: "pro"
        }
      }
    }
  } as unknown as Stripe.Event);

  assert.equal(alert?.kind, "subscription_canceled");
  assert.equal(alert?.organizationId, "org_123");
  assert.equal(alert?.plan, "pro");
  assert.equal(alert?.subscriptionId, "sub_123");
});

test("buildBillingAlertEmail includes the key billing fields", () => {
  const email = buildBillingAlertEmail({
    amount: 20000,
    currency: "usd",
    customerEmail: "buyer@example.com",
    customerId: "cus_123",
    eventId: "evt_paid",
    invoiceId: "in_123",
    kind: "invoice_paid",
    organizationId: "org_123",
    plan: "pro",
    stripeObjectId: "in_123",
    subscriptionId: "sub_123"
  });

  assert.equal(email.subject, "[CertScore Billing] Subscription invoice paid");
  assert.match(email.text, /Organization ID: org_123/);
  assert.match(email.text, /Customer email: buyer@example\.com/);
  assert.match(email.text, /Amount: \$200\.00/);
});
