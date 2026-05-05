"""
Export SQLite data to JSON files for the Next.js dashboard.

Reads from santa_fe_land_use.db and writes JSON files into
dashboard/public/data/ so the static site can fetch them at runtime.

Neon (approach A): the scraper and this export stay on SQLite. Push a copy of the
SQLite data to Postgres with sync_sqlite_to_neon.py when you want Neon updated
for backup or ad hoc SQL; the dashboard still loads only these JSON files.

Usage:
    python export_data.py
"""

import json
import os
import re
import sqlite3
from collections import Counter, defaultdict
from datetime import date as dt_date

from config import DB_PATH
from models import get_connection
from permit_taxonomy import classify_permit

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")


def export_summary(conn: sqlite3.Connection) -> dict:
    inspections = conn.execute("SELECT COUNT(*) FROM inspections").fetchone()[0]
    permits = conn.execute("SELECT COUNT(*) FROM permits").fetchone()[0]
    total_val = conn.execute("SELECT COALESCE(SUM(valuation),0) FROM permits").fetchone()[0]
    total_fees = conn.execute("SELECT COALESCE(SUM(amount),0) FROM fees").fetchone()[0]
    geocoded = conn.execute("SELECT COUNT(*) FROM permits WHERE latitude IS NOT NULL").fetchone()[0]

    passed = conn.execute("SELECT COUNT(*) FROM inspections WHERE status='Passed'").fetchone()[0]
    failed = conn.execute("SELECT COUNT(*) FROM inspections WHERE status='Re-inspection required'").fetchone()[0]
    pass_rate = round(passed / (passed + failed) * 100, 1) if (passed + failed) else 0

    return {
        "inspections": inspections,
        "permits": permits,
        "totalValuation": total_val,
        "totalFees": total_fees,
        "geocoded": geocoded,
        "passRate": pass_rate,
    }


def export_permits(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("""
        SELECT permit_id, permit_number, permit_type, work_class, status,
               description, apply_date, issue_date, expire_date,
               finalize_date, complete_date, address, parcel_number,
               project_name, valuation, square_feet, latitude, longitude
        FROM permits
        ORDER BY apply_date DESC
    """).fetchall()
    out: list[dict] = []
    for r in rows:
        d = dict(r)
        sector, permit_kind = classify_permit(d.get("permit_type"), d.get("work_class"))
        d["sector"] = sector
        d["permit_kind"] = permit_kind
        out.append(d)
    return out


def export_permits_timeline(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("""
        SELECT substr(apply_date, 1, 7) AS month,
               COUNT(*) AS count,
               COALESCE(SUM(valuation), 0) AS total_valuation
        FROM permits
        WHERE apply_date IS NOT NULL
        GROUP BY month
        ORDER BY month
    """).fetchall()
    return [dict(r) for r in rows]


def export_builders(conn: sqlite3.Connection) -> list[dict]:
    """Contractors and owner-builders only; names merged by case-insensitive key."""
    rows = conn.execute("""
        SELECT
            MIN(x.raw_name) AS name,
            MIN(x.contact_type) AS role,
            COUNT(DISTINCT x.case_id) AS permit_count,
            COALESCE(SUM(x.valuation), 0) AS total_valuation
        FROM (
            SELECT
                c.case_id,
                c.contact_type,
                COALESCE(
                    NULLIF(TRIM(c.company), ''),
                    NULLIF(TRIM(c.first_name || ' ' || c.last_name), ''),
                    'Unknown'
                ) AS raw_name,
                UPPER(TRIM(COALESCE(
                    NULLIF(TRIM(c.company), ''),
                    NULLIF(TRIM(c.first_name || ' ' || c.last_name), ''),
                    'Unknown'
                ))) AS name_key,
                p.valuation
            FROM contacts c
            LEFT JOIN permits p ON c.case_id = p.permit_id
            WHERE c.case_module = 'Permit'
              AND c.contact_type IN ('Contractor', 'Property Owner/Builder')
              AND COALESCE(NULLIF(TRIM(c.company), ''),
                           NULLIF(TRIM(c.first_name || ' ' || c.last_name), '')) IS NOT NULL
        ) x
        GROUP BY x.name_key
        ORDER BY permit_count DESC
        LIMIT 50
    """).fetchall()
    return [dict(r) for r in rows]


def export_permit_contacts(conn: sqlite3.Connection) -> dict[str, list[dict]]:
    """Map permit_id -> list of contact rows for dashboard permits table."""
    rows = conn.execute("""
        SELECT case_id, first_name, last_name, company, contact_type
        FROM contacts
        WHERE case_module = 'Permit' AND case_id IS NOT NULL
        ORDER BY case_id, contact_id
    """).fetchall()
    by_permit: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        cid = r["case_id"]
        if not cid:
            continue
        by_permit[str(cid)].append({
            "first_name": r["first_name"] or "",
            "last_name": r["last_name"] or "",
            "company": r["company"] or "",
            "contact_type": r["contact_type"] or "",
        })
    return dict(by_permit)


def export_inspection_status(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("""
        SELECT status, COUNT(*) AS count
        FROM inspections
        WHERE status IS NOT NULL
        GROUP BY status
        ORDER BY count DESC
    """).fetchall()
    return [dict(r) for r in rows]


def export_inspection_timeline(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("""
        SELECT substr(scheduled_date, 1, 7) AS month,
               COUNT(*) AS count
        FROM inspections
        WHERE scheduled_date IS NOT NULL
        GROUP BY month
        ORDER BY month
    """).fetchall()
    return [dict(r) for r in rows]


def export_fees_summary(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("""
        SELECT f.fee_name,
               COUNT(*) AS count,
               COALESCE(SUM(f.amount), 0) AS total,
               COALESCE(AVG(f.amount), 0) AS average
        FROM fees f
        WHERE f.fee_name IS NOT NULL
        GROUP BY f.fee_name
        ORDER BY total DESC
        LIMIT 30
    """).fetchall()
    return [dict(r) for r in rows]


def export_permit_types(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute("""
        SELECT permit_type,
               COUNT(*) AS count,
               COALESCE(AVG(valuation), 0) AS avg_valuation,
               COALESCE(SUM(valuation), 0) AS total_valuation,
               COALESCE(AVG(
                   CASE WHEN issue_date IS NOT NULL AND apply_date IS NOT NULL
                        AND julianday(issue_date) >= julianday(apply_date)
                   THEN julianday(issue_date) - julianday(apply_date)
                   END
               ), 0) AS avg_days_to_issue
        FROM permits
        WHERE permit_type IS NOT NULL
        GROUP BY permit_type
        ORDER BY count DESC
    """).fetchall()
    out: list[dict] = []
    for r in rows:
        d = dict(r)
        pt = d.get("permit_type")
        sec, pk = classify_permit(pt, None)
        d["sector"] = sec
        d["permit_kind"] = pk
        out.append(d)
    return out


CONSTRUCTION_SUFFIXES = {
    "EXPR", "BLDR", "BLDC", "ADDR", "EXTR", "EXPC",
    "WALR", "INTR", "WALC", "MFHM", "FDDS",
}


def _get_suffix(permit_number: str | None) -> str | None:
    """Extract the suffix from a permit number like '2026-48399-EXPR' -> 'EXPR'."""
    if not permit_number:
        return None
    parts = permit_number.split("-")
    return parts[-1] if len(parts) >= 3 else None


def _normalize_address(addr: str | None) -> str:
    """Normalize address for grouping: uppercase, collapse whitespace, strip city/unit."""
    if not addr:
        return "NO_ADDRESS"
    a = re.sub(r"\s+", " ", addr).strip().upper()
    a = a.split(" SANTA FE")[0].strip()
    a = re.sub(r"\s*UNIT/SUITE:.*$", "", a).strip()
    return a


def export_projects(conn: sqlite3.Connection) -> list[dict]:
    """Aggregate permits into per-address project records with historic flags and duration."""

    # Build lookup: permit_id -> list of historic inspections
    hist_rows = conn.execute("""
        SELECT json_extract(raw_json, '$.EntityID') AS entity_id,
               inspection_type, status, scheduled_date
        FROM inspections
        WHERE inspection_type LIKE '%Historic%'
          AND json_extract(raw_json, '$.EntityID') IS NOT NULL
    """).fetchall()

    hist_by_entity: dict[str, list[dict]] = defaultdict(list)
    for r in hist_rows:
        hist_by_entity[r["entity_id"]].append({
            "type": r["inspection_type"],
            "status": r["status"],
            "date": r["scheduled_date"],
        })

    # Build lookup: permit_id -> latest Building Final Passed date
    bldg_final_rows = conn.execute("""
        SELECT json_extract(raw_json, '$.EntityID') AS entity_id,
               MAX(scheduled_date) AS final_date
        FROM inspections
        WHERE inspection_type = 'Building Final' AND status = 'Passed'
          AND json_extract(raw_json, '$.EntityID') IS NOT NULL
        GROUP BY entity_id
    """).fetchall()
    bldg_final_by_entity = {r["entity_id"]: r["final_date"] for r in bldg_final_rows}

    # Get all permits with district from raw_json
    permits = conn.execute("""
        SELECT permit_id, permit_number, permit_type, status, address,
               issue_date, valuation, latitude, longitude,
               json_extract(raw_json, '$.DistrictName') AS district_name
        FROM permits
    """).fetchall()

    # Group ALL permits by normalized address (for historic flag lookup)
    all_by_addr: dict[str, list[dict]] = defaultdict(list)
    for p in permits:
        addr = _normalize_address(p["address"])
        all_by_addr[addr].append(dict(p))

    # Group only CONSTRUCTION permits by normalized address (for project records)
    by_addr: dict[str, list[dict]] = defaultdict(list)
    for p in permits:
        if _get_suffix(p["permit_number"]) in CONSTRUCTION_SUFFIXES:
            addr = _normalize_address(p["address"])
            by_addr[addr].append(dict(p))

    projects: list[dict] = []
    for norm_addr, plist in by_addr.items():
        permit_ids = [p["permit_id"] for p in plist]
        permit_types = sorted(set(p["permit_type"] for p in plist if p["permit_type"]))
        permit_suffixes = sorted(set(
            s for p in plist
            if (s := _get_suffix(p["permit_number"]))
        ))

        # Determine historic status using ALL permits at this address (not just construction)
        all_pids = [p["permit_id"] for p in all_by_addr.get(norm_addr, [])]
        is_historic = any(pid in hist_by_entity for pid in all_pids)

        # Compute first issue date
        issue_dates = [p["issue_date"] for p in plist if p["issue_date"]]
        first_issue_date = min(issue_dates)[:10] if issue_dates else None

        # Compute final inspection date based on type (check ALL permits at address)
        final_inspection_date = None
        if is_historic:
            for pid in all_pids:
                for insp in hist_by_entity.get(pid, []):
                    if insp["type"] == "Historic Final" and insp["status"] == "Passed":
                        d = (insp["date"] or "")[:10]
                        if d and (final_inspection_date is None or d > final_inspection_date):
                            final_inspection_date = d
        else:
            for pid in all_pids:
                d = (bldg_final_by_entity.get(pid) or "")[:10]
                if d and (final_inspection_date is None or d > final_inspection_date):
                    final_inspection_date = d

        is_open = final_inspection_date is None
        duration_days = None
        if first_issue_date and final_inspection_date:
            try:
                d1 = dt_date.fromisoformat(first_issue_date)
                d2 = dt_date.fromisoformat(final_inspection_date)
                duration_days = (d2 - d1).days
                if duration_days < 0:
                    duration_days = None
            except ValueError:
                pass

        total_valuation = sum(p["valuation"] or 0 for p in plist)
        lat = next((p["latitude"] for p in plist if p["latitude"]), None)
        lng = next((p["longitude"] for p in plist if p["longitude"]), None)
        district = next((p["district_name"] for p in plist if p["district_name"]), None)

        projects.append({
            "normalized_address": norm_addr,
            "is_historic": is_historic,
            "permit_count": len(plist),
            "permit_types": permit_types,
            "total_valuation": total_valuation,
            "first_issue_date": first_issue_date,
            "final_inspection_date": final_inspection_date,
            "is_open": is_open,
            "duration_days": duration_days,
            "district_name": district,
            "latitude": lat,
            "longitude": lng,
            "permit_ids": permit_ids,
            "permit_suffixes": permit_suffixes,
        })

    projects.sort(key=lambda p: p["normalized_address"])
    return projects


def write_json(name: str, data):
    path = os.path.join(OUT_DIR, f"{name}.json")
    with open(path, "w") as f:
        json.dump(data, f, separators=(",", ":"))
    count = len(data) if isinstance(data, list) else "obj"
    print(f"  {name}.json ({count})")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    conn = get_connection()
    print("Exporting data to", OUT_DIR)

    write_json("summary", export_summary(conn))
    permits_data = export_permits(conn)
    write_json("permits", permits_data)
    write_json(
        "permit_categories",
        {
            "by_sector": dict(Counter(p["sector"] for p in permits_data)),
            "by_permit_kind": dict(Counter(p["permit_kind"] for p in permits_data)),
        },
    )
    write_json("permits_timeline", export_permits_timeline(conn))
    write_json("builders", export_builders(conn))
    write_json("permit_contacts", export_permit_contacts(conn))
    write_json("inspection_status", export_inspection_status(conn))
    write_json("inspection_timeline", export_inspection_timeline(conn))
    write_json("fees_summary", export_fees_summary(conn))
    write_json("permit_types", export_permit_types(conn))
    write_json("projects", export_projects(conn))

    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
