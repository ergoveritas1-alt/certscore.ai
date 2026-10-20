import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

test("only advanced users and admins can change workspace branding", async () => {
  const source = fileURLToPath(new URL("./authorization.ts", import.meta.url));
  const mocks: Record<string, string> = {
    state: `export const state={admin:false,role:'user',sole:false};`,
    empty: "",
    db: `import {state} from 'test-state'; export async function queryOne(){return {organization_id:'own-workspace',role:state.role,is_sole_member:state.sole};}`,
    auth: `export async function getDashboardContext(){return {user:{id:'user',email:'viewer@example.test'}};}`,
    admin: `import {state} from 'test-state'; export function isPlatformAdminEmail(){return state.admin;}`,
  };
  const result = await build({ stdin: { contents: `export * from ${JSON.stringify(source)};export {state} from 'test-state';`, resolveDir: process.cwd() }, bundle: true, write: false, format: "esm", platform: "node",
    plugins: [{ name: "logo-auth", setup(api) {
      api.onResolve({ filter: /.*/ }, args => {
        const key = args.path === "test-state" ? "state" : args.path === "server-only" ? "empty" : args.path === "@website-signal-risk-scanner/db" ? "db" : args.path === "../auth" ? "auth" : args.path.endsWith("/platform-admin") ? "admin" : null;
        return key ? { path: key, namespace: "mock" } : undefined;
      });
      api.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }] });
  const { requireCompanyCapability: requireCapability, state } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString("base64")}`);
  await assert.rejects(requireCapability("own-workspace", "manage_logo"), /denied/);
  state.sole = true;
  await assert.rejects(requireCapability("own-workspace", "manage_logo"), /denied/);
  await assert.rejects(requireCapability("other-workspace", "manage_logo"), /denied/);
  await assert.rejects(requireCapability("own-workspace", "manage_users"), /denied/);
  state.sole = false; state.role = "advanced";
  await requireCapability("own-workspace", "manage_logo");
  await assert.rejects(requireCapability("other-workspace", "manage_logo"), /denied/);
  state.admin = true;
  await requireCapability("other-workspace", "manage_logo");
});
