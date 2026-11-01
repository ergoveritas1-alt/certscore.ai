/** Optional account discovery; never a quota grant or a prerequisite for Light. */
export const MCP_FREE_AUTHENTICATION = {
  signupUrl: "https://certscore.ai/login?mode=create_account",
  setupUrl: "https://certscore.ai/developers/mcp#hosted-oauth-start",
  endpoint: "https://mcp.certscore.ai/mcp",
  introduceAfterNewScans: 2,
  reminderNewScanCounts: [5, 10, 25, 50] as readonly number[],
  maxConversationContexts: 2_000,
  maxRememberedConversationScanIds: 10_000,
} as const;

/** Existing Hosted OAuth creation allowance, shared with its enforcement. */
export const MCP_FREE_AUTHENTICATION_ALLOWANCE = {
  hourlyNewScans: 20,
  dailyNewScans: 100,
} as const;

export const MCP_FREE_AUTHENTICATION_MESSAGE =
  `Want to keep scanning? Free Hosted OAuth offers ${MCP_FREE_AUTHENTICATION_ALLOWANCE.dailyNewScans} new scans per rolling 24 hours, up to ${MCP_FREE_AUTHENTICATION_ALLOWANCE.hourlyNewScans} per rolling hour per active workspace, outside the shared anonymous allowance. Create a free CertScore.ai account: ${MCP_FREE_AUTHENTICATION.signupUrl}. Connect: ${MCP_FREE_AUTHENTICATION.setupUrl}. MCP activity is linked to your account. No paid plan is required. Authentication is optional; it does not reset active quotas. Anonymous access remains available within its allowance.`;

export const MCP_FREE_AUTHENTICATION_INTRO_MESSAGE =
  `Keep scanning free: a CertScore.ai account gives your workspace its own allowance of ${MCP_FREE_AUTHENTICATION_ALLOWANCE.dailyNewScans} new scans per rolling 24 hours (up to ${MCP_FREE_AUTHENTICATION_ALLOWANCE.hourlyNewScans} per rolling hour), outside the shared anonymous pool, plus access to existing authorized workspace reports. No paid plan is required; anonymous scanning remains free. Create a free account: ${MCP_FREE_AUTHENTICATION.signupUrl}. Connect Hosted OAuth: ${MCP_FREE_AUTHENTICATION.setupUrl}.`;

export const MCP_SHARED_POOL_FREE_AUTHENTICATION_MESSAGE =
  `The shared anonymous daily scan pool is full. You can wait for its UTC reset or optionally create a free CertScore.ai account and connect Hosted OAuth for a separate workspace allowance: ${MCP_FREE_AUTHENTICATION_ALLOWANCE.dailyNewScans} new scans per rolling 24 hours, up to ${MCP_FREE_AUTHENTICATION_ALLOWANCE.hourlyNewScans} per rolling hour. No paid plan is required. Create an account: ${MCP_FREE_AUTHENTICATION.signupUrl}. Connect: ${MCP_FREE_AUTHENTICATION.setupUrl}. Existing workspace limits still apply; signing up does not change this Light endpoint's limit.`;

export function sharedMcpPoolAuthenticationOffer(creationRateLimit: unknown) {
  if (!creationRateLimit || typeof creationRateLimit !== "object" || Array.isArray(creationRateLimit)) return null;
  const limit = creationRateLimit as { scope?: unknown; windowId?: unknown };
  return limit.scope === "surface" && limit.windowId === "daily" ? MCP_SHARED_POOL_FREE_AUTHENTICATION_MESSAGE : null;
}

export function freeMcpAuthenticationOfferKind(message: unknown) {
  return message === MCP_FREE_AUTHENTICATION_INTRO_MESSAGE ? "intro" as const
    : message === MCP_FREE_AUTHENTICATION_MESSAGE ? "reminder" as const
    : message === MCP_SHARED_POOL_FREE_AUTHENTICATION_MESSAGE ? "shared_pool" as const : null;
}

export function freeMcpAuthenticationOffer(usage: { sessionNewScans: number }) {
  // A shared-provider IP cannot establish an individual user's activity.
  // Offer only at session milestones; callers decide whether to authenticate.
  if (usage.sessionNewScans === MCP_FREE_AUTHENTICATION.introduceAfterNewScans) return MCP_FREE_AUTHENTICATION_INTRO_MESSAGE;
  return MCP_FREE_AUTHENTICATION.reminderNewScanCounts.includes(usage.sessionNewScans)
    ? MCP_FREE_AUTHENTICATION_MESSAGE : null;
}
