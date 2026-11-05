import { assertScannerArtifact, type ScannerArtifact } from './scanner-artifact';
import { SCANNER_PROVENANCE_REGIONS } from './scanner-image-provenance';
import type { ScannerOperationalSnapshot } from './scanner-configuration-scope';

export type StagedCoupledRelease = {
  version: 1;
  sha: string;
  baseSha: string;
  stagedAt: string;
  webRunId: string;
  webImage: string;
  validation?: { runId: string; image: string };
  scanner: ScannerArtifact;
  scannerSettings: Record<string, ScannerOperationalSnapshot>;
};

export function assertStagedCoupledRelease(
  release: StagedCoupledRelease, sha: string, baseSha: string, now = Date.now(),
) {
  const stagedAt = Date.parse(release?.stagedAt ?? '');
  if (release?.version !== 1 || !/^[a-f0-9]{40}$/.test(sha) || !/^[a-f0-9]{40}$/.test(baseSha) ||
      release.sha !== sha || release.baseSha !== baseSha || !/^[1-9][0-9]{0,15}$/.test(release.webRunId) ||
      !/^[1-9][0-9]{0,5}:sha256:[0-9a-f]{64}$/.test(release.webImage) ||
      !Number.isFinite(stagedAt) || stagedAt > now || now - stagedAt > 24 * 60 * 60_000 ||
      release.scanner?.runtimeBase !== 'reused') throw new Error('Staged release does not match the exact, recent, warm release.');
  if (release.validation !== undefined && (!release.validation ||
      !/^[1-9][0-9]{0,15}$/.test(release.validation.runId) ||
      !/^[1-9][0-9]{0,5}:sha256:[0-9a-f]{64}$/.test(release.validation.image))) {
    throw new Error('Staged release validation image is invalid.');
  }
  assertScannerArtifact(release.scanner, sha);
  const names = SCANNER_PROVENANCE_REGIONS.flatMap(region =>
    [`${region}/certscore-v2-dag-local-lambda`, `${region}/certscore-v2-dag-local-lambda-inventory`]);
  const snapshots = release.scannerSettings;
  if (!snapshots || Object.keys(snapshots).length !== names.length || names.some(name => {
    const snapshot = snapshots[name];
    return !snapshot || snapshot.memoryMb !== 3008 || !Number.isInteger(snapshot.timeoutSeconds) ||
      snapshot.timeoutSeconds < 1 || snapshot.timeoutSeconds > 900 ||
      !/^[0-9a-f]{64}$/.test(snapshot.environmentSha256);
  })) throw new Error('Staged release is missing the six scanner settings snapshots.');
}
