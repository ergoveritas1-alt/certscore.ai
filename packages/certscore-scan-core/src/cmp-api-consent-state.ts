import type { Frame, Page } from "playwright";

export type CmpApiConsentProvider = "termly" | "transcend";

export type CmpApiConsentSnapshot = {
  canonicalState: string;
  decision: "granted" | "denied" | "mixed" | "unknown";
  eventSequence: number;
};

export async function readCmpApiConsentSnapshot(
  scope: Page | Frame,
  provider: CmpApiConsentProvider,
): Promise<CmpApiConsentSnapshot | undefined> {
  return scope.evaluate(async ({ provider }) => {
    if (provider === "termly") {
      const target = window as unknown as {
        Termly?: {
          getConsentState?: () => unknown;
          on?: (event: string, callback: (data: any) => void) => void;
        };
        __certscoreTermlyConsentEvents?: {
          sequence: number;
          consentState?: unknown;
        };
      };
      if (!target.Termly || typeof target.Termly.getConsentState !== "function") return undefined;
      if (!target.__certscoreTermlyConsentEvents && typeof target.Termly.on === "function") {
        const tracker = { sequence: 0, consentState: undefined as unknown };
        Object.defineProperty(target, "__certscoreTermlyConsentEvents", {
          configurable: false,
          enumerable: false,
          value: tracker,
          writable: false,
        });
        target.Termly.on("consent", (data) => {
          tracker.sequence += 1;
          tracker.consentState = data?.consentState;
        });
      }
      const raw = target.__certscoreTermlyConsentEvents?.consentState ??
        await Promise.resolve(target.Termly.getConsentState());
      if (!raw || typeof raw !== "object") return undefined;
      const entries = Object.entries(raw as Record<string, unknown>)
        .filter(([key, value]) =>
          typeof value === "boolean" && key.toLowerCase() !== "essential"
        )
        .sort(([left], [right]) => left.localeCompare(right));
      if (entries.length === 0) return undefined;
      const values = entries.map(([, value]) => value === true);
      const decision = values.every(Boolean)
        ? "granted" as const
        : values.every((value) => !value)
          ? "denied" as const
          : "mixed" as const;
      return {
        canonicalState: JSON.stringify(entries),
        decision,
        eventSequence: target.__certscoreTermlyConsentEvents?.sequence ?? 0,
      };
    }

    const target = window as unknown as {
      airgap?: {
        getConsent?: () => { purposes?: unknown; timestamp?: unknown };
        sync?: () => Promise<unknown>;
      };
    };
    if (!target.airgap || typeof target.airgap.getConsent !== "function") return undefined;
    if (typeof target.airgap.sync === "function") await target.airgap.sync().catch(() => undefined);
    const consent = target.airgap.getConsent();
    const purposes = consent?.purposes;
    if (!purposes || typeof purposes !== "object") return undefined;
    const entries = Object.entries(purposes as Record<string, unknown>)
      .filter(([key, value]) =>
        typeof value === "boolean" && !["essential", "unknown"].includes(key.toLowerCase())
      )
      .sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0) return undefined;
    const values = entries.map(([, value]) => value === true);
    const decision = values.every(Boolean)
      ? "granted" as const
      : values.every((value) => !value)
        ? "denied" as const
        : "mixed" as const;
    return {
      canonicalState: JSON.stringify({
        purposes: entries,
        timestamp: typeof consent.timestamp === "string" ? consent.timestamp.slice(0, 64) : null,
      }),
      decision,
      eventSequence: 0,
    };
  }, { provider }).catch(() => undefined);
}
