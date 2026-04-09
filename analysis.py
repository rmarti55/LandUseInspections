"""
Analysis and CSV export helpers for the Santa Fe land-use data.

Usage:
    python analysis.py                   # print summary stats
    python analysis.py --export          # export all tables to CSV
    python analysis.py --query permits   # show recent permits
"""

import argparse
import csv
import os
import sqlite3

from models import get_connection
from config import DB_PATH


def summary(conn: sqlite3.Connection) -> None:
    """Print high-level stats about the database."""
    tables = [
        "permits", "plans", "inspections", "code_cases",
        "licenses", "fees", "contacts", "todays_inspections",
    ]
    print("\n=== Santa Fe Land Use Data – Summary ===\n")
    for t in tables:
        try:
            count = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            print(f"  {t:<25s} {count:>8,d} records")
        except sqlite3.OperationalError:
            print(f"  {t:<25s}     (table missing)")
    print()


def export_all_csv(conn: sqlite3.Connection, out_dir: str = "exports") -> None:
    """Export every table to CSV."""
    os.makedirs(out_dir, exist_ok=True)
    tables = [
        "permits", "plans", "inspections", "code_cases",
        "licenses", "fees", "contacts", "todays_inspections",
    ]
    for t in tables:
        try:
            cur = conn.execute(f"SELECT * FROM {t}")
        except sqlite3.OperationalError:
            continue
        rows = cur.fetchall()
        if not rows:
            print(f"  {t}: 0 rows – skipped")
            continue
        cols = [desc[0] for desc in cur.description]
        path = os.path.join(out_dir, f"{t}.csv")
        with open(path, "w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(cols)
            for row in rows:
                writer.writerow(row)
        print(f"  {t}: {len(rows):,d} rows -> {path}")


def query_permits(conn: sqlite3.Connection, limit: int = 25) -> None:
    """Show most recent permits."""
    print(f"\n=== Most Recent Permits (limit {limit}) ===\n")
    cur = conn.execute("""
        SELECT permit_number, permit_type, work_class, status,
               apply_date, address, valuation
        FROM permits
        ORDER BY apply_date DESC
        LIMIT ?
    """, (limit,))
    rows = cur.fetchall()
    if not rows:
        print("  No permits found.")
        return
    print(f"  {'Permit #':<18s} {'Type':<25s} {'Status':<15s} "
          f"{'Apply Date':<12s} {'Valuation':>12s}  Address")
    print(f"  {'─' * 18} {'─' * 25} {'─' * 15} {'─' * 12} {'─' * 12}  {'─' * 30}")
    for r in rows:
        val = f"${r['valuation']:,.0f}" if r["valuation"] else ""
        print(f"  {(r['permit_number'] or ''):<18s} "
              f"{(r['permit_type'] or ''):<25s} "
              f"{(r['status'] or ''):<15s} "
              f"{(r['apply_date'] or ''):<12s} "
              f"{val:>12s}  "
              f"{(r['address'] or '')}")


def query_top_builders(conn: sqlite3.Connection, limit: int = 20) -> None:
    """Who is building the most?"""
    print(f"\n=== Top Builders (by permit count, limit {limit}) ===\n")
    cur = conn.execute("""
        SELECT
            COALESCE(
                NULLIF(TRIM(company), ''),
                NULLIF(TRIM(first_name || ' ' || last_name), ''),
                'Unknown'
            ) AS builder,
            contact_type,
            COUNT(DISTINCT case_id) AS num_permits
        FROM contacts
        WHERE case_module = 'Permit'
          AND COALESCE(NULLIF(TRIM(company),''), NULLIF(TRIM(first_name||' '||last_name),'')) IS NOT NULL
        GROUP BY builder
        ORDER BY num_permits DESC
        LIMIT ?
    """, (limit,))
    rows = cur.fetchall()
    if not rows:
        print("  No contact data found.")
        return
    for i, r in enumerate(rows, 1):
        print(f"  {i:>3d}. {r['builder'] or 'Unknown':<40s} "
              f"{r['num_permits']:>5d} permits")


def query_permit_types(conn: sqlite3.Connection) -> None:
    """Breakdown of permit types."""
    print("\n=== Permit Type Breakdown ===\n")
    cur = conn.execute("""
        SELECT permit_type, COUNT(*) AS cnt,
               AVG(valuation) AS avg_val
        FROM permits
        WHERE permit_type IS NOT NULL
        GROUP BY permit_type
        ORDER BY cnt DESC
        LIMIT 30
    """)
    rows = cur.fetchall()
    if not rows:
        print("  No permits found.")
        return
    print(f"  {'Type':<35s} {'Count':>8s} {'Avg Valuation':>15s}")
    print(f"  {'─' * 35} {'─' * 8} {'─' * 15}")
    for r in rows:
        avg = f"${r['avg_val']:,.0f}" if r["avg_val"] else ""
        print(f"  {r['permit_type']:<35s} {r['cnt']:>8,d} {avg:>15s}")


def query_avg_timeline(conn: sqlite3.Connection) -> None:
    """Average days from apply to issue."""
    print("\n=== Average Permit Timeline ===\n")
    cur = conn.execute("""
        SELECT permit_type,
               COUNT(*) AS cnt,
               AVG(julianday(issue_date) - julianday(apply_date)) AS avg_days
        FROM permits
        WHERE apply_date IS NOT NULL
          AND issue_date IS NOT NULL
          AND julianday(issue_date) >= julianday(apply_date)
        GROUP BY permit_type
        HAVING cnt >= 3
        ORDER BY avg_days DESC
        LIMIT 20
    """)
    rows = cur.fetchall()
    if not rows:
        print("  Insufficient date data.")
        return
    print(f"  {'Type':<35s} {'Count':>8s} {'Avg Days to Issue':>18s}")
    print(f"  {'─' * 35} {'─' * 8} {'─' * 18}")
    for r in rows:
        print(f"  {r['permit_type']:<35s} {r['cnt']:>8,d} "
              f"{r['avg_days']:>17.1f}d")


def query_inspection_pass_rate(conn: sqlite3.Connection) -> None:
    """Inspection pass/fail rates."""
    print("\n=== Inspection Status Breakdown ===\n")
    cur = conn.execute("""
        SELECT status, COUNT(*) AS cnt
        FROM inspections
        WHERE status IS NOT NULL
        GROUP BY status
        ORDER BY cnt DESC
    """)
    rows = cur.fetchall()
    if not rows:
        print("  No inspection data.")
        return
    total = sum(r["cnt"] for r in rows)
    for r in rows:
        pct = r["cnt"] / total * 100 if total else 0
        print(f"  {r['status']:<30s} {r['cnt']:>8,d}  ({pct:5.1f}%)")


def main():
    parser = argparse.ArgumentParser(
        description="Analyze Santa Fe land-use data")
    parser.add_argument("--export", action="store_true",
                        help="Export all tables to CSV")
    parser.add_argument("--query", choices=[
        "permits", "builders", "types", "timeline", "inspections", "all"],
        help="Run a specific analysis query")
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--db", default=DB_PATH)
    args = parser.parse_args()

    if not os.path.exists(args.db):
        print(f"Database not found: {args.db}")
        print("Run scraper.py first to populate the database.")
        return

    conn = get_connection(args.db)
    summary(conn)

    if args.export:
        print("Exporting to CSV …")
        export_all_csv(conn)
        print("Done.\n")

    if args.query:
        if args.query in ("permits", "all"):
            query_permits(conn, args.limit)
        if args.query in ("builders", "all"):
            query_top_builders(conn, args.limit)
        if args.query in ("types", "all"):
            query_permit_types(conn)
        if args.query in ("timeline", "all"):
            query_avg_timeline(conn)
        if args.query in ("inspections", "all"):
            query_inspection_pass_rate(conn)

    conn.close()


if __name__ == "__main__":
    main()
