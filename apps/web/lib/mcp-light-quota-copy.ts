import { LIGHT_MCP_NEW_SCAN_POLICY } from "../server/pulse/anonymous-scan-quota";

/** All public numeric Light creation guidance is rendered from the admission policy. */
const policy = LIGHT_MCP_NEW_SCAN_POLICY;
const minutes = policy.burstWindowSeconds / 60;
export const MCP_LIGHT_QUOTA_SUMMARY = `Light allows up to ${policy.session.dailyLimit} new scans per session per UTC day, subject to a ${policy.ip.dailyLimit}-scan requester-IP limit and a shared ${policy.surface.dailyLimit}-scan Light limit. Rolling ${minutes}-minute limits are ${policy.session.burstLimit} per session, ${policy.ip.burstLimit} per requester IP and ${policy.surface.burstLimit} across Light. Reused eligible results do not consume quota.`;
export const MCP_LIGHT_QUOTA_REFERENCE = "https://certscore.ai/developers/mcp#light-usage-limits";
