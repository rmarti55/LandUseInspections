"""SQLite schema definitions and helper functions."""

import sqlite3
from config import DB_PATH


def get_connection(db_path: str = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(db_path: str = DB_PATH) -> None:
    conn = get_connection(db_path)
    cur = conn.cursor()

    cur.executescript("""
    CREATE TABLE IF NOT EXISTS permits (
        permit_id       TEXT PRIMARY KEY,
        permit_number   TEXT,
        permit_type     TEXT,
        work_class      TEXT,
        status          TEXT,
        description     TEXT,
        apply_date      TEXT,
        issue_date      TEXT,
        expire_date     TEXT,
        finalize_date   TEXT,
        complete_date   TEXT,
        address         TEXT,
        parcel_number   TEXT,
        project_name    TEXT,
        valuation       REAL,
        square_feet     REAL,
        latitude        REAL,
        longitude       REAL,
        raw_json        TEXT,
        scraped_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS plans (
        plan_id         TEXT PRIMARY KEY,
        plan_number     TEXT,
        plan_type       TEXT,
        status          TEXT,
        description     TEXT,
        apply_date      TEXT,
        complete_date   TEXT,
        expire_date     TEXT,
        address         TEXT,
        parcel_number   TEXT,
        project_name    TEXT,
        raw_json        TEXT,
        scraped_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inspections (
        inspection_id       TEXT PRIMARY KEY,
        inspection_number   TEXT,
        case_number         TEXT,
        case_type           TEXT,
        inspection_type     TEXT,
        status              TEXT,
        scheduled_date      TEXT,
        completed_date      TEXT,
        inspector_name      TEXT,
        address             TEXT,
        result              TEXT,
        raw_json            TEXT,
        scraped_at          TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS code_cases (
        code_case_id    TEXT PRIMARY KEY,
        case_number     TEXT,
        case_type       TEXT,
        status          TEXT,
        priority        TEXT,
        opened_date     TEXT,
        closed_date     TEXT,
        address         TEXT,
        description     TEXT,
        raw_json        TEXT,
        scraped_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS licenses (
        license_id      TEXT PRIMARY KEY,
        license_number  TEXT,
        license_type    TEXT,
        status          TEXT,
        company_name    TEXT,
        issue_date      TEXT,
        expire_date     TEXT,
        address         TEXT,
        raw_json        TEXT,
        scraped_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fees (
        fee_id          INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id         TEXT,
        case_module     TEXT,
        fee_name        TEXT,
        amount          REAL,
        raw_json        TEXT,
        scraped_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
        contact_id      INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id         TEXT,
        case_module     TEXT,
        first_name      TEXT,
        last_name       TEXT,
        company         TEXT,
        contact_type    TEXT,
        raw_json        TEXT,
        scraped_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS todays_inspections (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        inspection_id       TEXT,
        inspection_number   TEXT,
        case_number         TEXT,
        case_type           TEXT,
        inspection_type     TEXT,
        status              TEXT,
        address             TEXT,
        inspector_name      TEXT,
        start_time          TEXT,
        end_time            TEXT,
        scheduled_date      TEXT,
        raw_json            TEXT,
        scraped_at          TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_permits_status ON permits(status);
    CREATE INDEX IF NOT EXISTS idx_permits_type ON permits(permit_type);
    CREATE INDEX IF NOT EXISTS idx_permits_address ON permits(address);
    CREATE INDEX IF NOT EXISTS idx_permits_apply_date ON permits(apply_date);
    CREATE INDEX IF NOT EXISTS idx_inspections_case ON inspections(case_number);
    CREATE INDEX IF NOT EXISTS idx_fees_case ON fees(case_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_case ON contacts(case_id);

    CREATE TABLE IF NOT EXISTS scraped_calendar_days (
        day         TEXT PRIMARY KEY,
        scraped_at  TEXT DEFAULT (datetime('now'))
    );

    -- Sub-record enrichment completed for (entity, module); avoids duplicate fee/contact rows on resume
    CREATE TABLE IF NOT EXISTS enrichment_log (
        entity_id    TEXT NOT NULL,
        case_module  TEXT NOT NULL,
        enriched_at  TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (entity_id, case_module)
    );
    """)

    conn.commit()
    conn.close()


def migrate_db(db_path: str = DB_PATH) -> None:
    """Add columns that may be missing from an older schema."""
    conn = get_connection(db_path)
    for col, typ in [("latitude", "REAL"), ("longitude", "REAL")]:
        try:
            conn.execute(f"ALTER TABLE permits ADD COLUMN {col} {typ}")
        except sqlite3.OperationalError:
            pass
    conn.commit()
    conn.close()


if __name__ == "__main__":
    init_db()
    migrate_db()
    print(f"Database initialized at {DB_PATH}")
