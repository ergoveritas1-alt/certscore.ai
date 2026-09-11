/** Pure bounded projection shared by immediate readback and event capture.
 * Safe to serialize into the browser: no imports, raw strings or external state.
 * Diagnostic codes are a fixed vocabulary; no GPP payload fields are retained.
 */
export function parseGpcGppPing(value: unknown) {
  type DiagnosticCode =
    | "ping_not_object" | "gpp_version_unsupported" | "cmp_status_not_loaded" | "signal_status_not_ready"
    | "applicable_sections_not_array" | "section_list_not_array" | "section_inventory_too_large"
    | "duplicate_applicable_section" | "duplicate_section_list_id" | "no_supported_applicable_section"
    | "ambiguous_applicable_sections" | "applicable_section_missing_from_list" | "parsed_section_missing"
    | "subsection_shape_invalid" | "section_version_invalid" | "sale_notice_invalid"
    | "sharing_notice_invalid" | "sale_opt_out_invalid" | "sharing_opt_out_invalid"
    | "gpc_subsection_type_invalid" | "gpc_subsection_type_missing" | "gpc_subsection_type_conflict" | "gpc_value_invalid" | "flat_usca_section" | "flat_usnat_section";
  const empty = (status: "not_ready" | "unsupported" | "invalid", reason: string, diagnosticCodes: DiagnosticCode[]) =>
    ({ status, state: null, reason, diagnosticCodes });
  const p = value as Record<string, any> | null;
  if (!p || typeof p !== "object") return empty("invalid", "malformed_ping", ["ping_not_object"]);
  if (p.gppVersion !== "1.1") return empty("unsupported", "unsupported_api_version", ["gpp_version_unsupported"]);
  const readinessCodes: DiagnosticCode[] = [];
  if (p.cmpStatus !== "loaded") readinessCodes.push("cmp_status_not_loaded");
  if (p.signalStatus !== "ready") readinessCodes.push("signal_status_not_ready");
  if (readinessCodes.length) return empty("not_ready", "cmp_or_signal_not_ready", readinessCodes);
  const inventoryCodes: DiagnosticCode[] = [];
  if (!Array.isArray(p.applicableSections)) inventoryCodes.push("applicable_sections_not_array");
  if (!Array.isArray(p.sectionList)) inventoryCodes.push("section_list_not_array");
  if (Array.isArray(p.applicableSections) && p.applicableSections.length > 3) inventoryCodes.push("section_inventory_too_large");
  if (Array.isArray(p.sectionList) && p.sectionList.length > 32) inventoryCodes.push("section_inventory_too_large");
  if (Array.isArray(p.applicableSections) && p.applicableSections.length <= 3 && new Set(p.applicableSections).size !== p.applicableSections.length) inventoryCodes.push("duplicate_applicable_section");
  if (Array.isArray(p.sectionList) && p.sectionList.length <= 32 && new Set(p.sectionList).size !== p.sectionList.length) inventoryCodes.push("duplicate_section_list_id");
  if (inventoryCodes.length) return empty("invalid", "invalid_section_inventory", [...new Set(inventoryCodes)]);
  const applicable = p.applicableSections.filter((id: unknown) => id === 7 || id === 8);
  if (!applicable.length) return empty("unsupported", "no_supported_applicable_section", ["no_supported_applicable_section"]);
  if (applicable.length !== 1) return empty("invalid", "ambiguous_or_missing_applicable_section", ["ambiguous_applicable_sections"]);
  if (!p.sectionList.includes(applicable[0])) return empty("invalid", "ambiguous_or_missing_applicable_section", ["applicable_section_missing_from_list"]);
  const sectionId = applicable[0] as 7 | 8;
  const sections = p.parsedSections?.[sectionId === 8 ? "usca" : "usnat"];
  // Sourcepoint documents flattened US National and California ping representations. Preserve
  // exactly those fields; this is not a fallback to cookies or guessed consent.
  // https://sourcepoint-public-api.readme.io/reference/ping-1
  const flattened = sections && typeof sections === "object" && !Array.isArray(sections);
  if (sections === null || sections === undefined) return empty("invalid", "invalid_subsection_shape", ["parsed_section_missing"]);
  if (!flattened && (!Array.isArray(sections) || sections.length < 1 || sections.length > 2)) return empty("invalid", "invalid_subsection_shape", ["subsection_shape_invalid"]);
  const core = flattened ? sections : sections[0];
  const signal = flattened ? (sections.Gpc !== undefined || sections.GpcSegmentType !== undefined ?
    { GpcSegmentType: sections.GpcSegmentType, Gpc: sections.Gpc } : undefined) : sections[1];
  const fieldCodes: DiagnosticCode[] = [];
  if (!core || typeof core !== "object") fieldCodes.push("parsed_section_missing");
  else {
    if (sectionId === 8 ? core.Version !== 1 : ![1, 2].includes(core.Version)) fieldCodes.push("section_version_invalid");
    if (![0, 1, 2].includes(core.SaleOptOutNotice)) fieldCodes.push("sale_notice_invalid");
    if (![0, 1, 2].includes(core.SharingOptOutNotice)) fieldCodes.push("sharing_notice_invalid");
    if (![0, 1, 2].includes(core.SaleOptOut)) fieldCodes.push("sale_opt_out_invalid");
    if (![0, 1, 2].includes(core.SharingOptOut)) fieldCodes.push("sharing_opt_out_invalid");
  }
  if (signal !== undefined) {
    if (!signal || typeof signal !== "object") fieldCodes.push("gpc_subsection_type_invalid");
    else {
      const hasCanonical = Object.prototype.hasOwnProperty.call(signal, "GpcSegmentType");
      const hasLegacy = Object.prototype.hasOwnProperty.call(signal, "SubsectionType");
      if (!hasCanonical && !hasLegacy) fieldCodes.push("gpc_subsection_type_missing");
      else if (hasCanonical && hasLegacy && signal.GpcSegmentType !== signal.SubsectionType) fieldCodes.push("gpc_subsection_type_conflict");
      else if ((hasCanonical ? signal.GpcSegmentType : signal.SubsectionType) !== 1) fieldCodes.push("gpc_subsection_type_invalid");
    }
  }
  if (signal !== undefined && signal && typeof signal.Gpc !== "boolean") fieldCodes.push("gpc_value_invalid");
  if (fieldCodes.length) return empty("invalid", "invalid_subsection_fields", fieldCodes);
  return { status: "observed" as const, reason: flattened ? (sectionId === 8 ? "ready_usca_flat_object" : "ready_usnat_flat_object") : "ready_supported_state", diagnosticCodes: flattened ? [sectionId === 8 ? "flat_usca_section" : "flat_usnat_section"] : [], state: { apiVersion: "1.1" as const, sectionId, sectionVersion: core.Version as 1 | 2,
    cmpStatus: "loaded" as const, signalStatus: "ready" as const, saleNotice: core.SaleOptOutNotice as 0 | 1 | 2,
    sharingNotice: core.SharingOptOutNotice as 0 | 1 | 2, saleOptOut: core.SaleOptOut as 0 | 1 | 2,
    sharingOptOut: core.SharingOptOut as 0 | 1 | 2, gpc: (signal?.Gpc ?? null) as boolean | null } };
}
