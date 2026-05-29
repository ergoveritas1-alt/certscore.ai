import { formatScanFromLabel, normalizeScanFrom, type ScanFrom } from "@website-signal-risk-scanner/shared";

export type ScanFromDisplay = {
  label: string;
  value: ScanFrom;
};

export function getScanFromDisplay(scanConfig: Record<string, unknown> | null | undefined): ScanFromDisplay {
  const value = normalizeScanFrom(scanConfig?.scanFrom);
  return {
    label: formatScanFromLabel(value),
    value
  };
}
