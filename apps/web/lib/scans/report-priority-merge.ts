/** Join already-projected cached and homepage priorities. This module is shared
 * by the browser workspace and server exports; keep it free of server imports. */
export function mergeHomepagePriorityFindings<T extends { id: string }>(cached: readonly T[] | undefined, homepage: readonly T[]): T[] {
  return cached ? [...cached, ...homepage.filter(row => (row.id.startsWith("california_privacy_choice_") || row.id === "california_sale_sharing_opt_out_activity" || row.id === "california_notice_at_collection_destination_error" || row.id === "california_rights_information_destination_error") && !cached.some(existing => existing.id === row.id))] : [...homepage];
}
