import { createHash } from "node:crypto";
import { getTrustedRequestSourceIp } from "../../lib/request-source-ip";
import { shouldUseLocalV2DagScanTool } from "./local-v2-dag-scan-config";

export type ScanRequesterIpContext = {
  ipHash: string | null;
  sourceIp: string | null;
};

export function getScanRequesterIpContext(headers: Pick<Headers, "get">): ScanRequesterIpContext {
  if (shouldUseLocalV2DagScanTool()) {
    return { ipHash: null, sourceIp: null };
  }
  const sourceIp = getTrustedRequestSourceIp(headers)?.slice(0, 120) ?? null;

  return {
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
  return { ipHash, sourceIp };
}
