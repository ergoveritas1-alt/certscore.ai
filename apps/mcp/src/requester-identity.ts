import shared from "@website-signal-risk-scanner/shared";
import type { AnonymousRequesterNetwork } from "@website-signal-risk-scanner/shared";
import type { CertScoreAccessTokenClaims } from "@certscore/mcp-auth";
import type { IncomingMessage } from "node:http";

const { anonymousRequesterNetwork, getTrustedRequestSourceIp } = shared;

function requestHeaders(req: IncomingMessage) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

export type AnonymousMcpRequester = {
  ip: string | null;
  network: AnonymousRequesterNetwork;
};

export function anonymousMcpRequester(req: IncomingMessage): AnonymousMcpRequester {
  const ip = getTrustedRequestSourceIp(requestHeaders(req));
  return { ip, network: anonymousRequesterNetwork(ip) };
}

export function anonymousSessionBinding(requester: AnonymousMcpRequester) {
  return requester.network === "anthropic"
    ? "anonymous-provider:anthropic"
    : `anonymous:${requester.ip ?? "unknown-requester"}`;
}

export function authenticatedMcpCallerBinding(claims: Pick<CertScoreAccessTokenClaims, "iss" | "sub">) {
  return `authenticated-oauth:${claims.iss}:${claims.sub}`;
}
