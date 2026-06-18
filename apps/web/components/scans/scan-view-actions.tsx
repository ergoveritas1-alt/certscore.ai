import Link from "next/link";
import { RescanDomainForm } from "./rescan-domain-form";
import type { ServerScanFrom } from "./scan-from-select";

type ScanViewActionsProps = {
  alternateHref?: string | null;
  alternateLabel?: string | null;
  canRescan: boolean;
  cooldownMessage?: string | null;
  defaultScanFrom?: ServerScanFrom;
  domainId?: string | null;
  rescanDisabled?: boolean;
};

function getLinkClassName() {
  return "inline-flex h-8 items-center justify-center rounded-full border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 shadow-sm hover:border-slate-400 hover:text-slate-950";
}

export function ScanViewActions({
  alternateHref,
  alternateLabel,
  canRescan,
  cooldownMessage = null,
  defaultScanFrom = "eu_ie",
  domainId = null,
  rescanDisabled = false
}: ScanViewActionsProps) {
  return (
    <div className="flex flex-col items-end gap-2 md:pt-0.5">
      {canRescan && domainId ? (
        <RescanDomainForm
          compact
          cooldownMessage={cooldownMessage}
          defaultScanFrom={defaultScanFrom}
          disabled={rescanDisabled}
          domainId={domainId}
          showLabel
        />
      ) : null}
      {alternateHref && alternateLabel ? (
        <Link className={getLinkClassName()} href={alternateHref}>
          {alternateLabel}
        </Link>
      ) : null}
    </div>
  );
}
