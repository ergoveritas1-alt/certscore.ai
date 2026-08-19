import { after } from "next/server";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "../../components/dashboard/app-shell";
import { getDashboardContext } from "../../server/auth";
import { getPlatformAdminFlag } from "../../server/admin/platform-admin";
import { normalizeAnalyticsRoute } from "../../lib/product-analytics/contract";
import { persistProductAnalyticsEvent } from "../../server/product-analytics/repository";

export const dynamic = "force-dynamic";

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const [{ membership, organization, user }, isPlatformAdmin, requestHeaders] = await Promise.all([
    getDashboardContext(),
    getPlatformAdminFlag(),
    headers()
  ]);

  const eventId = requestHeaders.get("x-certscore-operational-event-id");
  const method = requestHeaders.get("x-certscore-operational-method") ?? "GET";
  const route = requestHeaders.get("x-certscore-operational-route");
  if (eventId && route && (method === "GET" || method === "POST")) {
    const operationalEvent = method === "POST"
      ? { category: "form" as const, eventName: "form_submitted" as const, feature: "server_action", outcome: "submitted" as const }
      : { category: "navigation" as const, eventName: "page_viewed" as const, feature: "server_route", outcome: "observed" as const };
    after(async () => {
      try {
        await persistProductAnalyticsEvent({
          ...operationalEvent,
          route: normalizeAnalyticsRoute(route)
        }, {
          browserFamily: "server",
          consentState: "operational",
          countryCode: null,
          deviceClass: "unknown",
          isBot: false,
          isStaff: isPlatformAdmin,
          osFamily: "server",
          organizationId: organization?.id ?? null,
          referringDomain: null,
          userId: user.id
        }, eventId);
      } catch (error) {
        console.error(JSON.stringify({
          event: "operational_event.write_failed",
          errorClass: error instanceof Error ? error.name : "UnknownError",
          eventName: operationalEvent.eventName,
          route: normalizeAnalyticsRoute(route)
        }));
      }
    });
  }

  const canManageCompany = isPlatformAdmin;
  const hasWorkspace = Boolean(organization && membership);

  return (
    <AppShell
      isPlatformAdmin={isPlatformAdmin}
      canManageCompany={canManageCompany}
      organizationName={organization?.name ?? "No workspace assigned"}
      plan={organization?.plan ?? "free"}
      userEmail={user.email ?? "Unknown user"}
    >
      {!hasWorkspace && !isPlatformAdmin ? (
        <div className="mx-auto w-full max-w-2xl px-6 py-16">
          <div className="rounded-2xl border border-sky-100 bg-white p-8 text-slate-900 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight">Your account is ready</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">You do not have a workspace assigned yet. A CertScore administrator will create or assign one before you can scan sites.</p>
          </div>
        </div>
      ) : children}
    </AppShell>
  );
}
