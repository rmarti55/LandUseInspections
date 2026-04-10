"""
Derive sector (commercial/residential/multi_family) and permit_kind from EnerGov
permit_type and work_class. Add unknown permit_type strings to EXACT_OVERRIDES
after running: python analysis.py --query types
"""

from __future__ import annotations

import re
from typing import Literal

Sector = Literal["commercial", "residential", "multi_family", "unknown"]
PermitKind = Literal["construction", "trade", "site_civil", "compliance", "other", "unknown"]

# Exact PermitType -> (sector, permit_kind)
EXACT_OVERRIDES: dict[str, tuple[Sector, PermitKind]] = {
    "Building (Residential) Additions - Addition": ("residential", "construction"),
    "Certificate of Compliance": ("unknown", "compliance"),
    "Residential Electrical Trade Permit": ("residential", "trade"),
    "Residential Express- Re-roof": ("residential", "other"),
    "Residential Plumbing/GasTrade Permit": ("residential", "trade"),
    "New Single Family Detached Dwelling Unit": ("residential", "construction"),
    "Residential Solar- Electric": ("residential", "other"),
    "Additional Residential Mechanical Trade Permits": ("residential", "trade"),
    "Alterations with Exterior Changes to Single Family Detached Dwelling": (
        "residential",
        "construction",
    ),
    "Commercial Electrical Trade Permit": ("commercial", "trade"),
    "Commercial Plumbing/GasTrade Permit": ("commercial", "trade"),
    "New Commercial Building": ("commercial", "construction"),
    "New Multi-Family Building": ("multi_family", "construction"),
    "Other Remodel with Exterior Changes to Commercial Building": ("commercial", "construction"),
    "Additional Commercial Plumbing Trade Permits": ("commercial", "trade"),
    "Additional Residential Plumbing Trade Permits": ("residential", "trade"),
    "Alterations with Exterior Changes to Garage or Carport": ("residential", "construction"),
    "Grading and Drainage": ("unknown", "site_civil"),
    "Landscape and Utilities": ("unknown", "site_civil"),
    "Residential Mechanical Trade Permit": ("residential", "trade"),
}


def _infer_sector_from_text(tl: str) -> Sector:
    if "multi-family" in tl or "multi family" in tl:
        return "multi_family"
    if "commercial" in tl:
        return "commercial"
    if "residential" in tl or "single family" in tl or "single-family" in tl:
        return "residential"
    return "unknown"


def _infer_kind_heuristic(tl: str, wl: str) -> PermitKind:
    if "trade permit" in tl or "gastrade" in tl:
        return "trade"
    if re.search(r"\badditional\b.*\b(plumbing|mechanical)\b", tl):
        return "trade"
    if "certificate of compliance" in tl or wl == "certificate of compliance":
        return "compliance"
    if "grading and drainage" in tl:
        return "site_civil"
    if "landscape and utilities" in tl:
        return "site_civil"
    if "solar" in tl and "electric" in tl:
        return "other"
    if "re-roof" in tl or "reroof" in tl:
        return "other"
    if any(
        x in tl
        for x in (
            "new commercial building",
            "new multi-family",
            "new multi family",
            "dwelling unit",
            "additions",
            "addition",
            "alterations",
            "remodel",
            "building (residential)",
            "garage or carport",
            "garage and carport",
        )
    ):
        return "construction"
    if tl.startswith("new ") and "building" in tl:
        return "construction"
    # work_class hints when type is vague
    trade_classes = ("electrical", "plumbing", "plumbing/gas", "mechanical", "gas")
    if wl in trade_classes or any(c in wl for c in ("electrical", "plumbing", "mechanical")):
        if "trade" in tl or "permit" in tl:
            return "trade"
    return "unknown"


def classify_permit(
    permit_type: str | None,
    work_class: str | None,
) -> tuple[Sector, PermitKind]:
    t = (permit_type or "").strip()
    w = (work_class or "").strip()
    if not t and not w:
        return ("unknown", "unknown")

    if t in EXACT_OVERRIDES:
        return EXACT_OVERRIDES[t]

    tl = t.lower()
    wl = w.lower()

    kind = _infer_kind_heuristic(tl, wl)

    if kind == "trade":
        sec = _infer_sector_from_text(tl)
        return (sec, "trade")

    if kind in ("compliance", "site_civil", "other"):
        sec = _infer_sector_from_text(tl)
        if sec == "unknown" and kind == "other" and ("residential" in tl or "commercial" in tl):
            sec = _infer_sector_from_text(tl)
        return (sec if sec != "unknown" else _infer_sector_from_text(tl), kind)

    if kind == "construction":
        sec = _infer_sector_from_text(tl)
        return (sec, "construction")

    # Remaining: try sector from text, then kind from work_class
    sec = _infer_sector_from_text(tl)
    if kind == "unknown":
        kind = _infer_kind_heuristic(tl, wl)
    if kind == "unknown" and wl:
        if any(x in wl for x in ("electrical", "plumbing", "mechanical", "gas")):
            kind = "trade"
    return (sec, kind)
