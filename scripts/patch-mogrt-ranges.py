#!/usr/bin/env python3
"""Raise slider limits inside VizzFX .mogrt templates.

After Effects exports slider controls with a 0-100 range, and Premiere clamps
values to it (e.g. Lines 300 -> 100, Frame Width 1920 -> 100). Run this on every
newly exported template:  python3 scripts/patch-mogrt-ranges.py plugin/mogrt/*.mogrt
"""
import json
import sys
import zipfile

# Control name -> (min, max). Anything not listed keeps 0-100.
RANGES = {
    "Frame Width": (1, 8192), "Frame Height": (1, 8192),
    "Lines": (1, 2000), "Rows": (1, 2000), "Roll Speed": (-1000, 1000),
    "Ring Size": (10, 400), "Ring Width": (0, 1000), "Ring Blur": (0, 500),
    "Bokeh Size": (0, 500), "Bokeh Count": (0, 12), "Seed": (0, 10000),
    "Type Speed": (0, 500),
}

def patch(path):
    with zipfile.ZipFile(path) as z:
        entries = [(i, z.read(i.filename)) for i in z.infolist()]
    changed = []
    out = []
    for info, data in entries:
        if info.filename == "definition.json":
            d = json.loads(data)
            for c in d.get("clientControls", []):
                name = c["uiName"]["strDB"][0]["str"]
                if name in RANGES and "max" in c:
                    lo, hi = RANGES[name]
                    if (c.get("min"), c.get("max")) != (lo, hi):
                        c["min"], c["max"] = lo, hi
                        changed.append(f"{name} {lo}..{hi}")
            data = json.dumps(d, separators=(",", ":")).encode()
        out.append((info, data))
    if changed:
        with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
            for info, data in out:
                z.writestr(info, data)
    print(f"{path}: {', '.join(changed) if changed else 'already patched'}")

for p in sys.argv[1:]:
    patch(p)
