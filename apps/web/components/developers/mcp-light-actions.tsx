"use client";

import { Button, Input } from "@website-signal-risk-scanner/ui";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { pushDataLayerEvent } from "../../lib/analytics/data-layer";

export function McpLightTrackedLink({
  children,
  className,
  href,
  trackingTarget
}: {
  children: ReactNode;
  className: string;
  href: string;
  trackingTarget: string;
}) {
  return (
    <a
      className={className}
      href={href}
      onClick={() => pushDataLayerEvent({ event: "mcp_light_action", action: "connect", target: trackingTarget })}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

export function CopyMcpValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
  }, []);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    pushDataLayerEvent({ event: "mcp_light_action", action: "copy", target: label });
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:border-sky-400 hover:text-sky-800" onClick={copy} type="button">
      {copied ? "Copied" : `Copy ${label}`}
    </button>
  );
}

export function McpLightScanDemo() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    pushDataLayerEvent({ event: "mcp_light_action", action: "scan", target: "live_demo" });

    try {
      const response = await fetch("/api/v2/scans", {
        body: JSON.stringify({ freshness: "latest", scanFrom: "eu_ie", url }),
        headers: { "Content-Type": "application/json", "X-CertScore-Client": "mcp_light_landing" },
        method: "POST"
      });
      const payload = await response.json() as { error?: { message?: string }; scanId?: string };
      if (!response.ok || !payload.scanId) {
        throw new Error(payload.error?.message || "The scan could not be started.");
      }
      router.push(`/scan/${payload.scanId}?source=mcp-light-demo`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The scan could not be started.");
      setPending(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input aria-label="Public website URL" onChange={(event) => setUrl(event.target.value)} placeholder="https://ergoveritas.com/.well-known/certscore-canary/sentinels/broad-baseline.html" required type="url" value={url} />
        <Button disabled={pending} type="submit">{pending ? "Starting…" : "Run a free scan"}</Button>
      </div>
      <p className="text-xs leading-5 text-slate-500">No account or API key. This webpage demo uses the separate anonymous API allowance of 20 new scans per requester IP per UTC day; eligible recent-result reuse does not consume that allowance.</p>
      {error ? <p className="text-sm text-amber-800">{error} Contact support@certscore.ai if you need help or higher volume.</p> : null}
    </form>
  );
}
