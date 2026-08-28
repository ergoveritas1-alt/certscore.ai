import { createHash } from "node:crypto";
import { anonymousRequesterNetwork, type AnonymousRequesterNetwork } from "@website-signal-risk-scanner/shared";
import { getTrustedRequestSourceIp } from "../../lib/request-source-ip";
import { shouldUseLocalV2DagScanTool } from "./local-v2-dag-scan-config";

export type ScanRequesterIpContext = {
  anonymousMcpSurface?: "mcp_light" | "mcp_anonymous" | null;
  anonymousMcpSessionHash?: string | null;
  anonymousRequesterNetwork?: AnonymousRequesterNetwork;
  ipHash: string | null;
  sourceIp: string | null;
};

export function getScanRequesterIpContext(headers: Pick<Headers, "get">): ScanRequesterIpContext {
  if (shouldUseLocalV2DagScanTool()) {
    return { anonymousMcpSurface: null, anonymousMcpSessionHash: null, anonymousRequesterNetwork: "unknown", ipHash: null, sourceIp: null };
  }
  const sourceIp = getTrustedRequestSourceIp(headers)?.slice(0, 120) ?? null;

  return {
    anonymousMcpSurface: null,
    anonymousMcpSessionHash: null,
    anonymousRequesterNetwork: anonymousRequesterNetwork(sourceIp),
    ipHash: sourceIp ? createHash("sha256").update(sourceIp).digest("hex") : null,
    sourceIp
  };
}

export function normalizeScanRequesterIpContext(
  value: Partial<ScanRequesterIpContext> | null | undefined
): ScanRequesterIpContext {
  const sourceIp = value?.sourceIp?.trim().slice(0, 120) || null;
  const ipHash = value?.ipHash?.trim().slice(0, 128) || (sourceIp
    ? createHash("sha256").update(sourceIp).digest("hex")
    : null);
  const anonymousMcpSurface = value?.anonymousMcpSurface === "mcp_light" || value?.anonymousMcpSurface === "mcp_anonymous"
    ? value.anonymousMcpSurface
    : null;
  return {
    anonymousMcpSurface,
    anonymousMcpSessionHash: value?.anonymousMcpSessionHash?.trim().slice(0, 128) || null,
    anonymousRequesterNetwork: value?.anonymousRequesterNetwork ?? anonymousRequesterNetwork(sourceIp),
    ipHash,
    sourceIp
  };
}
