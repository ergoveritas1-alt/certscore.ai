"use client";
import { useActionState } from "react";
import { marketplaceAction } from "../../server/marketplace/actions";

export function MarketplaceLightAction({ operation, licenseArn, label }: { operation: "claim" | "rotate" | "revoke"; licenseArn?: string; label: string }) {
  const [state, action, pending] = useActionState(marketplaceAction, { message: "", key: null });
  return <form action={action} className="space-y-3">
    <input type="hidden" name="operation" value={operation} />
    {licenseArn && <input type="hidden" name="licenseArn" value={licenseArn} />}
    <button disabled={pending} className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-medium disabled:opacity-50">{pending ? "Working..." : label}</button>
    {state.message && <p role="status" className="text-sm">{state.message}</p>}
    {state.key && <label className="block text-sm">New API key (shown only now)<input readOnly value={state.key} autoComplete="off" spellCheck={false} className="mt-2 block w-full rounded border p-2 font-mono" onFocus={event => event.target.select()} /></label>}
  </form>;
}
