import {createHash} from 'node:crypto';

const sha256Pattern = /^[0-9a-f]{64}$/;

/** The coordinator writes this summary only after verifying the receipt
 * against the checksum-bound joined packet, without requiring a passive gate. */
export function retainedWorkerDiscoveredClick(manifest, scanId, action) {
 if (action !== 'accept' && action !== 'reject') return false;
 const bundle = manifest.workerDiscoveredClicks;
 const receipt = bundle?.[action];
 const packet = manifest.artifactMetadata?.[action === 'accept' ? 'postAcceptPacketUri' : 'postRefusalPacketUri'];
 const packetUri = manifest.pointers?.[action === 'accept' ? 'postAcceptPacketUri' : 'postRefusalPacketUri'];
 if(manifest.scanId !== scanId || manifest.targetEnvironment !== 'production' || !receipt ||
    receipt.version !== 'certscore.worker-discovered-click.v1' || receipt.scanId !== scanId || receipt.action !== action ||
    receipt.parentDispatchSha256 !== bundle.parentDispatchSha256 || !packet || receipt.packetSha256 !== packet.sha256 ||
    manifest.laneTimingSummary?.[action + 'LaneJoin'] !== 'joined' ||
    !Number.isSafeInteger(packet.sizeBytes) || packet.sizeBytes <= 0 ||
    typeof packetUri !== 'string' || !packetUri.startsWith('s3://') ||
    !packetUri.endsWith(`/${scanId}/lanes/${action}_observation/${action === 'accept' ? 'PostAccept' : 'PostRefusal'}EvidencePacket.json`) ||
    ![receipt.parentDispatchSha256, receipt.packetSha256, receipt.receiptSha256, receipt.controlSha256]
     .every(value => typeof value === 'string' && sha256Pattern.test(value))) return false;
 try {
  const target = new URL(manifest.targetUrl);
  target.hash = '';
  if(receipt.requestedTargetSha256 !== createHash('sha256').update(target.href).digest('hex')) return false;
 } catch { return false; }
 const {workerDispatchedAtMs,recheckedAtMs,dispatchedAtMs,completedAtMs,deadlineAtMs,verifiedAtMs,reserveMs} = receipt;
 return [workerDispatchedAtMs,recheckedAtMs,dispatchedAtMs,completedAtMs,deadlineAtMs,verifiedAtMs,reserveMs]
  .every(value => Number.isSafeInteger(value) && value > 0) &&
  workerDispatchedAtMs <= recheckedAtMs && recheckedAtMs <= dispatchedAtMs && dispatchedAtMs <= completedAtMs &&
  completedAtMs <= verifiedAtMs && reserveMs === deadlineAtMs - completedAtMs && reserveMs >= 200;
}
