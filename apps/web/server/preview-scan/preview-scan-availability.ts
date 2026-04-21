import { getFullScanQueueAvailability } from "../queue/full-scan-queue";

export async function getPreviewScanAvailability(input?: {
  getQueueAvailability?: typeof getFullScanQueueAvailability;
}) {
  const getQueueAvailability = input?.getQueueAvailability ?? getFullScanQueueAvailability;
  const availability = await getQueueAvailability();

  if (!availability.enabled) {
    return {
      enabled: false as const,
      reason: availability.reason
    };
  }

  return {
    enabled: true as const,
    reason: null as string | null
  };
}
