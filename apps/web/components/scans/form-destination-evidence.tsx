import type { FormDestinationProjection } from "@certscore/contracts";
/** Warning eligibility arrives from the canonical unified finding, never from UI inference. */
export function FormDestinationEvidence({ projection, warning = false }: { projection?: FormDestinationProjection | null; warning?: boolean }) {
  if (!projection?.trace.events.length) return null;
  const { trace } = projection;
  return <section id="form-destination-evidence" aria-label="Form-data destinations" className="my-3 scroll-mt-6 rounded-lg border border-zinc-200 p-4 text-sm target:ring-2 target:ring-sky-300">
    <details><summary className="cursor-pointer font-semibold">Form-data destinations {warning ? <span className="ml-2 text-amber-800">⚠ Unexpected recipient — review</span> : null}</summary>
      <p className="mt-2 text-xs text-zinc-500">Passive observation only. No forms were submitted by the scanner. Requests listed after an event are timing associations unless an exact field-value match is recorded. This does not establish data exfiltration.</p>
      {trace.events.map(event => <details key={event.evidenceRef} id={event.evidenceRef} className="mt-3 border-t pt-3">
        <summary className="cursor-pointer">Form {event.formIndex + 1} · {event.kind} · {(event.observedAtMs / 1000).toFixed(2)}s</summary>
        <p className="mt-2 break-all text-xs">Page: {event.documentUrl}<br />Declared destination: {event.actionUrl}<br />Evidence: {event.evidenceRef}</p>
        <ul className="my-2 text-xs">{event.fields.map(field => <li id={field.evidenceRef} key={field.evidenceRef}>{field.name || "Unnamed field"} · {field.category} · {field.evidenceRef}</li>)}</ul>
        {trace.requests.filter(request => request.eventRef === event.evidenceRef).map(request => <div id={request.evidenceRef} key={request.evidenceRef} className="my-2 rounded border border-zinc-200 p-2 text-xs">
          <p className="break-all font-medium">{request.method} {request.url}</p>
          <p>{request.party.replaceAll("_", " ")} · {request.status.replaceAll("_", " ")} · {request.relation === "exact_field_value_match" ? "Exact personal-field value match" : "Timing association only"}</p>
          <p className="break-all">{request.domain} · {request.evidenceRef} · Network: {request.networkRequestId}</p>
          {request.matches.map(match => <p key={match.fieldRef} className="break-all">{match.fieldRef} · {match.location} · HMAC {match.valueHmac}</p>)}
        </div>)}
      </details>)}
      <p className="mt-3 text-xs text-zinc-500">Coverage: main document, existing scan window. Native form events only; programmatic submit(), inaccessible frames, files, passwords, encoded/encrypted payloads and unsupported body formats are not fully traced.{trace.coverage.truncated ? " Capture limit reached; evidence is incomplete." : ""} {trace.coverage.unsupportedPayloads ? `${trace.coverage.unsupportedPayloads} request bodies could not be matched.` : ""}</p>
      <p className="mt-2 break-all text-xs text-zinc-500">Verified source: {projection.sourceHash}</p>
    </details>
  </section>;
}
