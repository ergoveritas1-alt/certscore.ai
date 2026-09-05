import React from "react";

export function InventoryConfidenceDots({ confidence, description }: { confidence: string | number; description?: string }) {
  const normalized = typeof confidence === "number" ? (confidence >= 0.9 ? "high" : confidence >= 0.7 ? "medium" : "low") : confidence.toLowerCase();
  const level = normalized.includes("high") ? 3 : normalized.includes("medium") ? 2 : normalized.includes("low") ? 1 : 0;
  const label = level === 3 ? "High" : level === 2 ? "Medium" : level === 1 ? "Low" : "Not retained";
  return (
    <span aria-label={description ?? `Confidence: ${label}`} className="inline-flex items-center gap-1" title={description ?? `Confidence: ${label}`}>
      {[1, 2, 3].map((dot) => (
        <span className={`h-2 w-2 rounded-full border border-slate-300 ${dot <= level ? "bg-slate-500" : "bg-white"}`} key={dot} />
      ))}
    </span>
  );
}

function inventoryPurposeClasses(purpose: string) {
  const normalized = purpose.toLowerCase();
  if (/advert|marketing|retarget/.test(normalized)) return "bg-rose-100 text-rose-800";
  if (/analytic|audience|measurement|experiment/.test(normalized)) return "bg-amber-100 text-amber-800";
  if (/auth|security|fraud|functional/.test(normalized)) return "bg-emerald-100 text-emerald-800";
  if (/consent|privacy|compliance/.test(normalized)) return "bg-sky-100 text-sky-800";
  if (/embed|media|social/.test(normalized)) return "bg-violet-100 text-violet-800";
  if (/cdn|static|font|delivery/.test(normalized)) return "bg-blue-100 text-blue-800";
  return "bg-zinc-100 text-zinc-700";
}

export function InventoryPurposeChip({ purpose }: { purpose: string }) {
  return (
    <span
      className={`inline-flex h-6 max-w-full min-w-0 items-center rounded-md px-2 text-[0.67rem] font-semibold ${inventoryPurposeClasses(purpose)}`}
      title={purpose}
    >
      <span className="min-w-0 truncate whitespace-nowrap leading-4">{purpose}</span>
    </span>
  );
}


