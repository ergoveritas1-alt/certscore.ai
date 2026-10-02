import "server-only";

import type { PlanCode } from "@website-signal-risk-scanner/shared";
import { queryOne } from "@website-signal-risk-scanner/db";
import { billingFunnelPayload, type BillingFunnelFeature } from "../../lib/billing/funnel-event";
import { isPlatformAdminEmail } from "../admin/platform-admin";
import { persistProductAnalyticsEvent } from "../product-analytics/repository";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function recordBillingFunnelEvent(input: {
  eventId?: string;
  feature: BillingFunnelFeature;
  organizationId: string;
  plan: PlanCode;
  userEmail?: string;
  userId: string | null;
}): Promise<void> {
  if (!UUID_PATTERN.test(input.organizationId)) return;
  const userId = input.userId && UUID_PATTERN.test(input.userId) ? input.userId : null;
  try {
    const userEmail = input.userEmail ?? (userId
      ? (await queryOne<{ email: string }>("select email from users where id = $1", [userId], { readOnly: true }))?.email
      : null);
    await persistProductAnalyticsEvent(billingFunnelPayload(input.feature, input.plan), {
      browserFamily: "server",
      consentState: "operational",
      countryCode: null,
      deviceClass: "unknown",
      isBot: false,
      isStaff: isPlatformAdminEmail(userEmail),
      organizationId: input.organizationId,
      osFamily: "server",
      referringDomain: null,
      userId
    }, input.eventId);
  } catch (error) {
    console.warn(JSON.stringify({
      event: "billing_funnel.write_failed",
      errorClass: error instanceof Error ? error.name : "UnknownError",
      feature: input.feature
    }));
  }
}
