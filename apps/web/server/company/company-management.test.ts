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

test("workspace user assignment requires a user to already exist", async () => {
  const actions = await readFile("apps/web/server/company/actions.ts", "utf8");
  const adminCompanyPage = await readFile("apps/web/app/app/admin/companies/[companyId]/page.tsx", "utf8");
  const settingsCompanyPage = await readFile("apps/web/app/app/settings/company/page.tsx", "utf8");

  assert.match(actions, /addExistingCompanyUserFormAction/);
  assert.match(actions, /Create the user from Admin → Users first/);
  assert.match(adminCompanyPage, /Add existing user/);
  assert.match(settingsCompanyPage, /createCompanyUserFormAction/);
});

test("workspace management navigation is limited to platform admins", async () => {
  const shell = await readFile("apps/web/components/dashboard/app-shell.tsx", "utf8");
  const layout = await readFile("apps/web/app/app/layout.tsx", "utf8");

  assert.match(shell, /canManageCompany\?/);
  assert.match(shell, /Manage workspace/);
  assert.match(shell, /\/app\/settings\/company/);
  assert.match(layout, /const canManageCompany = isPlatformAdmin/);
});

test("admin users navigation opens the last-login sort", async () => {
  const adminLayout = await readFile("apps/web/app/app/admin/layout.tsx", "utf8");
  const adminChrome = await readFile("apps/web/components/admin/admin-section-chrome.tsx", "utf8");

  assert.match(adminLayout, /href: "\/app\/admin\/users\?dir=desc&sort=lastLogin"/);
  assert.match(adminChrome, /href: "\/app\/admin\/users\?dir=desc&sort=lastLogin"/);
  assert.doesNotMatch(adminLayout, /href: "\/app\/admin\/users\?dir=desc&sort=lastScan"/);
  assert.doesNotMatch(adminChrome, /href: "\/app\/admin\/users\?dir=desc&sort=lastScan"/);
});

test("admin users expose a protected per-user activity page", async () => {
  const usersPage = await readFile("apps/web/app/app/admin/users/page.tsx", "utf8");
  const activityPage = await readFile("apps/web/app/app/admin/users/[userId]/activity/page.tsx", "utf8");
  const activityLoader = await readFile("apps/web/server/admin/list-admin-user-activity.ts", "utf8");
  const adminUsersList = await readFile("apps/web/server/admin/list-admin-users.ts", "utf8");

  assert.match(usersPage, /View activity for/);
  assert.match(usersPage, /\/app\/admin\/users\/\$\{user\.id\}\/activity/);
  assert.match(usersPage, /title="View user activity"/);
  assert.match(activityPage, />User activity</);
  assert.match(activityPage, /PaginationControls/);
  assert.match(activityPage, /pageSize/);
  assert.match(activityPage, /pageCount/);
  assert.match(activityPage, /Scan status/);
  assert.match(activityPage, /API activity routes/);
  assert.match(activityPage, /loadAdminUserActivity/);
  assert.match(activityLoader, /requirePlatformAdminContext/);
  assert.match(activityLoader, /limit \$2 offset \$3/);
  assert.match(activityLoader, /ADMIN_SCAN_STATUSES/);
  assert.match(activityLoader, /adminApiRouteSql/);
  assert.match(activityLoader, /submitted_by_user_id = \$1/);
  const adminRepository = await readFile("apps/web/server/admin/repository.ts", "utf8");
  assert.match(adminRepository, /last_scan_requested_at/);
  assert.match(adminRepository, /requested_by ->> 'userId'/);
  assert.match(adminUsersList, /latestActivityAt\(row\.last_associated_scan_at, row\.last_scan_requested_at\)/);
});

test("anonymous homepage scans support one-time verified user claims", async () => {
  const claims = await readFile("apps/web/server/scans/anonymous-scan-claims.ts", "utf8");
  const migration = await readFile("packages/db/migrations/0179_anonymous_scan_claims.sql", "utf8");
  const fullScanRoute = await readFile("apps/web/app/api/full-scan/route.ts", "utf8");

  assert.match(claims, /timingSafeEqual/);
  assert.match(claims, /organization_id is null/);
  assert.match(claims, /submitted_by_user_id is null/);
  assert.match(claims, /claimed_by_user_id is null/);
  assert.match(fullScanRoute, /addAnonymousScanClaimCookie/);
  assert.match(migration, /claimed_by_user_id/);
  assert.match(migration, /scans_claimed_by_user_id_idx/);
});

test("admin user deletion is protected and removes auth plus app records", async () => {
  const action = await readFile("apps/web/server/admin/delete-user.ts", "utf8");
  const page = await readFile("apps/web/app/app/admin/users/page.tsx", "utf8");
  const postgres = await readFile("packages/db/src/postgres.ts", "utf8");
  const migration = await readFile("packages/db/migrations/0168_user_delete_foreign_key_indexes.sql", "utf8");

  assert.match(action, /requirePlatformAdminContext/);
  assert.match(action, /userId === user\.id/);
  assert.match(action, /isPlatformAdminEmail\(target\.email\)/);
  assert.match(action, /advanced_member_count/);
  assert.match(action, /delete from better_auth_users/);
  assert.match(action, /delete from users/);
  assert.match(action, /withWriteTransaction/);
  assert.match(action, /admin\.user_delete\.completed/);
  assert.match(action, /admin\.user_delete\.failed/);
  assert.match(postgres, /set local lock_timeout = '5000ms'/);
  assert.match(postgres, /set local statement_timeout = '30000ms'/);
  assert.match(migration, /scans_submitted_by_user_id_idx/);
  assert.match(migration, /policy_review_queue_assigned_to_idx/);
  assert.match(migration, /validation_runs_triggered_by_user_id_idx/);
  assert.match(page, /DeleteUserButton/);
  assert.match(page, /deleteAdminUserFormAction/);
  assert.match(page, /sortKey="user"/);
  assert.match(page, /sortKey="activity"/);
  assert.match(page, /sortKey="lastLogin"/);
  assert.match(page, /sortKey="lastScan"/);
  assert.match(page, /sortKey="access"/);
  assert.match(page, /sortKey="assign"/);
  assert.match(page, /sortKey="plan"/);
  assert.match(page, /searchParams=\{\{ dir: direction, sort: sortKey \}\}/);
  assert.doesNotMatch(page, />Last active<\/th>/);
});

test("platform admins can assign unassigned users to a workspace", async () => {
  const action = await readFile("apps/web/server/admin/assign-user-workspace.ts", "utf8");
  const page = await readFile("apps/web/app/app/admin/users/page.tsx", "utf8");

  assert.match(action, /requirePlatformAdminContext/);
  assert.match(action, /addCompanyMembership/);
  assert.match(action, /role: parsed\.role/);
  assert.match(action, /updateAdminOrganizationPlan/);
  assert.match(action, /if \(parsed\.plan\)/);
  assert.match(action, /organizationId/);
  assert.match(action, /revalidatePath\("\/app\/admin\/users"\)/);
  assert.match(page, /Assign workspace/);
  assert.match(page, /assignUserWorkspaceFormAction/);
  assert.match(page, /form=\{assignmentFormId\}/);
  assert.match(page, /name="role"/);
  assert.match(page, /Keep workspace plan/);
  assert.match(page, /name="planStatus"/);
});

test("new admin-created accounts receive a workspace and default user access", async () => {
  const bootstrap = await readFile("apps/web/server/bootstrap-user.ts", "utf8");
  const adminUsersPage = await readFile("apps/web/app/app/admin/users/page.tsx", "utf8");
  const adminCreateAction = await readFile("apps/web/server/admin/create-user.ts", "utf8");
  const userRepository = await readFile("apps/web/server/users/repository.ts", "utf8");

  assert.doesNotMatch(bootstrap, /createOrganizationMembership|createOrganization\(/);
  assert.match(adminUsersPage, /createAdminUserFormAction/);
  assert.doesNotMatch(adminUsersPage, /name="companyId"/);
  assert.match(adminCreateAction, /requirePlatformAdminContext/);
  assert.match(adminCreateAction, /role: DEFAULT_NEW_MEMBERSHIP_ROLE/);
  assert.match(adminCreateAction, /createOrganizationForUser/);
  assert.match(adminCreateAction, /createUserWorkspaceIdentity/);
  assert.match(adminCreateAction, /sendPasswordSetupLink/);
  assert.match(adminCreateAction, /message=user_created/);
  assert.match(adminCreateAction, /existing_user_workspace_created/);
  assert.match(adminUsersPage, /User and workspace created successfully/);
  assert.match(userRepository, /with created_organization as/);
  assert.match(userRepository, /created_membership as/);
});

test("unassigned admin-created users retain and display their default user access level", async () => {
  const adminUsersPage = await readFile("apps/web/app/app/admin/users/page.tsx", "utf8");
  const adminRepository = await readFile("apps/web/server/admin/repository.ts", "utf8");
  const adminUserList = await readFile("apps/web/server/admin/list-admin-users.ts", "utf8");

  assert.match(adminRepository, /coalesce\(login_activity\.account_role, 'user'\) as account_role/);
  assert.match(adminRepository, /left join better_auth_sessions/);
  assert.match(adminUserList, /accountRole: row\.account_role/);
  assert.match(adminUsersPage, /aria-label=\{`Access level for \$\{user\.email\}`\}/);
  assert.match(adminUsersPage, /defaultValue="user"/);
  assert.doesNotMatch(adminUsersPage, />Not assigned</);
});

test("platform admins can send an existing user a password reset email", async () => {
  const action = await readFile("apps/web/server/admin/send-user-password-reset.ts", "utf8");
  const page = await readFile("apps/web/app/app/admin/users/page.tsx", "utf8");
  const auth = await readFile("apps/web/server/better-auth/auth.ts", "utf8");

  assert.match(action, /requirePlatformAdminContext/);
  assert.match(action, /findBetterAuthUserByEmail/);
  assert.match(action, /sendPasswordResetLink/);
  assert.match(action, /password_reset_sent/);
  assert.match(page, /Send reset link/);
  assert.match(page, /Password reset email sent/);
  assert.match(auth, /buildPasswordEmailContent/);
});

test("admin-created accounts receive welcome copy while reset actions retain reset copy", async () => {
  const createAction = await readFile("apps/web/server/admin/create-user.ts", "utf8");
  const resetAction = await readFile("apps/web/server/admin/send-user-password-reset.ts", "utf8");
  const setup = await readFile("apps/web/server/auth-flows/password-setup.ts", "utf8");
  const content = await readFile("apps/web/server/auth-flows/password-email-content.ts", "utf8");

  assert.match(createAction, /sendPasswordSetupLink/);
  assert.match(resetAction, /sendPasswordResetLink/);
  assert.match(setup, /"account_setup"/);
  assert.match(setup, /"password_reset"/);
  assert.match(content, /Welcome to CertScore\.ai — set your password/);
  assert.match(content, /Reset your CertScore\.ai password/);
});

test("admin user activity counts are scoped to the user who submitted the scan", async () => {
  const repository = await readFile("apps/web/server/admin/repository.ts", "utf8");

  assert.match(repository, /scans\.submitted_by_user_id = selected_users\.id/);
  assert.match(repository, /scans\.submitted_by_user_id = users\.id/);
  assert.doesNotMatch(repository, /where scans\.organization_id = selected_memberships\.organization_id/);
});
