"use client";

import { useState, type FormEvent } from "react";
import { Button, Input } from "@website-signal-risk-scanner/ui";

type KeyAccess = "read_only" | "scan_create";

type IssuedKeyResponse = {
  key: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: string;
  rateLimits?: {
    requestsPerMinute?: number;
    scanReadsPerDay?: number;
    scanCreatesPerDay?: number;
  };
};

function keyTypeLabel(access: KeyAccess) {
  return access === "scan_create" ? "Read + create scans" : "Read reports";
}

function defaultName(access: KeyAccess) {
  return access === "scan_create" ? "SDK trial scan key" : "Read-only API key";
}

export function SelfServeApiKeyCard() {
  const [access, setAccess] = useState<KeyAccess>("read_only");
  const [name, setName] = useState(defaultName("read_only"));
  const [pending, setPending] = useState(false);
  const [issued, setIssued] = useState<IssuedKeyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setIssued(null);

    try {
      const response = await fetch("/api/v2/keys/request", {
        body: JSON.stringify({
          access,
          name: name.trim() || defaultName(access)
        }),
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        method: "POST"
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.key) {
        const message = body?.error?.message ?? "Could not create an API key. Try again or contact support.";
        throw new Error(message);
      }
      setIssued(body as IssuedKeyResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create an API key. Try again or contact support.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 lg:grid-cols-[1fr,14rem,auto]">
        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-900">Key name</span>
          <Input name="name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-900">Access</span>
          <select
            name="access"
            value={access}
            onChange={(event) => {
              const nextAccess = event.target.value === "scan_create" ? "scan_create" : "read_only";
              setAccess(nextAccess);
              setName(defaultName(nextAccess));
            }}
            className="flex h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-ink shadow-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          >
            <option value="read_only">Read reports</option>
            <option value="scan_create">Read + create scans</option>
          </select>
        </label>
        <div className="flex items-end">
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Creating..." : "Create key"}
          </Button>
        </div>
      </form>

      <div className="grid gap-3 text-sm text-slate-600 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="font-semibold text-slate-950">cs_ro_</p>
          <p className="mt-1">Read existing scans, findings, reports, and MCP read tools.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <p className="font-semibold text-slate-950">cs_rw_</p>
          <p className="mt-1">Read access plus 5 fresh scan creations per day for SDK and REST trials.</p>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {issued ? (
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-950">Copy this key now</p>
            <p className="text-sm text-amber-900">
              This {keyTypeLabel(access).toLowerCase()} key will not be shown again. It expires at {new Date(issued.expiresAt).toLocaleString()}.
            </p>
          </div>
          <code className="block overflow-x-auto rounded-xl border border-amber-200 bg-white px-3 py-2 font-mono text-sm text-slate-950">
            {issued.key}
          </code>
          <div className="flex flex-wrap gap-2 text-xs text-amber-950">
            <span className="rounded-full bg-white px-2 py-1 font-mono">{issued.tokenPrefix}...</span>
            {issued.scopes.map((scope) => (
              <span key={scope} className="rounded-full bg-white px-2 py-1">
                {scope}
              </span>
            ))}
            {issued.rateLimits?.scanCreatesPerDay ? (
              <span className="rounded-full bg-white px-2 py-1">{issued.rateLimits.scanCreatesPerDay} scans/day</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
