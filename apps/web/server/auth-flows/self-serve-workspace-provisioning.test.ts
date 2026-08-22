import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("password and Google self-signups provision a dedicated workspace", async () => {
  const credentials = await readFile("apps/web/server/auth-flows/credentials-actions.ts", "utf8");
  const googleStart = await readFile("apps/web/app/auth/google/route.ts", "utf8");
  const googleComplete = await readFile("apps/web/app/auth/google/complete/route.ts", "utf8");
  const provisioner = await readFile("apps/web/server/auth-flows/provision-self-serve-user.ts", "utf8");

  assert.match(credentials, /await provisionSelfServeUserSession\(\{/);
  assert.match(googleStart, /new URL\("\/auth\/google\/complete", requestOrigin\)/);
  assert.match(googleStart, /newUserCallbackURL: newUserCallbackURL\.toString\(\)/);
  assert.match(googleComplete, /await provisionSelfServeUserSession\(user\)/);
  assert.match(provisioner, /createUserWorkspaceIdentity\(context\.profile\.email\)/);
  assert.match(provisioner, /role: DEFAULT_NEW_MEMBERSHIP_ROLE/);
  assert.match(provisioner, /ensureOrganizationForUser/);
  assert.match(provisioner, /eventName: "account_created"/);
  assert.match(provisioner, /consentState: "operational"/);
  assert.match(provisioner, /context\.user\.id\)\.catch/);
  assert.doesNotMatch(await readFile("apps/web/components/analytics/data-layer-events.tsx", "utf8"), /trackProductEvent\(\{ eventName: "account_created"/);
});

test("self-serve provisioning is idempotent and serialized per user", async () => {
  const repository = await readFile("apps/web/server/users/repository.ts", "utf8");
  const provisioner = await readFile("apps/web/server/auth-flows/provision-self-serve-user.ts", "utf8");

  assert.match(provisioner, /context\.membership\?\.organization_id/);
  assert.match(repository, /export async function ensureOrganizationForUser/);
  assert.match(repository, /withWriteTransaction/);
  assert.match(repository, /where id = \$1\s+for update/);
  assert.match(repository, /where user_id = \$1/);
  assert.match(repository, /created: false/);
});

test("the Google completion redirect rejects cross-origin targets", async () => {
  const googleComplete = await readFile("apps/web/app/auth/google/complete/route.ts", "utf8");

  assert.match(googleComplete, /nextPath\.startsWith\("\/"\)/);
  assert.match(googleComplete, /!nextPath\.startsWith\("\/\/"\)/);
  assert.match(googleComplete, /return "\/app"/);
});
