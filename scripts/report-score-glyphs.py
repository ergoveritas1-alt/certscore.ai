"""Build the tiny score-diagram outline subset using the existing PDF runtime.

No runtime font lookup, new dependency, network request or font install.
"""
import hashlib
import json
import struct
import sys
from pathlib import Path
from reportlab.pdfbase.ttfonts import TTFont

source = Path("scripts/report-pdf-v2/fonts/Manrope-700.ttf")
face = TTFont("ScoreOutline", str(source)).face
data = face.get_table("glyf")

def outline(character):
    glyph = face.charToGlyph[ord(character)]
    start, end = face.glyphPos[glyph:glyph + 2]
    if start == end:
        return ""
    count = struct.unpack_from(">h", data, start)[0]
    assert count >= 0, "The reviewed score subset must contain only simple glyphs"
    ends = list(struct.unpack_from(">" + "H" * count, data, start + 10))
    position = start + 10 + count * 2
    instructions = struct.unpack_from(">H", data, position)[0]
    position += 2 + instructions
    flags = []
    while len(flags) <= ends[-1]:
        flag = data[position]; position += 1
        repeat = data[position] if flag & 8 else 0
        position += bool(flag & 8)
        flags.extend([flag] * (repeat + 1))
    coordinates = []
    for short_bit, same_bit in [(2, 16), (4, 32)]:
        values, total = [], 0
        for flag in flags:
            if flag & short_bit:
                delta = data[position] * (1 if flag & same_bit else -1); position += 1
            elif flag & same_bit:
                delta = 0
            else:
                delta = struct.unpack_from(">h", data, position)[0]; position += 2
            total += delta; values.append(total)
        coordinates.append(values)
    points = [(x, y, bool(flag & 1)) for x, y, flag in zip(*coordinates, flags)]
    commands, first = [], 0
    def pair(point): return f"{point[0]:g} {point[1]:g}"
    def middle(a, b): return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, True)
    for last in ends:
        contour = points[first:last + 1]; first = last + 1
        if contour[0][2]:
            origin = contour.pop(0)
        elif contour[-1][2]:
            origin = contour.pop()
        else:
            origin = middle(contour[-1], contour[0])
        commands.append("M" + pair(origin)); contour.append(origin)
        index = 0
        while index < len(contour):
            point = contour[index]
            if point[2]:
                commands.append("L" + pair(point)); index += 1
            else:
                following = contour[index + 1]
                target = following if following[2] else middle(point, following)
                commands.append("Q" + pair(point) + " " + pair(target))
                index += 2 if following[2] else 1
        commands.append("Z")
    return " ".join(commands)

root = Path("apps/web/server/scans/assets")
root.mkdir(exist_ok=True)
result = {"source": "Manrope Bold, SIL Open Font License 1.1", "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
          "unitsPerEm": face.unitsPerEm, "glyphs": {character: {"advance": face.charWidths[ord(character)] * face.unitsPerEm / 1000, "path": outline(character)} for character in "0123456789.N/Aof eE-+"}}
outputs = {root / "report-score-glyphs.json": json.dumps(result, separators=(",", ":")) + "\n",
           root / "Manrope-score-OFL.txt": Path("scripts/report-pdf-v2/fonts/Manrope-OFL.txt").read_text()}
for path, content in outputs.items():
    if "--check" in sys.argv:
        assert path.read_text() == content, f"Score outline asset drift: {path}"
    else:
        path.write_text(content)
