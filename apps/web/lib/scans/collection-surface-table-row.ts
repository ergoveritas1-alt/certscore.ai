import type { CollectionSurfaceAssessment } from "@certscore/contracts";

export type CollectionSurfaceTableRow = {
  id: string;
  form: CollectionSurfaceAssessment["forms"][number];
  capturedAt: string;
  capturePhase?: "after_accept_click" | "after_accept";
  captureLimited?: boolean;
  captureProvenance?: {
    packetSha256: string; sessionId: string; frameRef: string; documentToken: string;
    exactTargetSha256: string; actionDispatchedAtMs: number; capturedAtMs: number;
  };
  snapshot: { status: "available"; url: string } | { status: "unavailable" | "withheld" | "pending"; reason?: string };
};
