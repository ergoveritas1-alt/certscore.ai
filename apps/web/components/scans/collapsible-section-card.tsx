import { Card, cn } from "@website-signal-risk-scanner/ui";
import React, { type ReactNode } from "react";

type CollapsibleSectionCardProps = {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  subtitle?: ReactNode;
  showChevron?: boolean;
  className?: string;
  contentClassName?: string;
  summaryClassName?: string;
};

function DisclosureChevron() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
      <path d="M7 4L13 10L7 16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" />
    </svg>
  );
}

export function CollapsibleSectionCard({
  title,
  children,
  defaultOpen = false,
  subtitle,
  showChevron = true,
  className,
  contentClassName,
  summaryClassName
}: CollapsibleSectionCardProps) {
  return (
    <Card className={cn("border border-slate-200 bg-white", className)}>
      <details suppressHydrationWarning className="group/section" {...(defaultOpen ? { open: true } : {})}>
        <summary
          className={cn(
            "flex cursor-pointer list-none items-start gap-3 px-6 py-5 marker:hidden [&::-webkit-details-marker]:hidden",
            summaryClassName
          )}
        >
          {showChevron ? (
            <span aria-hidden="true" className="mt-0.5 inline-flex shrink-0 text-slate-400 transition-transform duration-150 group-open/section:rotate-90">
              <DisclosureChevron />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900">{title}</p>
            {subtitle ? <div className="mt-1 text-sm text-slate-500">{subtitle}</div> : null}
          </div>
        </summary>
        <div className={cn("px-6 pb-6 pt-0", contentClassName)}>{children}</div>
      </details>
    </Card>
  );
}
