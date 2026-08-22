import "server-only";

import { DEFAULT_NEW_MEMBERSHIP_ROLE } from "../../lib/auth/membership-role-policy";
import { bootstrapAppUserSession, type BootstrapSessionUser } from "../bootstrap-user";
import { createUserWorkspaceIdentity } from "../company/workspace-identity";
import { persistProductAnalyticsEvent } from "../product-analytics/repository";
import { ensureOrganizationForUser } from "../users/repository";

export async function provisionSelfServeUserSession(user: BootstrapSessionUser) {
  const context = await bootstrapAppUserSession(user);
  let organizationId = context.membership?.organization_id ?? null;

  if (!organizationId) {
    const workspace = createUserWorkspaceIdentity(context.profile.email);
    const provisionedWorkspace = await ensureOrganizationForUser({
      ...workspace,
      role: DEFAULT_NEW_MEMBERSHIP_ROLE,
      userId: context.user.id
    });
    organizationId = provisionedWorkspace.organizationId;
  }

  await persistProductAnalyticsEvent({
    category: "account",
    eventName: "account_created",
    feature: `${user.authProvider === "google" ? "google" : "password"}_registration`,
    outcome: "success",
    route: user.authProvider === "google" ? "/auth/google/complete" : "/login"
  }, {
    browserFamily: "server",
    consentState: "operational",
    countryCode: null,
    deviceClass: "unknown",
    isBot: false,
    isStaff: false,
    osFamily: "server",
    organizationId,
    referringDomain: null,
    userId: context.user.id
  }, context.user.id).catch((error) => {
    console.error(JSON.stringify({
      event: "account_created.write_failed",
      errorClass: error instanceof Error ? error.name : "UnknownError",
      userId: context.user.id
    }));
  });

  return context;
}
