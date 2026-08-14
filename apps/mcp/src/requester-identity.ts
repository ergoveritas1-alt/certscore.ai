import shared from "@website-signal-risk-scanner/shared";
import type { AnonymousRequesterNetwork } from "@website-signal-risk-scanner/shared";
import type { CertScoreAccessTokenClaims } from "@certscore/mcp-auth";
import type { IncomingMessage } from "node:http";

const { anonymousRequesterNetwork, getTrustedRequestSourceIp } = shared;

type McpRequestHeaders = Record<string, string | string[] | undefined>;

function requestHeaders(sourceHeaders: McpRequestHeaders) {
  const normalizedHeaders = new Headers();
  for (const [name, value] of Object.entries(sourceHeaders)) {
    if (Array.isArray(value)) {
      for (const item of value) normalizedHeaders.append(name, item);
    } else if (value !== undefined) {
      normalizedHeaders.set(name, value);
    }
  }
  return normalizedHeaders;
}

export type AnonymousMcpRequester = {
  ip: string | null;
  network: AnonymousRequesterNetwork;
};

export function anonymousMcpRequesterFromHeaders(headers: McpRequestHeaders): AnonymousMcpRequester {
  const ip = getTrustedRequestSourceIp(requestHeaders(headers));
  return { ip, network: anonymousRequesterNetwork(ip) };
}

export function anonymousMcpRequester(req: IncomingMessage): AnonymousMcpRequester {
  return anonymousMcpRequesterFromHeaders(req.headers);
}

export function anonymousSessionBinding(requester: AnonymousMcpRequester) {
  return requester.network === "anthropic"
    ? "anonymous-provider:anthropic"
    : `anonymous:${requester.ip ?? "unknown-requester"}`;
}

export function authenticatedMcpCallerBinding(claims: Pick<CertScoreAccessTokenClaims, "iss" | "sub">) {
  return `authenticated-oauth:${claims.iss}:${claims.sub}`;
}
