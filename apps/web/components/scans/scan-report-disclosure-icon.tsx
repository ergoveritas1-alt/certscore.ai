type ScanReportDisclosureIconProps = {
  className?: string;
  open?: boolean;
};

export function ScanReportDisclosureIcon({ className, open }: ScanReportDisclosureIconProps) {
  const stateClass =
    open === true
      ? "rotate-90"
      : open === false
        ? ""
        : "group-open:rotate-90";

  return (
    <span
      aria-hidden="true"
      className={[
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm transition duration-150",
        "group-hover:border-slate-300 group-hover:text-slate-700",
        stateClass,
        className ?? ""
      ].join(" ")}
    >
      <svg aria-hidden="true" className="h-3 w-3" viewBox="0 0 20 20" fill="none">
        <path d="M7 4L13 10L7 16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" />
      </svg>
    </span>
  );
}
