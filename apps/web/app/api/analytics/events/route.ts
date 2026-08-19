import { after, NextResponse } from "next/server";
import { isPlatformAdminEmail } from "../../../../server/admin/platform-admin";
import { getBetterAuthSessionUser } from "../../../../server/better-auth/session";
import { parseProductAnalyticsPayload } from "../../../../lib/product-analytics/contract";
import { findOrganizationIdForUser, persistProductAnalyticsEvent } from "../../../../server/product-analytics/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function classifyUserAgent(userAgent: string) {
  const lower = userAgent.toLowerCase();
  const isBot = /bot|crawler|spider|headless|lighthouse|synthetic/.test(lower);
  const browserFamily = lower.includes("edg/") ? "edge" : lower.includes("firefox/") ? "firefox" : lower.includes("chrome/") ? "chrome" : lower.includes("safari/") ? "safari" : "other";
  const osFamily = lower.includes("iphone") || lower.includes("ipad") ? "ios" : lower.includes("android") ? "android" : lower.includes("mac os") ? "macos" : lower.includes("windows") ? "windows" : lower.includes("linux") ? "linux" : "other";
  const deviceClass = lower.includes("ipad") || lower.includes("tablet") ? "tablet" : lower.includes("mobile") || lower.includes("iphone") || lower.includes("android") ? "mobile" : userAgent ? "desktop" : "unknown";
  return { browserFamily, deviceClass: deviceClass as "desktop" | "mobile" | "tablet" | "unknown", isBot, osFamily };
}

function referringDomain(request: Request) {
  const value = request.headers.get("referer");
  if (!value) return null;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === request.headers.get("host") ? null : hostname.slice(0, 253);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 8_192) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });

  const payload = parseProductAnalyticsPayload(await request.json().catch(() => null));
  if (!payload) return NextResponse.json({ error: "invalid_event" }, { status: 400 });

  const consentState = payload.eventName === "analytics_opted_out"
    ? "opted_out" as const
    : request.headers.get("x-certscore-analytics-consent") === "granted"
      ? "granted" as const
      : "measurement" as const;
  const userAgent = request.headers.get("user-agent") ?? "";
  const technical = classifyUserAgent(userAgent);
  const countryHeader = request.headers.get("cloudfront-viewer-country") ?? request.headers.get("cf-ipcountry");
  const countryCode = countryHeader && /^[A-Z]{2}$/.test(countryHeader) ? countryHeader : null;

  after(async () => {
    try {
      const user = consentState === "opted_out" ? null : await getBetterAuthSessionUser();
      const organizationId = user ? await findOrganizationIdForUser(user.id).catch(() => null) : null;
      await persistProductAnalyticsEvent(payload, {
        ...technical,
        consentState,
        countryCode,
        isStaff: isPlatformAdminEmail(user?.email),
        organizationId,
        referringDomain: referringDomain(request),
        userId: user?.id ?? null
      });
    } catch (error) {
      console.warn(JSON.stringify({ event: "product_analytics.write_failed", errorClass: error instanceof Error ? error.name : "UnknownError" }));
    }
  });

  return new NextResponse(null, { status: 202 });
}
