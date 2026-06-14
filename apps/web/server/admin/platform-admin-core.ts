export const DEFAULT_PLATFORM_ADMIN_EMAILS = ["bmasek@gmail.com", "ben@certscore.ai"] as const;

export function parsePlatformAdminEmails(value: string | undefined) {
  return new Set([
    ...DEFAULT_PLATFORM_ADMIN_EMAILS,
    ...(value ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  ]);
}
