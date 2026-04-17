export const BETTER_AUTH_COOKIE_PREFIX = "certscore";
export const BETTER_AUTH_SESSION_COOKIE_NAME = "session_token";

export const BETTER_AUTH_REQUIRED_TABLES = [
  "better_auth_accounts",
  "better_auth_sessions",
  "better_auth_users",
  "better_auth_verifications"
] as const;
