import { createHash } from "node:crypto";
import { googleTagContextSchema, type GoogleTagContext } from "@certscore/contracts";

/** Renderer output is sanitized and validated again before entering retained evidence. */
export function retainGoogleTagContext(raw: unknown, binding: {
  documentToken?: string; documentUrl: string; capturedAtEpochMs: number;
}): GoogleTagContext | undefined {
  if (!binding.documentToken || !raw || typeof raw !== "object") return;
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  try {
    const value = raw as Record<string, unknown>;
    if (!Array.isArray(value.rows) || value.rows.length > 8) return;
    const rows = value.rows.map((candidate: unknown) => {
      if (!candidate || typeof candidate !== "object") throw Error("invalid queue context");
      const row = candidate as Record<string, unknown>;
      if (typeof row.queue !== "string" || !/^[A-Za-z_$][\w$]{0,63}$/.test(row.queue) ||
        !Array.isArray(row.destinations) || row.destinations.length > 4) throw Error("invalid queue context");
      return { queueHash: sha(row.queue), queueIndex: row.queueIndex, command: row.command,
        ...(row.eventKind ? { eventKind: row.eventKind } : {}),
        destinations: row.destinations.map((route: unknown) => {
          if (typeof route !== "string" || route.length > 160) throw Error("invalid destination");
          const match = /^(G-[A-Z0-9]{1,60}|AW-[0-9]{1,30}|DC-[0-9]{1,30}|GT-[A-Z0-9]{1,60})(\/[A-Za-z0-9_.-]{1,80})?$/.exec(route);
          if (!match) throw Error("invalid destination");
          return { namespace: match[1]!.split("-")[0], tagIdHash: sha(match[1]!), routeHash: sha(route), conversionLabelPresent: Boolean(match[2]) };
        }), settings: row.settings };
    });
    const result = googleTagContextSchema.safeParse({
      contractVersion: "google_tag_context.v1", scope: "main_document_queue_snapshot",
      documentToken: binding.documentToken, documentUrlSha256: sha(binding.documentUrl), capturedAtEpochMs: binding.capturedAtEpochMs,
      backendAdsLink: "not_observable", audienceUse: "not_established", coverage: "sampled",
      queuesObserved: value.queuesObserved, inspectedEntries: value.inspectedEntries, limitations: value.limitations, rows,
    });
    return result.success ? result.data : undefined;
  } catch { return; }
}
