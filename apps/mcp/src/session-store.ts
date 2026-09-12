import type { McpResponseSummary } from "@website-signal-risk-scanner/shared";
import { createHash } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { HostedMcpObservationContext } from "./telemetry.js";
import type { McpRequestDetails } from "@website-signal-risk-scanner/shared";
import type { OAuthSessionIdentity } from "./session-identity.js";

export type McpHttpSession = {
  expiresAt: number;
  lastSeenAt: number;
  server: McpServer;
  tokenHash: string;
  surface: "oauth" | "anonymous" | "light" | "microsoft";
  oauthIdentity?: OAuthSessionIdentity;
  transport: StreamableHTTPServerTransport;
  telemetry?: {
    observationContext(): HostedMcpObservationContext;
    observeActivation(stage: "mcp_initialized" | "mcp_tools_listed" | "mcp_first_tool_invoked" | "mcp_scan_requested"): void;
    observeTransportRateLimit(input: {
      responseSummary?: McpResponseSummary;
      rateLimit?: McpRequestDetails["rateLimit"];
      body: unknown;
      durationMs: number;
      requesterIp?: string | null;
      requesterNetwork?: "anthropic" | "direct" | "unknown";
      scanId?: string | null;
      toolName: string;
    }): void;
  };
};

export class McpHttpSessionStore {
  private readonly sessions = new Map<string, McpHttpSession>();

  constructor(private readonly options: { maxCount: number; ttlSeconds: number }) {}

  get size() {
    return this.sessions.size;
  }

  hashToken(token: string) {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  get(sessionId: string) {
    this.prune();
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    if (session.expiresAt <= Date.now()) {
      this.delete(sessionId);
      return null;
    }
    return session;
  }

  // Lookup must not renew a session before its requester has been authorized.
  touch(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const now = Date.now();
    if (session.expiresAt <= now) {
      this.delete(sessionId);
      return;
    }
    session.lastSeenAt = now;
    session.expiresAt = session.lastSeenAt + this.options.ttlSeconds * 1000;
  }

  set(sessionId: string, session: Omit<McpHttpSession, "expiresAt" | "lastSeenAt">) {
    this.prune();
    let evicted = 0;
    while (this.sessions.size >= this.options.maxCount) {
      const oldest = [...this.sessions.entries()].sort((a, b) => a[1].lastSeenAt - b[1].lastSeenAt)[0];
      if (!oldest) {
        break;
      }
      this.delete(oldest[0]);
      evicted += 1;
    }
    const now = Date.now();
    this.sessions.set(sessionId, {
      ...session,
      expiresAt: now + this.options.ttlSeconds * 1000,
      lastSeenAt: now
    });
    return { evicted, size: this.sessions.size };
  }

  delete(sessionId: string) {
    const session = this.sessions.get(sessionId);
    this.sessions.delete(sessionId);
    session?.server.close().catch((error) => console.error("[mcp-http] server close failed", { error }));
    session?.transport.close().catch((error) => console.error("[mcp-http] transport close failed", { error }));
  }

  prune() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.delete(sessionId);
      }
    }
  }
}
