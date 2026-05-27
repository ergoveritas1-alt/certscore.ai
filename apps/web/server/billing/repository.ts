import "server-only";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import type { PlanCode } from "@website-signal-risk-scanner/shared";

export type BillingAccountRow = {
  email: string | null;
  organization_id: string;
  organization_name: string;
  plan: PlanCode;
  plan_current_period_end: string | null;
  plan_current_period_start: string | null;
  stripe_customer_id: string | null;
  stripe_latest_invoice_id: string | null;
  stripe_payment_status: string | null;
  stripe_price_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_status: string | null;
};

export type BillingEventQueueRow = {
  id: string;
  event_type: string;
  payload_json: unknown;
  status: string;
  stripe_event_id: string;
};

export async function loadBillingAccountForOrganization(organizationId: string): Promise<BillingAccountRow | null> {
  return queryOne<BillingAccountRow>(
    `select
        organizations.id as organization_id,
        organizations.name as organization_name,
        organizations.plan,
        organizations.plan_current_period_end,
        organizations.plan_current_period_start,
        organizations.stripe_customer_id,
        organizations.stripe_latest_invoice_id,
        organizations.stripe_payment_status,
        organizations.stripe_price_id,
        organizations.stripe_subscription_id,
        organizations.stripe_subscription_status,
        users.email
       from organizations
       left join organization_members on organization_members.organization_id = organizations.id
       left join users on users.id = organization_members.user_id
      where organizations.id = $1
      order by
        case organization_members.role when 'owner' then 0 else 1 end,
        organization_members.created_at asc
      limit 1`,
    [organizationId],
    { readOnly: true }
  );
}

export async function setOrganizationStripeCustomer(input: { organizationId: string; stripeCustomerId: string }) {
  await query(
    `update organizations
        set stripe_customer_id = $1
      where id = $2`,
    [input.stripeCustomerId, input.organizationId]
  );
}

export async function findOrganizationIdByStripeCustomer(stripeCustomerId: string) {
  const row = await queryOne<{ id: string }>(
    `select id
       from organizations
      where stripe_customer_id = $1
      limit 1`,
    [stripeCustomerId],
    { readOnly: true }
  );
  return row?.id ?? null;
}

export async function upsertBillingEvent(input: {
  eventType: string;
  payload: unknown;
  stripeEventId: string;
}): Promise<BillingEventQueueRow> {
  const row = await queryOne<BillingEventQueueRow>(
    `insert into billing_event_queue (stripe_event_id, event_type, payload_json)
     values ($1, $2, $3::jsonb)
     on conflict (stripe_event_id) do update
       set payload_json = billing_event_queue.payload_json
     returning id, stripe_event_id, event_type, payload_json, status`,
    [input.stripeEventId, input.eventType, JSON.stringify(input.payload)]
  );

  if (!row) {
    throw new Error("Failed to enqueue Stripe billing event.");
  }

  return row;
}

export async function markBillingEventProcessing(queueId: string) {
  await query(
    `update billing_event_queue
        set status = 'processing',
            attempts = attempts + 1,
            last_error = null
      where id = $1
        and status in ('queued', 'failed')`,
    [queueId]
  );
}

export async function markBillingEventProcessed(queueId: string) {
  await query(
    `update billing_event_queue
        set status = 'processed',
            processed_at = timezone('utc', now()),
            last_error = null
      where id = $1`,
    [queueId]
  );
}

export async function markBillingEventFailed(input: { queueId: string; errorMessage: string }) {
  await query(
    `update billing_event_queue
        set status = 'failed',
            last_error = $2
      where id = $1`,
    [input.queueId, input.errorMessage]
  );
}

export async function updateOrganizationBillingPlan(input: {
  currentPeriodEnd: string | null;
  currentPeriodStart?: string | null;
  organizationId: string;
  plan: PlanCode;
  planStatus: string;
  stripeLatestInvoiceId?: string | null;
  stripeCustomerId: string | null;
  stripePaymentStatus?: string | null;
  stripePriceId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
}) {
  await query(
    `update organizations
        set plan = $2,
            plan_status = $3,
            stripe_customer_id = coalesce($4, stripe_customer_id),
            stripe_subscription_id = $5,
            stripe_subscription_status = $6,
            stripe_price_id = $7,
            plan_current_period_end = $8::timestamptz,
            plan_current_period_start = coalesce($9::timestamptz, plan_current_period_start),
            stripe_payment_status = coalesce($10, stripe_payment_status),
            stripe_latest_invoice_id = coalesce($11, stripe_latest_invoice_id)
      where id = $1`,
    [
      input.organizationId,
      input.plan,
      input.planStatus,
      input.stripeCustomerId,
      input.stripeSubscriptionId,
      input.stripeSubscriptionStatus,
      input.stripePriceId,
      input.currentPeriodEnd,
      input.currentPeriodStart ?? null,
      input.stripePaymentStatus ?? null,
      input.stripeLatestInvoiceId ?? null
    ]
  );
}

export async function updateOrganizationInvoiceState(input: {
  organizationId: string;
  stripeLatestInvoiceId: string | null;
  stripePaymentStatus: string;
}) {
  await query(
    `update organizations
        set stripe_latest_invoice_id = coalesce($2, stripe_latest_invoice_id),
            stripe_payment_status = $3
      where id = $1`,
    [input.organizationId, input.stripeLatestInvoiceId, input.stripePaymentStatus]
  );
}
