import "server-only";

import { query } from "@website-signal-risk-scanner/db";
import { requirePlatformAdminContext } from "./platform-admin";

export type AdminScanLiveTarget = {
  id: string;
  kind: "request" | "scan";
  status: string;
};

type ScanStatusRow = {
  id: string;
  status: string;
};

type RequestStatusRow = {
  public_id: string;
  status: string;
};

const ACTIVE_STATUSES = new Set(["queued", "running", "finalizing"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildAdminScanStatusFingerprint(targets: AdminScanLiveTarget[]) {
  return targets
    .map((target) => `${target.kind}:${target.id}:${target.status}`)
    .sort()
    .join("|");
}

export function hasActiveAdminScanTargets(targets: AdminScanLiveTarget[]) {
  return targets.some((target) => ACTIVE_STATUSES.has(target.status));
}

export async function getAdminScanLiveStatus(targets: AdminScanLiveTarget[]) {
  await requirePlatformAdminContext();
  const boundedTargets = targets
    .filter((target) => target && typeof target.id === "string" && typeof target.status === "string")
    .slice(0, 100);
  const scanIds = [...new Set(
    boundedTargets
      .filter((target) => target.kind === "scan" && UUID_PATTERN.test(target.id))
      .map((target) => target.id)
  )];
  const requestIds = [...new Set(
    boundedTargets
      .filter((target) => target.kind === "request")
      .map((target) => target.id.trim().slice(0, 160))
      .filter(Boolean)
  )];
  const [scanRows, requestRows] = await Promise.all([
    scanIds.length
      ? query<ScanStatusRow>(
          `select id::text, status
             from scans
            where id = any($1::uuid[])`,
          [scanIds],
          { readOnly: true }
        ).then((result) => result.rows)
      : Promise.resolve([]),
    requestIds.length
      ? query<RequestStatusRow>(
          `select public_id,
                  status
             from scan_requests
            where public_id = any($1::text[])`,
          [requestIds],
          { readOnly: true }
        ).then((result) => result.rows)
      : Promise.resolve([])
  ]);
  const scanStatusById = new Map(scanRows.map((row) => [row.id, row.status] as const));
  const requestStatusById = new Map(requestRows.map((row) => [row.public_id, row.status] as const));
  const currentTargets = boundedTargets.map((target) => ({
    ...target,
    status: target.kind === "scan"
      ? scanStatusById.get(target.id) ?? "missing"
      : requestStatusById.get(target.id) ?? "missing"
  }));

  return {
    fingerprint: buildAdminScanStatusFingerprint(currentTargets),
    hasActiveScans: hasActiveAdminScanTargets(currentTargets),
    targets: currentTargets
  };
}
