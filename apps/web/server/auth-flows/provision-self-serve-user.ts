import "server-only";

import { DEFAULT_NEW_MEMBERSHIP_ROLE } from "../../lib/auth/membership-role-policy";
import { bootstrapAppUserSession, type BootstrapSessionUser } from "../bootstrap-user";
import { createUserWorkspaceIdentity } from "../company/workspace-identity";
import { ensureOrganizationForUser } from "../users/repository";

export async function provisionSelfServeUserSession(user: BootstrapSessionUser) {
  const context = await bootstrapAppUserSession(user);
  if (context.membership) {
    return context;
  }

  const workspace = createUserWorkspaceIdentity(context.profile.email);
  await ensureOrganizationForUser({
    ...workspace,
    role: DEFAULT_NEW_MEMBERSHIP_ROLE,
    userId: context.user.id
  });

  return context;
}
