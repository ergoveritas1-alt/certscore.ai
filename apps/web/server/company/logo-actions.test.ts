import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

test("workspace logo mutations authorize before storage, replace old objects and clean failed writes", async () => {
  const actions = fileURLToPath(new URL("./actions.ts", import.meta.url));
  const mocks: Record<string, string> = {
    serverOnly: "",
    state: `export const state={allowed:true,failUpdate:false,puts:[],deletes:[],updates:[],invalidated:[],themes:[],key:null};`,
    cache: `import {state} from 'test-state'; export function revalidatePath(path){state.invalidated.push(path);}`,
    navigation: `export function redirect(){throw new Error('redirect');}`,
    authorization: `import {state} from 'test-state'; export async function requireCompanyCapability(id,capability){if(!state.allowed)throw new Error('Company capability denied: '+capability);}`,
    storage: `import {state} from 'test-state'; export async function putStorageObject(input){state.puts.push(input);} export async function deleteStorageObject(key){state.deletes.push(key);}`,
    repository: `import {state} from 'test-state'; export async function updateCompanyLogo(id,key){if(state.failUpdate)throw new Error('db unavailable');const old=state.key;state.key=key;state.updates.push({id,key});return old;} export async function updateCompanyReportHeaderTheme(id,theme){if(state.failUpdate)throw new Error('db unavailable');state.themes.push({id,theme});} export async function addCompanyMembership(){} export async function createCompany(){} export async function findCompanyByName(){} export async function removeCompanyMembership(){} export async function updateCompanyName(){} export async function updateCompanyMembershipRole(){}`,
    users: `export async function findAppUserByEmailRecord(){} export async function findOrganizationMembershipByUserId(){}`,
    admin: `export async function requirePlatformAdminContext(){}`,
  };
  const output = await build({ stdin: { contents: `export * from ${JSON.stringify(actions)};export {state} from 'test-state';`, resolveDir: process.cwd() },
    bundle: true, write: false, format: "cjs", platform: "node", packages: "external", plugins: [{ name: "logo-actions", setup(api) {
      const matches: Record<string, string> = { "server-only": "serverOnly", "test-state": "state", "next/cache": "cache", "next/navigation": "navigation", "./authorization": "authorization", "../storage/s3": "storage", "./repository": "repository", "../users/repository": "users", "../admin/platform-admin": "admin" };
      api.onResolve({ filter: /.*/ }, args => matches[args.path] ? { path: matches[args.path]!, namespace: "mock" } : undefined);
      api.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "js" }));
    } }] });
  const { createRequire } = await import("node:module");
  const compiled: { exports: Record<string, any> } = { exports: {} };
  new Function("require", "exports", "module", output.outputFiles[0]!.text)(createRequire(import.meta.url), compiled.exports, compiled);
  const { uploadCompanyLogoFormAction: upload, removeCompanyLogoFormAction: remove, saveWorkspaceReportHeaderAction: saveHeader, state } = compiled.exports;
  const sharp = (await import("sharp")).default;
  const png = await sharp({ create: { width: 30, height: 10, channels: 4, background: "#ffaa00" } }).png().toBuffer();
  const companyId = "00000000-0000-0000-0000-000000000001";
  function form(body = png) {
    const data = new FormData();
    data.set("companyId", companyId);
    data.set("logo", new File([new Uint8Array(body)], "logo.png", { type: "image/png" }));
    return data;
  }
  state.allowed = false;
  await assert.rejects(upload(form()), /capability denied/);
  await assert.rejects(remove(form()), /capability denied/);
  assert.equal(state.puts.length, 0);
  assert.equal(state.updates.length, 0);
  const headerForm = new FormData(); headerForm.set("companyId", companyId); headerForm.set("headerTheme", "black");
  assert.match((await saveHeader({ error: null, success: null }, headerForm)).error, /Advanced access/);
  assert.equal(state.themes.length, 0);
  state.allowed = true;
  headerForm.set("headerTheme", "navy");
  assert.match((await saveHeader({ error: null, success: null }, headerForm)).error, /white or black/);
  assert.equal(state.themes.length, 0);
  for (const theme of ["black", "white"]) {
    headerForm.set("headerTheme", theme);
    assert.equal((await saveHeader({ error: null, success: null }, headerForm)).success, "Report header saved.");
  }
  assert.deepEqual(state.themes, [{ id: companyId, theme: "black" }, { id: companyId, theme: "white" }]);
  state.failUpdate = true;
  assert.match((await saveHeader({ error: null, success: null }, headerForm)).error, /Unable to save/);
  state.failUpdate = false;
  await assert.rejects(upload(form(Buffer.from("fake PNG"))), /valid/);
  assert.equal(state.puts.length, 0);
  await upload(form());
  const first = state.key;
  assert.match(first, new RegExp(`^company-logos/${companyId}/.*\\.png$`));
  assert.equal(state.puts[0].contentType, "image/png");
  await upload(form());
  assert.notEqual(state.key, first);
  assert.deepEqual(state.deletes, [first]);
  const current = state.key;
  state.failUpdate = true;
  await assert.rejects(upload(form()), /db unavailable/);
  assert.equal(state.key, current);
  assert.equal(state.deletes[1], state.puts[2].key);
  state.failUpdate = false;
  await remove(form());
  assert.equal(state.key, null);
  assert.equal(state.deletes[2], current);
  assert.ok(state.invalidated.includes("/app/settings"));
  assert.ok(state.invalidated.includes("/app/scans/[scanId]"));
});
