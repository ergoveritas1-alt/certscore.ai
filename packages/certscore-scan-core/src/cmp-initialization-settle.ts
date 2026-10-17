import type { NetworkEvent } from "@certscore/contracts";
import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";

export const CMP_INITIALIZATION_SETTLE_POLICY = Object.freeze({
  version: "cmp_initialization_settle.v1",
  ownerApprovedMaximumWaitMs: 4000,
  // At 3008 MB, 2.5s across worker + coordinator is about $24.48 per
  // 100k affected scans at the repository planning rate, before overlap.
  maxWaitMs: 2500,
  quietMs: 250,
  maxTrackedRequests: 128,
} as const);

type Binding = { url: string; token?: string };
type Status = "pending" | "completed" | "failed";
type WaitOutcome = "not_needed" | "settled" | "budget_exhausted" | "document_changed" | "cancelled" | "closed" | "overflow";
export type CmpInitializationWaitResult = { outcome: WaitOutcome; durationMs: number };

/** This is a routing hint for an already-observed passive load, not CMP state,
 * initialization success, observation completeness, or a finding. */
export function isRegisteredCmpInitializationRequest(event: Pick<NetworkEvent, "method" | "requestUrl" | "resourceType" | "isMainFrame">) {
  if (event.method !== "GET" || !event.isMainFrame) return false;
  try {
    const url = new URL(event.requestUrl);
    if (url.username || url.password || url.hash || event.requestUrl.length > 2000) return false;
    return KNOWN_CMP_REGISTRY.some(definition => definition.passiveInitializationRequests?.endpoints.some(endpoint =>
      url.origin === endpoint.origin && endpoint.resourceTypes.some(type => type === event.resourceType) && endpoint.path.test(url.pathname)));
  } catch { return false; }
}

/** Observes existing request/response/finish events. Never fetches, polls the
 * browser, retries, clicks, follows navigation, or extends the caller's deadline.
 * One optional wait per consent visit, inside the existing 24-second gate. */
export function createCmpInitializationTracker(input: {
  readBinding: () => Binding;
  isCurrent: () => boolean;
  signal?: AbortSignal;
}) {
  const rows = new Map<string, { binding: Binding; status: Status }>();
  const changed = new Set<() => void>();
  let closed = false, overflow = false, waited = false;
  let lastSuccessfulCompletionAt: number | undefined;
  const same = (a: Binding, b: Binding) => Boolean(a.token && a.token === b.token && a.url === b.url);
  const currentRows = () => [...rows.values()].filter(row => same(row.binding, input.readBinding()));
  const pending = () => currentRows().filter(row => row.status === "pending").length;
  const notify = () => { for (const listener of changed) listener(); };
  const snapshot = () => {
    const current = currentRows();
    return { version: CMP_INITIALIZATION_SETTLE_POLICY.version, matched: current.length,
      pending: current.filter(row => row.status === "pending").length,
      completed: current.filter(row => row.status === "completed").length,
      failed: current.filter(row => row.status === "failed").length, overflow };
  };
  return {
    recordRequest(event: NetworkEvent) {
      if (closed) return;
      const binding = input.readBinding();
      if (input.isCurrent() && binding.token && event.documentUrl === binding.url && isRegisteredCmpInitializationRequest(event)) {
        if (!rows.has(event.requestId) && rows.size >= CMP_INITIALIZATION_SETTLE_POLICY.maxTrackedRequests) overflow = true;
        else rows.set(event.requestId, { binding, status: "pending" });
      }
      notify();
    },
    recordResponse(requestId: string | undefined, status: number) {
      if (closed || !requestId) return;
      const row = rows.get(requestId);
      if (row && status >= 400) row.status = "failed";
      notify();
    },
    finish(requestId: string | undefined, status: Exclude<Status, "pending">) {
      if (closed || !requestId) return;
      const row = rows.get(requestId);
      if (row && row.status === "pending") {
        row.status = status;
        if (status === "completed" && same(row.binding, input.readBinding())) lastSuccessfulCompletionAt = Date.now();
      }
      notify();
    },
    notifyBindingChanged: notify,
    snapshot,
    close() { closed = true; notify(); },
    async waitForReady(deadlineAtMs: number): Promise<CmpInitializationWaitResult> {
      const started = Date.now();
      if (closed) return { outcome: "closed", durationMs: 0 };
      if (overflow) return { outcome: "overflow", durationMs: 0 };
      const recentlyCompleted = lastSuccessfulCompletionAt !== undefined &&
        started - lastSuccessfulCompletionAt < CMP_INITIALIZATION_SETTLE_POLICY.quietMs;
      if (waited || (!pending() && !recentlyCompleted) || !input.isCurrent()) return { outcome: "not_needed", durationMs: 0 };
      const deadline = Math.min(deadlineAtMs, started + CMP_INITIALIZATION_SETTLE_POLICY.maxWaitMs);
      if (deadline <= started) return { outcome: "budget_exhausted", durationMs: 0 };
      waited = true;
      const binding = input.readBinding();
      return await new Promise(resolve => {
        let ended = false;
        let quietTimer: ReturnType<typeof setTimeout> | undefined;
        const finish = (outcome: WaitOutcome) => {
          if (ended) return;
          ended = true;
          clearTimeout(deadlineTimer);
          if (quietTimer) clearTimeout(quietTimer);
          changed.delete(check);
          input.signal?.removeEventListener("abort", aborted);
          resolve({ outcome, durationMs: Date.now() - started });
        };
        const aborted = () => finish("cancelled");
        const check = () => {
          if (closed) return finish("closed");
          if (input.signal?.aborted || !input.isCurrent()) return finish("cancelled");
          if (!same(binding, input.readBinding())) return finish("document_changed");
          if (overflow) return finish("overflow");
          if (Date.now() >= deadline) return finish("budget_exhausted");
          if (pending()) {
            if (quietTimer) clearTimeout(quietTimer);
            quietTimer = undefined;
          } else if (!quietTimer) {
            quietTimer = setTimeout(() => {
              if (closed) return finish("closed");
              if (input.signal?.aborted || !input.isCurrent()) return finish("cancelled");
              if (!same(binding, input.readBinding())) return finish("document_changed");
              finish(Date.now() < deadline ? "settled" : "budget_exhausted");
            }, CMP_INITIALIZATION_SETTLE_POLICY.quietMs);
          }
        };
        const deadlineTimer = setTimeout(() => finish("budget_exhausted"), deadline - started);
        changed.add(check);
        input.signal?.addEventListener("abort", aborted, { once: true });
        check();
      });
    },
  };
}
