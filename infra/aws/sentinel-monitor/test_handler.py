import importlib.util
import os
import pathlib
import sys
import types
import unittest
from unittest import mock


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

    def test_verification_transport_failure_is_not_reported_as_a_path_mismatch(self):
        result = handler.assess_freshness_verification_failure(
            RuntimeError("404 scan still materializing"),
            {"freshnessDecision": "queued_new_scan"},
        )

        self.assertTrue(result["freshnessIssue"])
        self.assertEqual(result["freshness"], "unverified")
        self.assertEqual(result["freshnessReasonCodes"], ["freshness_verification_unavailable"])
        self.assertNotIn("path", result["freshnessReason"])


class ScannerIncidentTests(unittest.TestCase):
    def test_terminal_failure_reports_transport_error_without_freshness_noise(self):
        message, code = handler.terminal_scan_error({
            "status": "failed",
            "error": {
                "code": "v2_dag_lambda_worker_failed",
                "message": "Required regional scanner egress preflight did not verify configured proxy and expected public region.",
            },
        })
        freshness = handler.terminal_failure_freshness({"freshnessDecision": "queued_new_scan"})
        incident = handler.scanner_incident_for_row({
            "scanId": "scan-failed",
            "status": "failed",
            "terminalError": message,
            "terminalErrorCode": code,
            **freshness,
        })

        self.assertFalse(freshness["freshnessIssue"])
        self.assertEqual(freshness["freshness"], "not_applicable_terminal_failure")
        self.assertEqual(
            incident["issue"],
            "scan failed: Required regional scanner egress preflight did not verify configured proxy and expected public region.",
        )
        self.assertEqual(
            incident["issueCodes"],
            ["scan_terminal_failure", "scan_error_v2_dag_lambda_worker_failed"],
        )

    def test_one_scan_produces_one_incident_with_multiple_reason_codes(self):
        incident = handler.scanner_incident_for_row({
            "scanId": "scan-123",
            "status": "queued",
            "freshnessIssue": True,
            "freshnessReason": "authoritative scan verification was unavailable",
            "freshnessReasonCodes": ["freshness_verification_unavailable"],
        })

        self.assertIsNotNone(incident)
        self.assertEqual(
            incident["issueCodes"],
            ["freshness_verification_unavailable", "scan_not_completed"],
        )
        self.assertIn(";", incident["issue"])

    def test_completed_fresh_scan_produces_no_incident(self):
        self.assertIsNone(handler.scanner_incident_for_row({
            "status": "completed",
            "freshnessIssue": False,
        }))

    def test_pre_email_reconciliation_suppresses_an_incident_that_completed(self):
        requested_url = "https://ergoveritas.com/.well-known/canary.html"
        incident = {
            "scanId": "scan-123",
            "requestedUrl": requested_url,
            "status": "queued",
            "freshnessIssue": True,
            "freshnessReason": "authoritative scan verification was unavailable",
            "freshnessReasonCodes": ["freshness_verification_unavailable"],
            "freshnessVerificationError": "404 scan still materializing",
            "issue": "old issue",
            "issueCodes": ["freshness_verification_unavailable", "scan_not_completed"],
        }

        with mock.patch.object(handler, "load_authoritative_scan", return_value={
            "scanId": "scan-123",
            "status": "completed",
            "url": requested_url,
            "createdAt": "2026-08-12T16:26:59Z",
        }):
            unresolved, resolved = handler.reconcile_scanner_incidents(
                [incident],
                "test-api-key",
                "2026-08-12T16:25:30Z",
            )

        self.assertEqual(unresolved, [])
        self.assertEqual(len(resolved), 1)
        self.assertEqual(resolved[0]["status"], "completed")
        self.assertNotIn("freshnessVerificationError", resolved[0])

    def test_pre_email_reconciliation_does_not_replace_a_known_terminal_failure_with_a_404(self):
        incident = {
            "scanId": "scan-failed",
            "requestedUrl": "https://ergoveritas.com/.well-known/canary.html",
            "status": "failed",
            "terminalError": "regional egress preflight failed",
            "issue": "scan failed: regional egress preflight failed",
            "issueCodes": ["scan_terminal_failure"],
        }

        with mock.patch.object(handler, "load_authoritative_scan") as load:
            unresolved, resolved = handler.reconcile_scanner_incidents(
                [incident],
                "test-api-key",
                "2026-08-12T16:25:30Z",
            )

        load.assert_not_called()
        self.assertEqual(unresolved, [incident])
        self.assertEqual(resolved, [])


class McpIdentityTests(unittest.TestCase):
    def test_stable_scan_id_never_promotes_a_job_id(self):
        self.assertIsNone(handler.stable_scan_id({"jobId": "job-123"}))
        self.assertEqual(
            handler.stable_scan_id({"data": {"scanId": "scan-123", "jobId": "job-123"}}),
            "scan-123",
        )

    def test_mcp_tool_payload_prefers_structured_content(self):
        result, payload = handler.mcp_tool_payload({
            "result": {
                "content": [{"type": "text", "text": "summary"}],
                "structuredContent": {"scanId": "scan-123", "status": "queued"},
            }
        })

        self.assertEqual(payload["scanId"], "scan-123")
        self.assertIn("content", result)

    def test_monitor_has_only_one_non_idempotent_scan_site_submission(self):
        source = module_path.read_text()
        mcp_scan_source = source.split("def mcp_scan", 1)[1].split("def signals", 1)[0]

        self.assertEqual(mcp_scan_source.count('"name": "certscore_scan_site"'), 1)
        self.assertIn('session, retry_safe=False)', mcp_scan_source)
        self.assertIn("not resubmitting", mcp_scan_source)

    def test_mcp_scan_polls_active_scan_before_requesting_bundle(self):
        calls = []
        responses = [
            ({"result": {}}, {"mcp-session-id": "session-1"}),
            ({}, {}),
            ({"result": {"structuredContent": {"scanId": "scan-123", "status": "queued", "retryAfterSeconds": 1}}}, {}),
            ({"result": {"structuredContent": {"scanId": "scan-123", "status": "running", "retryAfterSeconds": 1}}}, {}),
            ({"result": {"structuredContent": {"scanId": "scan-123", "status": "completed"}}}, {}),
            ({"result": {"structuredContent": {"scanId": "scan-123", "status": "completed", "findings": []}}}, {}),
        ]

        class FakeResponse:
            def __init__(self, body, headers):
                self.body = body
                self.headers = headers

            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return __import__("json").dumps(self.body).encode()

        def fake_urlopen(request, timeout):
            payload = __import__("json").loads(request.data.decode())
            calls.append(payload.get("params", {}).get("name") or payload.get("method"))
            body, headers = responses.pop(0)
            return FakeResponse(body, headers)

        with mock.patch.object(handler.urllib.request, "urlopen", side_effect=fake_urlopen), mock.patch.object(handler.time, "sleep") as sleep:
            scan_id, scan_status, bundle, created = handler.mcp_scan(
                "https://example.com/canary",
                "eu_ie",
                "test-secret",
            )

        self.assertEqual(scan_id, "scan-123")
        self.assertEqual(created["status"], "queued")
        self.assertEqual(scan_status["status"], "completed")
        self.assertEqual(scan_status["sentinelPollCount"], 2)
        self.assertEqual(calls.count("certscore_scan_site"), 1)
        self.assertEqual(calls.count("certscore_get_scan_status"), 2)
        self.assertEqual(calls[-1], "certscore_get_scan_bundle")
        self.assertEqual(bundle["scan"]["status"], "completed")
        self.assertTrue(all(call.args[0] >= 20 for call in sleep.call_args_list))


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

    def test_mcp_target_does_not_repeat_the_previous_hour_api_target(self):
        for hour in range(15):
            previous = handler.build_hourly_jobs(self.pages, hour - 1)
            current = handler.build_hourly_jobs(self.pages, hour)
            previous_api = next(job for job in previous if job["transport"] == "api")
            current_mcp = next(job for job in current if job["transport"] == "mcp")
            self.assertNotEqual(
                (current_mcp["page"]["key"], current_mcp["location"]),
                (previous_api["page"]["key"], previous_api["location"]),
            )


if __name__ == "__main__":
    unittest.main()
