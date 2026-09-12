"use client";
import { CopyJsonButton } from "./copy-json-button";

import { useTableRowLimit } from "./use-table-row-limit";
import { ScanLiveValue } from "./scan-live-value";

import { InspectButton } from "./inventory-resource-details";
import { Fragment, useEffect, useId, useMemo, useRef, useState } from "react";
import { FIELD_REVIEW_POLICY, legacyCollectionFieldCategory, type CollectionSurfaceAssessment } from "@certscore/contracts";

type Form = CollectionSurfaceAssessment["forms"][number];
export type CollectionSurfaceTableRow = {
  id: string;
  form: Form;
  capturedAt: string;
  snapshot: { status: "available"; url: string } | { status: "unavailable" | "withheld" | "pending" };
};

function pageHref(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}
const label = (value: string) => value.replaceAll("_", " ");

export function fieldsInPageOrder(fields: Form["fields"]) {
  // Older records without DOM positions retain their stored order.
  return fields.every(field => field.controlIndex !== undefined)
    ? [...fields].sort((a, b) => a.controlIndex! - b.controlIndex!)
    : fields;
}

export type FormSortKey = "form" | "type" | "fields" | "controls" | "sensitivity" | "method" | "destination" | "page" | "snapshot";
const columns: Array<{ key: FormSortKey; label: string }> = [
  { key: "form", label: "Form" }, { key: "type", label: "Type" }, { key: "fields", label: "Fields" },
  { key: "controls", label: "Checkboxes / toggles" }, { key: "sensitivity", label: "Field review" },
  { key: "method", label: "Method" }, { key: "destination", label: "Destination" },
  { key: "page", label: "Captured on page" }, { key: "snapshot", label: "Snapshot" },
];
export function sortCollectionSurfaces(rows: CollectionSurfaceTableRow[], key: FormSortKey, direction: "asc" | "desc") {
  const value = (row: CollectionSurfaceTableRow): string | number => {
    switch (key) {
      case "form": return row.form.title ?? label(row.form.surfaceType);
      case "type": return row.form.surfaceType;
      case "fields": return row.form.retainedFieldCount;
      case "controls": return row.form.fields.filter(f => ["checkbox", "switch"].includes(f.controlKind ?? f.inputType)).length;
      case "sensitivity": return Math.max(0,...row.form.fields.map(f=>reviewRank(f)));
      case "method": return row.form.method;
      case "destination": return row.form.actionHostname ?? row.form.actionRelationship;
      case "page": return row.form.pageUrl;
      case "snapshot": return row.snapshot.status;
    }
  };
  return [...rows].sort((a, b) => {
    const left = value(a), right = value(b);
    const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
    return (direction === "asc" ? order : -order) || a.id.localeCompare(b.id);
  });
}

function controlsSummary(fields: Form["fields"]) {
 const checkboxes=fields.filter(f=>(f.controlKind??f.inputType)==="checkbox").length;
 const toggles=fields.filter(f=>f.controlKind==="switch").length;
 return [checkboxes ? `${checkboxes} checkbox${checkboxes===1?"":"es"}` : "",toggles ? `${toggles} toggle${toggles===1?"":"s"}` : ""].filter(Boolean).join(" · ") || "—";
}
function reviewPolicy(field: Form["fields"][number]) { return FIELD_REVIEW_POLICY[field.review?.category ?? legacyCollectionFieldCategory(field.semanticCategory)]; }
function reviewRank(field: Form["fields"][number]) { return ({ highest:4, high:3, personal:2, contextual:1, unknown:0 })[reviewPolicy(field).tier]; }
function FieldReview({ field }: { field: Form["fields"][number] }) {
 const policy=reviewPolicy(field),rank=reviewRank(field);
 return <span title={`${policy.label}. Field review indicator; no score effect.`} className={`inline-flex items-center gap-1 ${rank>=3 ? "text-rose-700" : rank===2 ? "text-amber-700" : "text-slate-500"}`}>{rank>=2 ? <span role="img" aria-label="Field requires review">⚠</span> : null}{policy.label}</span>;
}
function ControlState({ field }: { field: Form["fields"][number] }) {
 const kind=field.controlKind ?? field.inputType;
 if(!["checkbox","switch","radio"].includes(kind))return null;
 const state=field.checkedState===undefined?"Not captured":field.checkedState==="checked"?(kind==="switch"?"On":"Checked"):field.checkedState==="unchecked"?(kind==="switch"?"Off":"Unchecked"):field.checkedState==="mixed"?"Mixed":"Unknown";
 return <span className="inline-flex items-center gap-1">{state}{field.review?.preselectedMarketing ? <span role="img" aria-label="Preselected marketing opt-in — review" title="Marketing control was selected at capture. Review the opt-in; this does not establish valid consent." className="text-amber-700">⚠</span> : null}</span>;
}

function FormSnapshotDialog({ title, url, onClose }: { title: string; url: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const trigger = useRef<HTMLElement | null>(null);
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "failed">("loading");
  useEffect(() => {
    const element = dialog.current;
    if (!trigger.current && document.activeElement instanceof HTMLElement) trigger.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} aria-labelledby={headingId} onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
    className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-xl overflow-auto rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-950/50">
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h3 id={headingId} className="min-w-0 text-base font-semibold">{title}</h3>
        <button type="button" autoFocus onClick={() => dialog.current?.close()} aria-label="Close form snapshot"
          className="shrink-0 rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-slate-50">Close</button>
      </div>
      {imageStatus === "loading" ? <p role="status" className="py-4 text-sm text-zinc-500">Loading snapshot…</p> : null}
      {imageStatus === "failed" ? <p role="alert" className="py-4 text-sm text-zinc-600">This form snapshot could not be loaded. Close this popup and try again.</p> :
        <img src={url} alt={`Captured form: ${title}`} onLoad={() => setImageStatus("loaded")} onError={() => setImageStatus("failed")}
          className={`mx-auto max-h-[65vh] max-w-full object-contain ${imageStatus === "loading" ? "hidden" : "block"}`} />}
    </div>
  </dialog>;
}

export function CollectionSurfacesTable({ rows, loading = false, scanning = false, pagesWithoutInventory = 0, limitedPages = 0 }: {
  rows: CollectionSurfaceTableRow[];
  loading?: boolean;
  scanning?: boolean;
  pagesWithoutInventory?: number;
  limitedPages?: number;
}) {
  const rowLimit = useTableRowLimit(3);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const prefix = useId();
  const [snapshot, setSnapshot] = useState<{ title: string; url: string } | null>(null);
  const [sort, setSort] = useState<{ key: FormSortKey; direction: "asc" | "desc" }>({ key: "page", direction: "asc" });
  const sortedRows = useMemo(() => sortCollectionSurfaces(rows, sort.key, sort.direction), [rows, sort]);
  if (!loading && rows.length === 0) return <section aria-label="Collection surfaces (forms)" className="border-b border-zinc-200 bg-white py-3 text-sm text-zinc-600">
    {scanning ? "Forms: none observed yet; scan in progress." : pagesWithoutInventory > 0 || limitedPages > 0 ? "Forms: no retained rows; form coverage is incomplete." : "Forms: no forms observed on the scanned pages."}
  </section>;
  return (
    <section aria-labelledby={`${prefix}-title`} className="min-w-0 border-b border-zinc-200 bg-white py-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id={`${prefix}-title`} className="text-xl font-semibold">Collection surfaces (forms)</h2>
        <div className="flex items-center gap-2"><span className="text-xs text-zinc-500"><ScanLiveValue active={scanning && !loading} value={loading ? "Loading…" : `${rows.length} ${rows.length === 1 ? "form" : "forms"}`} /></span>{!loading ? <CopyJsonButton className="inline-flex h-8 w-8 items-center justify-center rounded-md text-sky-700 hover:bg-sky-50" label="Copy entire forms table with all fields and evidence as JSON" payload={JSON.stringify(rows, null, 2)} /> : null}</div>
      </div>
      <p className="mb-4 text-xs text-zinc-600">Forms and fields observed on scanned pages. Expand a form to inspect its fields; submitted values are not included.</p>
      {pagesWithoutInventory > 0 || limitedPages > 0 ? <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
        {pagesWithoutInventory > 0 ? `${pagesWithoutInventory} page(s) have no retained form inventory. ` : ""}
        {limitedPages > 0 ? `${limitedPages} page(s) have limited form coverage. ` : ""}Missing evidence does not establish that a page has no forms.
      </p> : null}
      {loading ? <p role="status" className="py-4 text-sm text-zinc-500">Loading form inventory…</p> : rows.length === 0 ?
        <p className="py-4 text-sm text-zinc-500">{scanning ? "Form inventory will appear as pages finish scanning." : pagesWithoutInventory > 0 || limitedPages > 0 ? "No form rows are available in the retained evidence." : "No forms were observed on the inventoried pages."}</p> :
        <div ref={rowLimit.ref} style={rowLimit.style} className="max-h-[240px] overflow-auto" tabIndex={0} aria-label="Scrollable collection surfaces">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">One row per captured form, with expandable field details</caption>
            <thead className="sticky top-0 z-10 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>{columns.map(column => column.key === "form" ? <th key={column.key} scope="col" className="w-10 border-b px-3 py-2"><span className="sr-only">View details</span></th> : <th key={column.key} scope="col" aria-sort={sort.key === column.key ? sort.direction === "asc" ? "ascending" : "descending" : "none"} className="whitespace-nowrap border-b px-3 py-2">
                <button type="button" className="flex items-center gap-1 uppercase tracking-wider hover:text-sky-700" onClick={() => setSort(current => ({ key: column.key, direction: current.key === column.key && current.direction === "asc" ? "desc" : "asc" }))}>
                  {column.label}<span aria-hidden="true">{sort.key === column.key ? sort.direction === "asc" ? "↑" : "↓" : "↕"}</span>
                </button>
              </th>)}</tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => {
                const { form } = row;
                const open = expanded.has(row.id);
                const title = form.title ?? `${label(form.surfaceType)} ${Number(form.formRef.replace("collection_form_", "")) + 1}`;
                const detailId = `${prefix}-fields-${row.id}`;
                return <Fragment key={row.id}>
                  <tr className="border-b border-zinc-100">
                    <th scope="row" className="w-10 px-3 py-2 font-medium"><InspectButton open={open} controls={detailId} name={title} onClick={() => setExpanded(current => {
                      const next = new Set(current); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next;
                    })} /></th>
                    <td className="px-3 py-2 capitalize">{label(form.surfaceType)}</td>
                    <td className="px-3 py-2 tabular-nums">{form.retainedFieldCount}{form.fieldsTruncated ? ` of ${form.candidateFieldCount}` : ""}</td>
                    <td className="px-3 py-2">{controlsSummary(form.fields)}{form.fields.some(f=>f.review?.preselectedMarketing) ? <span role="img" aria-label="Preselected marketing opt-in — review" title="Expand to review preselected marketing controls" className="ml-1 text-amber-700">⚠</span> : null}{form.fieldsTruncated ? <span className="block text-zinc-500">Partial inventory</span> : null}</td>
                    <td className="px-3 py-2">{form.fields.length ? <FieldReview field={[...form.fields].sort((a,b)=>reviewRank(b)-reviewRank(a))[0]!}/> : "—"}</td>
                    <td className="px-3 py-2 uppercase">{form.method}</td>
                    <td className="px-3 py-2"><span className="block max-w-52 truncate" title={form.actionHostname}>{form.actionHostname ?? label(form.actionRelationship)}</span>{form.actionHostname ? <span className="block text-zinc-500">{label(form.actionRelationship)}</span> : null}</td>
                    <td className="px-3 py-2"><a className="block max-w-64 truncate text-sky-800 hover:underline" href={pageHref(form.pageUrl)} title={form.pageUrl} target="_blank" rel="noopener noreferrer">{form.pageUrl}</a></td>
                    <td className="whitespace-nowrap px-3 py-2">{row.snapshot.status === "available" && row.snapshot.url.startsWith("/api/scans/") ? <button type="button" onClick={() => { if (row.snapshot.status === "available") setSnapshot({ title, url: row.snapshot.url }); }} aria-label={`View form: ${title}`} className="inline-block rounded-lg border border-zinc-200 px-3 py-1.5 text-sky-800 hover:border-sky-500">View form</button> : <span className="text-zinc-500">{row.snapshot.status === "pending" ? "Snapshot pending" : row.snapshot.status === "withheld" ? "Snapshot withheld" : "Snapshot unavailable"}</span>}</td>
                  </tr>
                  <tr data-expanded-details id={detailId} hidden={!open} className="border-b border-zinc-200 bg-slate-50/60"><td colSpan={columns.length} className="p-4">
                    <h3 className="mb-2 font-semibold">{title}</h3>
                    <p className="mb-3 text-zinc-500">{label(form.structure)} · Captured {row.capturedAt}</p>
                    <dl className="mb-3 grid gap-2 text-xs sm:grid-cols-2">
                      <div><dt className="text-zinc-500">Form confidence</dt><dd>{Math.round(form.confidence * 100)}% · {form.directVsInferred}</dd></div>
                      <div><dt className="text-zinc-500">Evidence references</dt><dd className="break-all">{form.evidenceRefs.length ? JSON.stringify(form.evidenceRefs) : "Not retained"}</dd></div>
                    </dl>
                    {form.fields.length ? <table className="w-full text-left text-xs">
                      <caption className="sr-only">Fields in {title}</caption>
                      <thead><tr>{["Field", "Element", "Input type", "Category", "Field review", "Required", "Selection", "State", "Autocomplete", "Confidence", "Evidence refs"].map(h => <th key={h} scope="col" className="border-b border-slate-200 px-2 py-2 font-medium">{h}</th>)}</tr></thead>
                      <tbody>{fieldsInPageOrder(form.fields).map(field => <tr key={field.fieldRef} className="border-b border-slate-100">
                        <th scope="row" className="px-2 py-2 font-medium">{field.label ?? field.fieldRef}</th>
                        <td className="px-2 py-2">{field.elementType}</td><td className="px-2 py-2">{field.controlKind ?? field.inputType}</td><td className="px-2 py-2 capitalize">{label(field.semanticCategory)}</td>
                        <td className="px-2 py-2"><FieldReview field={field}/></td><td className="px-2 py-2">{field.required ? "Yes" : "No"}</td><td className="px-2 py-2"><ControlState field={field}/></td><td className="px-2 py-2">{[field.disabled ? "Disabled" : "", field.readOnly ? "Read only" : ""].filter(Boolean).join(", ") || "Enabled"}</td><td className="px-2 py-2">{field.autocompleteToken ?? "Not specified"}</td><td className="px-2 py-2">{Math.round(field.confidence * 100)}% · {field.directVsInferred}</td><td className="max-w-64 break-all px-2 py-2">{field.evidenceRefs.length ? JSON.stringify(field.evidenceRefs) : "Not retained"}</td>
                      </tr>)}</tbody>
                    </table> : <p>No field details were retained.</p>}
                    {form.fieldsTruncated ? <p className="mt-3 text-amber-800">{form.candidateFieldCount - form.retainedFieldCount} field(s) were omitted by the capture limit.</p> : null}
                  </td></tr>
                </Fragment>;
              })}
            </tbody>
          </table>
        </div>}
      {rows.length > 3 ? <p className="mt-2 text-xs text-zinc-500">{rows.length} forms · 3 visible at a time. Scroll within the table for more.</p> : null}
      {snapshot ? <FormSnapshotDialog key={snapshot.url} {...snapshot} onClose={() => setSnapshot(null)} /> : null}
    </section>
  );
}
