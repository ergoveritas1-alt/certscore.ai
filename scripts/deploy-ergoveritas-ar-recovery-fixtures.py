#!/usr/bin/env python3
"""Publish the eight new, owned and exact-route consent recovery fixtures."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.request

ACCOUNT = "199536052647"
REGION = "us-west-1"
BUCKET = "ergoveritas-com-static-199536052647"
DISTRIBUTION = "E3334DYFHSC1PR"
HOST = "www.ergoveritas.com"
SOURCE = Path(__file__).resolve().parent.parent / "infra/aws/ergoveritas-canary"
SCENARIOS = (
    "deferred-aria", "delayed-banner", "native-aria", "nested-caption",
    "quiet-aria", "quiet-reject", "reject-first", "visible-text",
)


def aws(*args):
    process = subprocess.run(
        ["aws", *args, "--no-cli-pager", "--cli-connect-timeout", "8",
         "--cli-read-timeout", "20", "--output", "json"],
        env={**os.environ, "AWS_MAX_ATTEMPTS": "1"}, capture_output=True, text=True,
    )
    if process.returncode:
        raise RuntimeError(process.stderr.strip())
    return json.loads(process.stdout) if process.stdout.strip() else None


def sha256(data):
    return hashlib.sha256(data).hexdigest()


class ExactRequest(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, new_url):
        raise RuntimeError(f"Unexpected redirect from {request.full_url}")


def publish(fixtures):
    if aws("sts", "get-caller-identity", "--query", "Account") != ACCOUNT:
        raise RuntimeError("AWS account mismatch")
    if aws("s3api", "get-bucket-location", "--bucket", BUCKET, "--expected-bucket-owner",
           ACCOUNT, "--query", "LocationConstraint") != REGION:
        raise RuntimeError("S3 region mismatch")
    distro = aws("cloudfront", "get-distribution", "--id", DISTRIBUTION,
                 "--query", "Distribution.DistributionConfig")
    expected_origin = f"{BUCKET}.s3.{REGION}.amazonaws.com"
    if (HOST not in distro["Aliases"].get("Items", []) or
            not any(origin["DomainName"] == expected_origin for origin in distro["Origins"]["Items"])):
        raise RuntimeError("CloudFront alias or origin mismatch")

    # Conditional creation keeps existing objects outside this release. A restart
    # may resume from an object only when its checksum is already identical.
    for name, digest in fixtures.items():
        args = ("--region", REGION, "--bucket", BUCKET, "--key", name,
                "--expected-bucket-owner", ACCOUNT)
        try:
            aws("s3api", "put-object", *args, "--body", str(SOURCE / name),
                "--content-type", "text/html; charset=utf-8", "--cache-control", "public,max-age=60",
                "--metadata", f"source-sha256={digest}", "--server-side-encryption", "AES256",
                "--if-none-match", "*")
        except RuntimeError as error:
            if "PreconditionFailed" not in str(error):
                raise
        observed = aws("s3api", "head-object", *args, "--query", 'Metadata."source-sha256"')
        if observed != digest:
            raise RuntimeError(f"S3 checksum mismatch for {name}")
        print(f"Verified S3 object {name}", flush=True)

    opener = urllib.request.build_opener(ExactRequest)
    for name, digest in fixtures.items():
        url = f"https://{HOST}/{name}"
        with opener.open(url, timeout=20) as response:
            if response.status != 200 or sha256(response.read(32_769)) != digest:
                raise RuntimeError(f"Public checksum mismatch for {url}")
        print(f"Verified HTTPS bytes {url}", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    fixtures = {f"testar-recovery-20261123-{name}.html": "" for name in SCENARIOS}
    for name in fixtures:
        fixtures[name] = sha256((SOURCE / name).read_bytes())
    if args.apply:
        publish(fixtures)
    else:
        print(json.dumps(fixtures, indent=2))


if __name__ == "__main__":
    main()
