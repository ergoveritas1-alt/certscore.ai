/**
 * Operational page count for the outer `scans` row, matching the full-site
 * report's completed + partial captures. The homepage is already a crawl row.
 * Null means no full-site crawl; zero means a crawl has no captured pages yet.
 * Uses the existing full_site_pages(scan_id, status) index without reading evidence.
 */
export const ADMIN_FULL_SITE_PAGES_SCANNED_SQL = `(
  select (select count(*)::int
            from full_site_pages fp
           where fp.scan_id = fc.scan_id and fp.status in ('completed', 'partial'))
    from full_site_crawls fc
   where fc.scan_id = scans.id
)`;
