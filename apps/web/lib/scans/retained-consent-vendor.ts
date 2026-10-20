import { KNOWN_CMP_REGISTRY } from "@website-signal-risk-scanner/shared";

/** Retained provider identity is context only; it never establishes a consent outcome. */
export function retainedConsentVendor(input: { snapshot?: unknown; runtimeArtifacts?: unknown }) {
  const field = (value: unknown) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return [row.cmp_vendor_name, row.cmpVendorName].find((item): item is string => typeof item === "string" && Boolean(item.trim())) ?? null;
  };
  const name = (field(input.snapshot) ?? field(input.runtimeArtifacts))?.trim();
  if (!name) return null;
  const normalized = name.toLowerCase();
  return KNOWN_CMP_REGISTRY.find(entry => normalized.includes(entry.canonicalName.toLowerCase()) ||
    entry.aliases.some(alias => normalized.includes(alias.toLowerCase())))?.canonicalName ?? name;
}
