"use client";
import type { NetworkDestination } from "@certscore/contracts";
import { resolveCanonicalVendorHeadquarters, documentedServiceRegions } from "@certscore/vendor-resolver";
import { useId } from "react";
import { CountryLabel } from "./country-label";
import type { FullSiteResourceContext as Context } from "../../lib/scans/full-site-resource-context";
const safeHref = (value: string) => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; } };
export function ProviderHeadquarters({ context }: { context?: Context }) {
  const id = useId();
  const reference = resolveCanonicalVendorHeadquarters(context?.identity?.entity);
  if (!reference) return <CountryLabel value={context?.headquarters} />;
  return <><button type="button" popoverTarget={id} aria-label={`Provider headquarters for ${reference.entity}`} className="rounded px-1 py-1 text-left text-xs text-sky-800 hover:bg-sky-50">
    <CountryLabel value={context?.headquarters} />
  </button><div id={id} popover="auto" className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
    <div className="mb-3 flex items-start justify-between gap-3"><strong>Provider headquarters</strong><button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label="Close provider headquarters">Close</button></div>
    <div className="space-y-3 text-xs text-slate-600">
      <p className="font-medium text-slate-800">{reference.entity}</p>
      <p><CountryLabel value={reference.headquartersCountry} /> · {reference.status === "verified" ? "Source-verified headquarters" : "Headquarters not verified"}</p>
      <p>{reference.note}</p>
      <p>Company reference data; the detected service does not establish which entity contracts with this site. Headquarters does not establish server location or transfer arrangements.</p>
      <p>Sources checked {reference.checkedAt}</p>
      <ul className="space-y-2">{reference.sources.map(source => <li key={source.url}><a href={safeHref(source.url)} target="_blank" rel="noopener noreferrer" className="text-sky-800 underline">{source.title}</a></li>)}</ul>
    </div>
  </div></>;
}
export function PageCountDisclosure({ pages, numberOnly = false }: { pages: string[]; numberOnly?: boolean }) {
  const id = useId(); const unique = [...new Set(pages)];
  return <><button type="button" popoverTarget={id} className="whitespace-nowrap text-sky-800 hover:underline" aria-label={`View ${unique.length} ${unique.length === 1 ? "page" : "pages"}`}>{numberOnly ? unique.length : `${unique.length} ${unique.length === 1 ? "page" : "pages"}`}</button>
    <div id={id} popover="auto" role="dialog" aria-label="Captured pages" className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
      <div className="mb-3 flex justify-between gap-3"><strong>Captured on {unique.length} {unique.length === 1 ? "page" : "pages"}</strong><button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label="Close page list">Close</button></div>
      <ul className="max-h-[60vh] space-y-3 overflow-auto text-sm">{unique.map(page => <li key={page}><a className="break-all text-sky-800 hover:underline" href={safeHref(page)} target="_blank" rel="noopener noreferrer">{page}</a></li>)}</ul>
    </div></>;
}
export function PageUrlDisclosure({ pages }: { pages: string[] }) {
  const unique = [...new Set(pages)];
  const link = (page: string) => <a className="block max-w-64 truncate text-sky-800 hover:underline" title={page} href={safeHref(page)} target="_blank" rel="noopener noreferrer">{page}</a>;
  return unique.length ? <div className="space-y-1">{link(unique[0]!)}{unique.length > 1 ? <PageCountDisclosure pages={unique}/> : null}</div> : <span>Unavailable</span>;
}
export function policyDisclosureLabel(status: Context["policy"]["status"]) {
  return status === "mentioned" ? "Mentioned" : status === "not_found" ? "Not found" : "Unknown";
}
function PolicyDisclosureEvidence({ context }: { context: Context }) {
  const policy = context.policy;
  return <div className="space-y-3 text-xs text-slate-600">      <p className="mt-2">Review scope: retained site policy from the homepage scan; this is a disclosure lookup, not a finding about compliance.</p>
      {policy.mentions.map((mention, i) => <div key={i} className="mt-3"><blockquote className="border-l-2 border-slate-300 pl-3">{mention.excerpt}</blockquote><p>Matched at {mention.scope} level.</p></div>)}
      {!policy.reviewed.length ? <p>No verified retained policy text is available for this lookup.</p> : policy.reviewed.map(doc => <div key={doc.sha256 + doc.url} className="mt-3"><a className="break-all text-sky-800 underline" href={safeHref(doc.url)} target="_blank" rel="noopener noreferrer">{doc.url}</a><p>Reviewed {doc.capturedAt} · {doc.complete ? "Complete retained text" : "Limited coverage"}</p><p className="break-all">Evidence SHA-256: {doc.sha256}</p></div>)}</div>;
}
export function PolicyDisclosure({ context, label }: { context: Context; label: string }) {
  const id = useId();
  const tone = context.policy.status === "mentioned" ? "!border-emerald-200 !bg-emerald-50 !text-emerald-800" : context.policy.status === "not_found" ? "!border-amber-200 !bg-amber-50 !text-amber-900" : "!border-slate-200 !bg-slate-100 !text-slate-600";
  return <><button type="button" popoverTarget={id} aria-label={`Policy disclosure for ${label}: ${policyDisclosureLabel(context.policy.status)}`} className={`whitespace-nowrap rounded-md border px-2 py-1 text-xs font-medium hover:brightness-95 ${tone}`}>{policyDisclosureLabel(context.policy.status)}</button>
    <div id={id} popover="auto" aria-label={`Policy disclosure for ${label}`} className="m-auto w-[min(36rem,calc(100vw-2rem))] max-h-[80vh] overflow-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
      <div className="mb-3 flex items-start justify-between gap-4"><div><h3 className="font-semibold text-slate-900">Policy disclosure · {policyDisclosureLabel(context.policy.status)}</h3><p className="mt-1 break-all text-xs text-slate-600">{label}</p></div><button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label="Close policy disclosure">Close</button></div>
      <PolicyDisclosureEvidence context={context} />
    </div></>;
}
export function FullSiteResourceContext({ context, destinations = [], serviceSummary = false }: { context: Context; serviceSummary?: boolean; destinations?: NetworkDestination[] }) {
  const policy = context.policy;
  return <div className="space-y-4 border-t border-slate-200 pt-3 text-xs text-slate-600">
    <section aria-label="Provider details"><h4 className="font-semibold text-slate-800">Provider</h4><p>Provided by {context.provider ?? "Unknown provider"}</p>{context.identity ? <p>Product: {context.identity.product} · Source: canonical vendor registry {context.identity.registryVersion}</p> : <p>No unambiguous canonical product match.</p>}</section>
    <details><summary className="cursor-pointer font-semibold text-sky-800">Privacy-policy disclosure: {policy.status === "mentioned" ? `Mentioned (${policy.mentions[0]?.scope ?? "identity"} match)` : policy.status === "not_found" ? "Not found in reviewed policy" : "Unknown"}</summary>
      <PolicyDisclosureEvidence context={context} />
    </details>
    <DataTransferDetails context={context} destinations={destinations} serviceSummary={serviceSummary} />
  </div>;
}

export function dataTransferLabel(context: Context) {
  if (!context.transfer || ["unknown", "sccs_assumed_unverified"].includes(context.transfer.mechanism)) return "Mechanism not assessed";
  return `${context.transfer.mechanism === "dpf_certified" ? "DPF certification" : "Adequacy decision"} (registry)`;
}
type TransferProps = { requestUrls?: string[]; context: Context; serviceSummary?: boolean; destinations?: NetworkDestination[]; resourceKind?: string;
  coverage?: { assessed: number; total: number; missing: number; truncated: boolean } };
const countryNames = new Intl.DisplayNames(["en"], { type: "region" });
function uniqueDestinations(destinations: NetworkDestination[]) {
  return [...new Map(destinations.map(destination => [JSON.stringify(destination), destination])).values()];
}
export function destinationLabel(destinations: NetworkDestination[] = []) {
  const countries = [...new Set(destinations.map(destination => destination.countryCode ?? destination.country).filter(Boolean))].sort();
  return countries.length ? countries.join(", ") : destinations.length ? "IP captured · location unavailable" : "Destination unavailable";
}
function locationStatus(destination: NetworkDestination) {
  switch (destination.enrichment?.country) {
    case "database_unavailable": return "Country lookup database unavailable";
    case "database_stale": return "Country lookup database expired";
    case "not_found": return "IP not located in country database";
    default: return destination.countryCode || destination.country ? "Approximate server country" : "Country enrichment not retained";
  }
}
function DataTransferDetails({ context, destinations = [], coverage, resourceKind, requestUrls = [] }: TransferProps) {
  const rows = uniqueDestinations(destinations);
  const regions = documentedServiceRegions(requestUrls);
  const nonNetwork = resourceKind && ["cookie", "storage"].includes(resourceKind);
  return <section aria-label="Destination and provider" className="space-y-3">
    <p>Server locations describe the endpoint associated with the captured browser response. They may be CDN edges and do not establish subsequent processing or storage locations.</p>
    {rows.length ? <ul className="max-h-72 space-y-3 overflow-auto">{rows.map((destination, i) => <li key={i} className="rounded border border-slate-200 p-2">
      <p className="font-medium text-slate-800">{destination.countryCode || destination.country ? <CountryLabel value={countryNames.of(destination.countryCode ?? destination.country!)}/> : locationStatus(destination)}</p>
      <p>{destination.ip} · {destination.provider ?? "Network operator unavailable"}{destination.asn ? ` · AS${destination.asn}` : ""}</p>
      <p>{locationStatus(destination)} · Source: {destination.source.replaceAll("_", " ")}</p>
      {destination.enrichment?.countryDatabaseBuiltAt ? <p>Country database: {destination.enrichment.countryDatabaseBuiltAt.slice(0, 10)}</p> : null}
      {destination.enrichment?.networkDatabaseBuiltAt ? <p>Network database: {destination.enrichment.networkDatabaseBuiltAt.slice(0, 10)}</p> : null}
    </li>)}</ul> : <p>{nonNetwork ? "This is stored browser data. Inspect linked requests for observed server destinations." : "No server IP is available in this inventory entry. Historical evidence may not include a destination summary. For newly assessed requests, a service-worker, failed or incomplete response may not expose an address; check retained connection evidence for the reason."}</p>}
    {regions.length ? <div className="space-y-3 border-t pt-3"><p className="font-medium text-slate-800">Documented service regions</p>{regions.map(region => <div key={region.id}><p>{region.label}</p><p>{region.note}</p><p>Sources checked {region.checkedAt}</p><ul>{region.sources.map(source => <li key={source.url}><a href={safeHref(source.url)} target="_blank" rel="noopener noreferrer" className="text-sky-800 underline">{source.title}</a></li>)}</ul></div>)}</div> : null}
    {coverage ? <p>{coverage.assessed > 0 ? `${coverage.assessed} of ${coverage.total} request events assessed; ${coverage.missing} without a retained server IP.` : "Complete destination coverage is not available for this historical evidence."}{coverage.truncated ? " The displayed destinations are a bounded sample." : ""}</p> : null}
    {rows.some(row => row.source.endsWith("geolite2")) ? <p>This product includes GeoLite Data created by <a href="https://www.maxmind.com" target="_blank" rel="noopener noreferrer" className="underline">MaxMind</a>.</p> : null}
    <div className="border-t pt-3"><p>Provider headquarters: <CountryLabel value={context.headquarters}/></p><p>Transfer mechanism: {dataTransferLabel(context)}</p>
      {context.transfer ? <p>{context.transfer.basis} Registry reference date: {context.transfer.verifiedAsOf}. This is registry context, not verification of this site's transfer arrangements.</p> : null}
    </div>
  </section>;
}
export function DataTransferDisclosure({ label, mechanismOnly: _mechanismOnly = false, location = false, ...props }: TransferProps & { label: string; mechanismOnly?: boolean; location?: boolean }) {
  const id = useId();
  const destinations = uniqueDestinations(props.destinations ?? []);
  const regions = documentedServiceRegions(props.requestUrls ?? []);
  const countries = [...new Set(destinations.map(destination => destination.countryCode ?? destination.country).filter((country): country is string => Boolean(country)))].sort();
  const operators = [...new Set(destinations.map(destination => destination.provider).filter(Boolean))];
  const headquarters = resolveCanonicalVendorHeadquarters(props.context.identity?.entity);
  const distinctOperators = operators.filter(operator => ![props.context.provider, props.context.identity?.entity, props.context.identity?.vendor].some(entity => entity?.toLowerCase() === operator?.toLowerCase()));
  const operatorName = distinctOperators.join(", ");
  const operatorCharacters = Array.from(operatorName);
  const operatorPreview = operatorCharacters.length > 12 ? `${operatorCharacters.slice(0, 12).join("")}…` : operatorName;
  const nonNetwork = props.resourceKind && ["cookie", "storage"].includes(props.resourceKind);
  return <><button type="button" popoverTarget={id} aria-label={`${location ? "Location" : "Data transfer"} for ${label}`} className="max-w-64 rounded-md px-1 py-1 text-left text-xs text-sky-800 hover:bg-sky-50">
      {location ? <>
        <span className="block max-w-64 truncate whitespace-nowrap"><span className="text-slate-500">HQ: </span><CountryLabel value={props.context.headquarters}/></span>
        <span className="block max-w-64 truncate whitespace-nowrap" title={distinctOperators.join(", ")}><span role="img" aria-label="Observed destination" title="Observed destination" className="mr-1 inline-flex align-middle text-slate-500"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="14" height="6" rx="1.5"/><rect x="3" y="11" width="14" height="6" rx="1.5"/><path d="M6 6h.01M6 14h.01M10 6h4M10 14h4"/></svg></span>{countries.length ? <><CountryLabel value={countries[0]}/>{countries.length > 1 ? ` +${countries.length - 1}` : null}</> : nonNetwork ? "See requests" : "Unavailable"}{operatorName ? <> · <span title={`${operatorName} · Click for full details`} className="underline decoration-dotted underline-offset-2">{operatorPreview}</span></> : null}</span>
      </> : <>
      <span className="block max-w-48 truncate whitespace-nowrap">{countries.length ? <><CountryLabel value={countryNames.of(countries[0]!)}/>{countries.length > 1 ? ` +${countries.length - 1}` : null}{destinations.some(destination => !destination.countryCode && !destination.country) ? " · some unavailable" : null}</> : nonNetwork && !destinations.length ? "See linked requests" : destinationLabel(destinations)}</span>
      {operators.length || regions.length ? <span className="block max-w-48 truncate text-[10px] text-slate-500">{operators.length ? operators.join(", ") : `Service region: ${regions.map(region => region.region).join(", ")} (documented)`}</span> : null}
      </>}
    </button>
    <div id={id} popover="auto" role="dialog" aria-label={`${location ? "Location" : "Data transfer"} for ${label}`} className="m-auto w-[min(36rem,calc(100vw-2rem))] max-h-[80vh] overflow-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
      <div className="mb-3 flex items-start justify-between gap-4"><div><h3 className="font-semibold text-slate-900">{location ? "Location details" : "Observed destinations"}</h3><p className="mt-1 break-all text-xs text-slate-600">{label}</p></div><button type="button" popoverTarget={id} popoverTargetAction="hide" aria-label="Close data transfer">Close</button></div>
      <div className="space-y-3 text-xs text-slate-600"><DataTransferDetails {...props}/>{location ? <section className="border-t pt-3"><h4 className="font-semibold">Corporate headquarters</h4><p>{props.context.provider ?? props.context.identity?.entity ?? "Provider unknown"}</p>{headquarters ? <><p>{headquarters.note}</p><p>Sources checked {headquarters.checkedAt}</p><ul>{headquarters.sources.map(source => <li key={source.url}><a className="text-sky-800 underline" href={safeHref(source.url)} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul></> : <p>No verified headquarters reference available.</p>}<p>Headquarters and network operator are distinct; neither establishes this site's contracting entity or subsequent data processing locations.</p></section> : null}</div>
    </div></>;
}
