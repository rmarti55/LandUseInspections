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

    if (
        "trade permit" in tl
        or "gastrade" in tl
        or re.search(r"\badditional\b.*\b(plumbing|mechanical)\b", tl)
    ):
        return (_infer_sector_from_text(tl), "trade")

    if "certificate of compliance" in tl or wl == "certificate of compliance":
        return (_infer_sector_from_text(tl), "compliance")

    if "grading and drainage" in tl:
        return (_infer_sector_from_text(tl), "site_civil")

    if "landscape and utilities" in tl:
        return (_infer_sector_from_text(tl), "site_civil")

    if "solar" in tl and "electric" in tl:
        return (_infer_sector_from_text(tl), "other")

    if "re-roof" in tl or "reroof" in tl:
        return (_infer_sector_from_text(tl), "other")

    construction_markers = (
        "new commercial building",
        "new multi-family",
        "new multi family",
        "dwelling unit",
        "additions",
        "alteration",
        "remodel",
        "building (residential)",
        "garage or carport",
        "garage and carport",
        "single family detached",
        "other remodel",
    )
    if any(p in tl for p in construction_markers) or (
        tl.startswith("new ") and "building" in tl
    ):
        return (_infer_sector_from_text(tl), "construction")

    return (_infer_sector_from_text(tl), "unknown")
