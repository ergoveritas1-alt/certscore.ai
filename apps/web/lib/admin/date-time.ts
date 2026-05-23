export const ADMIN_LOCAL_TIME_ZONE = "America/Los_Angeles";

type AdminDateTimeOptions = {
  fallback?: string;
  includeSeconds?: boolean;
};

export function formatAdminDateTime(value: string | Date | null | undefined, options: AdminDateTimeOptions = {}) {
  if (!value) {
    return options.fallback ?? "Not available";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return options.fallback ?? "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: options.includeSeconds ? "2-digit" : undefined,
    hour12: true,
    timeZone: ADMIN_LOCAL_TIME_ZONE,
    timeZoneName: "short"
  }).format(date);
}
