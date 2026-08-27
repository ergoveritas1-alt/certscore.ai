export const PRODUCT_ANALYTICS_EVENT_NAMES = [
  "page_viewed",
  "navigation_clicked",
  "action_clicked",
  "form_started",
  "form_submitted",
  "form_succeeded",
  "form_failed",
  "scan_started",
  "scan_completed",
  "scan_viewed",
  "report_viewed",
  "scroll_depth_reached",
  "session_engaged",
  "web_vital_recorded",
  "client_error",
  "account_created",
  "oauth_authorized",
  "mcp_initialized",
  "mcp_tools_listed",
  "mcp_first_tool_invoked",
  "mcp_scan_requested",
  "analytics_opted_in",
  "analytics_opted_out"
] as const;

export type ProductAnalyticsEventName = (typeof PRODUCT_ANALYTICS_EVENT_NAMES)[number];
export type ProductAnalyticsCategory = "navigation" | "interaction" | "form" | "scan" | "report" | "account" | "engagement" | "performance" | "reliability" | "preference";
export type ProductAnalyticsOutcome = "observed" | "started" | "submitted" | "success" | "failure" | "opted_in" | "opted_out";

export type ProductAnalyticsPayload = {
  actorId?: string;
  campaignMedium?: string;
  campaignName?: string;
  campaignSource?: string;
  category: ProductAnalyticsCategory;
  durationMs?: number;
  elementId?: string;
  entryRoute?: string;
  eventName: ProductAnalyticsEventName;
  feature: string;
  formId?: string;
  language?: string;
  numericValue?: number;
  outcome: ProductAnalyticsOutcome;
  previousRoute?: string;
  route: string;
  scanId?: string;
  sessionId?: string;
  viewportBand?: "xs" | "sm" | "md" | "lg" | "xl";
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/i;
const SENSITIVE_VALUE_PATTERN = /@|(?:https?:\/\/)|(?:bearer\s)|(?:password)|(?:token)|(?:secret)/i;

export function normalizeAnalyticsRoute(value: string) {
  const rawPath = value.split(/[?#]/, 1)[0]?.trim() || "/";
  const withLeadingSlash = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return withLeadingSlash
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ":id")
    .split("/")
    .map((segment) => {
      if (!segment || segment.startsWith(":")) return segment;
      if (segment.includes("@") || /%40/i.test(segment)) return ":value";
      if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(segment)) return ":site";
      if (/^\d+$/.test(segment) || /^[a-f0-9]{20,}$/i.test(segment) || /^[a-z0-9_-]{32,}$/i.test(segment)) return ":id";
      return segment;
    })
    .join("/")
    .replace(/\/{2,}/g, "/")
    .slice(0, 300);
}

export function analyticsRouteIdentifier(prefix: string, value: string, maxLength = 100) {
  const route = normalizeAnalyticsRoute(value);
  const routeLabel = route
    .split("/")
    .filter(Boolean)
    .join(":")
    .replace(/[^a-z0-9._:-]+/gi, "-")
    .replace(/-+/g, "-") || "root";
  return `${prefix}:${routeLabel}`.slice(0, maxLength);
}

export function extractScanIdFromPath(value: string) {
  const match = value.match(/\/scans\/([0-9a-f-]{36})(?:[/?#]|$)/i);
  const candidate = match?.[1];
  return candidate && UUID_PATTERN.test(candidate) ? candidate : undefined;
}

function optionalIdentifier(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, max);
  if (!normalized || !SAFE_IDENTIFIER_PATTERN.test(normalized) || SENSITIVE_VALUE_PATTERN.test(normalized)) return undefined;
  return normalized;
}

function optionalCampaign(value: unknown, max: number) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().slice(0, max);
  if (!normalized || SENSITIVE_VALUE_PATTERN.test(normalized)) return undefined;
  return /^[a-z0-9 _./+-]+$/i.test(normalized) ? normalized : undefined;
}

export function parseProductAnalyticsPayload(value: unknown): ProductAnalyticsPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (!PRODUCT_ANALYTICS_EVENT_NAMES.includes(input.eventName as ProductAnalyticsEventName)) return null;
  const categories: ProductAnalyticsCategory[] = ["navigation", "interaction", "form", "scan", "report", "account", "engagement", "performance", "reliability", "preference"];
  const outcomes: ProductAnalyticsOutcome[] = ["observed", "started", "submitted", "success", "failure", "opted_in", "opted_out"];
  if (!categories.includes(input.category as ProductAnalyticsCategory) || !outcomes.includes(input.outcome as ProductAnalyticsOutcome)) return null;
  const feature = optionalIdentifier(input.feature, 80);
  if (!feature || typeof input.route !== "string") return null;
  const route = normalizeAnalyticsRoute(input.route);
  const uuid = (candidate: unknown) => typeof candidate === "string" && UUID_PATTERN.test(candidate) ? candidate : undefined;
  const boundedNumber = (candidate: unknown, max: number) => typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 && candidate <= max ? candidate : undefined;
  return {
    eventName: input.eventName as ProductAnalyticsEventName,
    category: input.category as ProductAnalyticsCategory,
    outcome: input.outcome as ProductAnalyticsOutcome,
    feature,
    route,
    previousRoute: typeof input.previousRoute === "string" ? normalizeAnalyticsRoute(input.previousRoute) : undefined,
    entryRoute: typeof input.entryRoute === "string" ? normalizeAnalyticsRoute(input.entryRoute) : undefined,
    elementId: optionalIdentifier(input.elementId, 100),
    formId: optionalIdentifier(input.formId, 100),
    sessionId: uuid(input.sessionId),
    actorId: uuid(input.actorId),
    scanId: uuid(input.scanId),
    campaignSource: optionalCampaign(input.campaignSource, 80),
    campaignMedium: optionalCampaign(input.campaignMedium, 80),
    campaignName: optionalCampaign(input.campaignName, 120),
    durationMs: boundedNumber(input.durationMs, 3_600_000),
    numericValue: boundedNumber(input.numericValue, 10_000_000),
    language: typeof input.language === "string" && /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(input.language) ? input.language : undefined,
    viewportBand: ["xs", "sm", "md", "lg", "xl"].includes(String(input.viewportBand)) ? input.viewportBand as ProductAnalyticsPayload["viewportBand"] : undefined
  };
}
