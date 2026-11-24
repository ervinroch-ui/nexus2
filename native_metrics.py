"""Python bridge to the optional C++ KPI core. A pure-Python fallback is always available."""
from __future__ import annotations
import json
import os
import shutil
import subprocess
from pathlib import Path

BASE = Path(__file__).resolve().parent
SOURCE = BASE / "engine" / "metrics_core.cpp"
BINARY = BASE / "engine" / ("metrics_core.exe" if os.name == "nt" else "metrics_core")


def _try_compile():
    compiler = shutil.which("g++") or shutil.which("clang++")
    if not compiler or not SOURCE.exists():
        return False
    try:
        subprocess.run([compiler, "-std=c++17", "-O2", str(SOURCE), "-o", str(BINARY)], check=True, capture_output=True, timeout=25)
        return True
    except Exception:
        return False


def calculate_daily(cct=0, ccd=0, indv=0, ifi=0, dth=0, challenge=0):
    values = {"cct": float(cct), "ccd": float(ccd), "indv": float(indv), "ifi": float(ifi), "dth": float(dth), "challenge": float(challenge)}
    if not BINARY.exists():
        _try_compile()
    if BINARY.exists():
        try:
            completed = subprocess.run([str(BINARY)], input=json.dumps(values), text=True, capture_output=True, check=True, timeout=3)
            payload = json.loads(completed.stdout)
            payload["engine"] = "C++"
            return payload
        except Exception:
            pass
    weighted = values["cct"] * 3 + values["ccd"] * 2 + values["indv"] + values["ifi"] + values["dth"]
    deficit = weighted - values["challenge"]
    completion = weighted / values["challenge"] if values["challenge"] else None
    return {"weightedProducts": weighted, "deficit": deficit, "completion": completion, "engine": "Python"}
