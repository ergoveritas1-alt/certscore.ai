import { normalizeScanFrom, type ScanFrom } from "@website-signal-risk-scanner/shared";
import { parsePlatformAdminEmails } from "../admin/platform-admin-core";
import type { LocalV2DagScanEnv } from "./local-v2-dag-scan-config";

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
  void input.canUseRestrictedScanOptions;
  return normalizeScanFrom(input.scanFrom);
}

export function restrictLocalV2RunViaLambdaForUser(input: {
  canUseRestrictedScanOptions: boolean;
  env?: LocalV2DagScanEnv;
  localV2DagRunViaLambda: boolean | null | undefined;
}) {
  if (input.canUseRestrictedScanOptions) {
    return input.localV2DagRunViaLambda;
  }

  return false;
}
