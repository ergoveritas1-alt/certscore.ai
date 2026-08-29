import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  anonymousRequesterNetwork,
  createDomainRequestSchema,
  getDomainValidationReasonCode
} from "@website-signal-risk-scanner/shared";
import { getTrustedRequestSourceIp, normalizeRequestSourceIp } from "../request-source-ip";
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
      message: "Enter a valid public URL or domain.",
      reasonCode: getDomainValidationReasonCode(parsed.error)
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

type AnonymousMcpSurface = "mcp_light" | "mcp_anonymous";
type InternalMcpOperation = "scan_site_wait" | "scan_status" | "scan_bundle";

function safeProofEqual(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function freshProofTimestamp(timestamp: string | null) {
  if (!timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(Date.now() / 1000);
  return Number.isSafeInteger(timestampSeconds) && Math.abs(nowSeconds - timestampSeconds) <= ANONYMOUS_REQUESTER_PROOF_MAX_SKEW_SECONDS;
}

function verifiedAnonymousMcpRequester(headers: Headers) {
  const ip = headers.get("x-certscore-anonymous-requester-ip")?.trim() || null;
  const timestamp = headers.get("x-certscore-anonymous-requester-timestamp")?.trim() || null;
  const proof = headers.get("x-certscore-anonymous-requester-proof")?.trim() || null;
  const surfaceValue = headers.get("x-certscore-anonymous-surface")?.trim() || null;
  const sessionBindingValue = headers.get("x-certscore-anonymous-requester-session")?.trim() || null;
  const sessionBinding = sessionBindingValue && /^[A-Za-z0-9_-]{16,128}$/.test(sessionBindingValue)
    ? sessionBindingValue
    : null;
  const surface: AnonymousMcpSurface | null = surfaceValue === "mcp_light" || surfaceValue === "mcp_anonymous" ? surfaceValue : null;
  const secret = process.env.CERTSCORE_OAUTH_JWT_SECRET?.trim() || process.env.JWT_SIGNING_KEY?.trim();
  if (!ip || !timestamp || !proof || !secret || (surfaceValue && !surface) || (sessionBindingValue && !sessionBinding) || !freshProofTimestamp(timestamp)) {
    return null;
  }
  const expected = createHmac("sha256", secret)
    .update(sessionBinding
      ? `${timestamp}.${ip}.${surface ?? "mcp_anonymous"}.${sessionBinding}`
      : surface ? `${timestamp}.${ip}.${surface}` : `${timestamp}.${ip}`)
    .digest("base64url");
  if (!safeProofEqual(expected, proof)) {
    return null;
  }
  const normalizedIp = normalizeRequestSourceIp(ip);
  return normalizedIp ? {
    ip: normalizedIp,
    sessionHash: sessionBinding ? createHash("sha256").update(sessionBinding).digest("hex") : null,
    surface: surface ?? "mcp_anonymous"
  } : null;
}

export function trustedMcpInternalRead(request: Request, expected: {
  operations: readonly InternalMcpOperation[];
  scanId?: string;
}) {
  const requester = verifiedAnonymousMcpRequester(request.headers);
  const authenticatedBearer = /^Bearer\s+\S+$/i.test(request.headers.get("authorization")?.trim() ?? "");
  if (requester?.surface !== "mcp_light" && !authenticatedBearer) return null;
  const operation = request.headers.get("x-certscore-mcp-internal-operation")?.trim() as InternalMcpOperation | null;
  const scanId = request.headers.get("x-certscore-mcp-internal-scan-id")?.trim() || null;
  const proof = request.headers.get("x-certscore-mcp-internal-proof")?.trim() || null;
  const timestamp = request.headers.get("x-certscore-mcp-internal-timestamp")?.trim()
    || request.headers.get("x-certscore-anonymous-requester-timestamp")?.trim()
    || null;
  const secret = process.env.CERTSCORE_OAUTH_JWT_SECRET?.trim() || process.env.JWT_SIGNING_KEY?.trim();
  if (!operation || !expected.operations.includes(operation) || !scanId || !proof || !freshProofTimestamp(timestamp) || !secret) return null;
  if (expected.scanId && scanId !== expected.scanId) return null;
  const url = new URL(request.url);
  const target = `${url.pathname}${url.search}`;
  const message = `${timestamp}.${operation}.${scanId}.${request.method}.${target}`;
  const expectedProof = createHmac("sha256", secret).update(message).digest("base64url");
  return safeProofEqual(expectedProof, proof) ? { operation, scanId } : null;
}

export function getPulseRequesterContext(request: Request) {
  const headers = request.headers;
  const verifiedMcp = verifiedAnonymousMcpRequester(headers);
  const ip = verifiedMcp?.ip ?? getTrustedRequestSourceIp(headers);

  return {
    anonymousMcpSurface: verifiedMcp?.surface ?? null,
    anonymousMcpSessionHash: verifiedMcp?.sessionHash ?? null,
    anonymousRequesterNetwork: anonymousRequesterNetwork(ip),
    ipHash: ip ? createHash("sha256").update(ip).digest("hex") : null,
    referer: headers.get("referer")?.slice(0, 500) || null,
    sourceIp: ip?.slice(0, 120) || null,
    userAgent: headers.get("user-agent")?.slice(0, 500) || null
  };
}
