import type { ReactNode } from "react";

export const inventoryTilePadding = "px-3 py-3 sm:px-4";
export const inventoryTileDisclosure = `${inventoryTilePadding} block cursor-pointer list-none transition-colors hover:bg-sky-50/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden`;

/** Shared label/value rhythm for static and expandable inventory tiles. */
export function InventoryTileHeading({ label, value, chevron, detail }: { label: string; value: ReactNode; chevron?: ReactNode; detail?: ReactNode }) {
  return <span className="flex min-h-16 min-w-0 flex-col justify-between gap-1 sm:min-h-14">
    <span className="flex items-start justify-between gap-1 text-[11px] font-medium leading-4 text-slate-500 sm:text-xs">
      <span>{label}</span>{chevron ? <span className="shrink-0 text-slate-400">{chevron}</span> : null}
    </span>
    <span className="block text-2xl font-semibold leading-7 tracking-tight text-slate-950 tabular-nums">{value}</span>
    {detail}
  </span>;
}
