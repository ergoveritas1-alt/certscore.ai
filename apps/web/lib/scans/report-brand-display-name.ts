/** Auto-created workspace names can contain the owner's account email. Keep
 * shareable report branding organizational; explicit company names are preserved. */
export function reportBrandDisplayName(value?: string | null): string {
  const name = value?.trim();
  return !name || /[^\s@]+@[^\s@]+\.[^\s@]+/.test(name) ? "CertScore.ai" : name.slice(0, 64);
}
