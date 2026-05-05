-- Land use scraper schema for PostgreSQL (Neon).
-- Mirrors scraper/models.py SQLite DDL. Apply once via Neon SQL Editor or:
--   psql "$DATABASE_URL_UNPOOLED" -f scraper/schema_postgres.sql

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
    valuation       DOUBLE PRECISION,
    square_feet     DOUBLE PRECISION,
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    raw_json        TEXT,
    scraped_at      TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT)
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
    scraped_at      TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT)
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
    scraped_at          TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT)
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
    scraped_at      TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT)
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
    scraped_at      TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT)
);

CREATE TABLE IF NOT EXISTS fees (
    fee_id          SERIAL PRIMARY KEY,
    case_id         TEXT,
    case_module     TEXT,
    fee_name        TEXT,
    amount          DOUBLE PRECISION,
    raw_json        TEXT,
    scraped_at      TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT)
);

CREATE TABLE IF NOT EXISTS contacts (
    contact_id      SERIAL PRIMARY KEY,
    case_id         TEXT,
    case_module     TEXT,
    first_name      TEXT,
    last_name       TEXT,
    company         TEXT,
    contact_type    TEXT,
    raw_json        TEXT,
    scraped_at      TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT)
);

CREATE TABLE IF NOT EXISTS todays_inspections (
    id                  SERIAL PRIMARY KEY,
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
    scraped_at          TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT)
);

CREATE TABLE IF NOT EXISTS scraped_calendar_days (
    day         TEXT PRIMARY KEY,
    scraped_at  TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT)
);

CREATE TABLE IF NOT EXISTS enrichment_log (
    entity_id    TEXT NOT NULL,
    case_module  TEXT NOT NULL,
    enriched_at  TEXT DEFAULT (CURRENT_TIMESTAMP::TEXT),
    PRIMARY KEY (entity_id, case_module)
);

CREATE INDEX IF NOT EXISTS idx_permits_status ON permits(status);
CREATE INDEX IF NOT EXISTS idx_permits_type ON permits(permit_type);
CREATE INDEX IF NOT EXISTS idx_permits_address ON permits(address);
CREATE INDEX IF NOT EXISTS idx_permits_apply_date ON permits(apply_date);
CREATE INDEX IF NOT EXISTS idx_inspections_case ON inspections(case_number);
CREATE INDEX IF NOT EXISTS idx_fees_case ON fees(case_id);
CREATE INDEX IF NOT EXISTS idx_contacts_case ON contacts(case_id);
