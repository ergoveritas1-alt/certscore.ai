import { NextResponse } from "next/server";
import { getStripeBillingEnv } from "../../../../server/billing/stripe-config";
import { getStripeClient } from "../../../../server/billing/stripe-client";
import { upsertBillingEvent } from "../../../../server/billing/repository";
import { processBillingEventQueueRow } from "../../../../server/billing/stripe-webhook-processor";
import { constructVerifiedStripeWebhookEvent } from "../../../../server/billing/webhook-signature";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const webhookSecret = getStripeBillingEnv().STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook secret is not configured." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  const body = await request.text();
  let event;

  try {
    event = constructVerifiedStripeWebhookEvent({
      body,
      secret: webhookSecret,
      signature,
      stripe: getStripeClient()
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid Stripe webhook signature." },
      { status: 400 }
    );
  }

  const row = await upsertBillingEvent({
    eventType: event.type,
    payload: event,
    stripeEventId: event.id
  });

  await processBillingEventQueueRow(row);

  return NextResponse.json({ received: true });
}
