#!/bin/bash

# Production Load Test Script
# Usage: ./run-load-test.sh <manifest_path> <start_range> <end_range> <output_dir>

# Validate environment variable
if [ "$FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS" != "true" ]; then
  echo "ERROR: DNS bypass not enabled. Set FULL_SCAN_ALLOW_PRODUCTION_LOAD_TEST_DNS_BYPASS=true"
  exit 1
fi

# Parse arguments
MANIFEST="$1"
START_RANGE="$2"
END_RANGE="$3"
OUTPUT_DIR="$4"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Initialize audit trail
touch "$OUTPUT_DIR/operator-events.jsonl"

# Pre-flight checks
pnpm ops:check:scanner-autoscaling || {
  echo "ERROR: Autoscaling check failed"
  exit 1
}

# Start load test
{
  # Main loop with 30s polling
  while true; do
    # Get current status
    STATUS=$(curl -s https://certscore.ai/api/load-test/status)
    
    # Parse and display status
    DOMAINS_QUEUED=$(echo "$STATUS" | jq '.domains.queued')
    DOMAINS_RUNNING=$(echo "$STATUS" | jq '.domains.running')
    DOMAINS_COMPLETED=$(echo "$STATUS" | jq '.domains.completed')
    CPU_USAGE=$(echo "$STATUS" | jq '.system.cpu')
    FINDINGS_COUNT=$(echo "$STATUS" | jq '.findings.count')
    
    # Print status line
    echo "[STATUS] $DOMAINS_COMPLETED/$((DOMAINS_QUEUED + DOMAINS_RUNNING + DOMAINS_COMPLETED)) done | CPU:${CPU_USAGE}% | Findings:$FINDINGS_COUNT"
    
    # Write to live monitor
    echo "$STATUS" >> "$OUTPUT_DIR/live-monitor.jsonl"
    
    # Sleep for polling interval
    sleep 30
  done
} &

# Generate final reports
{
  # Wait for completion
  wait
  
  # Generate findings table
  curl -s https://certscore.ai/api/load-test/findings | jq -r '.[] | "\(.id)|\\(.count)"' > "$OUTPUT_DIR/findings-table.csv"
  
  # Generate interruptions breakdown
  curl -s https://certscore.ai/api/load-test/interruptions | jq -r '.[] | "\(.category)|\\(.count)|\\(.example)"' > "$OUTPUT_DIR/interruptions.csv"
  
  # Generate consolidated report
  {
    echo "# Load Test Report - $TIMESTAMP"
    echo "## Findings Summary"
    column -t -s '|' "$OUTPUT_DIR/findings-table.csv"
    echo "\n## Interruptions Breakdown"
    column -t -s '|' "$OUTPUT_DIR/interruptions.csv"
    echo "\n## Recommendations"
    curl -s https://certscore.ai/api/load-test/recommendations
  } > "$OUTPUT_DIR/consolidated-report.md"
}

exit 0