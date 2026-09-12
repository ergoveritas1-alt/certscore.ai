export type InventorySortRow = { evidence: string; type: string; vendor: string; name: string; purpose: string; firstSeenMs: number | null };
export type InventorySortKey = "default" | "type" | "vendor" | "name" | "purpose" | "firstSeenMs";
const priority: Record<string, number> = { "Non-essential": 0, Review: 1, Contextual: 2, Essential: 3 };

export function inventorySortIndices(rows: InventorySortRow[], key: InventorySortKey = "default", descending = false): number[] {
  const time = (a: InventorySortRow, b: InventorySortRow, reverse = false) => {
    if (a.firstSeenMs === null) return b.firstSeenMs === null ? 0 : 1;
    if (b.firstSeenMs === null) return -1;
    return (a.firstSeenMs - b.firstSeenMs) * (reverse ? -1 : 1);
  };
  return rows.map((_, i) => i).sort((a, b) => {
    const left = rows[a]!, right = rows[b]!;
    const comparison = key === "default"
      ? ((priority[left.evidence] ?? 4) - (priority[right.evidence] ?? 4)) * (descending ? -1 : 1) || time(left, right)
      : key === "firstSeenMs" ? time(left, right, descending)
      : left[key].localeCompare(right[key], "en", { sensitivity: "base", numeric: true }) * (descending ? -1 : 1);
    return comparison || a - b;
  });
}
