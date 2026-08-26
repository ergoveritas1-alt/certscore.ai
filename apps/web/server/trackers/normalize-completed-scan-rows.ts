type NormalizedCompletedScanRow<T extends { completed_at: string | Date }> = Omit<T, "completed_at"> & {
  completed_at: string;
};

export function normalizeCompletedScanRows<T extends { completed_at: string | Date }>(
  rows: T[]
): Array<NormalizedCompletedScanRow<T>> {
  return rows.map((row) => {
    const completedAt = row.completed_at instanceof Date ? row.completed_at : new Date(row.completed_at);

    return {
      ...row,
      completed_at: Number.isFinite(completedAt.getTime()) ? completedAt.toISOString() : String(row.completed_at)
    };
  });
}
