import assert from "node:assert/strict";
import test from "node:test";
import {
  cmpActionRecipeEnabled,
  parseDisabledCmpActionRecipes,
} from "./cmp-action-recipe-policy.js";

test("per-CMP action kill switches are exact, case-insensitive, and action-scoped", () => {
  const disabled = parseDisabledCmpActionRecipes(
    "Sourcepoint:reject, DIDOMI:*, cookieyes:accept",
  );
  assert.equal(cmpActionRecipeEnabled({ action: "reject", canonicalName: "Sourcepoint", disabled }), false);
  assert.equal(cmpActionRecipeEnabled({ action: "accept", canonicalName: "Sourcepoint", disabled }), true);
  assert.equal(cmpActionRecipeEnabled({ action: "accept", canonicalName: "Didomi", disabled }), false);
  assert.equal(cmpActionRecipeEnabled({ action: "reject", canonicalName: "Didomi", disabled }), false);
  assert.equal(cmpActionRecipeEnabled({ action: "accept", canonicalName: "CookieYes", disabled }), false);
});

test("global kill switch disables every CMP recipe", () => {
  const disabled = parseDisabledCmpActionRecipes("*");
  assert.equal(cmpActionRecipeEnabled({ action: "accept", canonicalName: "OneTrust", disabled }), false);
  assert.equal(cmpActionRecipeEnabled({ action: "reject", canonicalName: "OneTrust", disabled }), false);
});
