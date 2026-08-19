import Link from "next/link";

export function CanaryTrafficToggle({
  basePath,
  includeCanary,
  searchParams,
}: {
  basePath: string;
  includeCanary: boolean;
  searchParams: Record<string, string | null | undefined>;
}) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key !== "page" && key !== "includeCanary" && value) next.set(key, value);
  }
  if (!includeCanary) next.set("includeCanary", "1");
  const href = next.size ? `${basePath}?${next.toString()}` : basePath;

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600">
      <span>Canary traffic</span>
      <Link
        aria-label={`${includeCanary ? "Exclude" : "Include"} canary traffic`}
        aria-pressed={includeCanary}
        className={`relative h-5 w-9 rounded-full transition ${includeCanary ? "bg-sky-600" : "bg-slate-300"}`}
        href={href}
        role="switch"
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${includeCanary ? "left-[18px]" : "left-0.5"}`} />
      </Link>
      <span className="w-5 font-semibold text-slate-700">{includeCanary ? "On" : "Off"}</span>
    </div>
  );
}
