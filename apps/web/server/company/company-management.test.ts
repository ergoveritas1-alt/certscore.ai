import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canLoseAdvancedAccess, canRemoveCompanyMember, isAdvancedCompanyRole, roleForNewCompanyMember } from "./policy";

test("the first company member is advanced and later members default to user", () => {
  assert.equal(roleForNewCompanyMember(0), "advanced");
  assert.equal(roleForNewCompanyMember(0, "user"), "advanced");
  assert.equal(roleForNewCompanyMember(1), "user");
  assert.equal(roleForNewCompanyMember(1, "advanced"), "advanced");
});

test("only advanced roles are treated as company managers", () => {
  assert.equal(isAdvancedCompanyRole("advanced"), true);
  assert.equal(isAdvancedCompanyRole("admin"), true);
  assert.equal(isAdvancedCompanyRole("user"), false);
});

test("the last advanced user cannot be demoted or removed", () => {
  assert.equal(canLoseAdvancedAccess({ advancedCount: 1, currentRole: "advanced", nextRole: "user" }), false);
  assert.equal(canRemoveCompanyMember({ advancedCount: 1, currentRole: "advanced" }), false);
  assert.equal(canLoseAdvancedAccess({ advancedCount: 2, currentRole: "advanced", nextRole: "user" }), true);
  assert.equal(canRemoveCompanyMember({ advancedCount: 2, currentRole: "advanced" }), true);
  assert.equal(canRemoveCompanyMember({ advancedCount: 1, currentRole: "user" }), true);
});

test("company mutations enforce server-side capability checks and bounded logo types", async () => {
  const actions = await readFile("apps/web/server/company/actions.ts", "utf8");
  const authorization = await readFile("apps/web/server/company/authorization.ts", "utf8");
  const migration = await readFile("packages/db/migrations/0161_company_logo_and_auth_admin.sql", "utf8");

  assert.match(actions, /requireCompanyCapability\(companyId, "manage_users"\)/);
  assert.match(actions, /requireCompanyCapability\(companyId, "manage_logo"\)/);
  assert.match(actions, /image\/png/);
  assert.match(actions, /2 \* 1024 \* 1024/);
  assert.match(authorization, /access\.organizationId !== organizationId/);
  assert.match(authorization, /\["advanced", "admin"\]/);
  assert.match(migration, /logo_storage_key/);
});

test("company invitations create passwordless accounts and send a password setup link", async () => {
  const actions = await readFile("apps/web/server/company/actions.ts", "utf8");
  const setup = await readFile("apps/web/server/auth-flows/password-setup.ts", "utf8");
  const adminCompanyPage = await readFile("apps/web/app/app/admin/companies/[companyId]/page.tsx", "utf8");
  const settingsCompanyPage = await readFile("apps/web/app/app/settings/company/page.tsx", "utf8");

  assert.match(actions, /body: \{ email: parsed\.email, name: initialName \}/);
  assert.match(actions, /const initialName = parsed\.email\.split/);
  assert.match(actions, /sendPasswordSetupLink\(created\.user\.email\)/);
  assert.doesNotMatch(actions, /password: z\.string/);
  assert.match(setup, /requestPasswordReset/);
  assert.match(setup, /reset-password\/update/);
  assert.doesNotMatch(adminCompanyPage, /Temporary password|name="password"/);
  assert.doesNotMatch(settingsCompanyPage, /Temporary password|name="password"/);
  assert.doesNotMatch(adminCompanyPage, /name="fullName"/);
  assert.doesNotMatch(settingsCompanyPage, /name="fullName"/);
});

test("workspace management navigation is limited to platform admins", async () => {
  const shell = await readFile("apps/web/components/dashboard/app-shell.tsx", "utf8");
  const layout = await readFile("apps/web/app/app/layout.tsx", "utf8");

  assert.match(shell, /canManageCompany\?/);
  assert.match(shell, /Manage workspace/);
  assert.match(shell, /\/app\/settings\/company/);
  assert.match(layout, /const canManageCompany = isPlatformAdmin/);
});

test("admin user deletion is protected and removes auth plus app records", async () => {
  const action = await readFile("apps/web/server/admin/delete-user.ts", "utf8");
  const page = await readFile("apps/web/app/app/admin/users/page.tsx", "utf8");

  assert.match(action, /requirePlatformAdminContext/);
  assert.match(action, /userId === user\.id/);
  assert.match(action, /isPlatformAdminEmail\(target\.email\)/);
  assert.match(action, /advanced_member_count/);
  assert.match(action, /delete from better_auth_users/);
  assert.match(action, /delete from users/);
  assert.match(page, /DeleteUserButton/);
  assert.match(page, /deleteAdminUserFormAction/);
});

test("platform admins can assign unassigned users to a workspace", async () => {
  const action = await readFile("apps/web/server/admin/assign-user-workspace.ts", "utf8");
  const page = await readFile("apps/web/app/app/admin/users/page.tsx", "utf8");

  assert.match(action, /requirePlatformAdminContext/);
  assert.match(action, /addCompanyMembership/);
  assert.match(action, /organizationId/);
  assert.match(action, /revalidatePath\("\/app\/admin\/users"\)/);
  assert.match(page, /Assign workspace/);
  assert.match(page, /assignUserWorkspaceFormAction/);
});

test("platform admins can send an existing user a password reset email", async () => {
  const action = await readFile("apps/web/server/admin/send-user-password-reset.ts", "utf8");
  const page = await readFile("apps/web/app/app/admin/users/page.tsx", "utf8");
  const auth = await readFile("apps/web/server/better-auth/auth.ts", "utf8");

  assert.match(action, /requirePlatformAdminContext/);
  assert.match(action, /findBetterAuthUserByEmail/);
  assert.match(action, /sendPasswordSetupLink/);
  assert.match(action, /password_reset_sent/);
  assert.match(page, /Send reset link/);
  assert.match(page, /Password reset email sent/);
  assert.match(auth, /Reset your CertScore\.ai password/);
});

test("admin user activity counts are scoped to the user who submitted the scan", async () => {
  const repository = await readFile("apps/web/server/admin/repository.ts", "utf8");

  assert.match(repository, /scans\.submitted_by_user_id = selected_users\.id/);
  assert.match(repository, /scans\.submitted_by_user_id = users\.id/);
  assert.doesNotMatch(repository, /where scans\.organization_id = selected_memberships\.organization_id/);
});
