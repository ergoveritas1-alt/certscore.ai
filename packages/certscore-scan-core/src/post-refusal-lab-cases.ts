import { buildPostRefusalCmpActionRecipe } from "./post-refusal-cmp-recipes.js";
import type { PostRefusalActionRecipe } from "./post-refusal-observer.js";
import type { StaticFixturePage } from "./test-fixtures/static-server.js";

export const POST_REFUSAL_LAB_CASES = {
  certscoreOwnedAnalytics: "post-refusal-certscore-owned-analytics",
  honored: "post-refusal-reject-honored",
  ignored: "post-refusal-reject-ignored",
  missing: "post-refusal-reject-missing",
  unconfirmed: "post-refusal-reject-unconfirmed",
  inflight: "post-refusal-reject-inflight",
  inflightRedirectFlood: "post-refusal-reject-inflight-redirect-flood",
  clickFails: "post-refusal-reject-click-fails",
  staleStorage: "post-refusal-reject-stale-storage",
  requestFlood: "post-refusal-reject-request-flood",
  storageWriteFlood: "post-refusal-reject-storage-write-flood",
  serverCookie: "post-refusal-reject-server-cookie",
  thirdPartyCookie: "post-refusal-reject-third-party-cookie",
  tcf: "post-refusal-onetrust-tcf-honored",
  tcfIgnored: "post-refusal-onetrust-tcf-ignored",
  namedNoReject: "post-refusal-onetrust-no-reject",
  contradiction: "post-refusal-onetrust-tcf-contradiction",
  tcfStale: "post-refusal-onetrust-tcf-stale",
  tcfDelayedContradiction: "post-refusal-onetrust-tcf-delayed-contradiction",
  tcfStorageUnavailable: "post-refusal-onetrust-tcf-storage-unavailable",
  cookiebot: "post-refusal-cookiebot-fast",
  usercentrics: "post-refusal-usercentrics-delayed",
} as const satisfies Record<string, StaticFixturePage>;

export type PostRefusalLabCase = keyof typeof POST_REFUSAL_LAB_CASES;

const LOCAL_REJECT_RECIPE: PostRefusalActionRecipe = {
  artifactVersion: "certscore.post_refusal_action_recipe.v1",
  recipeId: "certscore-local-fixture-direct-reject-v1",
  cmpId: "certscore_local_fixture",
  controlSelector: '[data-certscore-consent-action="reject"]',
  bannerSelector: "#certscore-fixture-consent-banner",
  confirmation: {
    kind: "local_storage_equals",
    key: "certscore_fixture_consent",
    expectedValue: "rejected",
  },
};

export const CERTSCORE_OWNED_ANALYTICS_REJECT_RECIPE: PostRefusalActionRecipe = {
  artifactVersion: "certscore.post_refusal_action_recipe.v1",
  recipeId: "certscore-owned-analytics-consent-reject-v1",
  cmpId: "certscore_owned_analytics_consent",
  resolverMethod: "local_fixture_recipe",
  controlSelector:
    'section[aria-label="Cookie and analytics preferences"] button:nth-of-type(2)',
  bannerSelector: 'section[aria-label="Cookie and analytics preferences"]',
  confirmation: {
    kind: "local_storage_equals",
    key: "certscore:analytics-consent:v1",
    expectedValue: "denied",
  },
};

export function postRefusalLabRecipe(fixture: PostRefusalLabCase): PostRefusalActionRecipe {
  if (fixture === "certscoreOwnedAnalytics") {
    return CERTSCORE_OWNED_ANALYTICS_REJECT_RECIPE;
  }
  if (
    fixture === "tcf" ||
    fixture === "tcfIgnored" ||
    fixture === "namedNoReject" ||
    fixture === "tcfStale" ||
    fixture === "tcfDelayedContradiction" ||
    fixture === "tcfStorageUnavailable"
  ) {
    return requireCmpRecipe("OneTrust", { kind: "tcf_purposes_denied" }, "#onetrust-banner-sdk");
  }
  if (fixture === "contradiction") {
    return requireCmpRecipe("OneTrust", LOCAL_REJECT_RECIPE.confirmation, "#onetrust-banner-sdk");
  }
  if (fixture === "cookiebot") {
    return requireCmpRecipe("Cookiebot", LOCAL_REJECT_RECIPE.confirmation, "#CybotCookiebotDialog");
  }
  if (fixture === "usercentrics") {
    return requireCmpRecipe("Usercentrics", LOCAL_REJECT_RECIPE.confirmation, "#usercentrics-root");
  }
  return LOCAL_REJECT_RECIPE;
}

function requireCmpRecipe(
  cmpCanonicalName: string,
  confirmation: PostRefusalActionRecipe["confirmation"],
  bannerSelector: string,
): PostRefusalActionRecipe {
  const recipe = buildPostRefusalCmpActionRecipe({
    cmpCanonicalName,
    confirmation,
    bannerSelector,
  });
  if (!recipe) throw new Error(`No canonical post-refusal recipe for ${cmpCanonicalName}.`);
  return recipe;
}
