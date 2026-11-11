import { z } from "zod";

export const CAMPAIGN = "black-friday-2026";
export const CAMPAIGN_START = "2026-11-10T08:00:00.000Z";
// Exclusive midnight boundary: includes all of December 2 in Pacific time.
export const CAMPAIGN_END = "2026-12-03T08:00:00.000Z";
export const CAPACITY = 10;
export const TERMS_VERSION = "bf26.2026-11-10.v6";
export const BUSINESS_TYPES = ["Web design/development agency", "Digital marketing agency", "Independent web developer / marketer", "Privacy consultancy", "Law firm", "In-house privacy team (DPO)", "Other"] as const;
export const SITE_COUNTS = ["0–5", "6–20", "21–50", "51+"] as const;
export const STATUSES = ["submitted", "under_review", "approved", "rejected", "invited", "activated", "expired"] as const;
export const SUCCESS_MESSAGE = "Thank you. If your application is new and eligible, it has been received for review. Repeat submissions keep the existing application. Promotional places require approval.";
const short = (max: number) => z.string().trim().min(1, "This field is required.").max(max).refine(v => !/[\u0000-\u001f\u007f]/.test(v), "Use plain text.");
function publicWebsite(value: string) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) && !u.username && !u.password && !u.port &&
      /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(u.hostname) && !u.hostname.endsWith(".local") && !u.hostname.endsWith(".localhost");
  } catch { return false; }
}
export const applicationSchema = z.object({
  fullName: short(120), email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  company: short(160), website: short(300).refine(publicWebsite, "Enter a public organization website, including https://."),
  businessType: z.enum(BUSINESS_TYPES), clientSites: z.enum(SITE_COUNTS),
  intendedUse: short(600), linkedIn: z.string().trim().max(300).optional().default("").refine(v => !v || /^https:\/\/(www\.)?linkedin\.com\/(in|company)\/[a-zA-Z0-9_%-]+\/?$/.test(v), "Enter a LinkedIn profile URL."),
  comments: z.string().trim().max(1500).optional().default(""), terms: z.literal(true),
  marketingOptIn: z.boolean().default(false), websiteConfirm: z.string().max(0).default(""),
  requestId: z.string().uuid(), analyticsConsent: z.boolean().default(false), attribution: z.unknown().optional()
});
export type ApplicationInput = z.infer<typeof applicationSchema>;
export function campaignOpen(now: Date, allocated: number, testWindow = false) {
  return allocated < CAPACITY && (testWindow || (now >= new Date(CAMPAIGN_START) && now < new Date(CAMPAIGN_END)));
}
export function addCalendarMonths(input: Date, months: number) {
  const result = new Date(input);
  const day = result.getUTCDate();
  result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}
export function entitlementPeriod(start: Date, now: Date) {
  for (let i = 0; i < 3; i++) {
    const from = addCalendarMonths(start, i), to = addCalendarMonths(start, i + 1);
    if (now >= from && now < to) return { start: from, end: to, index: i };
  }
  return null;
}
export type Attribution = Partial<Record<"utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "referrerDomain", string>>;
export function cleanAttribution(value: unknown, consent: boolean, gpc: boolean): Attribution {
  if (!consent || gpc || !value || typeof value !== "object") return {};
  const data = value as Record<string, unknown>, result: Attribution = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const) {
    const text = data[key];
    if (typeof text === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(text) && !/token|password|secret/i.test(text)) result[key] = text.toLowerCase();
  }
  if (typeof data.referrerDomain === "string" && /^[a-z0-9.-]{1,120}\.[a-z]{2,}$/i.test(data.referrerDomain)) result.referrerDomain = data.referrerDomain.toLowerCase();
  return result;
}
export function sourceGroup(a: Attribution) {
  const source = a.utm_source ?? a.referrerDomain ?? "";
  if (/^(linkedin|linkedin.com|www.linkedin.com)$/.test(source)) return "LinkedIn";
  if (/^(x|twitter|x.com|t.co|twitter.com)$/.test(source)) return "X";
  if (/^(termageddon|termageddon.com|www.termageddon.com)$/.test(source)) return "Termageddon";
  if (/email|newsletter/.test(a.utm_medium ?? source)) return "Email";
  return source ? "Other" : "Direct/unknown";
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function percentage(numerator: number, denominator: number) { return denominator ? `${(100 * numerator / denominator).toFixed(1)}%` : "Unavailable"; }
