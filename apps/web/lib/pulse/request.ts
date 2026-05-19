import { createHash } from "node:crypto";
import { createDomainRequestSchema } from "@website-signal-risk-scanner/shared";
import type { PulseDetail, PulseFormat, PulseFreshnessMode } from "./types";

export function parsePulseFormat(value: string | null): PulseFormat {
  return value === "markdown" ? "markdown" : "json";
}

export function parsePulseDetail(value: string | null): PulseDetail {
  if (value === "quick") {
    return "tiny";
  }
  if (value === "tiny" || value === "full") {
    return value;
  }
  return "standard";
}

export function parsePulseFreshness(value: string | null): PulseFreshnessMode {
  return value === "refresh" ? "refresh" : "latest";
}

export function parsePulseWaitSeconds(value: string | null) {
  if (!value) {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.min(80, parsed));
}

export function normalizePulseUrl(value: string) {
  const parsed = createDomainRequestSchema.safeParse({ domain: value });
  if (!parsed.success) {
    return {
      ok: false as const,
      message: "Enter a valid public URL or domain."
    };
  }

  return {
    ok: true as const,
    requestedUrl: value,
    normalizedUrl: parsed.data.normalizedUrl,
    normalizedDomain: parsed.data.hostname
  };
}

export function getFirstHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

export function getPulseRequesterContext(request: Request) {
  const headers = request.headers;
  const ip =
    getFirstHeaderValue(headers.get("cf-connecting-ip")) ??
    getFirstHeaderValue(headers.get("x-forwarded-for")) ??
    getFirstHeaderValue(headers.get("x-real-ip"));

  return {
    ipHash: ip ? createHash("sha256").update(ip).digest("hex") : null,
    referer: headers.get("referer")?.slice(0, 500) || null,
    sourceIp: ip?.slice(0, 120) || null,
    userAgent: headers.get("user-agent")?.slice(0, 500) || null
  };
}
