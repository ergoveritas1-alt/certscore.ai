import "server-only";

import { query, queryOne } from "@website-signal-risk-scanner/db";
import type { ProductAnalyticsPayload } from "../../lib/product-analytics/contract";

const RAW_RETENTION_DAYS = 90;
let lastPrunedAt = 0;

export type ProductAnalyticsContext = {
  browserFamily: string;
  consentState: "operational" | "measurement" | "granted" | "opted_out";
  countryCode: string | null;
  deviceClass: "desktop" | "mobile" | "tablet" | "unknown";
  isBot: boolean;
  isStaff: boolean;
  osFamily: string;
  organizationId: string | null;
  referringDomain: string | null;
  userId: string | null;
};

export async function persistProductAnalyticsEvent(payload: ProductAnalyticsPayload, context: ProductAnalyticsContext, eventId?: string | null) {
  const optedOut = context.consentState === "opted_out";
  await query(
    `insert into public.product_analytics_events (
       event_id, event_name, category, feature, outcome, normalized_route, previous_route, entry_route,
       element_id, form_id, session_id, actor_id, user_id, organization_id, scan_id,
       consent_state, referring_domain, campaign_source, campaign_medium, campaign_name,
       browser_family, os_family, device_class, viewport_band, language, country_code,
       is_authenticated, is_staff, is_bot, duration_ms, numeric_value
     ) values (
       coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8,
       $9, $10, $11::uuid, $12::uuid, $13::uuid, $14::uuid, $15::uuid,
       $16, $17, $18, $19, $20,
       $21, $22, $23, $24, $25, $26,
       $27, $28, $29, $30, $31
     ) on conflict (event_id) do nothing`,
    [
      eventId ?? null,
      payload.eventName,
      payload.category,
      payload.feature,
      payload.outcome,
      payload.route,
      payload.previousRoute ?? null,
      payload.entryRoute ?? null,
      payload.elementId ?? null,
      payload.formId ?? null,
      optedOut ? null : payload.sessionId ?? null,
      optedOut ? null : payload.actorId ?? null,
      optedOut ? null : context.userId,
      optedOut ? null : context.organizationId,
      optedOut ? null : payload.scanId ?? null,
      context.consentState,
      optedOut ? null : context.referringDomain,
      optedOut ? null : payload.campaignSource ?? null,
      optedOut ? null : payload.campaignMedium ?? null,
      optedOut ? null : payload.campaignName ?? null,
      context.browserFamily,
      context.osFamily,
      context.deviceClass,
      payload.viewportBand ?? null,
      payload.language ?? null,
      context.countryCode,
      Boolean(context.userId) && !optedOut,
      context.isStaff && !optedOut,
      context.isBot,
      payload.durationMs ?? null,
      payload.numericValue ?? null
    ]
  );

  if (Date.now() - lastPrunedAt > 60 * 60 * 1_000) {
    lastPrunedAt = Date.now();
    await query(
      `delete from public.product_analytics_events
        where event_id in (
          select event_id from public.product_analytics_events
           where occurred_at < now() - make_interval(days => $1)
           order by occurred_at asc
           limit 1000
        )`,
      [RAW_RETENTION_DAYS]
    ).catch((error) => {
      console.warn(JSON.stringify({ event: "product_analytics.retention_prune_failed", errorClass: error instanceof Error ? error.name : "UnknownError" }));
    });
  }
}

export async function findOrganizationIdForUser(userId: string) {
  const row = await queryOne<{ organization_id: string }>(
    `select organization_id from public.organization_members where user_id = $1::uuid limit 1`,
    [userId],
    { readOnly: true }
  );
  return row?.organization_id ?? null;
}

export const PRODUCT_ANALYTICS_RAW_RETENTION_DAYS = RAW_RETENTION_DAYS;
