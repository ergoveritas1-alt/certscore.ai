-- Migration 0004 duplicated the scan_id/created_at index already created by
-- migration 0003. Retain scan_events_scan_id_created_at_idx and remove only
-- the later structurally identical index without blocking event writes.
drop index concurrently if exists public.scan_events_scan_created_at_idx;
