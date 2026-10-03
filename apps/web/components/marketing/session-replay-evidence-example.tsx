export function SessionReplayEvidenceExample() {
  return (
    <figure className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <figcaption className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm text-slate-600">
        Illustrative evidence layout · not an actual scan
      </figcaption>
      <div className="space-y-5 p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Tracking &amp; embeds
          </p>
          <span className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-800">
            Service signal
          </span>
        </div>
        <p className="text-xl font-semibold text-slate-950">
          Session replay service signal observed
        </p>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Example service</dt>
            <dd className="mt-1 font-medium text-slate-900">
              Microsoft Clarity
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Evidence source</dt>
            <dd className="mt-1 text-slate-900">
              Retained product-specific network request
            </dd>
          </div>
        </dl>
        <details className="rounded-lg border border-slate-200 p-4">
          <summary className="cursor-pointer font-medium text-sky-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">
            What this evidence would establish
          </summary>
          <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
            <p>
              A recognized replay-service request tied to the measured page. It
              may be a library download.
            </p>
            <p>
              It would not establish active recording, captured inputs, a
              successful transmission or a consent violation.
            </p>
          </div>
        </details>
      </div>
    </figure>
  );
}
