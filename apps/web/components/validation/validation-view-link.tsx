import { PendingLink } from "../ui/pending-link";

type ValidationViewLinkProps = {
  href: string;
  className?: string;
  idleLabel?: string;
  pendingLabel?: string;
};

export function ValidationViewLink({
  href,
  className = "text-sm font-medium text-slate-900 underline underline-offset-4",
  idleLabel = "View",
  pendingLabel = "Opening..."
}: ValidationViewLinkProps) {
  return (
    <PendingLink
      className={className}
      href={href}
      idleContent={idleLabel}
      pendingContent={pendingLabel}
      pendingClassName="pointer-events-none opacity-70"
    />
  );
}
