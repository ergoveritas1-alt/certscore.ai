import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createDomainRequestSchema } from "@website-signal-risk-scanner/shared";
import type { PulseDetail, PulseFormat, PulseFreshnessMode } from "./types";

export function parsePulseFormat(value: string | null): PulseFormat {
  return value === "markdown" ? "markdown" : "json";
}

export function parsePulseDetail(value: string | null): PulseDetail {
  if (value === "quick") {
    return "tiny";
  }
  if (value === "tiny" || value === "standard" || value === "full" || value === "summary" || value === "evidence") {
    return value;
  }
  return "summary";
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

const ANONYMOUS_REQUESTER_PROOF_MAX_SKEW_SECONDS = 300;

function verifiedAnonymousMcpRequesterIp(headers: Headers) {
  const ip = headers.get("x-certscore-anonymous-requester-ip")?.trim() || null;
  const timestamp = headers.get("x-certscore-anonymous-requester-timestamp")?.trim() || null;
  const proof = headers.get("x-certscore-anonymous-requester-proof")?.trim() || null;
  const secret = process.env.CERTSCORE_OAUTH_JWT_SECRET?.trim() || process.env.JWT_SIGNING_KEY?.trim();
  if (!ip || !timestamp || !proof || !secret || !/^\d{1,12}$/.test(timestamp)) {
    return null;
  }
  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > ANONYMOUS_REQUESTER_PROOF_MAX_SKEW_SECONDS) {
    return null;
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${ip}`).digest("base64url");
  const expectedBuffer = Buffer.from(expected);
  const proofBuffer = Buffer.from(proof);
  if (expectedBuffer.length !== proofBuffer.length || !timingSafeEqual(expectedBuffer, proofBuffer)) {
    return null;
  }
  return ip;
}

export function getPulseRequesterContext(request: Request) {
  const headers = request.headers;
  const ip = verifiedAnonymousMcpRequesterIp(headers) ??
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
