import Link from "next/link";
import { getPromotionalEntitlement } from "../../server/promotions/entitlement";
import { BrowserShell } from "../../components/marketplace-browser/shell";
import { redirect } from "next/navigation";
import { AuthenticatedPageConfirmation } from "../../components/analytics/authenticated-page-confirmation";
import { retainedActivityPagePath } from "../../lib/product-analytics/activity-page-context";
import { issueAuthenticatedPageToken } from "../../server/product-analytics/authenticated-page-token";
import { persistAuthenticatedPageRequest } from "../../server/product-analytics/authenticated-page-repository";
import { requestTechnicalContext } from "../../server/product-analytics/technical-context";
import { after } from "next/server";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AppShell } from "../../components/dashboard/app-shell";
import { getDashboardContext } from "../../server/auth";
import { getPlatformAdminFlag } from "../../server/admin/platform-admin";
import { extractScanIdFromPath, normalizeAnalyticsRoute } from "../../lib/product-analytics/contract";
import { persistProductAnalyticsEvent } from "../../server/product-analytics/repository";

export const dynamic = "force-dynamic";

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const [{ membership, organization, user, marketplaceBrowser }, isPlatformAdmin, requestHeaders] = await Promise.all([
    getDashboardContext(),
    getPlatformAdminFlag(),
    headers()
  ]);

  const eventId = requestHeaders.get("x-certscore-operational-event-id");
  const method = requestHeaders.get("x-certscore-operational-method") ?? "GET";
  const route = requestHeaders.get("x-certscore-operational-route");
  let confirmation: {path: string; token: string} | null = null;
  if (eventId && route && (method === "GET" || method === "POST")) {
    const operationalEvent = method === "POST"
      ? { category: "form" as const, eventName: "form_submitted" as const, feature: "server_action", outcome: "submitted" as const }
      : { category: "navigation" as const, eventName: "page_requested" as const, feature: "authenticated_page_request", outcome: "observed" as const };
    const pagePath = retainedActivityPagePath(route);
    const requestedAt = Number(requestHeaders.get("x-certscore-operational-requested-at"));
    const identity = method === "GET" && pagePath && Number.isSafeInteger(requestedAt) && requestedAt > 0
      ? {id: eventId, requestedAt, path: pagePath, userId: user.id} : null;
    if (identity) {
      try { confirmation = {path: identity.path, token: issueAuthenticatedPageToken(identity, process.env.BETTER_AUTH_SECRET ?? "")}; }
      catch { console.error(JSON.stringify({event: "authenticated_page_confirmation.configuration_failed"})); }
    }
    const context = {
      ...requestTechnicalContext(requestHeaders),
      consentState: "operational" as const, isStaff: isPlatformAdmin,
      organizationId: organization?.id ?? null, referringDomain: null, userId: user.id,
    };
    after(async () => {
      try {
        if (identity) await persistAuthenticatedPageRequest(identity, context, false, {language: context.language});
        else await persistProductAnalyticsEvent({
          ...operationalEvent, route: normalizeAnalyticsRoute(route), pagePath: pagePath ?? undefined,
          scanId: extractScanIdFromPath(route),
        }, context, eventId);
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

  if (marketplaceBrowser) {
    if (route && !/^\/app\/(?:scans|scanso|scanso2)\//.test(route)) redirect("/marketplace/browser");
    return <BrowserShell>{children}</BrowserShell>;
  }
  const promotion = organization ? await getPromotionalEntitlement(organization.id) : null;
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
      {promotion && <aside className="mb-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950" aria-label="Promotional Pro access">
        {promotion.active ? <>Complimentary Pro through {promotion.endsAt.toLocaleDateString("en-US",{timeZone:"UTC"})} (UTC). {promotion.used} / 1,000 page scans reserved this entitlement period. No automatic paid renewal.</> : <>Your complimentary Pro access has ended. Your account remains nonpaid.</>}
        {" "}<Link className="underline" href="/app/modify-plan">Choose a paid plan</Link>
      </aside>}
      {confirmation ? <AuthenticatedPageConfirmation {...confirmation} /> : null}
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
