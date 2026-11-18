export function documentedChoiceCookie(name: string) {
  // Exact first-party SDK cookie names documented by RudderStack:
  // https://www.rudderstack.com/docs/sources/event-streams/sdks/rudderstack-javascript-sdk/server-side-cookies/
  switch (name) {
    case "rl_anonymous_id":
    case "rl_session":
    case "rl_page_init_referrer":
      return { category: "analytics", essentiality: "non_essential" } as const;
    // Osano documents the choice receipt and its lookup ID:
    // https://docs.osano.com/en-US/osano/article/8e3LDxEd-osano-cookies
    case "osano_consentmanager":
    case "osano_consentmanager_uuid":
      return { category: "consent_management", essentiality: "essential" } as const;
  }
}
