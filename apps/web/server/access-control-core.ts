const DEFAULT_ALLOWED_AUTH_EMAILS = [
  "ben@certscore.ai",
  "bmasek@gmail.com",
  "demo@certscore.ai",
  "xlprep@gmail.com",
  "ben@ergoveritas.com"
] as const;

type AccessControlEnv = Record<string, string | undefined>;

function envBoolean(value: string | undefined, defaultValue: boolean) {
  if (value === undefined || value.trim().length === 0) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true") {
    return true;
  }
  if (normalized === "0" || normalized === "false") {
    return false;
  }

  return defaultValue;
}

function parseEmailList(value: string | undefined) {
  if (!value?.trim()) {
    return DEFAULT_ALLOWED_AUTH_EMAILS;
  }

  return value
    .split(",")
    .map((email) => normalizeAccessEmail(email))
    .filter((email): email is string => Boolean(email));
}

export function normalizeAccessEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
}

export function isPublicAccountCreationEnabled(env: AccessControlEnv = process.env) {
  return envBoolean(env.CERTSCORE_PUBLIC_ACCOUNT_CREATION_ENABLED, true);
}

export function isSelfServePurchasingEnabled(env: AccessControlEnv = process.env) {
  return envBoolean(env.CERTSCORE_SELF_SERVE_PURCHASING_ENABLED, true);
}

export function isAuthAccessRestricted(env: AccessControlEnv = process.env) {
  return envBoolean(env.CERTSCORE_AUTH_ACCESS_RESTRICTED, false);
}

export function getAllowedAuthEmails(env: AccessControlEnv = process.env) {
  return new Set(parseEmailList(env.CERTSCORE_AUTH_ALLOWED_EMAILS));
}

export function isAllowedAuthEmail(email: string | null | undefined, env: AccessControlEnv = process.env) {
  if (!isAuthAccessRestricted(env)) {
    return true;
  }

  const normalized = normalizeAccessEmail(email);
  return normalized ? getAllowedAuthEmails(env).has(normalized) : false;
}

export function getAuthAccessDeniedMessage() {
  return "CertScore account access is temporarily limited. Contact support if you need access.";
}

export function getAccountCreationPausedMessage() {
  return "New account creation is temporarily paused.";
}

export function getSelfServePurchasingPausedMessage() {
  return "Self-serve checkout is temporarily paused.";
}
