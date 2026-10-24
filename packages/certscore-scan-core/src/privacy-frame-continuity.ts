/** Diagnostic endpoint identity; never used to establish absence.
 *
 * Exact references must stay in this closure between checkpoints. Serializing
 * the first checkpoint and reconstructing its nodes cannot establish identity.
 * No target globals, DOM mutations, observers, timers or browser calls are used.
 * Callers supply an existing shared diagnostic deadline, not a fresh allowance.
 * Equality proves identity at the two endpoints only: it does not prove
 * uninterrupted attachment, visibility, inventory completeness or absence.
 * The caller binds this result to the retained inspection diagnostics and hash.
 */
export function createPrivacyFrameContinuityProof() {
  type Identity = "same" | "different" | "unavailable";
  type Limitation = "frame_limit" | "time_limit" | "read_unavailable" |
    "parent_changed" | "frame_set_changed" | "duplicate_frame" |
    "node_changed" | "document_changed" | "cancelled" | "checkpoint_missing";
  type Row = { slot: number; node: Identity; document: Identity };
  type Snapshot = { node: Element; document: Document | null };
  type Result = {
    version: "privacy_frame_checkpoint_identity.v1";
    scope: "sampled_frame_checkpoint_identity_only";
    identityBasis: "dom_reference_equality";
    status: "matched" | "limited";
    parentDocument: Identity;
    frames: Row[];
    limitations: Limitation[];
  };
  let parent: Document | null = null;
  let first: Array<Snapshot | null> = [];
  let firstCount = 0;
  let started = false;
  let terminal: Result | undefined;
  const limitations = new Set<Limitation>();

  function inTime(deadline: number) {
    // Infinity/NaN cannot accidentally opt this prototype out of its caller's cap.
    if (!Number.isFinite(deadline) || performance.now() >= deadline) {
      limitations.add("time_limit");
      return false;
    }
    return true;
  }

  function snapshot(node: Element, owner: Document): Snapshot | null {
    try {
      if (!node.isConnected || node.ownerDocument !== owner ||
          (node.localName !== "iframe" && node.localName !== "frame")) {
        limitations.add("read_unavailable");
        return null;
      }
      const child = (node as HTMLIFrameElement).contentDocument;
      // An opaque frame's WindowProxy or URL is not its Document identity.
      if (!child?.defaultView || child.defaultView.document !== child) {
        limitations.add("read_unavailable");
        return { node, document: null };
      }
      return { node, document: child };
    } catch {
      limitations.add("read_unavailable");
      return null;
    }
  }

  function finishResult(parentDocument: Identity, frames: Row[]): Result {
    // Never retain DOM references after success, failure or cancellation.
    first = [];
    parent = null;
    terminal = {
      version: "privacy_frame_checkpoint_identity.v1",
      scope: "sampled_frame_checkpoint_identity_only",
      identityBasis: "dom_reference_equality",
      status: limitations.size ? "limited" : "matched",
      parentDocument, frames, limitations: [...limitations],
    };
    // Return detached JSON so a caller cannot mutate a subsequent terminal read.
    return JSON.parse(JSON.stringify(terminal)) as Result;
  }

  function begin(owner: Document, nodes: readonly Element[], deadline: number): void {
    if (started || terminal) return; // No retry or new sample after the first checkpoint.
    deadline = Number.isFinite(deadline) ? Math.min(deadline, performance.now() + 2) : deadline;
    started = true;
    parent = owner;
    firstCount = nodes.length;
    if (nodes.length > 4) limitations.add("frame_limit");
    for (let slot = 0; slot < Math.min(nodes.length, 4); slot++) {
      if (!inTime(deadline)) { first.push(null); continue; }
      const node = nodes[slot];
      if (!node) { limitations.add("read_unavailable"); first.push(null); continue; }
      if (nodes.slice(0, slot).includes(node)) limitations.add("duplicate_frame");
      first.push(snapshot(node, owner));
      // A slow getter can consume the remaining cooperative allowance.
      if (!inTime(deadline)) first[slot] = null;
    }
  }

  function finish(owner: Document, nodes: readonly Element[], deadline: number): Result {
    if (terminal) return JSON.parse(JSON.stringify(terminal)) as Result;
    deadline = Number.isFinite(deadline) ? Math.min(deadline, performance.now() + 2) : deadline;
    if (!started) limitations.add("checkpoint_missing");
    const parentDocument: Identity = !started ? "unavailable" : parent === owner ? "same" : "different";
    if (parentDocument === "different") limitations.add("parent_changed");
    if (nodes.length !== firstCount) limitations.add("frame_set_changed");
    if (nodes.length > 4) limitations.add("frame_limit");
    const rows: Row[] = [];
    for (let slot = 0; slot < Math.min(Math.max(firstCount, nodes.length), 4); slot++) {
      const row: Row = {slot, node: "unavailable", document: "unavailable"};
      rows.push(row);
      if (!inTime(deadline) || parentDocument !== "same") continue;
      const node = nodes[slot];
      if (node && nodes.slice(0, slot).includes(node)) limitations.add("duplicate_frame");
      if (!node || !first[slot]) { limitations.add("read_unavailable"); continue; }
      const current = snapshot(node, owner);
      if (!inTime(deadline) || !current) continue;
      if (first[slot]!.node !== current.node) {
        row.node = "different";
        limitations.add("node_changed");
        continue;
      }
      row.node = "same";
      if (first[slot]!.document && current.document) {
        row.document = first[slot]!.document === current.document ? "same" : "different";
        if (row.document === "different") limitations.add("document_changed");
      }
    }
    // Zero sampled frames do not establish a positive frame identity proof.
    if (!rows.length) limitations.add("checkpoint_missing");
    return finishResult(parentDocument, rows);
  }

  function cancel(): Result {
    if (terminal) return JSON.parse(JSON.stringify(terminal)) as Result;
    limitations.add("cancelled");
    return finishResult("unavailable", []);
  }

  return { begin, finish, cancel };
}
