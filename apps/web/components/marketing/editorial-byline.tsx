import Link from "next/link";
import { getEditorialDates } from "../../lib/marketing/editorial-metadata";

export function EditorialByline({ path }: { path: string }) {
  const dates = getEditorialDates(path);
  return (
    <p className="text-sm leading-6 text-slate-500">
      By <Link className="underline underline-offset-4" href="/what-is-certscore">CertScore.ai</Link>
      {dates ? <> · Updated <time dateTime={dates.dateModified}>{new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${dates.dateModified}T00:00:00Z`))}</time></> : null}
    </p>
  );
}
