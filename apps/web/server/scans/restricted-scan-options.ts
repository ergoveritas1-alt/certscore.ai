import { normalizeScanFrom, type ScanFrom } from "@website-signal-risk-scanner/shared";
import { parsePlatformAdminEmails } from "../admin/platform-admin-core";

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
  return !input.canUseRestrictedScanOptions && scanFrom === "eu_de" ? "eu_ie" : scanFrom;
}

export function restrictLocalV2RunViaLambdaForUser(input: {
  canUseRestrictedScanOptions: boolean;
  localV2DagRunViaLambda: boolean | null | undefined;
}) {
  return input.canUseRestrictedScanOptions ? input.localV2DagRunViaLambda : true;
}
