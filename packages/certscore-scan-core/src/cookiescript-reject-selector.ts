import { createHash } from "node:crypto";

const roleButtonRestrictions =
  ':not([inert],[inert] *,[disabled],[disabled] *,[aria-disabled="true" i],[aria-disabled="true" i] *,form *,a[href] *)' +
  ':not(:has(a[href],button,input,select,textarea,form,[role="button"]))';

export const COOKIE_SCRIPT_ACCEPT_ROLE_SELECTOR = '#cookiescript_injected div#cookiescript_accept[role="button"]' + roleButtonRestrictions;
export const COOKIE_SCRIPT_REJECT_ROLE_SELECTOR = '#cookiescript_injected div#cookiescript_reject[role="button"]' + roleButtonRestrictions;
export const COOKIE_SCRIPT_ACCEPT_IDS = "#cookiescript_injected, #cookiescript_accept";
export const COOKIE_SCRIPT_REJECT_IDS = "#cookiescript_injected, #cookiescript_reject";

const moodMediaLanding = "https://us.moodmedia.com/?utm_source=MoodMedia&utm_medium=redirect&utm_campaign=moodmedia_com";
const moodMediaLandingHash = createHash("sha256").update(moodMediaLanding).digest("hex");

// Only wait for the browser to arrive naturally. Authorization still binds the actual navigation.
export function expectedMoodMediaLanding(requestedUrl: string, selector?: string, documentHash?: string): string | undefined {
  if (requestedUrl === "https://moodmedia.com/" && documentHash === moodMediaLandingHash &&
      (selector === COOKIE_SCRIPT_ACCEPT_ROLE_SELECTOR || selector === COOKIE_SCRIPT_REJECT_ROLE_SELECTOR)) return moodMediaLanding;
}
