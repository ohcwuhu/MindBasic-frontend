"""Read an `impeccable detect --json` dump and print one line per finding.

usage: python tools/detect-summary.py <json file>
"""
from __future__ import annotations

import json
import re
import sys

raw = open(sys.argv[1], encoding="utf-8").read()
start = raw.find("[")
findings = []
if start >= 0:
    try:
        findings = json.loads(raw[start:])
    except json.JSONDecodeError:
        pass
if not findings:
    for m in re.finditer(
        r'"antipattern":\s*"(?P<a>[^"]+)".*?"severity":\s*"(?P<s>[^"]+)".*?"snippet":\s*"(?P<n>[^"]*)"',
        raw,
        re.S,
    ):
        findings.append({"antipattern": m.group("a"), "severity": m.group("s"), "snippet": m.group("n")})

print(f"findings: {len(findings)}")
for f in findings:
    print(f" - {f.get('antipattern')} | {f.get('severity')} | {f.get('snippet')}")
