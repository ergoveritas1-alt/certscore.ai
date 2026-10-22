#!/usr/bin/env python3
"""Build or verify the reproducible public CertScore.ai Muse skill ZIP."""
import argparse
import io
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NAME = 'certscore-website-privacy-scan'
SOURCE = ROOT / 'integrations/muse' / NAME
OUTPUT = ROOT / 'apps/web/public/resources/certscore-muse-skill-1.0.0.zip'
FILES = ('SKILL.md', 'skill.yaml', 'scripts/certscore_mcp.py')


def package_bytes():
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for filename in FILES:
            entry = zipfile.ZipInfo(f'{NAME}/{filename}', date_time=(2026, 10, 22, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, (SOURCE / filename).read_bytes())
    return output.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if the published ZIP differs from source.')
    args = parser.parse_args()
    expected = package_bytes()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_bytes() != expected:
            parser.exit(1, 'Muse skill ZIP is stale. Run python3 scripts/package-muse-skill.py\n')
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_bytes(expected)
    print(f'Muse skill ZIP verified: {len(expected):,} bytes, {len(FILES)} files')


if __name__ == '__main__':
    main()
