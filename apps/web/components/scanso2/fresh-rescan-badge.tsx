type FreshRescanBadgeProps = {
  value: boolean | null;
};

export function FreshRescanBadge({ value }: FreshRescanBadgeProps) {
  if (value === true) {
    return (
      <span
        className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100"
        title="Fresh re-scan bypassed the 24-hour recent-scan reuse check."
      >
        Fresh re-scan: Yes
      </span>
    );
  }

  if (value === false) {
    return (
      <span
        className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200"
        title="This scan request allowed reuse of an eligible scan from the past 24 hours."
      >
        Fresh re-scan: No
      </span>
    );
  }

  return (
    <span
      className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-100"
      title="Fresh re-scan request context was not available for this row."
    >
      Fresh re-scan: Unknown
    </span>
  );
}
