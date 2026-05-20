type MonitorSetupTimelineProps = {
  activatedAt?: string | null;
  activationConfirmedAt?: string | null;
  confirmationEmailSentAt?: string | null;
  createdAt: string;
  linkedAt?: string | null;
  setupStatus?: "activated" | "pending_setup" | null;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Pending";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Los_Angeles",
    timeZoneName: "short"
  }).format(new Date(value));
}

export function MonitorSetupTimeline({
  activatedAt,
  activationConfirmedAt,
  confirmationEmailSentAt,
  createdAt,
  linkedAt,
  setupStatus
}: MonitorSetupTimelineProps) {
  const confirmedAt = activationConfirmedAt ?? activatedAt ?? null;
  const items = [
    {
      description: "The monitor-site form created a pending monitoring request.",
      isComplete: true,
      label: "Request submitted",
      timestamp: createdAt
    },
    {
      description: "The request was associated with a workspace domain for setup review.",
      isComplete: Boolean(linkedAt),
      label: "Workspace linked",
      timestamp: linkedAt
    },
    {
      description:
        setupStatus === "activated"
          ? "Setup was confirmed and the requested cadence was activated."
          : "Monitoring remains inactive until setup is confirmed.",
      isComplete: setupStatus === "activated" && Boolean(confirmedAt),
      label: "Setup confirmed",
      timestamp: confirmedAt
    },
    {
      description: confirmationEmailSentAt
        ? "The customer confirmation email was recorded."
        : "Customer notification has not been recorded in CertScore.",
      isComplete: Boolean(confirmationEmailSentAt),
      label: "Customer notified",
      timestamp: confirmationEmailSentAt
    }
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-900">Setup timeline</h2>
      <ol className="mt-4 space-y-4">
        {items.map((item) => (
          <li key={item.label} className="grid grid-cols-[1rem_1fr] gap-3">
            <span
              aria-hidden="true"
              className={[
                "mt-1 block h-3 w-3 rounded-full border",
                item.isComplete ? "border-emerald-600 bg-emerald-600" : "border-slate-300 bg-white"
              ].join(" ")}
            />
            <div className="space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-slate-900">{item.label}</p>
                <p className="text-xs text-slate-500">{formatDateTime(item.timestamp)}</p>
              </div>
              <p className="text-xs leading-5 text-slate-600">{item.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
