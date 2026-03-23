import React, { type ReactNode } from "react";

type InfoTipProps = {
  text: ReactNode;
  className?: string;
  align?: "center" | "start" | "end";
  placement?: "top" | "bottom";
};

function getTooltipAlignmentClassName(align: InfoTipProps["align"]) {
  if (align === "start") {
    return "left-0 translate-x-0";
  }

  if (align === "end") {
    return "right-0 translate-x-0";
  }

  return "left-1/2 -translate-x-1/2";
}

function getTooltipPlacementClassName(placement: InfoTipProps["placement"]) {
  if (placement === "bottom") {
    return "top-full mt-2";
  }

  return "bottom-full mb-2";
}

export function InfoTip({ text, className, align = "center", placement = "top" }: InfoTipProps) {
  return (
    <span className={`group/tooltip relative inline-flex ${className ?? ""}`}>
      <span className="inline-flex h-[11px] w-[11px] items-center justify-center rounded-full border border-slate-300 text-[7px] font-semibold leading-none text-slate-500">
        i
      </span>
      <span
        className={`pointer-events-none absolute z-20 hidden w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] normal-case tracking-normal text-slate-600 shadow-lg group-hover/tooltip:block ${getTooltipPlacementClassName(
          placement
        )} ${getTooltipAlignmentClassName(
          align
        )}`}
      >
        {text}
      </span>
    </span>
  );
}
