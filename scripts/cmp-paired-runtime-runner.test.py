"""Offline harness safety tests: no browser, DNS, SDK call or public contact."""
import copy
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("runner", Path(__file__).with_name("cmp-paired-runtime-runner.py"))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def plan(sites=1):
    value = {"schemaVersion": runner.VERSION, "runId": "offline-test", "budgets": runner.BUDGET.copy(),
             "outputPath": "/offline/results",
             "concurrency": 2, "maxContacts": sites * 4,
             "authorization": {"publicContactsApproved": True, "reference": "offline fixture only"},
             "arms": {arm: {"root": "/offline/" + arm, "sourceFingerprint": arm + "-source", "buildFingerprint": arm + "-build"} for arm in ("reference", "candidate")},
             "runtime": {key: "offline" for key in ("nodePath", "nodeVersion", "nodeSha256", "playwrightVersion", "browserExecutablePath", "browserExecutableSha256", "lockfileSha256", "browserManifestSha256")},
             "visitor": {"path": "/offline/visitor", "sha256": "offline"},
             "runner": {"path": "/offline/runner", "sha256": "offline"},
             "campaign": {"path": "/offline/campaign", "sha256": "offline"},
             "eligibility": {"path": "/offline/eligibility", "sha256": "offline", "checkedAt": "2026-10-29T00:00:00Z", "expiresAt": "2026-10-30T00:00:00Z"},
             "targets": [], "slots": []}
    for index in range(sites):
        tid = f"site-{index}"
        target = {"targetId": tid, "url": f"https://site-{index}.example/", "domain": f"site-{index}.example",
                  "providerStratum": "OneTrust", "phase": "diagnostic", "eligible": True,
                  "eligibilityReason": "offline fixture; no contact", "armOrder": ["reference", "candidate"] if index % 2 == 0 else ["candidate", "reference"]}
        value["targets"].append(target)
        for ai, action in enumerate(("accept", "reject")):
            for arm in target["armOrder"] if ai == 0 else reversed(target["armOrder"]):
                value["slots"].append({"slotId": f"{tid}-{action}-{arm}", "pairId": f"{tid}-{action}",
                                       "targetId": tid, "url": target["url"], "action": action, "arm": arm,
                                       "providerStratum": target["providerStratum"], "phase": target["phase"]})
    return value


def successful_visit(slot, directory, no_go=False, wrong_session=False):
    claim = runner.read_json(directory / "claim.json")
    marker = {**claim, "event": "contact_started", "at": runner.now()}
    runner.durable_json(directory / "contact-started.json", marker, exclusive=True)
    filename = "PostAcceptEvidencePacket.json" if slot["action"] == "accept" else "PostRefusalEvidencePacket.json"
    packet = {"parentScanId": "wrong-session" if wrong_session else claim["scanId"],
              "scanId": claim["scanId"] + "-" + slot["action"], "normalizedUrl": slot["url"],
              "targetUrl": "https://resolved.example/"}
    runner.durable_json(directory / filename, packet, exclusive=True)
    runner.durable_json(directory / "projection.json", {"fixture": True}, exclusive=True)
    result = {**{key: claim[key] for key in ("url", "action", "arm", "planSha256", "sourceFingerprint", "buildFingerprint", "dispatchTargetSha256")}, "scanId": claim["scanId"], "status": "completed",
              "scannerRuntimeStarted": True, "packetFile": filename, "packetSha256": runner.file_sha(directory / filename),
              "packetBytes": (directory / filename).stat().st_size, "canonicalVerificationCompleted": True,
              "projectionSha256": runner.file_sha(directory / "projection.json"), "runtime": {"noGoCandidate": no_go}}
    result["nativeProjection"] = {"path": str(directory / "projection.json"), "sha256": result["projectionSha256"], "bytes": (directory / "projection.json").stat().st_size}
    runner.durable_json(directory / "result.json", result, exclusive=True)
    return result


class HarnessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.plan_path, self.out = self.root / "plan.json", self.root / "results"
        self.calls = []

    def tearDown(self):
        self.temp.cleanup()

    def make_runner(self, value=None, executor=None):
        value = value or plan()
        value["outputPath"] = str(self.out)
        campaign_path = self.root / "campaign.json"
        if not campaign_path.exists():
            runner.durable_json(campaign_path, {"schemaVersion": "cmp_paired_campaign.v1", "campaignId": "offline-campaign",
                "maxContacts": value["maxContacts"], "outputPath": str(self.root / "campaign-ledger"), "slots": value["slots"]})
        value["campaign"] = {"path": str(campaign_path), "sha256": runner.file_sha(campaign_path)}
        runner.durable_json(self.plan_path, value)
        def visit(slot, directory):
            self.calls.append(slot["slotId"])
            return successful_visit(slot, directory)
        return runner.Runner(self.plan_path, self.out, "diagnostic", executor or visit)

    def run_offline(self, instance):
        with patch.object(runner, "verify_environment"):
            return instance.run()

    def test_complete_schedule_and_no_retries_on_resume(self):
        self.assertTrue(self.run_offline(self.make_runner()))
        self.assertEqual(len(self.calls), 4)
        self.assertTrue(self.run_offline(self.make_runner()))
        self.assertEqual(len(self.calls), 4)
        summary = runner.read_json(self.out / "contact-summary.json")
        self.assertEqual((summary["claimedSlots"], summary["contacted"], len(summary["rows"])), (4, 4, 4))
        self.assertEqual(runner.file_sha(summary["localContactLedger"]["path"]), summary["localContactLedger"]["sha256"])
        ledger = runner.read_json(summary["localContactLedger"]["path"])
        for row in summary["rows"]:
            receipt = row["contactLedgerReceipt"]
            self.assertEqual(receipt["ledgerSha256"], summary["localContactLedger"]["sha256"])
            event = ledger["events"][receipt["eventIndex"]]
            self.assertEqual((event["event"], event["slotId"], event["scanId"]), ("contact_started", row["slotId"], row["scanId"]))

    def test_observer_schema_error_stops_all_later_domains(self):
        value = plan(2); value["concurrency"] = 1
        def fail(slot, directory):
            self.calls.append(slot["slotId"])
            result = successful_visit(slot, directory)
            result.update(status="failed", fatalEvidenceError=True, error="ZodError: exact retained request mismatch")
            runner.durable_json(directory / "result.json", result)
            return result
        self.assertFalse(self.run_offline(self.make_runner(value, fail)))
        summary = runner.read_json(self.out / "contact-summary.json")
        self.assertEqual(len(self.calls), 1)
        self.assertTrue(summary["halted"])
        self.assertEqual(sum(row.get("contacted") is True for row in summary["rows"]), 1)

    def test_no_go_stops_only_remaining_same_domain(self):
        def visit(slot, directory):
            self.calls.append(slot["slotId"])
            return successful_visit(slot, directory, no_go=slot["targetId"] == "site-0")
        self.run_offline(self.make_runner(plan(2), visit))
        rows = runner.read_json(self.out / "contact-summary.json")["rows"]
        self.assertEqual((len(self.calls), sum(r["status"] == "skipped" for r in rows), len(rows)), (5, 3, 8))

    def test_claimed_interruption_is_unknown_and_never_retried(self):
        instance = self.make_runner()
        with instance.acquire():
            instance.initialize()
            slot = instance.plan["slots"][0]
            claim = {**instance.common(slot), "scanId": "interrupted-session", "status": "claimed"}
            runner.durable_json(instance.campaign_dir / "claims" / (slot["slotId"] + ".json"), claim, exclusive=True)
            runner.durable_json(self.out / "visits" / slot["slotId"] / "claim.json", claim, exclusive=True)
        self.run_offline(self.make_runner())
        self.assertEqual(self.calls, [])
        summary = runner.read_json(self.out / "contact-summary.json")
        self.assertEqual((summary["claimedSlots"], summary["contactUncertain"]), (1, 1))
        self.assertEqual([r["status"] for r in summary["rows"]], ["interrupted", "skipped", "skipped", "skipped"])

    def test_changed_resume_manifest_rejected(self):
        self.run_offline(self.make_runner())
        value = plan(); value["authorization"]["reference"] = "changed"
        with self.assertRaisesRegex(ValueError, "already bound to a different plan"):
            self.run_offline(self.make_runner(value))

    def test_alternate_output_cannot_repeat_frozen_campaign(self):
        self.make_runner()
        with self.assertRaisesRegex(ValueError, "output directory differs"):
            runner.Runner(self.plan_path, self.root / "alternate", "diagnostic")

    def test_new_phase_may_pin_new_candidate_but_shared_claims_cannot_repeat(self):
        value = plan(2); value["targets"][1]["phase"] = "holdout"
        for slot in value["slots"][4:]: slot["phase"] = "holdout"
        initial = self.make_runner(value)
        self.run_offline(initial)
        self.assertEqual(len(self.calls), 4)
        holdout = copy.deepcopy(initial.plan)
        holdout["targets"] = holdout["targets"][1:]; holdout["slots"] = holdout["slots"][4:]
        holdout["maxContacts"] = 4; holdout["outputPath"] = str(self.root / "holdout")
        holdout["arms"]["candidate"]["buildFingerprint"] = "repaired-candidate"
        path = self.root / "holdout-plan.json"; runner.durable_json(path, holdout)
        second = runner.Runner(path, self.root / "holdout", "holdout", successful_visit)
        self.assertTrue(self.run_offline(second))
        self.assertEqual(len(list(initial.campaign_dir.glob("claims/*.json"))), 8)
        repeat = copy.deepcopy(initial.plan); repeat["outputPath"] = str(self.root / "repeat")
        repeat_path = self.root / "repeat-plan.json"; runner.durable_json(repeat_path, repeat)
        with self.assertRaisesRegex(ValueError, "already bound to a different plan"):
            self.run_offline(runner.Runner(repeat_path, self.root / "repeat", "diagnostic", successful_visit))

    def test_shared_reservation_crash_before_local_claim_consumes_slot(self):
        instance = self.make_runner()
        slot = instance.plan["slots"][0]
        claim = {**instance.common(slot), "scanId": "reserved-session", "status": "claimed"}
        runner.durable_json(instance.campaign_dir / "claims" / (slot["slotId"] + ".json"), claim, exclusive=True)
        self.run_offline(instance)
        self.assertEqual(len(self.calls), 0)
        summary = runner.read_json(self.out / "contact-summary.json")
        self.assertEqual((summary["claimedSlots"], summary["campaignClaimedSlots"], summary["contactUncertain"]), (1, 1, 1))

    def test_shared_cap_prevents_fresh_phase_contact(self):
        instance = self.make_runner()
        for i in range(4):
            runner.durable_json(instance.campaign_dir / "claims" / f"spent-{i}.json", {"conservativelySpent": True}, exclusive=True)
        self.assertFalse(self.run_offline(instance))
        self.assertEqual(len(self.calls), 0)
        self.assertTrue((instance.campaign_dir / "halt.json").exists())

    def test_stop_between_claim_and_launch_cannot_start_visitor(self):
        instance = self.make_runner()
        slot = instance.plan["slots"][0]
        directory = self.out / "visits" / slot["slotId"]
        directory.mkdir(parents=True)
        instance.halt.set()
        with patch.object(runner.subprocess, "Popen") as launch:
            self.assertIsNone(instance.execute_visit(slot, directory))
            launch.assert_not_called()

    def prepare_continuation(self, with_holdout=False):
        value = plan(3); value["concurrency"] = 1
        if with_holdout:
            value["targets"][-1]["phase"] = "holdout"
            for slot in value["slots"][-4:]: slot["phase"] = "holdout"
            runner.durable_json(self.root / "campaign.json", {"schemaVersion": "cmp_paired_campaign.v1", "campaignId": "offline-campaign",
                "maxContacts": 12, "outputPath": str(self.root / "campaign-ledger"), "slots": value["slots"]})
            value["targets"] = value["targets"][:-1]; value["slots"] = value["slots"][:-4]; value["maxContacts"] = 8
        def fail(slot, directory):
            result = successful_visit(slot, directory)
            result.update(status="failed", fatalEvidenceError=True,
                          error="AssertionError: Expected values to be strictly deep-equal: observationEndedAtMs: undefined")
            runner.durable_json(directory / "result.json", result)
            return result
        original = self.make_runner(value, fail)
        self.assertFalse(self.run_offline(original))
        def ref(path): return {"path": str(path), "sha256": runner.file_sha(path)}
        review = self.root / "stop-review.json"
        runner.durable_json(review, {"policyVersion": "cmp_instrumentation_stop_review.v1", "campaignStopped": True,
                                    "terminalProcessExitCode": 1, "knownContacts": 1, "possibleAdditionalContacts": 0, "originalApprovedCap": 12})
        receipt = self.root / "continuation-receipt.json"
        runner.durable_json(receipt, {"schemaVersion": "cmp_paired_continuation.v1", "reason": "serialized_optional_undefined_fields_only",
            "reviewedBy": "offline fixture", "reviewedAt": runner.now(), "review": ref(review),
            "previousPlan": ref(self.plan_path), "previousSummary": ref(self.out / "contact-summary.json"),
            "previousLedger": ref(self.out / "local-contact-ledger.json"), "previousHalt": ref(original.campaign_dir / "halt.json"),
            "previousPhaseBinding": ref(original.campaign_dir / "phase-plans/diagnostic.json")})
        continued = copy.deepcopy(original.plan)
        continued.update(runId="offline-continuation", outputPath=str(self.root / "continuation"), maxContacts=len(continued["slots"]) - 4,
                         targets=continued["targets"][1:], slots=continued["slots"][4:], continuation=ref(receipt))
        path = self.root / "continuation-plan.json"; runner.durable_json(path, continued)
        return original, continued, path

    def test_reviewed_continuation_preserves_halt_and_contacts_only_unclaimed_domains(self):
        original, value, path = self.prepare_continuation()
        halt_before = (original.campaign_dir / "halt.json").read_bytes()
        phase_before = (original.campaign_dir / "phase-plans/diagnostic.json").read_bytes()
        continued = runner.Runner(path, Path(value["outputPath"]), "diagnostic", successful_visit)
        self.assertTrue(self.run_offline(continued))
        self.assertEqual(len(list(original.campaign_dir.glob("claims/*.json"))), 9)
        self.assertEqual((original.campaign_dir / "halt.json").read_bytes(), halt_before)
        self.assertEqual((original.campaign_dir / "phase-plans/diagnostic.json").read_bytes(), phase_before)
        sibling = copy.deepcopy(value); sibling["outputPath"] = str(self.root / "sibling")
        sibling_path = self.root / "sibling-plan.json"; runner.durable_json(sibling_path, sibling)
        with self.assertRaisesRegex(ValueError, "sibling retry prohibited"):
            self.run_offline(runner.Runner(sibling_path, Path(sibling["outputPath"]), "diagnostic", successful_visit))

    def test_continuation_rejects_claimed_domain_omission_runtime_change_and_changed_proof(self):
        original, value, path = self.prepare_continuation()
        changes = []
        changed = copy.deepcopy(value); changed.update(targets=original.plan["targets"], slots=original.plan["slots"], maxContacts=12); changes.append(changed)
        changed = copy.deepcopy(value); changed.update(targets=value["targets"][:1], slots=value["slots"][:4], maxContacts=4); changes.append(changed)
        changed = copy.deepcopy(value); changed["arms"]["candidate"]["buildFingerprint"] = "changed"; changes.append(changed)
        for changed in changes:
            runner.durable_json(path, changed)
            with self.assertRaises(ValueError): runner.Runner(path, Path(changed["outputPath"]), "diagnostic", successful_visit)
        runner.durable_json(path, value)
        (original.campaign_dir / "halt.json").write_text("{}")
        with self.assertRaisesRegex(ValueError, "previousHalt changed"):
            runner.Runner(path, Path(value["outputPath"]), "diagnostic", successful_visit)

    def test_preselected_holdout_waits_for_finished_continuation_and_can_pin_repaired_candidate(self):
        original, value, path = self.prepare_continuation(with_holdout=True)
        holdout = copy.deepcopy(value)
        target = plan(3)["targets"][-1]; target["phase"] = "holdout"
        holdout.update(runId="offline-holdout", outputPath=str(self.root / "holdout"), targets=[target],
                       slots=[s for s in original.campaign["slots"] if s["phase"] == "holdout"], maxContacts=4)
        holdout["arms"]["candidate"]["buildFingerprint"] = "new-validated-runtime"
        holdout_path = self.root / "holdout-plan.json"; runner.durable_json(holdout_path, holdout)
        with self.assertRaises(FileNotFoundError):
            self.run_offline(runner.Runner(holdout_path, Path(holdout["outputPath"]), "holdout", successful_visit))
        self.assertTrue(self.run_offline(runner.Runner(path, Path(value["outputPath"]), "diagnostic", successful_visit)))
        self.assertTrue(self.run_offline(runner.Runner(holdout_path, Path(holdout["outputPath"]), "holdout", successful_visit)))
        self.assertEqual(len(list(original.campaign_dir.glob("claims/*.json"))), 9)

    def test_completed_packet_corruption_halts_resume(self):
        self.run_offline(self.make_runner())
        next((self.out / "visits").glob("*/PostAcceptEvidencePacket.json")).write_text("{}")
        self.assertFalse(self.run_offline(self.make_runner()))
        summary = runner.read_json(self.out / "contact-summary.json")
        self.assertTrue(summary["halted"])
        self.assertIn("invalid_evidence", [r["status"] for r in summary["rows"]])
        self.assertEqual(len(self.calls), 4)

    def test_wrong_session_halts_without_more_visits(self):
        def visit(slot, directory):
            self.calls.append(slot["slotId"])
            return successful_visit(slot, directory, wrong_session=True)
        self.assertFalse(self.run_offline(self.make_runner(executor=visit)))
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(runner.read_json(self.out / "contact-summary.json")["rows"][0]["status"], "invalid_evidence")

    def test_source_drift_prevents_claim_or_contact(self):
        instance = self.make_runner()
        with patch.object(runner, "verify_environment", side_effect=ValueError("candidate source drift")):
            self.assertFalse(instance.run())
        summary = runner.read_json(self.out / "contact-summary.json")
        self.assertEqual((len(self.calls), summary["claimedSlots"], summary["contacted"]), (0, 0, 0))
        self.assertEqual(len(summary["rows"]), 4)

    def test_post_visit_build_drift_invalidates_result(self):
        instance = self.make_runner()
        with patch.object(runner, "verify_environment", side_effect=[None, ValueError("candidate build drift")]):
            self.assertFalse(instance.run())
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(runner.read_json(self.out / "contact-summary.json")["rows"][0]["status"], "invalid_evidence")

    def test_missing_terminal_result_is_not_retried(self):
        def visit(slot, directory):
            self.calls.append(slot["slotId"])
            return None
        self.assertTrue(self.run_offline(self.make_runner(executor=visit)))
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(runner.read_json(self.out / "contact-summary.json")["contactUncertain"], 1)

    def test_ineligible_rows_and_untouched_holdout_remain_visible(self):
        value = plan(2); value["targets"][0]["eligible"] = False
        value["targets"][1]["phase"] = "holdout"
        for slot in value["slots"][4:]: slot["phase"] = "holdout"
        self.run_offline(self.make_runner(value))
        rows = runner.read_json(self.out / "contact-summary.json")["rows"]
        self.assertEqual(len(self.calls), 0)
        self.assertEqual([r["status"] for r in rows], ["skipped"] * 4 + ["planned"] * 4)

    def test_global_concurrency_two_and_each_domain_serial(self):
        active = set(); peak = 0; lock = threading.Lock()
        def visit(slot, directory):
            nonlocal peak
            with lock:
                self.assertNotIn(slot["targetId"], active)
                active.add(slot["targetId"]); peak = max(peak, len(active))
            time.sleep(0.01)
            result = successful_visit(slot, directory)
            with lock: active.remove(slot["targetId"])
            return result
        self.run_offline(self.make_runner(plan(4), visit))
        self.assertEqual(peak, 2)

    def test_process_lock_prevents_second_coordinator(self):
        first = self.make_runner(); second = runner.Runner(self.plan_path, self.out, "diagnostic")
        with first.acquire():
            with self.assertRaises(BlockingIOError):
                with second.acquire(): pass

    def test_plan_rejects_duplicate_domain_bad_cap_missing_pair_held_target(self):
        values = []
        value = plan(); value["maxContacts"] = 3; values.append(value)
        value = plan(); value["maxContacts"] = 121; values.append(value)
        value = plan(); value["slots"].pop(); values.append(value)
        value = plan(); value["slots"][1]["pairId"] = "other"; values.append(value)
        value = plan(); value["concurrency"] = 3; values.append(value)
        value = plan(); value["targets"][0].update(url="https://www.gimbal.com/", domain="gimbal.com"); values.append(value)
        value = plan(2); value["targets"][1].update(url=value["targets"][0]["url"], domain=value["targets"][0]["domain"]); values.append(value)
        for value in values:
            with self.subTest(value=value):
                with self.assertRaises(ValueError): runner.validate_plan(value)

    def test_credentials_rollout_flags_and_node_overrides_not_in_child_environment(self):
        with patch.dict(os.environ, {"AWS_ACCESS_KEY_ID": "fake", "NODE_OPTIONS": "fake", "NODE_PATH": "fake", "TSX_TSCONFIG_PATH": "fake", "CERTSCORE_PAID_MODEL_ENABLED": "true"}):
            self.assertFalse(set(runner.clean_env()) - set(runner.ENV_KEYS))

    def test_inventory_detects_workspace_link_escape_and_added_file(self):
        root = self.root / "frozen"
        for package in runner.PACKAGES:
            for folder in ("src", "dist"):
                file = root / "packages" / package / folder / "index.js"
                file.parent.mkdir(parents=True); file.write_text("fixture")
            (root / "packages" / package / "package.json").write_text("{}")
        for name in ("package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json"):
            (root / name).write_text("{}")
        link = root / "packages/certscore-scan-core/node_modules/@certscore/contracts"
        link.parent.mkdir(parents=True); link.symlink_to(root / "packages/certscore-contracts", target_is_directory=True)
        before = runner.inventory(root)
        (root / "packages/certscore-scan-core/src/extra.js").write_text("added")
        self.assertNotEqual(before["sourceFingerprint"], runner.inventory(root)["sourceFingerprint"])
        link.unlink(); link.symlink_to("/outside/packages/certscore-contracts")
        with self.assertRaisesRegex(ValueError, "escapes frozen root"): runner.inventory(root)


if __name__ == "__main__":
    unittest.main()
