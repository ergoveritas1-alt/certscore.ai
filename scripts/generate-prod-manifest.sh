#!/bin/bash

# Production Manifest Generator
# Usage: ./generate-prod-manifest.sh <start_range> <end_range> <output_file>

START=$1
END=$2
OUTPUT=$3

TRUSTED_DOMAINS=(
    "example1.com"
    "example2.com"
    "example3.com"
)

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
echo "Generating production manifest for range $START-$END..."

echo "domain,rank,timestamp" > "$OUTPUT"
for ((i=START; i<=END; i++)); do
    DOMAIN=${TRUSTED_DOMAINS[$RANDOM % ${#TRUSTED_DOMAINS[@]}]}
    echo "$DOMAIN,$i,$TIMESTAMP" >> "$OUTPUT"
done

echo "Manifest generated at $OUTPUT"
exit 0