import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ASSIGNABLE_MEMBERSHIP_ROLES,
  DEFAULT_NEW_MEMBERSHIP_ROLE,
  MEMBERSHIP_ROLES
} from "./membership-role-policy";

test("new memberships default to user and admin is not assignable", () => {
  assert.equal(DEFAULT_NEW_MEMBERSHIP_ROLE, "user");
  assert.deepEqual(ASSIGNABLE_MEMBERSHIP_ROLES, ["advanced", "user"]);
  assert.equal(ASSIGNABLE_MEMBERSHIP_ROLES.includes("admin" as never), false);
  assert.equal(MEMBERSHIP_ROLES.includes("admin"), true);
});

test("membership role persistence defaults to user and rejects new admin assignments", () => {
  const migration = readFileSync(
    new URL("../../../../packages/db/migrations/0143_default_membership_role_user.sql", import.meta.url),
    "utf8"
  );

  assert.match(migration, /alter column role set default 'user'/i);
  assert.match(migration, /check \(role in \('advanced', 'user'\)\) not valid/i);
  assert.doesNotMatch(migration, /set default 'admin'/i);
});

test("bootstrap and role updates consume the non-admin assignment policy", () => {
  const bootstrap = readFileSync(new URL("../../server/bootstrap-user.ts", import.meta.url), "utf8");
  const roleAction = readFileSync(new URL("../../server/admin/update-membership-role.ts", import.meta.url), "utf8");
  const roleForm = readFileSync(new URL("../../components/admin/membership-role-form.tsx", import.meta.url), "utf8");

  assert.match(bootstrap, /role: DEFAULT_NEW_MEMBERSHIP_ROLE/);
  assert.doesNotMatch(bootstrap, /role: "admin"/);
  assert.match(roleAction, /z\.enum\(ASSIGNABLE_MEMBERSHIP_ROLES\)/);
  assert.doesNotMatch(roleAction, /z\.enum\(\["admin"/);
  assert.match(roleForm, /<option disabled value="admin">admin \(existing\)<\/option>/);
  assert.doesNotMatch(roleForm, /<option value="admin">admin<\/option>/);
});
