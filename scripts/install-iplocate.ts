/** Install already-licensed local databases; no network requests or credentials. */
import { mkdir, copyFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import maxmind from "maxmind";

async function main() {
  const [country, asn] = process.argv.slice(2);
  if (!country || !asn) throw new Error("Usage: pnpm exec tsx scripts/install-iplocate.ts /path/ip-to-country.mmdb /path/ip-to-asn.mmdb");
  const inputs = [[country, "ip-to-country"], [asn, "ip-to-asn"]] as const;
  // Validate both before replacing either. Never package stale/wrong data silently.
  for (const [file, expected] of inputs) {
    const reader = await maxmind.open(resolve(file));
    const age = Date.now() - reader.metadata.buildEpoch.getTime();
    if (!reader.metadata.databaseType.startsWith(`iplocate ${expected}-`) || !Number.isFinite(age) || age < 0 || age > 30 * 86400000) throw new Error(`Expected a current ${expected} database`);
  }
  const directory = resolve("config/iplocate");
  await mkdir(directory, { recursive: true });
  for (const [file, name] of inputs) {
    const target = resolve(directory, `${name}.mmdb`), staging = `${target}.installing`;
    try { await copyFile(resolve(file), staging); await rename(staging, target); }
    finally { await rm(staging, { force: true }); }
  }
  console.log("Installed Country and ASN databases. Restart local scanner processes to load them; use the normal AWS release workflow for production.");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Database installation failed"); process.exitCode = 1; });
