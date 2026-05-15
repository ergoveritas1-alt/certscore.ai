import type { FullScanRequestProvenance } from "../../app/api/full-scan/load-test-intake";
import { shouldBypassDnsValidationForProductionLoadTest } from "../../app/api/full-scan/load-test-intake";

export const SCAN_QUEUE_PRIORITIES = {
  preview: 0,
  user: 10,
  scheduled: 20,
  default: 50,
  productionLoadTest: 90
} as const;

export type ScanQueueOrigin = "preview" | "user" | "scheduled" | "production_load_test";

export type ScanQueueMetadata = {
  queueOrigin: ScanQueueOrigin;
  queuePriority: number;
};

export function getPreviewScanQueueMetadata(): ScanQueueMetadata {
  return {
    queueOrigin: "preview",
    queuePriority: SCAN_QUEUE_PRIORITIES.preview
  };
}

export function getFullScanQueueMetadata(input: {
  provenance?: FullScanRequestProvenance | null;
  scanType?: "full" | "scheduled";
}): ScanQueueMetadata {
  if (input.scanType === "scheduled") {
    return {
      queueOrigin: "scheduled",
      queuePriority: SCAN_QUEUE_PRIORITIES.scheduled
    };
  }

  if (input.provenance && shouldBypassDnsValidationForProductionLoadTest(input.provenance)) {
    return {
      queueOrigin: "production_load_test",
      queuePriority: SCAN_QUEUE_PRIORITIES.productionLoadTest
    };
  }

  return {
    queueOrigin: "user",
    queuePriority: SCAN_QUEUE_PRIORITIES.user
  };
}
