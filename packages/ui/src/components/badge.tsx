import type { HTMLAttributes } from "react";
import { cn } from "../lib/cn";

const tones = {
  info: "bg-sky-100 text-sky-900",
  neutral: "bg-slate-100 text-slate-700",
  warning: "bg-amber-100 text-amber-900",
  success: "bg-emerald-100 text-emerald-900"
} as const;

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: keyof typeof tones;
};

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}
