import { setTimeout as delay } from "node:timers/promises";

export type LocalGpcAdaptiveOutcome = {durationMs: number; peerDocumentToken: string; outcome: "quiet" | "cap"};
export type LocalGpcAdaptiveParticipant = {
  commit(documentToken: string): void;
  request(offsetMs: number): void;
  poll(): LocalGpcAdaptiveOutcome | undefined;
  wait(signal?: AbortSignal): Promise<LocalGpcAdaptiveOutcome>;
  fail(): void;
};

export function createLocalGpcAdaptivePair(input: {scanId: string; now?: () => number}) {
  const now = input.now ?? Date.now;
  const lanes = new Map<string, {token?: string; committedAt?: number}>();
  let durationMs = 5000;
  let failed = false;
  let complete = false;
  return {
    participant(scanId: string, lane: "runtime_evidence" | "gpc_observation"): LocalGpcAdaptiveParticipant {
      if (scanId !== input.scanId || lanes.has(lane)) throw new Error("adaptive_participant_mismatch");
      const state: {token?: string; committedAt?: number} = {};
      lanes.set(lane, state);
      const poll = (): LocalGpcAdaptiveOutcome | undefined => {
        if (failed) throw new Error("adaptive_pair_unavailable");
        const peer = lanes.get(lane === "runtime_evidence" ? "gpc_observation" : "runtime_evidence");
        if (state.committedAt === undefined || !state.token) throw new Error("adaptive_document_unavailable");
        if (!peer?.token || peer.committedAt === undefined) {
          if (now() - state.committedAt >= 15000) {failed = true; throw new Error("adaptive_pair_unavailable");}
          return;
        }
        const elapsedMs = now() - state.committedAt;
        if (Math.min(elapsedMs, now() - peer.committedAt) >= durationMs) complete = true;
        if (!complete && elapsedMs >= 15000) {durationMs = 15000;complete = true;}
        return complete && elapsedMs >= durationMs ? {durationMs, peerDocumentToken: peer.token, outcome: durationMs === 15000 ? "cap" : "quiet"} : undefined;
      };
      return {
        commit(documentToken) {
          if (!documentToken || state.token || complete || failed) {failed = true; return;}
          state.token = documentToken;
          state.committedAt = now();
        },
        request(offsetMs) {
          if (complete || failed || !state.token || !Number.isFinite(offsetMs) || offsetMs < 0 || offsetMs >= durationMs) return;
          durationMs = Math.max(durationMs, Math.min(15000, Math.ceil(offsetMs) + 2000));
        },
        poll,
        async wait(signal) {
          while (true) {
            signal?.throwIfAborted();
            const outcome = poll();
            if (outcome) return outcome;
            await delay(25, undefined, {signal});
          }
        },
        fail() {failed = true;},
      };
    },
  };
}
