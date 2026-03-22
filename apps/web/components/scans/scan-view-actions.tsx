import Link from "next/link";
import { RescanDomainForm } from "./rescan-domain-form";

type ScanViewActionsProps = {
  alternateHref: string;
  alternateLabel: string;
  canRescan: boolean;
  cooldownMessage?: string | null;
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
  domainId = null,
  rescanDisabled = false
}: ScanViewActionsProps) {
  return (
    <div className="flex flex-col items-end gap-2 md:pt-0.5">
      {canRescan && domainId ? (
        <RescanDomainForm
          compact
          cooldownMessage={cooldownMessage}
          disabled={rescanDisabled}
          domainId={domainId}
          showLabel
        />
      ) : null}
      <Link className={getLinkClassName()} href={alternateHref}>
        {alternateLabel}
      </Link>
    </div>
  );
}
