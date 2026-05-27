import "server-only";

import type Stripe from "stripe";
import { getPlanForStripePriceId } from "./stripe-config";
import {
  findOrganizationIdByStripeCustomer,
  markBillingEventFailed,
  markBillingEventProcessed,
  markBillingEventProcessing,
  type BillingEventQueueRow,
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
    organizationId,
    plan,
    planStatus: getPlanStatus(subscription.status),
    stripeCustomerId: customerId,
    stripePriceId: priceId,
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: subscription.status
  });
}

async function applyCheckoutCompleted(session: Stripe.Checkout.Session) {
  const organizationId = getStringMetadataValue(session.metadata, "certscore_organization_id");
  const plan = getStringMetadataValue(session.metadata, "certscore_plan");
  const customerId = getCustomerId(session.customer as string | Stripe.Customer | Stripe.DeletedCustomer | null);

  if (!organizationId || (plan !== "individual" && plan !== "pro") || typeof session.subscription !== "string") {
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
    organizationId,
    plan: "free",
    planStatus: "inactive",
    stripeCustomerId: customerId,
    stripePriceId: null,
    stripeSubscriptionId: subscription.id,
    stripeSubscriptionStatus: subscription.status
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
    await applyBillingEvent(row.payload_json as Stripe.Event);
    await markBillingEventProcessed(row.id);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Stripe billing event processing error.";
    await markBillingEventFailed({ queueId: row.id, errorMessage });
    throw error;
  }
}
