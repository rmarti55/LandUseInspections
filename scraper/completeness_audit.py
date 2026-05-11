"""
Repeatable completeness audit for the SQLite scrape.

Reports calendar coverage, permit discovery gaps (orphan Permit EntityIDs),
issue_date distribution, permit suffix inventory, address/parcel grouping
warnings, export/summary reconciliation, and enrichment failure counts.

Usage:
    python completeness_audit.py
    python completeness_audit.py --db /path/to/santa_fe_land_use.db
    python completeness_audit.py --json-out ../reports/completeness_report.json
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any

from config import DB_PATH
from export_data import CONSTRUCTION_SUFFIXES, _get_suffix, _normalize_address
from models import get_connection


def _calendar_coverage(conn: sqlite3.Connection) -> dict[str, Any]:
    rows = conn.execute("SELECT day FROM scraped_calendar_days ORDER BY day").fetchall()
    days_set = {r["day"] for r in rows if r["day"]}
    if not days_set:
        return {
            "tracked_days": 0,
            "min_day": None,
            "max_day": None,
            "expected_days_in_span": None,
            "missing_days_in_span": [],
            "note": "No rows in scraped_calendar_days (run scraper with --resume to log days).",
        }

    sorted_days = sorted(days_set)
    min_d = datetime.fromisoformat(sorted_days[0]).date()
    max_d = datetime.fromisoformat(sorted_days[-1]).date()
    expected = (max_d - min_d).days + 1
    missing: list[str] = []
    cur = min_d
    while cur <= max_d:
        iso = cur.isoformat()
        if iso not in days_set:
            missing.append(iso)
        cur += timedelta(days=1)

    return {
        "tracked_days": len(days_set),
        "min_day": sorted_days[0],
        "max_day": sorted_days[-1],
        "expected_days_in_span": expected,
        "missing_days_in_span": missing[:500],
        "missing_days_truncated": len(missing) > 500,
        "total_missing_in_span": len(missing),
    }


def _inspection_date_span(conn: sqlite3.Connection) -> dict[str, Any]:
    row = conn.execute("""
        SELECT MIN(substr(scheduled_date, 1, 10)) AS mn,
               MAX(substr(scheduled_date, 1, 10)) AS mx,
               COUNT(*) AS n
        FROM inspections
        WHERE scheduled_date IS NOT NULL AND scheduled_date != ''
    """).fetchone()
    return {
        "inspection_scheduled_min": row["mn"],
        "inspection_scheduled_max": row["mx"],
        "inspection_row_count": row["n"],
    }


def _permit_orphans(conn: sqlite3.Connection) -> dict[str, Any]:
    rows = conn.execute("""
        SELECT DISTINCT json_extract(raw_json, '$.EntityID') AS eid
        FROM inspections
        WHERE case_type = 'Permit'
          AND json_extract(raw_json, '$.EntityID') IS NOT NULL
          AND json_extract(raw_json, '$.EntityID') != ''
    """).fetchall()
    entity_ids = [str(r["eid"]) for r in rows if r["eid"]]
    unique_ids = sorted(set(entity_ids))
    if not unique_ids:
        return {
            "distinct_permit_entity_ids_from_inspections": 0,
            "permits_table_rows": conn.execute("SELECT COUNT(*) FROM permits").fetchone()[0],
            "missing_permit_rows": 0,
            "orphan_entity_ids_sample": [],
        }

    placeholders = ",".join("?" * len(unique_ids))
    have = conn.execute(
        f"SELECT permit_id FROM permits WHERE permit_id IN ({placeholders})",
        unique_ids,
    ).fetchall()
    have_set = {str(r["permit_id"]) for r in have}
    orphans = [e for e in unique_ids if e not in have_set]
    return {
        "distinct_permit_entity_ids_from_inspections": len(unique_ids),
        "permits_table_rows": conn.execute("SELECT COUNT(*) FROM permits").fetchone()[0],
        "missing_permit_rows": len(orphans),
        "orphan_ratio": round(len(orphans) / len(unique_ids), 4) if unique_ids else 0,
        "orphan_entity_ids_sample": orphans[:40],
    }


def _issue_year_histogram(conn: sqlite3.Connection) -> dict[str, Any]:
    rows = conn.execute("""
        SELECT substr(issue_date, 1, 4) AS yr, COUNT(*) AS n
        FROM permits
        WHERE issue_date IS NOT NULL AND length(issue_date) >= 4
        GROUP BY yr
        ORDER BY yr
    """).fetchall()
    return {r["yr"] or "unknown": r["n"] for r in rows}


def _suffix_inventory(conn: sqlite3.Connection) -> dict[str, Any]:
    rows = conn.execute("SELECT permit_number FROM permits WHERE permit_number IS NOT NULL").fetchall()
    counter: Counter[str] = Counter()
    nullish = 0
    for r in rows:
        num = r["permit_number"]
        suf = _get_suffix(num)
        if suf is None:
            nullish += 1
            counter["(no_suffix)"] += 1
        else:
            counter[suf] += 1

    outside = {k: v for k, v in counter.items() if k not in CONSTRUCTION_SUFFIXES and k != "(no_suffix)"}
    return {
        "permits_with_numbers": len(rows),
        "suffix_counts": dict(counter.most_common()),
        "suffixes_outside_construction_set": outside,
        "construction_suffix_set_size": len(CONSTRUCTION_SUFFIXES),
    }


def _address_parcel_sanity(conn: sqlite3.Connection) -> dict[str, Any]:
    rows = conn.execute("""
        SELECT parcel_number, address
        FROM permits
        WHERE parcel_number IS NOT NULL AND TRIM(parcel_number) != ''
    """).fetchall()

    by_parcel: dict[str, set[str]] = defaultdict(set)
    for r in rows:
        pnum = str(r["parcel_number"]).strip()
        norm = _normalize_address(r["address"])
        by_parcel[pnum].add(norm)

    multi_addr = [(p, addrs) for p, addrs in by_parcel.items() if len(addrs) > 1]
    multi_addr.sort(key=lambda x: len(x[1]), reverse=True)

    # Same normalized address, different parcel strings (sample)
    by_addr: dict[str, set[str]] = defaultdict(set)
    for r in rows:
        pnum = str(r["parcel_number"]).strip()
        norm = _normalize_address(r["address"])
        by_addr[norm].add(pnum)
    multi_parcel = [(a, pars) for a, pars in by_addr.items() if len(pars) > 1 and a != "NO_ADDRESS"]
    multi_parcel.sort(key=lambda x: len(x[1]), reverse=True)

    return {
        "permits_with_parcel": len(rows),
        "parcels_with_multiple_normalized_addresses": len(multi_addr),
        "sample_parcel_address_collisions": [
            {"parcel": p, "distinct_normalized_addresses": len(addrs), "addresses": sorted(addrs)[:8]}
            for p, addrs in multi_addr[:25]
        ],
        "normalized_addresses_with_multiple_parcels": len(multi_parcel),
        "sample_address_parcel_collisions": [
            {"normalized_address": a[:80], "parcel_count": len(pars), "parcels": sorted(pars)[:8]}
            for a, pars in multi_parcel[:25]
        ],
    }


def _enrichment_failures(conn: sqlite3.Connection) -> dict[str, Any]:
    try:
        n = conn.execute("SELECT COUNT(*) FROM enrichment_failures").fetchone()[0]
    except sqlite3.OperationalError:
        return {"enrichment_failures_count": None, "note": "enrichment_failures table missing; run migrate_db."}
    by_kind = conn.execute("""
        SELECT enrichment_kind, COUNT(*) AS n
        FROM enrichment_failures
        GROUP BY enrichment_kind
        ORDER BY n DESC
    """).fetchall()
    recent = conn.execute("""
        SELECT entity_id, enrichment_kind, error_message, http_status, attempted_at
        FROM enrichment_failures
        ORDER BY id DESC
        LIMIT 15
    """).fetchall()
    return {
        "enrichment_failures_count": n,
        "by_kind": {r["enrichment_kind"]: r["n"] for r in by_kind},
        "recent_failures": [dict(r) for r in recent],
    }


def _summary_json_reconcile(conn: sqlite3.Connection, repo_root: str) -> dict[str, Any]:
    path = os.path.join(repo_root, "public", "data", "summary.json")
    out: dict[str, Any] = {"summary_json_path": path, "readable": False}
    if not os.path.isfile(path):
        out["note"] = "summary.json not found (export not run?)."
        return out
    try:
        with open(path, encoding="utf-8") as f:
            summary = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        out["note"] = str(e)
        return out
    db_permits = conn.execute("SELECT COUNT(*) FROM permits").fetchone()[0]
    json_permits = summary.get("permits")
    out["readable"] = True
    out["summary_permits"] = json_permits
    out["sqlite_permits"] = db_permits
    out["match"] = json_permits == db_permits
    if json_permits is not None:
        out["delta_sqlite_minus_summary"] = db_permits - int(json_permits)
    return out


def run_audit(db_path: str, repo_root: str) -> dict[str, Any]:
    conn = get_connection(db_path)
    try:
        cal = _calendar_coverage(conn)
        insp = _inspection_date_span(conn)
        orphans = _permit_orphans(conn)
        hist = _issue_year_histogram(conn)
        suff = _suffix_inventory(conn)
        addr = _address_parcel_sanity(conn)
        fails = _enrichment_failures(conn)
        summ = _summary_json_reconcile(conn, repo_root)
        return {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "db_path": os.path.abspath(db_path),
            "calendar_coverage": cal,
            "inspection_span": insp,
            "permit_orphans": orphans,
            "permits_issue_year_histogram": hist,
            "suffix_inventory": suff,
            "address_parcel_sanity": addr,
            "enrichment_failures": fails,
            "summary_json_reconcile": summ,
        }
    finally:
        conn.close()


def _print_report(data: dict[str, Any]) -> None:
    print("=== Completeness audit ===")
    print(f"DB: {data['db_path']}")
    print()
    cal = data["calendar_coverage"]
    print("--- Calendar (scraped_calendar_days) ---")
    if cal.get("note"):
        print(cal["note"])
    else:
        print(f"  Tracked days: {cal['tracked_days']}  span: {cal['min_day']} .. {cal['max_day']}")
        print(f"  Expected days in span: {cal['expected_days_in_span']}  missing: {cal['total_missing_in_span']}")
        if cal.get("missing_days_in_span"):
            print(f"  First missing: {cal['missing_days_in_span'][:10]}…")
    print()
    sp = data["inspection_span"]
    print("--- Inspections scheduled_date span ---")
    print(f"  {sp['inspection_scheduled_min']} .. {sp['inspection_scheduled_max']}  ({sp['inspection_row_count']} rows)")
    print()
    po = data["permit_orphans"]
    print("--- Permit EntityID orphan ratio ---")
    print(
        f"  Distinct Permit entity IDs (inspections): {po['distinct_permit_entity_ids_from_inspections']}"
    )
    print(f"  Permits in DB: {po.get('permits_table_rows', '?')}")
    print(f"  Missing permit rows (orphans): {po['missing_permit_rows']}  ratio: {po.get('orphan_ratio', 0)}")
    if po.get("orphan_entity_ids_sample"):
        print(f"  Sample orphan IDs: {po['orphan_entity_ids_sample'][:8]}")
    print()
    print("--- Issue year histogram (permits) ---")
    for yr, n in sorted(data["permits_issue_year_histogram"].items()):
        print(f"  {yr}: {n}")
    print()
    si = data["suffix_inventory"]
    print("--- Suffix inventory ---")
    print(f"  Top suffixes: {dict(list(si['suffix_counts'].items())[:15])}")
    if si["suffixes_outside_construction_set"]:
        print(f"  Outside CONSTRUCTION_SUFFIXES: {si['suffixes_outside_construction_set']}")
    print()
    ap = data["address_parcel_sanity"]
    print("--- Address / parcel ---")
    print(f"  Parcels mapping to multiple normalized addresses: {ap['parcels_with_multiple_normalized_addresses']}")
    print(f"  Addresses mapping to multiple parcel IDs: {ap['normalized_addresses_with_multiple_parcels']}")
    print()
    print("--- Enrichment failures ---")
    ef = data["enrichment_failures"]
    cnt = ef.get("enrichment_failures_count")
    if cnt is None:
        print(f"  {ef.get('note', 'N/A')}")
    elif cnt == 0:
        print("  Total: 0 (no recorded permit_detail failures)")
    else:
        print(f"  Total: {cnt}  by kind: {ef.get('by_kind', {})}")
    print()
    sr = data["summary_json_reconcile"]
    print("--- summary.json vs SQLite ---")
    if sr.get("readable"):
        print(f"  summary permits: {sr['summary_permits']}  SQLite: {sr['sqlite_permits']}  match: {sr['match']}")
    else:
        print(f"  {sr.get('note', 'N/A')}")


def main() -> None:
    parser = argparse.ArgumentParser(description="SQLite scrape completeness audit")
    parser.add_argument("--db", default=DB_PATH, help="Path to santa_fe_land_use.db")
    parser.add_argument(
        "--json-out",
        default="",
        help="Write full JSON report to this path (directories created if needed)",
    )
    args = parser.parse_args()

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    data = run_audit(args.db, repo_root)
    _print_report(data)

    if args.json_out:
        out_path = os.path.abspath(args.json_out)
        os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print()
        print(f"Wrote JSON report: {out_path}")


if __name__ == "__main__":
    main()
