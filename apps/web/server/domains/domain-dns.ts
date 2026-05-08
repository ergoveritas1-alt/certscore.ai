import "server-only";

import { resolve4, resolve6 } from "node:dns/promises";
import { checkDomainDnsWithResolvers, type DomainDnsStatus } from "./domain-dns-core";

export async function checkDomainDns(hostname: string): Promise<DomainDnsStatus> {
  return checkDomainDnsWithResolvers(hostname, {
    resolve4,
    resolve6
  });
}
