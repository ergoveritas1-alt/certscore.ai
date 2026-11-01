import { createHmac } from "node:crypto";
import { isCanonicalScanId } from "@certscore/api-contracts";
import shared from "@website-signal-risk-scanner/shared";

const { MCP_FREE_AUTHENTICATION: policy, freeMcpAuthenticationOffer } = shared;

/** Client-declared context is only a cosmetic invitation boundary. It is never
 * authenticated identity, an admission key, a quota grant or an abuse signal. */
export function declaredInvitationConversation(headers: Readonly<Record<string, unknown>> | null | undefined, secret: string) {
  const value = headers?.["openai-conversation-id"];
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.length > 256 || /[\u0000-\u0020\u007f]/.test(id)) return null;
  return createHmac("sha256", secret).update(`mcp-free-auth:openai-conversation:v1:${id}`).digest("hex");
}

type Conversation = { scanIds: Set<string> };

/** Best-effort continuity across transport sessions on this host. The UTC-day
 * reset, entry/ID caps and milestone saturation bound memory without storage,
 * background work, extra API reads or retaining raw conversation identifiers. */
export class McpConversationInvitations {
  private day: number | null = null;
  private readonly conversations = new Map<string, Conversation>();
  private rememberedScanIds = 0;
  get size() { return this.conversations.size; }
  get rememberedIds() { return this.rememberedScanIds; }

  offer(context: string, result: Record<string, unknown>, now = Date.now()) {
    if (!/^[a-f0-9]{64}$/.test(context) || !Number.isFinite(now)) return null;
    const day = Math.floor(now / 86_400_000);
    if (this.day !== day) {
      this.conversations.clear(); this.rememberedScanIds = 0; this.day = day;
    }
    const id = result.scanId ?? result.scan_id;
    if (result.executionMode !== "new_scan" || result.reused === true || !isCanonicalScanId(id)) return null;
    const conversation = this.conversations.get(context) ?? { scanIds: new Set<string>() };
    if (conversation.scanIds.has(id) || conversation.scanIds.size >= Math.max(...policy.reminderNewScanCounts)) return null;
    conversation.scanIds.add(id);
    this.rememberedScanIds++;
    this.conversations.delete(context);
    this.conversations.set(context, conversation);
    while (this.conversations.size > policy.maxConversationContexts || this.rememberedScanIds > policy.maxRememberedConversationScanIds) {
      const oldest = this.conversations.keys().next().value!;
      this.rememberedScanIds -= this.conversations.get(oldest)!.scanIds.size;
      this.conversations.delete(oldest);
    }
    return freeMcpAuthenticationOffer({ sessionNewScans: conversation.scanIds.size });
  }
}
