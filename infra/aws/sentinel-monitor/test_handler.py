import importlib.util
import os
import pathlib
import sys
import types
import unittest


class _FakeDynamoResource:
    def Table(self, _name):
        return object()


fake_boto3 = types.ModuleType("boto3")
fake_boto3.client = lambda *_args, **_kwargs: object()
fake_boto3.resource = lambda *_args, **_kwargs: _FakeDynamoResource()
sys.modules.setdefault("boto3", fake_boto3)
os.environ.setdefault("TABLE_NAME", "certscore-sentinel-runs-test")

module_path = pathlib.Path(__file__).with_name("handler.py")
spec = importlib.util.spec_from_file_location("certscore_sentinel_handler", module_path)
handler = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(handler)


class AuthoritativeFreshnessTests(unittest.TestCase):
    requested_url = "https://ergoveritas.com/.well-known/certscore-canary/sentinels/privacy-evidence.html"
    run_started_at = "2026-08-08T13:25:30Z"

    def test_authoritative_fresh_scan_overrides_transient_mcp_reuse_metadata(self):
        result = handler.assess_authoritative_freshness(
            self.requested_url,
            self.run_started_at,
            {
                "createdAt": "2026-08-08T13:30:04.424Z",
                "url": self.requested_url,
            },
            {
                "freshnessDecision": "returned_stale_while_refreshing",
                "reused": True,
            },
        )

        self.assertFalse(result["freshnessIssue"])
        self.assertEqual(result["freshness"], "new_path")
        self.assertEqual(result["freshnessReasonCodes"], [])
        self.assertTrue(result["creationMetadataReportedReuse"])

    def test_authoritative_creation_time_detects_an_actually_reused_scan(self):
        result = handler.assess_authoritative_freshness(
            self.requested_url,
            self.run_started_at,
            {
                "createdAt": "2026-08-08T12:25:30Z",
                "url": self.requested_url,
            },
        )

        self.assertTrue(result["freshnessIssue"])
        self.assertIn("authoritative_scan_reused", result["freshnessReasonCodes"])
        self.assertIn("predates", result["freshnessReason"])

    def test_authoritative_url_detects_a_page_path_mismatch(self):
        result = handler.assess_authoritative_freshness(
            self.requested_url,
            self.run_started_at,
            {
                "createdAt": "2026-08-08T13:30:04Z",
                "url": "https://ergoveritas.com/",
            },
        )

        self.assertTrue(result["freshnessIssue"])
        self.assertIn("authoritative_path_mismatch", result["freshnessReasonCodes"])

    def test_missing_authoritative_fields_fail_closed_as_unverifiable(self):
        result = handler.assess_authoritative_freshness(
            self.requested_url,
            self.run_started_at,
            {},
        )

        self.assertTrue(result["freshnessIssue"])
        self.assertEqual(
            result["freshnessReasonCodes"],
            ["authoritative_url_unavailable", "authoritative_creation_time_unavailable"],
        )

    def test_creation_time_tolerance_allows_minor_clock_skew(self):
        result = handler.assess_authoritative_freshness(
            self.requested_url,
            self.run_started_at,
            {
                "createdAt": "2026-08-08T13:25:05Z",
                "url": self.requested_url,
            },
        )

        self.assertFalse(result["freshnessIssue"])


class HourlyJobRotationTests(unittest.TestCase):
    pages = [{"key": f"page-{index}"} for index in range(5)]

    def test_each_hour_covers_every_transport_and_location_with_distinct_pages(self):
        for hour in range(15):
            jobs = handler.build_hourly_jobs(self.pages, hour)

            self.assertEqual(len(jobs), 3)
            self.assertEqual({job["transport"] for job in jobs}, set(handler.TRANSPORTS))
            self.assertEqual({job["location"] for job in jobs}, set(handler.LOCATIONS))
            self.assertEqual(len({job["page"]["key"] for job in jobs}), 3)

    def test_each_transport_covers_every_page_over_five_hours(self):
        jobs = [
            job
            for hour in range(5)
            for job in handler.build_hourly_jobs(self.pages, hour)
        ]

        for transport in handler.TRANSPORTS:
            transport_pages = {
                job["page"]["key"]
                for job in jobs
                if job["transport"] == transport
            }
            self.assertEqual(transport_pages, {page["key"] for page in self.pages})

    def test_fifteen_hour_cycle_covers_every_page_location_transport_tuple_once(self):
        tuples = [
            (job["page"]["key"], job["location"], job["transport"])
            for hour in range(15)
            for job in handler.build_hourly_jobs(self.pages, hour)
        ]

        expected = {
            (page["key"], location, transport)
            for page in self.pages
            for location in handler.LOCATIONS
            for transport in handler.TRANSPORTS
        }
        self.assertEqual(len(tuples), 45)
        self.assertEqual(set(tuples), expected)


if __name__ == "__main__":
    unittest.main()
