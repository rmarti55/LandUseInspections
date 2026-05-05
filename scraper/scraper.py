"""
Santa Fe EnerGov Self-Service Portal Scraper.

Strategy: use the todaysinspections endpoint (which works publicly) to
scrape inspections across a date range.  Each inspection record contains
an EntityID and CaseNumber that links back to a permit / license / code
case.  We collect those IDs and then pull full permit details and
sub-records (fees, contacts, entity-level inspections).
"""

import argparse
import json
import logging
import sqlite3
import time
from datetime import date, timedelta
from typing import Any

import requests

import config
from models import get_connection, init_db, migrate_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)


# ──────────────────────────────────────────────────────────────────
# HTTP helpers
# ──────────────────────────────────────────────────────────────────

class EnerGovClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(config.HEADERS)
        self.base = f"{config.BASE_URL}/api"

    def _url(self, key: str) -> str:
        return self.base + config.ENDPOINTS[key]

    def delay(self):
        time.sleep(config.REQUEST_DELAY_SECONDS)

    def get(self, key: str, suffix: str = "") -> Any:
        url = self._url(key) + suffix
        r = self.session.get(url, timeout=30)
        r.raise_for_status()
        return r.json()

    def post(self, key: str, body: Any) -> Any:
        url = self._url(key)
        r = self.session.post(url, json=body, timeout=60)
        r.raise_for_status()
        return r.json()


# ──────────────────────────────────────────────────────────────────
# Inspection scraper (the primary data source)
# ──────────────────────────────────────────────────────────────────

def scrape_inspections_for_date(
    client: EnerGovClient,
    conn: sqlite3.Connection,
    target: date,
) -> list[dict]:
    """Fetch all inspections for a single date.  Returns the raw list."""
    all_results: list[dict] = []
    page = 1
    date_show = target.strftime("%m/%d/%Y")
    while True:
        body = {
            "ExcludeCompleted": False,
            "IsSortedInAscendingOrder": True,
            "PageNumber": page,
            "PageSize": config.PAGE_SIZE,
            "ScheduledDate": config.to_energov_date(target.isoformat()),
            "ScheduledDateShow": date_show,
            "SortField": "",
            "EntityId": "",
            "ModuleId": 0,
            "Keyword": "",
            "ExactMatch": False,
        }
        resp = client.post("todays_inspections", body)
        total = resp.get("TotalFound", 0)
        results = resp.get("Result") or []

        for r in results:
            _store_inspection(conn, r, target.isoformat())
            all_results.append(r)

        if not results or page * config.PAGE_SIZE >= total:
            break
        page += 1
        client.delay()

    return all_results


def _store_inspection(conn: sqlite3.Connection, r: dict, sched: str) -> None:
    conn.execute("""
        INSERT OR REPLACE INTO inspections
        (inspection_id, inspection_number, case_number, case_type,
         inspection_type, status, scheduled_date, completed_date,
         inspector_name, address, result, raw_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        r.get("InspectionID"),
        r.get("InspectionNumber"),
        r.get("CaseNumber"),
        r.get("CaseType"),
        r.get("InspectionTypeName"),
        r.get("InspectionStatusName"),
        sched,
        r.get("ActualStartDate"),
        r.get("PrimaryInspectorName"),
        r.get("Address"),
        r.get("InspectionResult"),
        json.dumps(r),
    ))


def scrape_date_range(
    client: EnerGovClient,
    conn: sqlite3.Connection,
    start: date,
    end: date,
    resume: bool = False,
) -> int:
    """Scrape inspections for every date in [start, end].  Returns total."""
    done_days: set[str] = set()
    if resume:
        rows = conn.execute("SELECT day FROM scraped_calendar_days").fetchall()
        done_days = {r["day"] for r in rows}
        if done_days:
            log.info("  Resume: skipping %d calendar days already scraped", len(done_days))

    total = 0
    current = start
    days = (end - start).days + 1
    day_num = 0
    while current <= end:
        day_num += 1
        day_iso = current.isoformat()
        if resume and day_iso in done_days:
            log.info("  [%d/%d] %s … resume skip", day_num, days, day_iso)
            current += timedelta(days=1)
            continue

        log.info("  [%d/%d] %s …", day_num, days, day_iso)
        try:
            results = scrape_inspections_for_date(client, conn, current)
            count = len(results)
            total += count
            if count:
                log.info("         %d inspections", count)
            if resume:
                conn.execute(
                    "INSERT OR REPLACE INTO scraped_calendar_days (day) VALUES (?)",
                    (day_iso,),
                )
            conn.commit()
        except Exception as exc:
            log.warning("         failed: %s", exc)
        current += timedelta(days=1)
        client.delay()
    conn.commit()
    return total


# ──────────────────────────────────────────────────────────────────
# Permit detail enrichment
# ──────────────────────────────────────────────────────────────────

def _collect_entity_ids(conn: sqlite3.Connection) -> list[tuple[str, str]]:
    """Return unique (entity_id, case_type) pairs from inspections."""
    rows = conn.execute("""
        SELECT DISTINCT
            json_extract(raw_json, '$.EntityID') AS eid,
            case_type
        FROM inspections
        WHERE json_extract(raw_json, '$.EntityID') IS NOT NULL
          AND json_extract(raw_json, '$.EntityID') != ''
          AND case_type != 'NONE'
    """).fetchall()
    return [(r["eid"], r["case_type"]) for r in rows if r["eid"]]


def enrich_permits(
    client: EnerGovClient,
    conn: sqlite3.Connection,
    limit: int = 0,
    resume: bool = False,
) -> int:
    """GET full permit details for every Permit entity discovered."""
    pairs = _collect_entity_ids(conn)
    permit_ids = [eid for eid, ct in pairs if ct == "Permit"]
    # de-dup
    seen: set[str] = set()
    unique: list[str] = []
    for pid in permit_ids:
        if pid not in seen:
            seen.add(pid)
            unique.append(pid)
    if limit:
        unique = unique[:limit]

    existing: set[str] = set()
    if resume:
        rows = conn.execute("SELECT permit_id FROM permits").fetchall()
        existing = {r["permit_id"] for r in rows if r["permit_id"]}
        skipped = sum(1 for p in unique if p in existing)
        if skipped:
            log.info("  Resume: skipping %d permits already in DB", skipped)

    log.info("─── Enriching %d permits ───", len(unique))
    stored = 0
    skipped_count = 0
    for i, pid in enumerate(unique, 1):
        if i % 50 == 0:
            log.info("  %d / %d …", i, len(unique))
        if resume and pid in existing:
            skipped_count += 1
            continue
        try:
            resp = client.get("permit_detail", pid)
            result = resp.get("Result") or {}
            if result.get("PermitNumber"):
                _store_permit(conn, result)
                stored += 1
        except Exception:
            pass
        if i % 20 == 0:
            conn.commit()
        client.delay()

    conn.commit()
    log.info("  Permits stored: %d (resume skipped: %d)", stored, skipped_count)
    return stored


def _store_permit(conn: sqlite3.Connection, p: dict) -> None:
    conn.execute("""
        INSERT OR REPLACE INTO permits
        (permit_id, permit_number, permit_type, work_class, status,
         description, apply_date, issue_date, expire_date, finalize_date,
         complete_date, address, parcel_number, project_name,
         valuation, square_feet, raw_json)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, (
        p.get("PermitId"),
        p.get("PermitNumber"),
        p.get("PermitType"),
        p.get("WorkClassName"),
        p.get("PermitStatus"),
        p.get("Description"),
        p.get("ApplyDate"),
        p.get("IssueDate"),
        p.get("ExpireDate"),
        p.get("FinalizeDate"),
        p.get("CompleteDate") or p.get("CompletedDate"),
        p.get("MainAddress"),
        p.get("MainParcelNumber"),
        p.get("ProjectName"),
        p.get("Value"),
        p.get("SquareFeet"),
        json.dumps(p),
    ))


# ──────────────────────────────────────────────────────────────────
# Sub-record enrichment (fees, contacts, entity inspections)
# ──────────────────────────────────────────────────────────────────

def enrich_sub_records(
    client: EnerGovClient,
    conn: sqlite3.Connection,
    limit: int = 0,
    resume: bool = False,
) -> None:
    """Pull fees, contacts, and inspections for discovered entities."""
    pairs = _collect_entity_ids(conn)
    seen: set[str] = set()
    unique: list[tuple[str, str]] = []
    for eid, ct in pairs:
        if eid not in seen:
            seen.add(eid)
            unique.append((eid, ct))
    if limit:
        unique = unique[:limit]

    done_pairs: set[tuple[str, str]] = set()
    if resume:
        rows = conn.execute(
            "SELECT entity_id, case_module FROM enrichment_log"
        ).fetchall()
        done_pairs = {(r["entity_id"], r["case_module"]) for r in rows}
        if done_pairs:
            log.info("  Resume: skipping %d entities already enriched", len(done_pairs))

    log.info("─── Enriching sub-records for %d entities ───", len(unique))

    skipped = 0
    for i, (eid, case_type) in enumerate(unique, 1):
        if i % 50 == 0:
            log.info("  %d / %d …", i, len(unique))

        if resume and (eid, case_type) in done_pairs:
            skipped += 1
            continue

        module_id = config.MODULE_IDS.get(case_type, 0)
        base_body = {
            "EntityId": eid,
            "ModuleId": module_id,
            "PageNumber": 1,
            "PageSize": 200,
            "SortField": "",
            "IsSortedInAscendingOrder": True,
        }

        fees_ok = False
        try:
            resp = client.post("entity_fees", base_body)
            for fee in (resp.get("Result") or []):
                _store_fee(conn, eid, case_type, fee)
            fees_ok = True
        except Exception:
            pass
        client.delay()

        contacts_ok = False
        try:
            resp = client.post("entity_contacts", base_body)
            for c in (resp.get("Result") or []):
                _store_contact(conn, eid, case_type, c)
            contacts_ok = True
        except Exception:
            pass
        client.delay()

        if resume and fees_ok and contacts_ok:
            conn.execute(
                """
                INSERT OR REPLACE INTO enrichment_log (entity_id, case_module)
                VALUES (?, ?)
                """,
                (eid, case_type),
            )

        if i % 10 == 0:
            conn.commit()

    conn.commit()
    log.info("  Sub-record enrichment complete (resume skipped: %d)", skipped)


def _store_fee(conn: sqlite3.Connection, eid: str, mod: str, f: dict):
    conn.execute("""
        INSERT INTO fees (case_id, case_module, fee_name, amount, raw_json)
        VALUES (?,?,?,?,?)
    """, (
        eid, mod,
        f.get("FeeName") or f.get("FeeDescription"),
        f.get("Computed") or f.get("ComputedAmount") or f.get("Amount"),
        json.dumps(f),
    ))


def _store_contact(conn: sqlite3.Connection, eid: str, mod: str, c: dict):
    conn.execute("""
        INSERT INTO contacts
        (case_id, case_module, first_name, last_name, company,
         contact_type, raw_json)
        VALUES (?,?,?,?,?,?,?)
    """, (
        eid, mod,
        c.get("FirstName"),
        c.get("LastName"),
        c.get("Company") or c.get("CompanyName"),
        c.get("ContactTypeName") or c.get("ContactType") or c.get("Type"),
        json.dumps(c),
    ))


# ──────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Santa Fe EnerGov inspection / permit scraper")
    parser.add_argument("--days", type=int, default=config.DEFAULT_SCRAPE_DAYS,
                        help="Number of days back to scrape (default: 365)")
    parser.add_argument("--enrich-limit", type=int, default=0,
                        help="Max entities to enrich (0 = all)")
    parser.add_argument("--skip-inspections", action="store_true",
                        help="Skip the inspection date-range scrape")
    parser.add_argument("--skip-enrich", action="store_true",
                        help="Skip the permit/sub-record enrichment")
    parser.add_argument("--resume", action="store_true",
                        help="Skip work already recorded (calendar days, permits, enrichment_log)")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("Santa Fe EnerGov Data Scraper")
    log.info("=" * 60)

    init_db()
    migrate_db()
    conn = get_connection()
    client = EnerGovClient()

    # Phase 1 — scrape inspections across the date range
    if not args.skip_inspections:
        end_date = date.today()
        start_date = end_date - timedelta(days=args.days)
        log.info("")
        log.info("Phase 1: Scraping inspections %s → %s (%d days)",
                 start_date, end_date, args.days)
        if not args.resume:
            conn.execute("DELETE FROM scraped_calendar_days")
            conn.commit()
            log.info("  Fresh run: cleared scraped_calendar_days")
        total = scrape_date_range(
            client, conn, start_date, end_date, resume=args.resume)
        log.info("Phase 1 complete: %d inspections", total)

    # Phase 2 — enrich permits from discovered entity IDs
    if not args.skip_enrich:
        log.info("")
        log.info("Phase 2: Enriching permit details")
        enrich_permits(
            client, conn, limit=args.enrich_limit, resume=args.resume)
        client.delay()

        log.info("")
        log.info("Phase 3: Enriching sub-records (fees, contacts)")
        enrich_sub_records(
            client, conn, limit=args.enrich_limit, resume=args.resume)

    # Summary
    log.info("")
    log.info("=" * 60)
    log.info("SCRAPE COMPLETE")
    for table in ("inspections", "permits", "fees", "contacts", "scraped_calendar_days", "enrichment_log"):
        count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        log.info("  %-20s %d records", table, count)
    log.info("=" * 60)

    conn.close()


if __name__ == "__main__":
    main()
