# Local destination databases

IPLocate Country and ASN MMDB files are installed here with:

```sh
pnpm exec tsx scripts/install-iplocate.ts /path/ip-to-country.mmdb /path/ip-to-asn.mmdb
```

Obtain the free files from https://github.com/iplocate/ip-address-databases or
https://www.iplocate.io/free-databases. The GitHub mirror needs no account and may
lag the daily account downloads. Validate both build dates before packaging.
The installer rejects wrong database types and files older than 30 days.

Database files are Git-ignored. The scanner image copies this directory to
`/opt/iplocate`; local ZIP builds copy it to `/var/task/iplocate`. Local source
runs also look here. Optional explicit paths are `CERTSCORE_IPLOCATE_COUNTRY_DB_PATH`
and `CERTSCORE_IPLOCATE_ASN_DB_PATH`. CI must supply the files before building;
a Git checkout alone has no databases. The canonical image/ZIP build paths now
fail their offline packaging gate when either database is missing, wrong-type,
future-dated, or older than 30 days. Run `node scripts/verify-iplocate.mjs`
before preparing a release.

No download occurs during a scan. Readers load once per process and are reused.
Warm processes cache up to 2,048 IP results. Replace files before the 30-day
freshness limit and restart/release scanner processes to load the new version.
Missing/stale databases leave the captured IP intact with neutral coverage status.
No scheduled updater or production deployment has been enabled.

IP geolocation and network data provided by IPLocate (https://www.iplocate.io/),
licensed under CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).
Files are stored unmodified; report fields are selected and reformatted.
Data is provided as-is. Customer-facing attribution is on `/terms#third-party-data`.

To measure local opening and lookup costs without making network calls:

```sh
pnpm exec tsx --tsconfig tsconfig.base.json scripts/benchmark-iplocate.ts
```

Use one validated pair across regional image releases. Review freshness weekly;
reuse the database image layer when only scanner code changes. Refresh and release
before expiry, outside the scan path. Do not add per-scan downloads or keep Lambda
processes artificially warm for this feature.
