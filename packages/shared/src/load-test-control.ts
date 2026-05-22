export const PRODUCTION_LOAD_TEST_BATCH_ID_PATTERN =
  /^prod-manifest-(\d+)-(\d+)-load-test-(\d{8})-(\d{4})$/;

export type ProductionLoadTestBatchIdParts = {
  batchId: string;
  end: number;
  start: number;
  timestamp: string;
};

export function parseProductionLoadTestBatchId(batchId: string): ProductionLoadTestBatchIdParts | null {
  const match = PRODUCTION_LOAD_TEST_BATCH_ID_PATTERN.exec(batchId);
  if (!match) {
    return null;
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end < start) {
    return null;
  }

  return {
    batchId,
    end,
    start,
    timestamp: `${match[3]}-${match[4]}`
  };
}

export function isProductionLoadTestBatchId(batchId: string) {
  return parseProductionLoadTestBatchId(batchId) !== null;
}

export function buildProductionLoadTestBatchId(input: {
  end: number;
  now?: Date;
  start: number;
}) {
  if (!Number.isInteger(input.start) || !Number.isInteger(input.end) || input.start <= 0 || input.end < input.start) {
    throw new Error(`Invalid production load-test range: ${input.start}-${input.end}`);
  }

  const now = input.now ?? new Date();
  const timestamp = now.toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
  return `prod-manifest-${input.start}-${input.end}-load-test-${timestamp}`;
}

export function buildProductionLoadTestSource(input: {
  batchId: string;
  domain: string;
  manifestRow: string | number;
  trancoGenerated: string;
  trancoList: string;
  trancoRank: string | number;
}) {
  if (!isProductionLoadTestBatchId(input.batchId)) {
    throw new Error(`Invalid production load-test batch id: ${input.batchId}`);
  }

  return [
    input.batchId,
    `manifest_row=${input.manifestRow}`,
    `tranco_rank=${input.trancoRank}`,
    `tranco_list=${input.trancoList}`,
    `tranco_generated=${input.trancoGenerated}`,
    `domain=${input.domain}`
  ].join(";");
}
