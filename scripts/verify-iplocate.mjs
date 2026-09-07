/** Offline release gate. Never downloads data or runs a scan. */
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(pathToFileURL(resolve('packages/certscore-scan-core/package.json')));
const maxmind = require('maxmind');
const directory = resolve(process.argv[2] || 'config/iplocate');
try {
  for (const name of ['ip-to-country', 'ip-to-asn']) {
    const reader = await maxmind.open(resolve(directory, `${name}.mmdb`), { watchForUpdates: false, cache: { max: 1 } });
    const age = Date.now() - reader.metadata.buildEpoch.getTime();
    if (!reader.metadata.databaseType.startsWith(`iplocate ${name}-`) || !Number.isFinite(age) || age < 0 || age > 30 * 86400000) throw new Error(`${name} database is wrong or expired`);
    console.log(`${name}: verified, built ${reader.metadata.buildEpoch.toISOString()}`);
  }
} catch (error) {
  console.error(`IP lookup packaging blocked: ${error.message}. Install both current databases with scripts/install-iplocate.ts before building.`);
  process.exitCode = 1;
}
