"use client";

import { useActionState } from "react";
import { Button, Input } from "@website-signal-risk-scanner/ui";
import {
  createIntegrationApiKeyAction,
  initialApiKeyActionState,
  revokeIntegrationApiKeyAction
} from "../../server/integrations/api-key-actions";
import type { IntegrationApiKeyRecord } from "../../server/integrations/api-keys";

type ApiKeysCardProps = {
  apiKeys: IntegrationApiKeyRecord[];
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).format(new Date(value));
}

function formatExpiry(value: string | null) {
  if (!value) {
    return "No expiry";
  }
  return formatDateTime(value);
}

function scopeLabel(scope: string) {
  if (scope === "pulse:read") {
    return "Read reports";
  }
  if (scope === "pulse:scan") {
    return "Create scans";
  }
  if (scope === "mcp") {
    return "MCP";
  }
  return scope;
}

export function ApiKeysCard({ apiKeys }: ApiKeysCardProps) {
  const [createState, createAction, createPending] = useActionState(createIntegrationApiKeyAction, initialApiKeyActionState);
  const [revokeState, revokeAction, revokePending] = useActionState(revokeIntegrationApiKeyAction, initialApiKeyActionState);

  return (
    <div className="space-y-6">
      <form action={createAction} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 lg:grid-cols-[1fr,12rem,auto]">
        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-900">Key name</span>
          <Input name="name" placeholder="Claude desktop MCP" maxLength={80} required />
        </label>
        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-900">Expires in</span>
          <select
            name="expiresInDays"
            defaultValue="90"
            className="flex h-11 w-full rounded-xl border border-slate-300 bg-white px-4 text-sm text-ink shadow-sm outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
          >
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
            <option value="365">1 year</option>
          </select>
        </label>
        <div className="flex items-end">
          <input type="hidden" name="scopes" value="pulse:read" />
          <input type="hidden" name="scopes" value="pulse:scan" />
          <input type="hidden" name="scopes" value="mcp" />
          <Button type="submit" disabled={createPending} className="w-full">
            {createPending ? "Creating..." : "Create key"}
          </Button>
        </div>
      </form>

      {createState.error ? <p className="text-sm text-red-600">{createState.error}</p> : null}
      {revokeState.error ? <p className="text-sm text-red-600">{revokeState.error}</p> : null}
      {revokeState.success ? <p className="text-sm text-emerald-700">{revokeState.success}</p> : null}

      {createState.token ? (
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-950">Copy this key now</p>
            <p className="text-sm text-amber-900">Only the hash is stored, so this full token will not be shown again.</p>
          </div>
          <code className="block overflow-x-auto rounded-xl border border-amber-200 bg-white px-3 py-2 font-mono text-sm text-slate-950">
            {createState.token}
          </code>
        </div>
      ) : createState.success ? (
        <p className="text-sm text-emerald-700">{createState.success}</p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="grid grid-cols-[1fr,9rem,9rem,7rem] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          <span>Name</span>
          <span>Last used</span>
          <span>Expires</span>
          <span>Status</span>
        </div>
        {apiKeys.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-600">No API keys yet.</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {apiKeys.map((apiKey) => (
              <ApiKeyRow key={apiKey.publicId} apiKey={apiKey} revokeAction={revokeAction} revokePending={revokePending} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ApiKeyRow({
  apiKey,
  revokeAction,
  revokePending
}: {
  apiKey: IntegrationApiKeyRecord;
  revokeAction: (payload: FormData) => void;
  revokePending: boolean;
}) {
  const expired = apiKey.expiresAt ? new Date(apiKey.expiresAt).getTime() <= Date.now() : false;
  const statusLabel = apiKey.status === "revoked" ? "revoked" : expired ? "expired" : "active";
  const statusClasses =
    statusLabel === "active"
      ? "bg-emerald-50 text-emerald-700"
      : statusLabel === "expired"
        ? "bg-amber-50 text-amber-700"
        : "bg-slate-100 text-slate-500";

  return (
    <div className="grid gap-3 px-4 py-4 text-sm text-slate-600 lg:grid-cols-[1fr,9rem,9rem,7rem]">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-slate-950">{apiKey.name}</p>
          <code className="rounded-full bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600">{apiKey.tokenPrefix}...</code>
        </div>
        <div className="flex flex-wrap gap-2">
          {apiKey.scopes.map((scope) => (
            <span key={scope} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
              {scopeLabel(scope)}
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-500">Created {formatDateTime(apiKey.createdAt)}</p>
      </div>
      <p>{formatDateTime(apiKey.lastUsedAt)}</p>
      <p>{formatExpiry(apiKey.expiresAt)}</p>
      <div className="space-y-2">
        <span className={["inline-flex rounded-full px-2 py-1 text-xs font-medium", statusClasses].join(" ")}>{statusLabel}</span>
        {apiKey.status === "active" ? (
          <form action={revokeAction}>
            <input type="hidden" name="publicId" value={apiKey.publicId} />
            <Button type="submit" size="sm" variant="secondary" disabled={revokePending}>
              Revoke
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
