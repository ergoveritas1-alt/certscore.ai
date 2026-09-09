/** Local diagnostic only. This is not a production evidence source or request-IP projection. */
import { normalizePublicIpAddress } from '../../packages/certscore-scan-core/src/public-ip-address.js';
export type TunnelAttempt = { id: string; authority: string; connected: boolean };
export function verifiedTunnelEndpoints(attempts: TunnelAttempt[], lines: string[]) {
  const records = new Map<string, string[][]>();
  for (const line of lines) {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 7 || fields[2] !== 'CONNECT') continue;
    const entries = records.get(fields[1]!) ?? [];
    entries.push(fields); records.set(fields[1]!, entries);
  }
  return attempts.map(attempt => {
    const matches = records.get(attempt.id) ?? [];
    const record = matches[0];
    const ip = record ? normalizePublicIpAddress(record[5]) : undefined;
    if (!attempt.connected || attempts.filter(item=>item.id===attempt.id).length !== 1 || matches.length !== 1 || !record || record[3] !== attempt.authority || record[4] !== '200' || record[6] !== 'TCP_TUNNEL' || !ip) {
      return { tunnelId: attempt.id, status: 'unavailable' as const };
    }
    return { tunnelId: attempt.id, status: 'observed' as const, authority: attempt.authority, ip, scope: 'proxy_tunnel' as const };
  });
}

/** A hostname match is insufficient: bind CDP -> browser socket -> bridge tunnel -> Squid. */
export function bindRequestEndpoint(
  connectionId: number,
  sockets: { connectionId: number; clientPort: number; bridgePort: number }[],
  attempts: (TunnelAttempt & { clientPort: number; bridgePort: number })[],
  lines: string[],
) {
  const socketMatches = sockets.filter(s=>s.connectionId===connectionId);
  if(socketMatches.length!==1)return undefined;
  const socket=socketMatches[0]!;
  const tunnelMatches=attempts.filter(a=>a.clientPort===socket.clientPort && a.bridgePort===socket.bridgePort);
  if(tunnelMatches.length!==1)return undefined;
  const endpoint=verifiedTunnelEndpoints(tunnelMatches,lines)[0];
  return endpoint?.status==='observed'?endpoint:undefined;
}

/** Local acceptance gate for a real response; cache/worker evidence is not a connection. */
export function bindObservedResponseEndpoint(
  response: { connectionId: number; url: string; status: number; fromDiskCache?: boolean; fromServiceWorker?: boolean; fromPrefetchCache?: boolean },
  sockets: Parameters<typeof bindRequestEndpoint>[1],
  attempts: Parameters<typeof bindRequestEndpoint>[2],
  lines: string[],
) {
  if (!Number.isSafeInteger(response.connectionId) || response.connectionId <= 0 ||
      !Number.isInteger(response.status) || response.status < 100 || response.status > 599 ||
      response.fromDiskCache || response.fromServiceWorker || response.fromPrefetchCache) return undefined;
  let authority: string;
  try {
    const url = new URL(response.url);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    authority = `${url.hostname}:${url.port || '443'}`;
  } catch { return undefined; }
  const endpoint = bindRequestEndpoint(response.connectionId, sockets, attempts, lines);
  // Coalesced cross-authority responses require additional proof not present here.
  return endpoint?.authority === authority ? endpoint : undefined;
}
