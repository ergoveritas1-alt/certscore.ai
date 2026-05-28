import { Card, cn } from "@website-signal-risk-scanner/ui";
import React, { type ReactNode } from "react";
import { ScanReportDisclosureIcon } from "./scan-report-disclosure-icon";

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
            "flex cursor-pointer list-none items-start gap-3 px-6 py-5 transition-colors hover:bg-slate-100/70 marker:hidden [&::-webkit-details-marker]:hidden",
            summaryClassName
          )}
        >
          {showChevron ? (
            <ScanReportDisclosureIcon className="mt-0.5 group-open/section:rotate-90" />
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
