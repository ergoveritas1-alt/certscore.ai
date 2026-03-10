import type { ReactNode } from "react";

export function InfoTip({ text, className }: { text: ReactNode; className?: string }) {
  return (
    <span className={`group/tooltip relative inline-flex ${className ?? ""}`}>
      <span className="inline-flex h-[11px] w-[11px] items-center justify-center rounded-full border border-slate-300 text-[7px] font-semibold leading-none text-slate-500">
        i
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-56 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] normal-case tracking-normal text-slate-600 shadow-lg group-hover/tooltip:block">
        {text}
      </span>
    </span>
  );
}
