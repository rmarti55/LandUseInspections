"""
Export SQLite data to JSON files for the Next.js dashboard.

Reads from santa_fe_land_use.db and writes JSON files into
dashboard/public/data/ so the static site can fetch them at runtime.

Usage:
    python export_data.py
"""

import json
import os
import sqlite3
from collections import defaultdict

from config import DB_PATH
from models import get_connection

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
    return [dict(r) for r in rows]


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
    rows = conn.execute("""
        SELECT
            COALESCE(
                NULLIF(TRIM(company), ''),
                NULLIF(TRIM(first_name || ' ' || last_name), ''),
                'Unknown'
            ) AS name,
            contact_type AS role,
            COUNT(DISTINCT case_id) AS permit_count,
            COALESCE(SUM(p.valuation), 0) AS total_valuation
        FROM contacts c
        LEFT JOIN permits p ON c.case_id = p.permit_id
        WHERE c.case_module = 'Permit'
          AND COALESCE(NULLIF(TRIM(c.company),''),
                       NULLIF(TRIM(c.first_name||' '||c.last_name),'')) IS NOT NULL
        GROUP BY name
        ORDER BY permit_count DESC
        LIMIT 50
    """).fetchall()
    return [dict(r) for r in rows]


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
    return [dict(r) for r in rows]


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
    write_json("permits", export_permits(conn))
    write_json("permits_timeline", export_permits_timeline(conn))
    write_json("builders", export_builders(conn))
    write_json("inspection_status", export_inspection_status(conn))
    write_json("inspection_timeline", export_inspection_timeline(conn))
    write_json("fees_summary", export_fees_summary(conn))
    write_json("permit_types", export_permit_types(conn))

    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
