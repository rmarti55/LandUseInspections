#!/usr/bin/env python3
"""
Copy all tables from local SQLite (santa_fe_land_use.db) to Neon PostgreSQL.

Prerequisites:
  1. Rotate Neon credentials if they were ever exposed; set DATABASE_URL in Vercel.
  2. pip install -r scraper/requirements.txt
  3. Apply schema once: python sync_sqlite_to_neon.py --init-schema
     (or run scraper/schema_postgres.sql in the Neon SQL Editor)

Environment (prefer unpooled URL for bulk copy):
  DATABASE_URL_UNPOOLED or DATABASE_URL

Optional: vercel env pull .env.development.local — this script loads .env.development.local,
.env.local, and .env from the repo root if present.

Dashboard (approach A): scraper/export_data.py still reads SQLite and writes public/data/*.json;
re-run this script after scrapes when you want Neon updated for backup/analytics.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

# Repo root (parent of scraper/) and scraper dir (where santa_fe_land_use.db lives)
_SCRAPER_DIR = Path(__file__).resolve().parent
_ROOT = _SCRAPER_DIR.parent


def _load_dotenv() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    for name in (".env.development.local", ".env.local", ".env"):
        p = _ROOT / name
        if p.is_file():
            load_dotenv(p)


def _pg_dsn() -> str:
    dsn = os.environ.get("DATABASE_URL_UNPOOLED") or os.environ.get("DATABASE_URL")
    if not dsn:
        print(
            "Missing DATABASE_URL_UNPOOLED or DATABASE_URL. "
            "Use vercel env pull or export from Neon / Vercel.",
            file=sys.stderr,
        )
        sys.exit(1)
    return dsn


TABLES_COPY_ORDER: tuple[str, ...] = (
    "permits",
    "plans",
    "inspections",
    "code_cases",
    "licenses",
    "fees",
    "contacts",
    "todays_inspections",
    "scraped_calendar_days",
    "enrichment_log",
)

SERIAL_TABLES: tuple[tuple[str, str], ...] = (
    ("fees", "fee_id"),
    ("contacts", "contact_id"),
    ("todays_inspections", "id"),
)


def _statements_from_sql_file(path: Path) -> list[str]:
    raw = path.read_text()
    parts: list[str] = []
    for block in raw.split(";"):
        lines = [
            ln
            for ln in block.splitlines()
            if ln.strip() and not ln.strip().startswith("--")
        ]
        s = "\n".join(lines).strip()
        if s:
            parts.append(s)
    return parts


def apply_schema_file(pg_conn) -> None:
    schema_path = Path(__file__).resolve().parent / "schema_postgres.sql"
    stmts = _statements_from_sql_file(schema_path)
    with pg_conn.cursor() as cur:
        for stmt in stmts:
            cur.execute(stmt)
    pg_conn.commit()
    print(f"Applied {len(stmts)} statements from {schema_path.name}")


def truncate_neon(pg_conn) -> None:
    with pg_conn.cursor() as cur:
        names = ", ".join(f'"{t}"' for t in TABLES_COPY_ORDER)
        cur.execute(f"TRUNCATE TABLE {names} RESTART IDENTITY")
    pg_conn.commit()


def table_count_sqlite(sqlite_conn, table: str) -> int:
    row = sqlite_conn.execute(f"SELECT COUNT(*) AS c FROM {table}").fetchone()
    return int(row["c"] if hasattr(row, "keys") else row[0])


def table_count_pg(pg_conn, table: str) -> int:
    with pg_conn.cursor() as cur:
        cur.execute(f'SELECT COUNT(*) FROM "{table}"')
        return int(cur.fetchone()[0])


def copy_table(sqlite_conn, pg_conn, table: str, batch_size: int) -> int:
    lite_cur = sqlite_conn.execute(f"SELECT * FROM {table}")
    cols = [d[0] for d in lite_cur.description]
    rows = lite_cur.fetchall()
    if not rows:
        return 0

    col_sql = ", ".join(f'"{c}"' for c in cols)
    placeholders = ", ".join(["%s"] * len(cols))
    insert_sql = f'INSERT INTO "{table}" ({col_sql}) VALUES ({placeholders})'

    tuples = [tuple(r) for r in rows]
    with pg_conn.cursor() as cur:
        for i in range(0, len(tuples), batch_size):
            chunk = tuples[i : i + batch_size]
            cur.executemany(insert_sql, chunk)
    return len(tuples)


def reset_serial_sequences(pg_conn) -> None:
    with pg_conn.cursor() as cur:
        for table, col in SERIAL_TABLES:
            cur.execute(f'SELECT MAX("{col}") FROM "{table}"')
            max_id = cur.fetchone()[0]
            cur.execute(
                "SELECT pg_get_serial_sequence(%s, %s)",
                (table, col),
            )
            row = cur.fetchone()
            seq = row[0] if row else None
            if seq is None:
                continue
            if max_id is None:
                cur.execute("SELECT setval(%s, 1, false)", (seq,))
            else:
                cur.execute("SELECT setval(%s, %s, true)", (seq, max_id))
    pg_conn.commit()


def print_count_comparison(sqlite_conn, pg_conn) -> None:
    print("\nTable row counts (sqlite | postgres):")
    for t in TABLES_COPY_ORDER:
        ns = table_count_sqlite(sqlite_conn, t)
        np = table_count_pg(pg_conn, t)
        match = "OK" if ns == np else "MISMATCH"
        print(f"  {t:24} {ns:8} | {np:8}  {match}")


def print_sample_newest_permit(sqlite_conn, pg_conn) -> None:
    """Spot-check: one row from permits (newest apply_date)."""
    lite = sqlite_conn.execute(
        """
        SELECT permit_id, permit_number, apply_date
        FROM permits
        WHERE apply_date IS NOT NULL AND apply_date != ''
        ORDER BY apply_date DESC
        LIMIT 1
        """
    ).fetchone()
    with pg_conn.cursor() as cur:
        cur.execute(
            """
            SELECT permit_id, permit_number, apply_date
            FROM permits
            WHERE apply_date IS NOT NULL AND apply_date <> ''
            ORDER BY apply_date DESC NULLS LAST
            LIMIT 1
            """
        )
        pg = cur.fetchone()
    print("\nSample permit (newest apply_date):")
    print(f"  sqlite:   {tuple(lite) if lite else None}")
    print(f"  postgres: {tuple(pg) if pg else None}")


def main() -> None:
    _load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--init-schema",
        action="store_true",
        help="Create tables/indexes on Neon from schema_postgres.sql",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only print SQLite and Postgres row counts (no writes)",
    )
    parser.add_argument(
        "--no-truncate",
        action="store_true",
        help="Append without truncating (may duplicate PK rows; use with care)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        metavar="N",
        help="Rows per INSERT batch (default 500)",
    )
    args = parser.parse_args()

    import psycopg
    from models import get_connection

    dsn = _pg_dsn()

    # config.DB_PATH is relative; match export_data.py (run from scraper/)
    os.chdir(_SCRAPER_DIR)

    if args.init_schema:
        with psycopg.connect(dsn, autocommit=False) as pg_conn:
            apply_schema_file(pg_conn)
        print("Run again without --init-schema to copy data from SQLite.")
        return

    from config import DB_PATH

    if not Path(DB_PATH).is_file():
        print(
            f"SQLite database not found: {Path(DB_PATH).resolve()}",
            file=sys.stderr,
        )
        sys.exit(1)

    sqlite_conn = get_connection()

    if args.dry_run:
        with psycopg.connect(dsn) as pg_conn:
            print_count_comparison(sqlite_conn, pg_conn)
            print_sample_newest_permit(sqlite_conn, pg_conn)
        sqlite_conn.close()
        return

    with psycopg.connect(dsn, autocommit=False) as pg_conn:
        if not args.no_truncate:
            print("Truncating Neon tables …")
            truncate_neon(pg_conn)

        total = 0
        for table in TABLES_COPY_ORDER:
            n = copy_table(sqlite_conn, pg_conn, table, args.batch_size)
            print(f"  {table}: {n} rows")
            total += n
        print(f"Total rows copied: {total}")

        reset_serial_sequences(pg_conn)
        print("Serial sequences reset for fees, contacts, todays_inspections.")

        pg_conn.commit()

    with psycopg.connect(dsn) as pg_conn:
        print_count_comparison(sqlite_conn, pg_conn)
        print_sample_newest_permit(sqlite_conn, pg_conn)
    sqlite_conn.close()


if __name__ == "__main__":
    main()
