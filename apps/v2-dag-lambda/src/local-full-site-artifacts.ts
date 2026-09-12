import { FULL_SITE_ARTIFACT_LIMITS } from "@website-signal-risk-scanner/shared";

/** Local transport preserves the exact bytes accepted by production ingestion. */
export function createLocalInventoryArtifacts(prefix: string) {
  const artifacts: Array<{ key: string; body: string }> = [];
  const pending = new Map([
    [`${prefix}/inventory.json`, FULL_SITE_ARTIFACT_LIMITS.inventory],
    [`${prefix}/evidence.json`, FULL_SITE_ARTIFACT_LIMITS.evidence],
  ]);
  async function send(command: { input: { Key?: string; Body?: unknown } }) {
    const { Key: key, Body: body } = command.input;
    const maxBytes = key ? pending.get(key) : undefined;
    if (!key || maxBytes === undefined)
      throw new Error("Unexpected or duplicate local inventory artifact");
    if (typeof body !== "string" || !body.length || Buffer.byteLength(body) > maxBytes)
      throw new Error("Local inventory artifact exceeds canonical bounds");
    pending.delete(key);
    artifacts.push({ key, body });
    return {};
  }
  return { artifacts, send };
}
