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

test("company management navigation is limited to advanced company members", async () => {
  const shell = await readFile("apps/web/components/dashboard/app-shell.tsx", "utf8");
  const layout = await readFile("apps/web/app/app/layout.tsx", "utf8");

  assert.match(shell, /canManageCompany\?/);
  assert.match(shell, /Manage company/);
  assert.match(shell, /\/app\/settings\/company/);
  assert.match(layout, /getCompanyAccess\(\)/);
  assert.match(layout, /membershipRole === "advanced"/);
  assert.match(layout, /membershipRole === "admin"/);
});
