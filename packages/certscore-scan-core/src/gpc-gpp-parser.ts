/** Pure bounded projection shared by immediate readback and event capture.
 * Safe to serialize into the browser: no imports, raw strings or external state. */
export function parseGpcGppPing(value: unknown) {
  const p = value as Record<string, any> | null;
  const empty = (status: "not_ready" | "unsupported" | "invalid", reason: string) => ({ status, state: null, reason });
  if (!p || typeof p !== "object") return empty("invalid", "malformed_ping");
  if (p.gppVersion !== "1.1") return empty("unsupported", "unsupported_api_version");
  if (p.cmpStatus !== "loaded" || p.signalStatus !== "ready") return empty("not_ready", "cmp_or_signal_not_ready");
  if (!Array.isArray(p.applicableSections) || !Array.isArray(p.sectionList) ||
    p.applicableSections.length > 3 || p.sectionList.length > 32 ||
    new Set(p.applicableSections).size !== p.applicableSections.length ||
    new Set(p.sectionList).size !== p.sectionList.length) return empty("invalid", "invalid_section_inventory");
  const applicable = p.applicableSections.filter((id: unknown) => id === 7 || id === 8);
  if (!applicable.length) return empty("unsupported", "no_supported_applicable_section");
  if (applicable.length !== 1 || !p.sectionList.includes(applicable[0])) return empty("invalid", "ambiguous_or_missing_applicable_section");
  const sectionId = applicable[0] as 7 | 8;
  const sections = p.parsedSections?.[sectionId === 8 ? "usca" : "usnat"];
  // Sourcepoint documents flattened US National and California ping representations. Preserve
  // exactly those fields; this is not a fallback to cookies or guessed consent.
  // https://sourcepoint-public-api.readme.io/reference/ping-1
  const flattened = sections && typeof sections === "object" && !Array.isArray(sections);
  if (!flattened && (!Array.isArray(sections) || sections.length < 1 || sections.length > 2)) return empty("invalid", "invalid_subsection_shape");
  const core = flattened ? sections : sections[0];
  const signal = flattened ? (sections.Gpc !== undefined || sections.GpcSegmentType !== undefined ?
    { SubsectionType: sections.GpcSegmentType, Gpc: sections.Gpc } : undefined) : sections[1];
  if (!core || typeof core !== "object" ||
    (sectionId === 8 ? core.Version !== 1 : ![1, 2].includes(core.Version)) ||
    [core.SaleOptOutNotice, core.SharingOptOutNotice, core.SaleOptOut, core.SharingOptOut].some(v => v !== 0 && v !== 1 && v !== 2) ||
    (signal !== undefined && (!signal || signal.SubsectionType !== 1 || typeof signal.Gpc !== "boolean"))) return empty("invalid", "invalid_subsection_fields");
  return { status: "observed" as const, reason: flattened ? (sectionId === 8 ? "ready_usca_flat_object" : "ready_usnat_flat_object") : "ready_supported_state", state: { apiVersion: "1.1" as const, sectionId, sectionVersion: core.Version as 1 | 2,
    cmpStatus: "loaded" as const, signalStatus: "ready" as const, saleNotice: core.SaleOptOutNotice as 0 | 1 | 2,
    sharingNotice: core.SharingOptOutNotice as 0 | 1 | 2, saleOptOut: core.SaleOptOut as 0 | 1 | 2,
    sharingOptOut: core.SharingOptOut as 0 | 1 | 2, gpc: (signal?.Gpc ?? null) as boolean | null } };
}
