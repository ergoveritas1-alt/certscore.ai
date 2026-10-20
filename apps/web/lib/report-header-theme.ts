export type ReportHeaderTheme = "white" | "black";

export function normalizeReportHeaderTheme(value: unknown): ReportHeaderTheme {
  return value === "black" ? "black" : "white";
}

export const REPORT_HEADER_PALETTES = {
  white: { background: "1 1 1", foreground: "0.12 0.18 0.27", muted: "0.32 0.39 0.47", matte: [255, 255, 255] },
  black: { background: "0 0 0", foreground: "1 1 1", muted: "0.79 0.84 0.89", matte: [0, 0, 0] },
} as const;
