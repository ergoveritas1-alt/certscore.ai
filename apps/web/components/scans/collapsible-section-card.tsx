import { Card, cn } from "@website-signal-risk-scanner/ui";
import React, { type ReactNode } from "react";
import { ScanReportDisclosureIcon } from "./scan-report-disclosure-icon";

type CollapsibleSectionCardProps = {
  title: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
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
  collapsible = true,
  defaultOpen = false,
  subtitle,
  showChevron = true,
  className,
  contentClassName,
  summaryClassName
}: CollapsibleSectionCardProps) {
  if (!collapsible) {
    return (
      <Card className={cn("border border-slate-200 bg-white", className)}>
        <div
          className={cn(
            "flex items-start gap-3 px-4 py-4 sm:px-6 sm:py-5",
            summaryClassName
          )}
        >
          {showChevron ? <ScanReportDisclosureIcon className="mt-0.5" /> : null}
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900">{title}</div>
            {subtitle ? <div className="mt-1 text-sm text-slate-500">{subtitle}</div> : null}
          </div>
        </div>
        <div className={cn("px-4 pb-5 pt-0 sm:px-6 sm:pb-6", contentClassName)}>{children}</div>
      </Card>
    );
  }

  return (
    <Card className={cn("border border-slate-200 bg-white", className)}>
      <details suppressHydrationWarning className="group/section" {...(defaultOpen ? { open: true } : {})}>
        <summary
          className={cn(
            "flex cursor-pointer list-none items-start gap-3 px-4 py-4 sm:px-6 sm:py-5 marker:hidden [&::-webkit-details-marker]:hidden",
            summaryClassName
          )}
        >
          {showChevron ? (
            <ScanReportDisclosureIcon className="mt-0.5 group-open/section:rotate-90" />
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900">{title}</div>
            {subtitle ? <div className="mt-1 text-sm text-slate-500">{subtitle}</div> : null}
          </div>
        </summary>
        <div className={cn("px-4 pb-5 pt-0 sm:px-6 sm:pb-6", contentClassName)}>{children}</div>
      </details>
    </Card>
  );
}
