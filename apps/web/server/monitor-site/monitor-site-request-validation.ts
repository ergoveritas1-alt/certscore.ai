const MONITORING_GOALS = new Set([
  "changes",
  "pre-consent-tracking",
  "cookies",
  "accessibility",
  "vendor-review"
]);

export type MonitorSiteRequestInput = {
  company: string | null;
  fullName: string | null;
  monitoringGoal: string;
  notes: string | null;
  sourceContext: string | null;
  sourcePageUrl: string | null;
  sourcePlan: string | null;
  sourceReportUrl: string | null;
  website: string;
  workEmail: string;
};

export type MonitorSiteRequestValidationResult =
  | {
      ok: true;
      value: MonitorSiteRequestInput & {
        normalizedHostname: string;
      };
    }
  | {
      ok: false;
      error: string;
    };

function compact(value: FormDataEntryValue | null, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function nullableCompact(value: FormDataEntryValue | null, maxLength: number) {
  const compacted = compact(value, maxLength);
  return compacted.length > 0 ? compacted : null;
}

function normalizeEmail(value: string) {
  return value.toLowerCase();
}

function isProbablyEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function normalizeWebsiteHostname(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return hostname.length > 0 ? hostname : null;
  } catch {
    return null;
  }
}

function normalizeSafeUrl(value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString().slice(0, 1000);
  } catch {
    return null;
  }
}

function normalizeSourcePlan(value: string | null) {
  if (!value) {
    return null;
  }

  return ["individual", "pro", "ultra", "enterprise"].includes(value) ? value : null;
}

export function validateMonitorSiteRequestForm(formData: FormData): MonitorSiteRequestValidationResult {
  const honeypot = compact(formData.get("companyWebsite"), 200);
  if (honeypot) {
    return { ok: false, error: "Monitoring request could not be submitted." };
  }

  const workEmail = normalizeEmail(compact(formData.get("workEmail"), 320));
  const website = compact(formData.get("website"), 300);
  const normalizedHostname = normalizeWebsiteHostname(website);
  const requestedGoal = compact(formData.get("monitoringGoal"), 80);
  const monitoringGoal = MONITORING_GOALS.has(requestedGoal) ? requestedGoal : "changes";

  if (!workEmail) {
    return { ok: false, error: "Work email is required." };
  }

  if (!isProbablyEmail(workEmail)) {
    return { ok: false, error: "Enter a valid work email." };
  }

  if (!website || !normalizedHostname) {
    return { ok: false, error: "Website is required for monitoring interest." };
  }

  return {
    ok: true,
    value: {
      company: nullableCompact(formData.get("company"), 200),
      fullName: nullableCompact(formData.get("fullName"), 200),
      monitoringGoal,
      normalizedHostname,
      notes: nullableCompact(formData.get("message"), 2000),
      sourceContext: nullableCompact(formData.get("sourceContext"), 120),
      sourcePageUrl: normalizeSafeUrl(nullableCompact(formData.get("sourcePageUrl"), 1000)),
      sourcePlan: normalizeSourcePlan(nullableCompact(formData.get("sourcePlan"), 80)),
      sourceReportUrl: normalizeSafeUrl(nullableCompact(formData.get("sourceReportUrl"), 1000)),
      website,
      workEmail
    }
  };
}
