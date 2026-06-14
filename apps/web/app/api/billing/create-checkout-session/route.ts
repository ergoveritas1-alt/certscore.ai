import { NextResponse } from "next/server";
import {
  getSelfServePurchasingPausedMessage,
  isSelfServePurchasingEnabled
} from "../../../../server/access-control";
import { getCurrentUser } from "../../../../server/auth";
import { bootstrapAppUserSession } from "../../../../server/bootstrap-user";
import { createStripeCheckoutForDashboardContext, parseSelfServeCheckoutPlan } from "../../../../server/billing/checkout";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSelfServePurchasingEnabled()) {
    return NextResponse.json({ error: getSelfServePurchasingPausedMessage() }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let plan;
  try {
    plan = parseSelfServeCheckoutPlan((body as { plan?: unknown })?.plan);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid checkout plan." }, { status: 400 });
  }
  const context = await bootstrapAppUserSession(user);
  const checkout = await createStripeCheckoutForDashboardContext({ context, plan });

  return NextResponse.json({
    plan: checkout.plan,
    url: checkout.url
  });
}
