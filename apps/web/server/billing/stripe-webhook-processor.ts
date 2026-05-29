import "server-only";

import type Stripe from "stripe";
import { sendBillingAlertEmail } from "./billing-alert-email";
import { getPlanForStripePriceId } from "./stripe-config";
import { getStripeClient } from "./stripe-client";
import {
  findOrganizationIdByStripeCustomer,
  markBillingEventFailed,
  markBillingEventProcessed,
  markBillingEventProcessing,
  type BillingEventQueueRow,
  updateOrganizationInvoiceState,
  updateOrganizationBillingPlan
} from "./repository";

function getStringMetadataValue(metadata: Stripe.Metadata | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getCustomerId(value: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id;
}

function getSubscriptionCustomerId(subscription: Stripe.Subscription) {
  return getCustomerId(subscription.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null);
}

function getSubscriptionPlan(subscription: Stripe.Subscription) {
  const planFromMetadata = getStringMetadataValue(subscription.metadata, "certscore_plan");
  if (planFromMetadata === "individual" || planFromMetadata === "pro") {
    return planFromMetadata;
  }

  const priceId = subscription.items.data[0]?.price.id ?? null;
  return getPlanForStripePriceId(priceId);
}

function getSubscriptionCurrentPeriodEnd(subscription: Stripe.Subscription) {
  return subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null;
}

function getSubscriptionCurrentPeriodStart(subscription: Stripe.Subscription) {
  return subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null;
}

function getPlanStatus(subscriptionStatus: Stripe.Subscription.Status) {
  switch (subscriptionStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "unpaid":
      return "paused";
    default:
      return "paused";
  }
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const value = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription;
  if (!value) {
    return null;
  }

  return typeof value === "string" ? value : value.id;
}

function getInvoiceCustomerId(invoice: Stripe.Invoice) {
  return getCustomerId(invoice.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null);
}

async function resolveOrganizationId(input: {
  customerId: string | null;
  metadata: Stripe.Metadata | null | undefined;
}) {
  const metadataOrganizationId = getStringMetadataValue(input.metadata, "certscore_organization_id");
  if (metadataOrganizationId) {
    return metadataOrganizationId;
  }

  if (!input.customerId) {
    return null;
  }

  return findOrganizationIdByStripeCustomer(input.customerId);
}

async function applySubscription(subscription: Stripe.Subscription) {
  const customerId = getSubscriptionCustomerId(subscription);
  const organizationId = await resolveOrganizationId({
    customerId,
    metadata: subscription.metadata
  });
  const plan = getSubscriptionPlan(subscription);
  const priceId = subscription.items.data[0]?.price.id ?? null;

  if (!organizationId || !plan) {
    return;
  }

  await updateOrganizationBillingPlan({
    currentPeriodEnd: getSubscriptionCurrentPeriodEnd(subscription),
    currentPeriodStart: getSubscriptionCurrentPeriodStart(subscription),
    organizationId,
    plan,
    planStatus: getPlanStatus(subscription.status),
    stripeLatestInvoiceId: typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice?.id ?? null,
    stripeCustomerId: customerId,
    stripePaymentStatus: subscription.status === "past_due" ? "payment_failed" : "paid",
    stripePriceId: priceId,
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: subscription.status
  });
}

async function applyCheckoutCompleted(session: Stripe.Checkout.Session) {
  const organizationId = getStringMetadataValue(session.metadata, "certscore_organization_id") ?? session.client_reference_id;
  const plan = getStringMetadataValue(session.metadata, "certscore_plan");
  const customerId = getCustomerId(session.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null);

  if (!organizationId || (plan !== "individual" && plan !== "pro") || typeof session.subscription !== "string") {
    return;
  }

  const subscription = await getStripeClient().subscriptions.retrieve(session.subscription);
  const subscriptionPlan = getSubscriptionPlan(subscription);
  if (subscriptionPlan) {
    await applySubscription(subscription);
    return;
  }

  await updateOrganizationBillingPlan({
    currentPeriodEnd: null,
    organizationId,
    plan,
    planStatus: "trialing",
    stripeCustomerId: customerId,
    stripePriceId: null,
    stripeSubscriptionId: session.subscription,
    stripeSubscriptionStatus: "checkout_completed"
  });
}

async function applySubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = getSubscriptionCustomerId(subscription);
  const organizationId = await resolveOrganizationId({
    customerId,
    metadata: subscription.metadata
  });

  if (!organizationId) {
    return;
  }

  await updateOrganizationBillingPlan({
    currentPeriodEnd: getSubscriptionCurrentPeriodEnd(subscription),
    currentPeriodStart: getSubscriptionCurrentPeriodStart(subscription),
    organizationId,
    plan: "free",
    planStatus: "inactive",
    stripeLatestInvoiceId: typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice?.id ?? null,
    stripeCustomerId: customerId,
    stripePaymentStatus: "canceled",
    stripePriceId: null,
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: subscription.status
  });
}

async function applyInvoicePaymentState(invoice: Stripe.Invoice, paymentStatus: "paid" | "payment_failed") {
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  const customerId = getInvoiceCustomerId(invoice);
  let organizationId = await resolveOrganizationId({
    customerId,
    metadata: invoice.metadata
  });

  if (!organizationId && subscriptionId) {
    const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
    await applySubscription(subscription);
    organizationId = await resolveOrganizationId({
      customerId: getSubscriptionCustomerId(subscription),
      metadata: subscription.metadata
    });
  }

  if (!organizationId) {
    return;
  }

  await updateOrganizationInvoiceState({
    organizationId,
    stripeLatestInvoiceId: invoice.id,
    stripePaymentStatus: paymentStatus
  });
}

async function applyBillingEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      await applyCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await applySubscription(event.data.object as Stripe.Subscription);
      return;
    case "customer.subscription.deleted":
      await applySubscriptionDeleted(event.data.object as Stripe.Subscription);
      return;
    case "invoice.payment_succeeded":
      await applyInvoicePaymentState(event.data.object as Stripe.Invoice, "paid");
      return;
    case "invoice.payment_failed":
      await applyInvoicePaymentState(event.data.object as Stripe.Invoice, "payment_failed");
      return;
    default:
      return;
  }
}

export async function processBillingEventQueueRow(row: BillingEventQueueRow) {
  if (row.status === "processed") {
    return;
  }

  await markBillingEventProcessing(row.id);

  try {
    const event = row.payload_json as Stripe.Event;
    await applyBillingEvent(event);
    await sendBillingAlertEmail(event).catch((error) => {
      console.error("Failed to send Stripe billing alert email.", error);
    });
    await markBillingEventProcessed(row.id);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Stripe billing event processing error.";
    await markBillingEventFailed({ queueId: row.id, errorMessage });
    throw error;
  }
}
