/** Copy only compiler caches. Never restore .next output, route types or build identity. */
import { cp, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
const [source, destination] = process.argv.slice(2);
if (!source || !destination || path.resolve(source) === path.resolve(destination)) throw new Error('Distinct compiler-cache source and destination required.');
let bytes = 0;
const files = [];
async function inspect(directory) {
  for (const name of await readdir(directory)) {
    const file = path.join(directory, name), stat = await lstat(file);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error('Unsupported compiler-cache entry.');
    if (stat.isDirectory()) await inspect(file); else { bytes += stat.size; files.push({ file, size: stat.size, time: stat.mtimeMs }); }
  }
}
const start = performance.now();
await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
for (const name of ['webpack', 'swc']) {
  const directory = path.join(source, name);
  try { await inspect(directory); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  await cp(directory, path.join(destination, name), { recursive: true, dereference: false });
}
// Oversized caches become a clean cache miss; never add cache storage capacity.
if (bytes > 512 * 1024 * 1024) { await rm(destination, { recursive: true, force: true }); await mkdir(destination, { recursive: true }); }
console.log(JSON.stringify({ compilerCacheBytes: bytes, retained: bytes <= 512 * 1024 * 1024, copyMs: Math.round(performance.now() - start) }));
