export function pdfTimeZone(value?: string | null) {
  if (!value) return "UTC";
  if (value.length > 100) return null;
  try { return new Intl.DateTimeFormat("en-GB", { timeZone: value }).resolvedOptions().timeZone; }
  catch { return null; }
}

export function pdfLocalDate(value: string | null | undefined, timeZone = "UTC") {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return "Unavailable";
  const zone = pdfTimeZone(timeZone) ?? "UTC";
  const zoneLabel = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" }).formatToParts(date).find(part => part.type === "timeZoneName")?.value ?? zone;
  return `${new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23", timeZone: zone }).format(date)} ${zoneLabel}`;
}
