import type { ScanChangeEventType } from "@website-signal-risk-scanner/shared";
import type { DerivedSignalInsert } from "./derive-scan-signals";

type ComparableSignal = Pick<DerivedSignalInsert, "category" | "signal_key" | "signal_label" | "signal_value_json">;

type DerivedChangeEvent = {
  eventType: ScanChangeEventType;
  message: string;
  metadata: Record<string, unknown>;
};

function isActiveValue(value: ComparableSignal["signal_value_json"]) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value > 0;
  }

  if (typeof value === "string") {
    return value.length > 0;
  }

  return value.length > 0;
}

function valuesEqual(
  left: ComparableSignal["signal_value_json"] | undefined,
  right: ComparableSignal["signal_value_json"] | undefined
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function compareScanSignals(input: {
  currentSignals: ComparableSignal[];
  previousScanId: string | null;
  previousSignals: ComparableSignal[];
}) {
  if (!input.previousScanId) {
    return {
      summary: {
        comparedToScanId: null,
        isBaseline: true,
        addedCount: 0,
        removedCount: 0,
        changedCount: 0,
        trackerDetectedCount: 0,
        trackerRemovedCount: 0
      },
      events: [] as DerivedChangeEvent[]
    };
  }

  const previousMap = new Map(input.previousSignals.map((signal) => [signal.signal_key, signal]));
  const currentMap = new Map(input.currentSignals.map((signal) => [signal.signal_key, signal]));
  const signalKeys = new Set([...previousMap.keys(), ...currentMap.keys()]);
  const events: DerivedChangeEvent[] = [];
  let addedCount = 0;
  let removedCount = 0;
  let changedCount = 0;
  let trackerDetectedCount = 0;
  let trackerRemovedCount = 0;

  for (const signalKey of signalKeys) {
    const previousSignal = previousMap.get(signalKey);
    const currentSignal = currentMap.get(signalKey);
    const previousValue = previousSignal?.signal_value_json;
    const currentValue = currentSignal?.signal_value_json;

    if (previousSignal && currentSignal && valuesEqual(previousValue, currentValue)) {
      continue;
    }

    const signal = currentSignal ?? previousSignal;

    if (!signal) {
      continue;
    }

    const label = signal.signal_label;
    const isTrackerSignal = signal.signal_key.startsWith("privacy.tracker_vendor_");
    const previousActive = previousSignal ? isActiveValue(previousSignal.signal_value_json) : false;
    const currentActive = currentSignal ? isActiveValue(currentSignal.signal_value_json) : false;

    if (!previousActive && currentActive) {
      const eventType: ScanChangeEventType = isTrackerSignal ? "tracker_detected" : "signal_added";
      events.push({
        eventType,
        message: isTrackerSignal ? `Tracker detected: ${label}.` : `Signal added: ${label}.`,
        metadata: {
          category: signal.category,
          currentValue: currentValue ?? null,
          previousValue: previousValue ?? null,
          signalKey: signal.signal_key
        }
      });
      if (isTrackerSignal) {
        trackerDetectedCount += 1;
      } else {
        addedCount += 1;
      }
      continue;
    }

    if (previousActive && !currentActive) {
      const eventType: ScanChangeEventType = isTrackerSignal ? "tracker_removed" : "signal_removed";
      events.push({
        eventType,
        message: isTrackerSignal ? `Tracker removed: ${label}.` : `Signal removed: ${label}.`,
        metadata: {
          category: signal.category,
          currentValue: currentValue ?? null,
          previousValue: previousValue ?? null,
          signalKey: signal.signal_key
        }
      });
      if (isTrackerSignal) {
        trackerRemovedCount += 1;
      } else {
        removedCount += 1;
      }
      continue;
    }

    events.push({
      eventType: "signal_changed",
      message: `Signal changed: ${label}.`,
      metadata: {
        category: signal.category,
        currentValue: currentValue ?? null,
        previousValue: previousValue ?? null,
        signalKey: signal.signal_key
      }
    });
    changedCount += 1;
  }

  return {
    summary: {
      comparedToScanId: input.previousScanId,
      isBaseline: false,
      addedCount,
      removedCount,
      changedCount,
      trackerDetectedCount,
      trackerRemovedCount
    },
    events
  };
}
