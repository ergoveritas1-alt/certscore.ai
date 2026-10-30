"""Extract optional presentation assets from an owner-supplied saved PDF.

These images supply visual context, never new canonical findings or receipt proof.
"""
import argparse
import hashlib
import json
from pathlib import Path
from pypdf import PdfReader

def main():
    p=argparse.ArgumentParser();p.add_argument("--source",required=True);p.add_argument("--scan-id",required=True);p.add_argument("--out",required=True);a=p.parse_args()
    source=Path(a.source);out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
    pdf=PdfReader(source)
    if a.scan_id not in "\n".join(page.extract_text() or "" for page in pdf.pages):
        raise ValueError("The saved PDF does not identify this scan")
    result={"sourcePdfSha256":hashlib.sha256(source.read_bytes()).hexdigest(),"scanId":a.scan_id,"role":"saved_report_presentation_context"}
    first=(pdf.pages[0].extract_text() or "").splitlines()
    if first:result["brandName"]=first[0].strip()
    for image in pdf.pages[0].images:
        role="logo" if image.name.lower().startswith("logo") else "capture" if image.name.lower().startswith("im1") else None
        if not role:continue
        path=out/f"{role}.png";image.image.convert("RGB").save(path)
        result[role]=str(path.resolve());result[f"{role}Sha256"]=hashlib.sha256(path.read_bytes()).hexdigest()
    (out/"assets.json").write_text(json.dumps(result,indent=2)+"\n")

if __name__=="__main__":main()
