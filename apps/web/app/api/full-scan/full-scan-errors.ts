export function getFullScanQueueErrorCode(error: string | null | undefined) {
  const message = error ?? "";

  if (message.startsWith("Full-site scanning is unavailable in this local environment.")) {
    return "full_site_local_unavailable";
  }

  if (/already queued|already running|active scan|queued or running/i.test(message)) {
    return "active_scan_exists";
  }

  if (/already connected to your workspace/i.test(message)) {
    return "domain_already_connected";
  }

  if (/manual scan limit|billing period|scan allowance/i.test(message)) {
    return "monthly_usage_limit";
  }

  if (
    /Scan requests are limited|higher-throughput scanning|batch workflows|try again after|try again shortly|recent scan|recently|re-scan/i.test(
      message
    )
  ) {
    return "rescan_cooldown";
  }

  if (/queue|scanner|heartbeat|availability|unavailable/i.test(message)) {
    return "scan_queue_unavailable";
  }

  if (/domain|hostname|website/i.test(message)) {
    return "invalid_domain";
  }

  return "scan_queue_rejected";
}
