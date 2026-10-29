/** Closed operational diagnostics. Preserve the historical error message. */
import type {ProtocolJsonLimitContext} from "@certscore/contracts";
export type ProtocolLimitReason = "bytes" | "members" | "depth" | "array_items" | "fields" | "event_records";
export class ProtocolLimitError extends Error {
  constructor(readonly limitReason: ProtocolLimitReason,readonly limitContext?:ProtocolJsonLimitContext) { super("body_limit"); }
}
export function protocolLimit(reason: ProtocolLimitReason,context?:ProtocolJsonLimitContext): never { throw new ProtocolLimitError(reason,context); }
