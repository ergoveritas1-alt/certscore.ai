#!/usr/bin/env python3
"""Bounded local CertScore.ai CMP comparison. Default operation is offline preflight.

Central eligibility/authorization is supplied by the operator in a frozen plan. This
runner neither selects public targets nor creates production scans. A claimed slot
is never retried, including after an interruption before contact can be established.
"""
import argparse
import concurrent.futures
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import threading
import urllib.parse

VERSION = "cmp_paired_runtime_plan.v1"
PACKAGES = ["certscore-contracts", "certscore-vendor-resolver", "shared", "web-bot-auth", "certscore-review-engine", "certscore-scan-core"]
BUDGET = {"searchMs": 14000, "confirmationMs": 2000, "resultMs": 20000,
          "acceptObservationMs": 3000, "rejectObservationMs": 8000}
ENV_KEYS = ("HOME", "PATH", "TMPDIR", "LANG", "LC_ALL")
DENIED_DOMAINS = ("gimbal.com", "readcube.com", "sits.com")
ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$")


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def read_json(path):
    return json.loads(Path(path).read_text())


def durable_json(path, value, exclusive=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = json.dumps(value, indent=2, sort_keys=True) + "\n"
    if exclusive:
        with path.open("x") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
    else:
        temp = path.with_name(path.name + ".tmp")
        with temp.open("w") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, path)
    fd = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def inventory(root):
    """Complete source/build inventory of the six runtime workspace packages."""
    root = Path(root).resolve()
    source, build = {}, {}
    for name in PACKAGES:
        package = root / "packages" / name
        require(package.is_dir(), f"missing runtime package: {name}")
        for folder, target in (("src", source), ("dist", build)):
            base = package / folder
            require(base.is_dir(), f"missing {name}/{folder}; build both arms first")
            files = [p for p in base.rglob("*") if p.is_file()]
            require(files, f"empty runtime {name}/{folder}")
            for path in sorted(files):
                require(path.resolve().is_relative_to(root), f"workspace file escapes frozen root: {path}")
                target[str(path.relative_to(root))] = file_sha(path)
        for path in sorted(package.glob("*")):
            if path.is_file() and (path.name == "package.json" or path.name.startswith("tsconfig") and path.suffix == ".json"):
                source[str(path.relative_to(root))] = file_sha(path)
    for name in ("package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "tsconfig.base.json"):
        source[name] = file_sha(root / name)
    # Prevent a frozen arm importing a mutable sibling workspace through pnpm links.
    links = {}
    for name in PACKAGES:
        modules = root / "packages" / name / "node_modules"
        for path in sorted(modules.glob("@*/*")):
            if path.is_symlink() and "/packages/" in str(path.resolve()):
                require(path.resolve().is_relative_to(root / "packages"), f"workspace dependency escapes frozen root: {path}")
                links[str(path.relative_to(root))] = str(path.resolve().relative_to(root))
    require(links, "runtime workspace links unavailable")
    return {"root": str(root), "sourceFiles": source, "buildFiles": build,
            "workspaceLinks": links,
            "sourceFingerprint": sha(canonical(source)),
            "buildFingerprint": sha(canonical({"files": build, "links": links}))}


def clean_env():
    return {key: os.environ[key] for key in ENV_KEYS if key in os.environ}


def parse_time(value):
    stamp = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    require(stamp.tzinfo is not None, "eligibility time must include timezone")
    return stamp


def validate_plan(plan):
    require(plan.get("schemaVersion") == VERSION, "unsupported plan version")
    require(bool(ID.fullmatch(plan.get("runId", ""))), "invalid runId")
    require(isinstance(plan.get("outputPath"), str) and Path(plan["outputPath"]).is_absolute(), "absolute bound outputPath required")
    require(plan.get("budgets") == BUDGET, "action budgets must remain unchanged")
    require(type(plan.get("concurrency")) is int and 1 <= plan["concurrency"] <= 2, "global concurrency must be 1 or 2")
    require(set(plan.get("arms", {})) == {"reference", "candidate"}, "exactly two frozen arms required")
    require(plan["arms"]["reference"]["root"] != plan["arms"]["candidate"]["root"], "arms require separate frozen roots")
    require(plan.get("authorization", {}).get("publicContactsApproved") is True, "plan requires documented public-contact authorization")
    require(bool(plan["authorization"].get("reference")), "authorization reference required")
    targets, slots = plan.get("targets", []), plan.get("slots", [])
    require(1 <= len(targets) <= 30, "bounded cohort requires 1 through 30 sites")
    require(type(plan.get("maxContacts")) is int and 0 < plan["maxContacts"] <= 120, "contact cap must be between 1 and 120")
    require(len(slots) == len(targets) * 4 and len(slots) <= plan["maxContacts"], "preserve all four planned action/arm slots per site within approved cap")
    target_ids, slot_ids, hosts, expected = set(), set(), set(), []
    for target in targets:
        tid = target.get("targetId", "")
        require(bool(ID.fullmatch(tid)) and tid not in target_ids, "duplicate or unsafe targetId")
        target_ids.add(tid)
        url = urllib.parse.urlsplit(target["url"])
        require(url.scheme == "https" and url.hostname and not url.username and not url.password and not url.fragment,
                "public target must be exact HTTPS URL without credentials or fragment")
        host = url.hostname.lower().rstrip(".")
        domain = target.get("domain", "").lower().rstrip(".")
        require(domain and (host == domain or host.endswith("." + domain)), "selector-validated registrable domain required")
        require(domain not in hosts, "same registrable domain may appear only once")
        hosts.add(domain)
        require(not any(host == held or host.endswith("." + held) for held in DENIED_DOMAINS), "held domain excluded from this campaign")
        require(target.get("phase") in ("diagnostic", "holdout"), "explicit diagnostic or untouched holdout phase required")
        require(bool(target.get("providerStratum")), "fixed selection provider stratum required")
        require(type(target.get("eligible")) is bool and bool(target.get("eligibilityReason")), "explicit eligibility outcome required")
        require(sorted(target.get("armOrder", [])) == ["candidate", "reference"], "counterbalanced arm order required")
        for index, action in enumerate(("accept", "reject")):
            order = target["armOrder"] if index == 0 else list(reversed(target["armOrder"]))
            for arm in order:
                expected.append((tid, target["url"], action, arm, target["providerStratum"], target["phase"]))
    pair_keys = {}
    for slot, want in zip(slots, expected):
        require(tuple(slot.get(k) for k in ("targetId", "url", "action", "arm", "providerStratum", "phase")) == want,
                "slots must preserve target order, both actions, reversed arm order and fixed strata")
        sid, pid = slot.get("slotId", ""), slot.get("pairId", "")
        require(bool(ID.fullmatch(sid)) and sid not in slot_ids and bool(ID.fullmatch(pid)), "duplicate or unsafe slot/pair ID")
        slot_ids.add(sid)
        pair_keys.setdefault(pid, []).append((slot["targetId"], slot["action"], slot["arm"]))
    require(all(len(v) == 2 and v[0][:2] == v[1][:2] and {x[2] for x in v} == {"reference", "candidate"} for v in pair_keys.values()), "each pair must contain one action for both arms")
    require(set(plan.get("runtime", {})) >= {"nodePath", "nodeVersion", "nodeSha256", "playwrightVersion", "browserExecutablePath", "browserExecutableSha256", "lockfileSha256", "browserManifestSha256"}, "complete shared runtime identity required")
    require(set(plan.get("visitor", {})) == {"path", "sha256"}, "pinned visitor required")
    require(set(plan.get("runner", {})) == {"path", "sha256"}, "pinned coordinator required")
    require(set(plan.get("campaign", {})) == {"path", "sha256"}, "shared immutable campaign required")
    require(set(plan.get("eligibility", {})) >= {"path", "sha256", "checkedAt", "expiresAt"}, "pinned central eligibility evidence required")


def campaign_for_plan(plan):
    binding = plan["campaign"]
    require(file_sha(binding["path"]) == binding["sha256"], "campaign source drift")
    campaign = read_json(binding["path"])
    require(campaign.get("schemaVersion") == "cmp_paired_campaign.v1" and bool(ID.fullmatch(campaign.get("campaignId", ""))), "invalid shared campaign")
    require(isinstance(campaign.get("outputPath"), str) and Path(campaign["outputPath"]).is_absolute(), "absolute campaign ledger directory required")
    slots = campaign.get("slots", [])
    require(type(campaign.get("maxContacts")) is int and len(slots) <= campaign["maxContacts"] <= 120, "shared campaign cap invalid")
    require(plan["maxContacts"] <= campaign["maxContacts"], "phase cap exceeds campaign cap")
    frozen = {s["slotId"]: s for s in slots}
    require(len(frozen) == len(slots), "campaign has duplicate slots")
    require(all(frozen.get(s["slotId"]) == s for s in plan["slots"]), "phase plan changed preselected campaign slots")
    return campaign


def continuation_for_plan(plan, campaign):
    """Acknowledge the one reviewed wrapper defect without erasing prior claims/halts.

    Only wholly unclaimed diagnostic domains can continue. The first continuation
    plan is append-only bound under the campaign lock; holdout stays preselected.
    """
    binding = plan.get("continuation")
    if binding is None:
        return None
    require(set(binding) == {"path", "sha256"}, "continuation requires a pinned review receipt")
    require(file_sha(binding["path"]) == binding["sha256"], "continuation receipt drift")
    receipt = read_json(binding["path"])
    require(receipt.get("schemaVersion") == "cmp_paired_continuation.v1" and
            receipt.get("reason") == "serialized_optional_undefined_fields_only", "unsupported continuation reason")
    require(bool(receipt.get("reviewedBy")) and bool(receipt.get("reviewedAt")), "explicit scoped continuation review required")
    values = {}
    for field in ("review", "previousPlan", "previousSummary", "previousLedger", "previousHalt", "previousPhaseBinding"):
        ref = receipt[field]
        require(file_sha(ref["path"]) == ref["sha256"], f"continuation {field} changed")
        values[field] = read_json(ref["path"])
    prior, summary, ledger, halt, phase = (values[key] for key in ("previousPlan", "previousSummary", "previousLedger", "previousHalt", "previousPhaseBinding"))
    prior_hash = receipt["previousPlan"]["sha256"]
    require(prior["campaign"] == plan["campaign"], "continuation must retain original campaign and cap")
    require(summary.get("planSha256") == prior_hash and ledger.get("planSha256") == prior_hash and phase.get("planSha256") == prior_hash,
            "predecessor plan/summary/ledger/phase binding mismatch")
    require(summary.get("halted") is True and all(r["status"] not in ("planned", "claimed") for r in summary["rows"]), "predecessor must be terminal and halted")
    review = values["review"]
    require(review.get("policyVersion") == "cmp_instrumentation_stop_review.v1" and review.get("campaignStopped") is True and
            review.get("terminalProcessExitCode") == 1 and review.get("possibleAdditionalContacts") == 0 and
            review.get("knownContacts") == sum(r.get("contacted") is True for r in summary["rows"]) and
            review.get("originalApprovedCap") == campaign["maxContacts"], "instrumentation stop review does not bind reviewed contact/cap state")
    require("strictly deep-equal" in halt.get("reason", "") and "undefined" in halt.get("reason", ""), "predecessor halt was not the reviewed serialization defect")
    require(Path(receipt["previousSummary"]["path"]).resolve() == (Path(prior["outputPath"]) / "contact-summary.json").resolve(), "predecessor summary path mismatch")
    require(Path(receipt["previousLedger"]["path"]).resolve() == Path(summary["localContactLedger"]["path"]).resolve() and
            receipt["previousLedger"]["sha256"] == summary["localContactLedger"]["sha256"], "predecessor ledger receipt mismatch")
    require(Path(receipt["previousHalt"]["path"]).resolve() == (Path(campaign["outputPath"]) / "halt.json").resolve(), "original campaign halt must remain retained")
    require(Path(receipt["previousPhaseBinding"]["path"]).resolve() == (Path(campaign["outputPath"]) / "phase-plans/diagnostic.json").resolve(), "original diagnostic phase binding must remain retained")
    require(plan["runtime"] == prior["runtime"] and plan["budgets"] == prior["budgets"], "continuation must keep browser/environment/budgets fixed")
    require(plan["arms"]["reference"] == prior["arms"]["reference"], "continuation reference must stay fixed")
    claimed_ids = {event["slotId"] for event in ledger["events"] if event["event"] == "claimed"}
    require(len(claimed_ids) == summary["claimedSlots"], "predecessor claim accounting mismatch")
    old_slots = {s["slotId"]: s for s in prior["slots"]}
    require(claimed_ids <= old_slots.keys(), "predecessor claim outside frozen plan")
    excluded_targets = {old_slots[sid]["targetId"] for sid in claimed_ids}
    excluded_domains = {t["domain"] for t in prior["targets"] if t["targetId"] in excluded_targets}
    require(not any(t["domain"] in excluded_domains for t in plan["targets"]), "continuation cannot revisit any previously claimed domain")
    if any(t["phase"] == "diagnostic" for t in plan["targets"]):
        require(all(t["phase"] == "diagnostic" for t in plan["targets"]), "continuation phase plans must be separate")
        require(plan["arms"]["candidate"] == prior["arms"]["candidate"], "diagnostic continuation may only repair the harness")
        expected_targets = [t for t in prior["targets"] if t["phase"] == "diagnostic" and t["targetId"] not in excluded_targets]
        expected_slots = [s for s in prior["slots"] if s["phase"] == "diagnostic" and s["targetId"] not in excluded_targets]
        require(plan["targets"] == expected_targets and plan["slots"] == expected_slots, "continuation must retain every wholly unclaimed diagnostic site without replacement")
    else:
        require(all(t["phase"] == "holdout" for t in plan["targets"]), "continuation permits only original holdout phase")
        require(plan["slots"] == [s for s in campaign["slots"] if s["phase"] == "holdout"], "holdout must preserve all original preselected slots")
    return {"receipt": receipt, "priorPlanSha256": prior_hash}


def verify_environment(plan, *, check_expiry=True, arm_names=("reference", "candidate")):
    validate_plan(plan)
    campaign = campaign_for_plan(plan)
    continuation_for_plan(plan, campaign)
    require(Path(plan["runner"]["path"]).resolve() == Path(__file__).resolve() and file_sha(__file__) == plan["runner"]["sha256"], "coordinator source drift")
    require(file_sha(plan["visitor"]["path"]) == plan["visitor"]["sha256"], "visitor source drift")
    eligibility = plan["eligibility"]
    require(file_sha(eligibility["path"]) == eligibility["sha256"], "eligibility source drift")
    checked, expires = parse_time(eligibility["checkedAt"]), parse_time(eligibility["expiresAt"])
    require(checked < expires and expires - checked <= dt.timedelta(hours=24), "eligibility window must be at most 24 hours")
    if check_expiry:
        require(checked <= dt.datetime.now(dt.timezone.utc) < expires, "eligibility review is not currently valid")
    runtime = plan["runtime"]
    require(file_sha(runtime["nodePath"]) == runtime["nodeSha256"], "Node executable drift")
    version = subprocess.check_output([runtime["nodePath"], "--version"], env=clean_env(), text=True).strip()
    require(version == runtime["nodeVersion"] and 22 <= int(version.lstrip("v").split(".")[0]) < 25, "unsupported or changed Node version")
    require(file_sha(runtime["browserExecutablePath"]) == runtime["browserExecutableSha256"], "Chromium executable drift")
    for name in arm_names:
        arm = plan["arms"][name]
        actual = inventory(arm["root"])
        for field in ("sourceFiles", "buildFiles", "workspaceLinks", "sourceFingerprint", "buildFingerprint"):
            require(actual[field] == arm[field], f"{name} {field} drift")
        root = Path(arm["root"])
        require(file_sha(root / "pnpm-lock.yaml") == runtime["lockfileSha256"], f"{name} dependency lock differs")
        require(read_json(root / "node_modules/playwright/package.json")["version"] == runtime["playwrightVersion"], "Playwright version differs")
        require(file_sha(root / "node_modules/playwright-core/browsers.json") == runtime["browserManifestSha256"], "Playwright Chromium manifest differs")


def verify_result(plan, slot, directory, result):
    require(all(result.get(k) == slot[k] for k in ("url", "action", "arm")), "result target/action/arm binding invalid")
    claim = read_json(directory / "claim.json")
    require(result.get("scanId") == claim["scanId"], "result session differs from durable claim")
    for key in ("planSha256", "sourceFingerprint", "buildFingerprint", "dispatchTargetSha256"):
        require(result.get(key) == claim[key], f"result {key} differs from durable claim")
    marker = directory / "contact-started.json"
    require(type(result.get("scannerRuntimeStarted")) is bool and result["scannerRuntimeStarted"] == marker.exists(), "contact marker/result disagreement")
    if marker.exists():
        started = read_json(marker)
        require(all(started.get(key) == claim.get(key) for key in ("scanId", "slotId", "url", "action", "arm", "planSha256", "sourceFingerprint", "buildFingerprint", "dispatchTargetSha256")), "contact marker binding differs")
    if result.get("status") == "completed":
        filename = "PostAcceptEvidencePacket.json" if slot["action"] == "accept" else "PostRefusalEvidencePacket.json"
        require(result.get("packetFile") == filename, "unexpected packet filename")
        path = directory / filename
        data = path.read_bytes()
        require(sha(data) == result.get("packetSha256") and len(data) == result.get("packetBytes"), "packet byte/hash mismatch")
        packet = json.loads(data)
        require(packet.get("parentScanId") == result["scanId"] and packet.get("scanId") == result["scanId"] + "-" + slot["action"], "packet source session mismatch")
        initial = urllib.parse.urlsplit(slot["url"])
        sanitized = urllib.parse.urlunsplit((initial.scheme, initial.netloc, initial.path or "/", "", ""))
        require(packet.get("normalizedUrl") == sanitized, "packet initial target mismatch")
        projection_path = directory / "projection.json"
        require(file_sha(projection_path) == result.get("projectionSha256"), "projection hash mismatch")
        require(result.get("nativeProjection") == {"path": str(projection_path), "sha256": file_sha(projection_path), "bytes": projection_path.stat().st_size}, "native projection receipt mismatch")
        require(result.get("canonicalVerificationCompleted") is True, "canonical packet verification unavailable")
    return result


class Runner:
    def __init__(self, plan_path, output, phase, executor=None):
        self.plan_path, self.output, self.phase = Path(plan_path), Path(output), phase
        self.plan_bytes = self.plan_path.read_bytes()
        self.plan = json.loads(self.plan_bytes)
        validate_plan(self.plan)
        require(self.output.resolve() == Path(self.plan["outputPath"]).resolve(), "output directory differs from bound plan; alternate output cannot retry claimed slots")
        self.plan_hash = sha(self.plan_bytes)
        self.campaign = campaign_for_plan(self.plan)
        self.continuation = continuation_for_plan(self.plan, self.campaign)
        self.campaign_dir = Path(self.campaign["outputPath"])
        self.lock = threading.RLock()
        self.halt = threading.Event()
        self.executor = executor or self.execute_visit
        self.rows = {}
        self.processes = set()
        self.lock_stream = None
        self.campaign_lock_stream = None

    def common(self, slot):
        arm = self.plan["arms"][slot["arm"]]
        url = urllib.parse.urlsplit(slot["url"])
        dispatch = urllib.parse.urlunsplit((url.scheme, url.netloc, url.path or "/", url.query, ""))
        return {**slot, "sourceFingerprint": arm["sourceFingerprint"], "buildFingerprint": arm["buildFingerprint"],
                "planSha256": self.plan_hash, "dispatchTargetSha256": sha(dispatch.encode()), "contacted": False, "status": "planned"}

    def summary(self):
        rows = [dict(self.rows[s["slotId"]]) for s in self.plan["slots"]]
        events, indices = [], {}
        for slot, row in zip(self.plan["slots"], rows):
            directory = self.output / "visits" / slot["slotId"]
            for filename, event in (("claim.json", "claimed"), ("contact-started.json", "contact_started"), ("outcome.json", "finished")):
                path = directory / filename
                if not path.exists():
                    continue
                retained = read_json(path)
                entry = {key: row.get(key) for key in ("slotId", "scanId", "url", "action", "arm", "sourceFingerprint", "buildFingerprint", "dispatchTargetSha256")}
                entry.update(event="skipped" if event == "finished" and row["status"] == "skipped" else event,
                             time=retained.get("claimedAt", retained.get("at", retained.get("completedAt"))),
                             source={"path": str(path), "sha256": file_sha(path), "bytes": path.stat().st_size})
                if event == "contact_started" or slot["slotId"] not in indices:
                    indices[slot["slotId"]] = len(events)
                events.append(entry)
        ledger = self.output / "local-contact-ledger.json"
        durable_json(ledger, {"schemaVersion": "cmp_paired_local_contact_ledger.v1", "planSha256": self.plan_hash, "events": events})
        ledger_hash = file_sha(ledger)
        for row in rows:
            if row["slotId"] in indices:
                row["contactLedgerReceipt"] = {"ledgerSha256": ledger_hash, "eventIndex": indices[row["slotId"]]}
        durable_json(self.output / "contact-summary.json", {"schemaVersion": "cmp_paired_runtime_summary.v1", "runId": self.plan["runId"],
                     "planSha256": self.plan_hash, "generatedAt": now(), "maxContacts": self.plan["maxContacts"],
                     "campaign": self.plan["campaign"],
                     "campaignClaimedSlots": len(list((self.campaign_dir / "claims").glob("*.json"))),
                     "claimedSlots": sum((self.output / "visits" / s["slotId"] / "claim.json").exists() for s in self.plan["slots"]),
                     "contacted": sum(r.get("contacted") is True for r in rows),
                     "contactUncertain": sum(r.get("contacted") is None for r in rows), "halted": self.halt.is_set(),
                     "localContactLedger": {"path": str(ledger), "sha256": ledger_hash, "bytes": ledger.stat().st_size}, "rows": rows})

    def stop(self, reason):
        with self.lock:
            self.halt.set()
            if not (self.output / "halt.json").exists():
                durable_json(self.output / "halt.json", {"reason": reason, "at": now(), "planSha256": self.plan_hash}, exclusive=True)
            if not (self.campaign_dir / "halt.json").exists():
                durable_json(self.campaign_dir / "halt.json", {"reason": reason, "at": now(), "planSha256": self.plan_hash}, exclusive=True)
            self.kill_children()

    @contextlib.contextmanager
    def acquire(self):
        self.output.mkdir(parents=True, exist_ok=True)
        self.campaign_dir.mkdir(parents=True, exist_ok=True)
        with (self.campaign_dir / "runner.lock").open("a+") as campaign_stream:
            fcntl.flock(campaign_stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            with (self.output / "runner.lock").open("a+") as stream:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.lock_stream, self.campaign_lock_stream = stream, campaign_stream
                try:
                    yield
                finally:
                    self.kill_children()
                    self.lock_stream = self.campaign_lock_stream = None

    def kill_children(self):
        for process in list(self.processes):
            if process.poll() is None:
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(process.pid, signal.SIGKILL)
                process.wait()

    def initialize(self):
        phase_binding = self.campaign_dir / "phase-plans" / (self.phase + ".json")
        require(any(t["phase"] == self.phase for t in self.plan["targets"]), "requested phase has no targets")
        if phase_binding.exists():
            bound_hash = read_json(phase_binding).get("planSha256")
            if bound_hash != self.plan_hash:
                require(self.continuation is not None and self.phase == "diagnostic" and bound_hash == self.continuation["priorPlanSha256"],
                        "campaign phase is already bound to a different plan; no repeat")
                continuation_binding = self.campaign_dir / "phase-continuations/diagnostic.json"
                if continuation_binding.exists():
                    require(read_json(continuation_binding).get("planSha256") == self.plan_hash, "diagnostic continuation already bound; sibling retry prohibited")
                else:
                    durable_json(continuation_binding, {"planSha256": self.plan_hash, "outputPath": str(self.output.resolve()),
                                 "predecessorPlanSha256": bound_hash, "receipt": self.plan["continuation"], "at": now()}, exclusive=True)
        else:
            if self.continuation is not None and self.phase == "holdout":
                continued = read_json(self.campaign_dir / "phase-continuations/diagnostic.json")
                previous_output = Path(continued["outputPath"])
                require(not (previous_output / "halt.json").exists(), "diagnostic continuation halted; holdout remains closed")
                previous_summary = read_json(previous_output / "contact-summary.json")
                require(previous_summary["planSha256"] == continued["planSha256"] and all(r["status"] not in ("planned", "claimed") for r in previous_summary["rows"]), "diagnostic continuation must finish before holdout")
            durable_json(phase_binding, {"planSha256": self.plan_hash, "outputPath": str(self.output.resolve()), "at": now()}, exclusive=True)
        frozen = self.output / "frozen-plan.json"
        if frozen.exists():
            require(read_json(frozen).get("planSha256") == self.plan_hash, "resume plan differs from frozen plan")
        else:
            require(not (self.output / "visits").exists(), "cannot adopt existing visits without frozen plan")
            durable_json(frozen, {"planSha256": self.plan_hash, "plan": self.plan}, exclusive=True)
        if (self.output / "halt.json").exists() or (self.campaign_dir / "halt.json").exists() and self.continuation is None:
            self.halt.set()
        for slot in self.plan["slots"]:
            directory = self.output / "visits" / slot["slotId"]
            shared_claim = self.campaign_dir / "claims" / (slot["slotId"] + ".json")
            if (directory / "claim.json").exists():
                require(shared_claim.exists() and read_json(shared_claim) == read_json(directory / "claim.json"), "shared/local durable claim mismatch")
            if shared_claim.exists() and not (directory / "claim.json").exists():
                retained = read_json(shared_claim)
                require(retained.get("planSha256") == self.plan_hash, "campaign slot was claimed by another plan; no retry")
                # Crash between shared reservation and local claim still consumes the slot.
                durable_json(directory / "claim.json", retained, exclusive=True)
            row = self.common(slot)
            if (directory / "outcome.json").exists():
                row = read_json(directory / "outcome.json")
                require(row.get("planSha256") == self.plan_hash and all(row.get(k) == slot[k] for k in slot), "resume outcome binding differs")
                if row.get("status") == "finished":
                    try:
                        verify_result(self.plan, slot, directory, read_json(directory / "result.json"))
                    except Exception as error:
                        row.update(status="invalid_evidence", reason=str(error))
                        self.stop("retained evidence failed verification during resume")
            elif (directory / "claim.json").exists():
                # Claim consumes the budget even if launch/contact state was lost. Never replay it.
                claim = read_json(directory / "claim.json")
                require(claim.get("planSha256") == self.plan_hash, "resume claim has wrong plan")
                row.update(status="interrupted", contacted=True if (directory / "contact-started.json").exists() else None,
                           scanId=claim["scanId"], reason="previously claimed slot interrupted; no retry", noGo=True)
                durable_json(directory / "outcome.json", row, exclusive=True)
            self.rows[slot["slotId"]] = row
        self.summary()

    def execute_visit(self, slot, directory):
        runtime = self.plan["runtime"]
        args = [runtime["nodePath"], self.plan["visitor"]["path"], self.plan["arms"][slot["arm"]]["root"],
                str(directory), slot["url"], slot["action"], slot["arm"], str(directory / "claim.json")]
        with (directory / "visit.log").open("x") as log:
            with self.lock:
                # A concurrent integrity stop must not race a previously claimed launch.
                if self.halt.is_set():
                    return None
                process = subprocess.Popen(args, cwd=self.plan["arms"][slot["arm"]]["root"], stdout=log,
                                           stderr=subprocess.STDOUT, env=clean_env(), start_new_session=True,
                                           pass_fds=(self.lock_stream.fileno(), self.campaign_lock_stream.fileno()))
                self.processes.add(process)
            try:
                process.wait(timeout=50)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
            finally:
                with self.lock:
                    self.processes.discard(process)
        return read_json(directory / "result.json") if (directory / "result.json").exists() else None

    def skip(self, slot, reason):
        row = {**self.common(slot), "status": "skipped", "reason": reason}
        directory = self.output / "visits" / slot["slotId"]
        durable_json(directory / "outcome.json", row, exclusive=True)
        self.rows[slot["slotId"]] = row
        self.summary()

    def run_target(self, target):
        slots = [s for s in self.plan["slots"] if s["targetId"] == target["targetId"]]
        domain_stop = not target["eligible"] or any(self.rows[s["slotId"]].get("noGo") for s in slots)
        for slot in slots:
            if self.rows[slot["slotId"]]["status"] != "planned":
                continue
            with self.lock:
                if self.halt.is_set() or domain_stop:
                    self.skip(slot, "global stop; no replacement" if self.halt.is_set() else target["eligibilityReason"] if not target["eligible"] else "earlier same-domain no-go or interruption; no retry")
                    continue
                try:
                    require(self.plan_path.read_bytes() == self.plan_bytes, "plan source drift")
                    # Serialize preflight/claim; contact work remains at most two independent domains.
                    verify_environment(self.plan)
                    claimed = sum((self.output / "visits" / s["slotId"] / "claim.json").exists() for s in self.plan["slots"])
                    require(claimed < self.plan["maxContacts"], "conservative claimed-slot cap reached")
                    shared_claims = list((self.campaign_dir / "claims").glob("*.json"))
                    require(len(shared_claims) < self.campaign["maxContacts"], "shared campaign contact cap reached")
                    require(not (self.campaign_dir / "claims" / (slot["slotId"] + ".json")).exists(), "campaign slot already claimed; no retry")
                except Exception as error:
                    self.stop(str(error))
                    self.skip(slot, "pre-contact integrity stop: " + str(error))
                    continue
                directory = self.output / "visits" / slot["slotId"]
                import uuid
                claim = {**self.common(slot), "scanId": str(uuid.uuid4()), "claimedAt": now(), "runtime": self.plan["runtime"],
                         "budgets": self.plan["budgets"], "runId": self.plan["runId"], "status": "claimed", "contacted": None}
                durable_json(self.campaign_dir / "claims" / (slot["slotId"] + ".json"), claim, exclusive=True)
                durable_json(directory / "claim.json", claim, exclusive=True)
                self.rows[slot["slotId"]] = claim
                self.summary()
            try:
                result = self.executor(slot, directory)
                if result is None:
                    row = {**self.common(slot), "scanId": claim["scanId"], "status": "interrupted", "noGo": True,
                           "contacted": True if (directory / "contact-started.json").exists() else None,
                           "reason": "claimed visitor exited without terminal result; no retry"}
                else:
                    verify_result(self.plan, slot, directory, result)
                    row = {**result, **self.common(slot), "scanId": claim["scanId"], "status": "finished",
                           "visitorStatus": result["status"], "contacted": bool(result.get("scannerRuntimeStarted")),
                           "noGo": bool(result.get("runtime", {}).get("noGoCandidate")) or result["status"] != "completed",
                           "resultDirectory": str(directory), "packetPath": str(directory / result["packetFile"]) if result.get("packetFile") else None}
                    if result.get("fatalEvidenceError"):
                        self.stop("visitor canonical verification failed: " + result.get("error", "unknown"))
                # Post-run drift invalidates comparison even when a packet looks plausible.
                verify_environment(self.plan, check_expiry=False)
            except Exception as error:
                row = {**self.common(slot), "scanId": claim["scanId"], "status": "invalid_evidence", "noGo": True,
                       "contacted": True if (directory / "contact-started.json").exists() else None, "reason": str(error)}
                self.stop("source or evidence integrity failed: " + str(error))
            with self.lock:
                row["contactLedgerReceipt"] = {"kind": "local_durable_claim", "path": str(directory / "claim.json"), "sha256": file_sha(directory / "claim.json")}
                durable_json(directory / "outcome.json", row, exclusive=True)
                self.rows[slot["slotId"]] = row
                domain_stop = domain_stop or row.get("noGo", False)
                self.summary()
                print(json.dumps({key: row.get(key) for key in ("slotId", "status", "contacted", "actionOutcome", "noGo", "reason")}), flush=True)

    def run(self):
        with self.acquire():
            self.initialize()
            selected = [t for t in self.plan["targets"] if t["phase"] == self.phase]
            with concurrent.futures.ThreadPoolExecutor(max_workers=self.plan["concurrency"]) as pool:
                list(pool.map(self.run_target, selected))
            self.summary()
            return not self.halt.is_set()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fingerprint-root", type=Path)
    parser.add_argument("--plan", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--phase", choices=("diagnostic", "holdout"))
    parser.add_argument("--execute", action="store_true", help="perform only already-authorized slots; default is offline preflight")
    args = parser.parse_args()
    if args.fingerprint_root:
        print(json.dumps(inventory(args.fingerprint_root), indent=2, sort_keys=True))
        return
    require(args.plan is not None, "--plan is required")
    plan = read_json(args.plan)
    verify_environment(plan)
    # Load the compiled observer and canonical contracts in each arm without launching a browser.
    for arm in ("reference", "candidate"):
        subprocess.run([plan["runtime"]["nodePath"], plan["visitor"]["path"], "--preflight", plan["arms"][arm]["root"],
                        plan["runtime"]["browserExecutablePath"]], check=True, env=clean_env())
    if not args.execute:
        print(json.dumps({"offlinePreflight": "passed", "planSha256": file_sha(args.plan), "publicContacts": 0}))
        return
    require(args.output is not None and args.phase is not None, "execution requires explicit --output and --phase")
    runner = Runner(args.plan, args.output, args.phase)
    def interrupt(_signal, _frame):
        runner.stop("operator/process interruption; claimed slots will not be retried")
        runner.kill_children()
    signal.signal(signal.SIGTERM, interrupt)
    signal.signal(signal.SIGINT, interrupt)
    require(runner.run(), "comparison stopped; inspect halt.json and preserved rows")


if __name__ == "__main__":
    main()
