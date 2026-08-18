import { DEFAULT_SCAN_FROM, normalizeScanFrom, type ScanFrom } from "@website-signal-risk-scanner/shared";
import { parsePlatformAdminEmails } from "../admin/platform-admin-core";
import { shouldUseLocalhostFullScanQueue, type LocalV2DagScanEnv } from "./local-v2-dag-scan-config";

function isPlatformAdminEmail(email: string | null | undefined) {
  return email ? parsePlatformAdminEmails(process.env.CERTSCORE_ADMIN_EMAILS).has(email.toLowerCase()) : false;
}

export function canUseRestrictedScanOptions(input: {
  membershipRole?: string | null;
  userEmail?: string | null;
}) {
  return input.membershipRole === "admin" || isPlatformAdminEmail(input.userEmail ?? null);
}

export function restrictScanFromForUser(input: {
  canUseRestrictedScanOptions: boolean;
  scanFrom: unknown;
}): ScanFrom {
  const scanFrom = normalizeScanFrom(input.scanFrom);
  if (scanFrom === "default") {
    return DEFAULT_SCAN_FROM;
  }
  return scanFrom;
}

export function restrictLocalV2RunViaLambdaForUser(input: {
  canUseRestrictedScanOptions: boolean;
  env?: LocalV2DagScanEnv;
  localV2DagRunViaLambda: boolean | null | undefined;
}) {
  if (input.env?.NODE_ENV === "production" || (!input.env && process.env.NODE_ENV === "production")) {
    return true;
  }

  if (input.canUseRestrictedScanOptions) {
    return input.localV2DagRunViaLambda;
  }

  return shouldUseLocalhostFullScanQueue(input.env) ? false : true;
}
