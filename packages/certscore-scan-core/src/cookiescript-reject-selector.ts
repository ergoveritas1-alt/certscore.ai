// Only the direct first-layer CookieScript Reject control has a reviewed role-button shape.
export const COOKIE_SCRIPT_REJECT_ROLE_SELECTOR =
  '#cookiescript_injected div#cookiescript_reject[role="button"]' +
  ':not([inert],[inert] *,[disabled],[disabled] *,[aria-disabled="true" i],[aria-disabled="true" i] *,form *,a[href] *)' +
  ':not(:has(a[href],button,input,select,textarea,form,[role="button"]))';

export const COOKIE_SCRIPT_REJECT_IDS = "#cookiescript_injected, #cookiescript_reject";
