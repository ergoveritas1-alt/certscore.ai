"""Offline PDF layout checks and renderer edge cases. No site or API requests.

Usage: python validate.py --pdf preview.pdf --model preview-source/model.json
       --out artifacts/pdf-v2-qa [--edges]
"""
import argparse
import copy
import hashlib
import json
import re
from pathlib import Path

import pdfplumber
from pypdf import PdfReader
from render import render


def check(path):
    reader = PdfReader(path)
    model_path=Path(str(path)+".model.json")
    model=json.loads(model_path.read_text()) if model_path.exists() else None
    layout = json.loads(Path(str(path) + ".layout.json").read_text())
    assert len(reader.pages) == layout["pages"]
    assert layout["passes"][-1]["targets"] == layout["passes"][-2]["targets"]
    assert layout["passes"][-1]["pages"] == layout["passes"][-2]["pages"]
    fonts = set()
    links = 0
    minimum = float("inf")
    texts = []
    with pdfplumber.open(path) as pdf:
        # The summary's independent card rows must remain aligned as content
        # changes. Background rectangles capture the full card geometry.
        first=pdf.pages[0]
        kpis=[r for r in first.rects if abs(r["width"]-(first.width-96)/4)<.1]
        assert len(kpis)==4, (path.name,"missing KPI cards")
        assert max(r["top"] for r in kpis)-min(r["top"] for r in kpis)<.1
        assert max(r["height"] for r in kpis)-min(r["height"] for r in kpis)<.1
        topics=[r for r in first.rects if abs(r["width"]-(first.width-80)/2)<.1]
        topic_count=len(model["topics"]) if model else 7
        assert len(topics)==topic_count//2*2, (path.name,"missing topic cards")
        if topic_count%2:
            assert len([r for r in first.rects if abs(r["width"]-(first.width-72))<.1])==1, (path.name,"missing full-width final topic")
        for left,right in zip(topics[::2],topics[1::2]):
            assert abs(left["top"]-right["top"])<.1 and abs(left["height"]-right["height"])<.1
        for n, page in enumerate(pdf.pages, 1):
            texts.append(page.extract_text() or "")
            for char in page.chars:
                minimum = min(minimum, char["size"])
                assert char["size"] >= 8.99, (path.name, n, "undersized", char)
                assert char["x0"] >= 24 and char["x1"] <= page.width - 24, (path.name, n, "horizontal overflow", char)
                assert char["top"] >= 10 and char["bottom"] <= page.height - 10, (path.name, n, "vertical overflow", char)
            for curve in page.curves:
                assert curve["x0"] >= 24 and curve["x1"] <= page.width - 24, (path.name, n, "card overflow")
                assert curve["top"] >= 10 and curve["bottom"] <= page.height - 10, (path.name, n, "card overflow")
            assert f"{n} / {len(pdf.pages)}" in texts[-1], (path.name, n, "footer")
    all_text = "\n".join(texts)
    if model:
        if any(t["status"]=="Manual review" for t in model["topics"]):assert "Manual check" in all_text
        if any(t["status"]=="Needs review" for t in model["topics"]):assert "Review" in all_text
    forbidden = r"site_integrity:|canonical_cookie_registry|unknown_or_partial|not_detected|tag_management|consent_management|session_replay|&lt;|&amp;|Not Not|p\.\s*—|score effect|deduction|\[PLACEHOLDER|Global Privacy Control|\bGPC\b|California privacy.choice|sale / sharing|Needs review|Manual review|Review findings"
    assert not re.search(forbidden, all_text, re.I), (path.name, "unrendered or prohibited copy", re.findall(forbidden, all_text, re.I))
    for page in reader.pages:
        for font_ref in page["/Resources"].get("/Font", {}).values():
            font = font_ref.get_object()
            fonts.add(str(font["/BaseFont"]))
            descriptor = font.get("/FontDescriptor")
            assert descriptor and "/FontFile2" in descriptor.get_object(), (path.name, "unembedded font", font)
        for ref in page.get("/Annots", []):
            annotation = ref.get_object()
            if "/Dest" in annotation:
                target = annotation["/Dest"][0]
                assert any(target == p.indirect_reference for p in reader.pages), (path.name, "invalid link destination")
                links += 1
    # Every executive topic link must point to the actual target page recorded
    # by ReportLab's afterFlowable hook, not just a fabricated page-number string.
    if model:
        destinations = [a.get_object()["/Dest"][0] for a in reader.pages[0].get("/Annots", []) if "/Dest" in a.get_object()]
        for topic in model["topics"]:
            expected = reader.pages[layout["targets"][topic["target"]] - 1].indirect_reference
            assert expected in destinations, (path.name, "wrong topic link", topic["target"])
    return {"file": str(path), "pages": len(reader.pages), "minimumFontPt": minimum,
            "embeddedFonts": sorted(fonts), "internalLinks": links,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "text": all_text}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--edges", action="store_true")
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    model = json.loads(Path(args.model).read_text())
    results = []
    primary = Path(args.pdf)
    # Sidecar model stays an internal QA artifact.
    def verify(path, m):
        sidecar = Path(str(path) + ".model.json")
        sidecar.write_text(json.dumps(m))
        result = check(path)
        sidecar.unlink()
        (out / (path.stem + ".txt")).write_text(result.pop("text"))
        results.append(result)
        return (out / (path.stem + ".txt")).read_text()
    verify(primary, model)
    if args.edges:
        cases = [("a4-no-logo", copy.deepcopy(model), "a4"),
                 ("letter-no-logo", copy.deepcopy(model), "letter")]
        empty = copy.deepcopy(model)
        empty.update(findings=[], issues=[], retest=None)
        cases.append(("zero-findings", empty, "letter"))
        missing = copy.deepcopy(model)
        missing.update(findings=[], issues=[], retest=None)
        missing["sections"] = [s for s in missing["sections"] if s["id"] != "choice-reject"]
        missing["metrics"][2]["value"] = "Unknown"
        cases.append(("no-reject-result", missing, "letter"))
        long = copy.deepcopy(model)
        long["sections"].append({"id": "stress", "title": "Long evidence table", "shortTitle": "Long evidence table", "status": "Observed", "summary": "Synthetic owned layout fixture.", "coverage": "Repeated headers and complete row pagination.", "blocks": [{"kind": "table", "title": "Pagination fixture", "headers": ["Pagination test row", "Narrative"], "rows": [[f"ROW-{i:04}", "Evidence paragraph wraps normally. " * 5] for i in range(240)], "widths": [.25, .75]}]})
        cases.append(("long-table", long, "letter"))
        long_issue = copy.deepcopy(model)
        if long_issue["issues"]:
            long_issue["issues"][0]["blocks"].insert(0, {"kind": "table", "title": "Long issue fixture", "headers": ["Issue test row", "Recorded evidence"], "rows": [[f"ISSUE-ROW-{i:04}", "Synthetic owned fixture evidence."] for i in range(100)], "widths": [.30,.70]})
            cases.append(("long-issue-card", long_issue, "letter"))
        for name, m, paper in cases:
            path = out / f"{name}.pdf"
            render(m, path, paper)
            text = verify(path, m)
            if name == "zero-findings":
                assert "No priority issues were identified" in text
                assert "How to re-test" not in text
            if name == "no-reject-result":
                assert "A.5 · Choice sessions and Reject" not in text
            if name == "long-table":
                assert "ROW-0239" in text
                assert text.count("Pagination test row") > 5
                assert "(continued)" in text
            if name == "long-issue-card":
                assert "ISSUE-ROW-0099" in text
                assert text.count("Issue test row") > 1
    (out / "validation.json").write_text(json.dumps({"results": results, "networkRequests": 0}, indent=2) + "\n")
    print(json.dumps({"passed": len(results), "reports": [{"file": Path(r["file"]).name, "pages": r["pages"]} for r in results]}))


if __name__ == "__main__":
    main()
