import "server-only";
import {
  canUseFullSite,
  fullSitePolicy,
  validateFullSiteRequest,
} from "@website-signal-risk-scanner/shared";
import { getCurrentUser, getDashboardContext } from "../auth";

export async function readFullSiteOptions() {
  const user = await getCurrentUser();
  if (!user) return { allowed: false, policy: fullSitePolicy(process.env) };
  const context = await getDashboardContext();
  return {
    allowed: canUseFullSite(context.membership?.role),
    policy: fullSitePolicy(process.env),
  };
}
export async function authorizeFullSiteInput(input: {
  fullSite?: unknown;
  crawlOptions?: unknown;
}) {
  if (
    (input.fullSite === undefined || input.fullSite === false) &&
    input.crawlOptions === undefined
  )
    return { fullSite: false as const };
  const { allowed, policy } = await readFullSiteOptions();
  return validateFullSiteRequest(input, allowed, policy);
}
export function fullSiteFormInput(form: FormData) {
  if (
    !form.has("fullSite") &&
    !["maxPages", "concurrency", "waitSeconds"].some((key) => form.has(key))
  )
    return {};
  return {
    fullSite: !form.has("fullSite")
      ? false
      : form.get("fullSite") === "true"
        ? true
        : form.get("fullSite") === "false"
          ? false
          : form.get("fullSite"),
    crawlOptions: Object.fromEntries(
      ["maxPages", "concurrency", "waitSeconds"]
        .filter((key) => form.has(key))
        .map((key) => [key, Number(form.get(key))]),
    ),
  };
}
