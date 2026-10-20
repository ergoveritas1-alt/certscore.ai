"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { normalizeReportHeaderTheme, type ReportHeaderTheme } from "../../lib/report-header-theme";
import { saveWorkspaceLogoAction, saveWorkspaceReportHeaderAction } from "../../server/company/actions";

export function ReportBrandingCard({ companyId, name, logoUrl, canManage, headerTheme = "white" }: {
  companyId: string; name: string; logoUrl: string | null; canManage: boolean; headerTheme?: ReportHeaderTheme;
}) {
  const [state, action, pending] = useActionState(saveWorkspaceLogoAction, { error: null, success: null });
  const [headerState, headerAction, headerPending] = useActionState(saveWorkspaceReportHeaderAction, { error: null, success: null });
  const [selectedTheme, setSelectedTheme] = useState(normalizeReportHeaderTheme(headerTheme));
  useEffect(() => { setSelectedTheme(normalizeReportHeaderTheme(headerTheme)); }, [headerTheme]);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => {
    if (state.success) {
      setPreview(null);
      if (input.current) input.current.value = "";
    }
  }, [state]);

  if (!canManage) return <p className="text-sm text-slate-500">Advanced access is required to upload a workspace logo and use white-label reports.</p>;

  return <div className="space-y-4">
    <div aria-label="Report header preview" className={`flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 p-4 ${selectedTheme === "black" ? "bg-black text-white" : "bg-white text-slate-900"}`}>
      <div className="flex h-24 w-48 items-center justify-center rounded-xl border border-slate-200 bg-white p-3">
        {preview || logoUrl ? <img alt={`${name} report logo`} className="max-h-full max-w-full object-contain" src={preview ?? logoUrl!} /> : <span className="text-sm text-slate-400">No workspace logo</span>}
      </div>
      <div className="min-w-0 flex-1"><p className="break-words text-lg font-semibold">{name}</p><p className={`text-sm ${selectedTheme === "black" ? "text-slate-300" : "text-slate-500"}`}>Executive summary · Report header preview</p></div>
    </div>
    <p className="text-sm text-slate-600">Your workspace logo and header style appear on report pages and PDF exports.</p>
    <form action={headerAction} className="space-y-3">
      <input name="companyId" type="hidden" value={companyId} />
      <fieldset disabled={headerPending} className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">Report header</legend>
        <div className="flex flex-wrap gap-3">{(["white", "black"] as const).map(theme => <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700" key={theme}>
          <input checked={selectedTheme === theme} name="headerTheme" onChange={() => setSelectedTheme(theme)} type="radio" value={theme} />
          <span aria-hidden="true" className={`h-4 w-6 rounded border border-slate-300 ${theme === "black" ? "bg-black" : "bg-white"}`} />
          {theme === "white" ? "White" : "Black"}
        </label>)}</div>
      </fieldset>
      <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50" disabled={headerPending} type="submit">{headerPending ? "Saving…" : "Save header style"}</button>
      <div aria-live="polite">{headerState.error ? <p className="text-sm text-rose-700" role="alert">{headerState.error}</p> : headerState.success ? <p className="text-sm text-emerald-700">{headerState.success}</p> : null}</div>
    </form>
    <p className="text-xs text-slate-500">PNG, JPEG, or WebP up to 2 MB. Use a still image with up to 4 million pixels. A transparent or white background works best.</p>
    {canManage ? <form action={action} className="space-y-3">
      <input name="companyId" type="hidden" value={companyId} />
      <label className="block text-sm font-medium text-slate-700">Choose report logo
        <input ref={input} accept="image/png,image/jpeg,image/webp" className="mt-2 block max-w-full text-sm" disabled={pending} name="logo" type="file" onChange={(event) => {
          const file = event.target.files?.[0];
          const error = file && (file.size > 2 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) ? "Choose a PNG, JPEG, or WebP file up to 2 MB." : null;
          setFileError(error);
          setPreview(file && !error ? URL.createObjectURL(file) : null);
        }} />
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <button className="app-raised-button app-raised-button-dark rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={pending || !preview || Boolean(fileError)} name="intent" type="submit" value="upload">{pending ? "Saving…" : logoUrl ? "Replace logo" : "Upload logo"}</button>
        {logoUrl ? <button className="text-sm font-semibold text-rose-700 disabled:opacity-50" disabled={pending} name="intent" type="submit" value="remove">Remove logo</button> : null}
      </div>
    </form> : <p className="text-sm text-slate-500">Ask a workspace manager to upload or change the report logo.</p>}
    <div aria-live="polite">{fileError || state.error ? <p className="text-sm text-rose-700" role="alert">{fileError ?? state.error}</p> : state.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}</div>
  </div>;
}
