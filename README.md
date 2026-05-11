# Santa Fe Land Use Inspections – Open Data Scraper

Pulls publicly available inspection, permit, fee, and contact data from the
City of Santa Fe's Tyler EnerGov Self-Service portal.

## Setup

```bash
pip install -r requirements.txt
```

## Usage

### Full scrape (default: 365 days of inspections + permit enrichment)

```bash
python scraper.py
```

### Shorter scrape for testing

```bash
# Last 7 days, enrich only 10 permits
python scraper.py --days 7 --enrich-limit 10

# Skip enrichment, just pull inspections
python scraper.py --days 30 --skip-enrich
```

### Re-enrich without re-scraping inspections

```bash
python scraper.py --skip-inspections
```

Use **`--resume`** to skip permit IDs already in `permits` (fills **orphan** EntityIDs from inspections without re-fetching every permit):

Use **`--orphans-only --no-delay`** to fetch only permits not yet in `permits` with **no** pause between API calls (faster; watch for timeouts). **`--skip-sub-records`** skips fees/contacts for that run.

```bash
cd scraper
python3 scraper.py --skip-inspections --orphans-only --no-delay --skip-sub-records
```

### Analyze the data

```bash
# Print summary stats
python analysis.py

# Export all tables to CSV
python analysis.py --export

# Run specific queries
python analysis.py --query permits     # Recent permits
python analysis.py --query builders    # Top builders by permit count
python analysis.py --query types       # Permit type breakdown
python analysis.py --query timeline    # Average days to issue
python analysis.py --query inspections # Pass/fail rates
python analysis.py --query all         # Run all queries

# Scrape / export completeness (calendar gaps, orphan permit IDs, suffixes, summary.json vs DB)
python3 completeness_audit.py
```

## How it works

The EnerGov portal's "Today's Inspections" page is publicly accessible without
authentication. The scraper uses this as the entry point:

1. **Phase 1 – Inspection sweep**: POST to the `todaysinspections` endpoint for
   every date in the range. Each inspection record contains an `EntityID` linking
   back to a permit, license, or code case.
2. **Phase 2 – Permit enrichment**: For each unique permit `EntityID` discovered,
   GET the full permit detail (type, status, dates, valuation, square footage,
   address, description).
3. **Phase 3 – Sub-records**: For each entity, pull associated fees and contacts.

Rate-limited to ~1.5 seconds between requests.

## Data completeness (why counts can look “low”)

1. **Inspection-bounded discovery** — Phase 1 only sees **EntityID** values that appear on inspections whose **scheduled date** falls in `[today - --days, today]` (default **365** in [`scraper/config.py`](scraper/config.py) `DEFAULT_SCRAPE_DAYS`). Permits never touched by an inspection in that window are **not** discovered. Use a larger `--days`, or run multiple backfills with **`--resume`** so [`scraped_calendar_days`](scraper/models.py) grows without re-fetching finished days.
2. **Permit enrichment** — Failures are stored in **`enrichment_failures`** (after `migrate_db`). Transient HTTP errors (429, 502, 503, 504, timeouts) are **retried** a few times during permit detail fetch.
3. **Dashboard “projects”** — JSON [`export_data.py`](scraper/export_data.py) groups **construction suffix** permits by normalized address; the Historic dashboard **Building** toggle only includes **BLDR / BLDC / ADDR**, so totals differ from “all construction” rows.
4. **How far back does the API go?** — Run [`probe_history.py`](scraper/probe_history.py) to approximate the earliest date with inspection data, then choose `--days` accordingly.
5. **Future: permit search enumeration** — See [`scraper/PERMIT_SEARCH_SPIKE.md`](scraper/PERMIT_SEARCH_SPIKE.md) for a manual spike procedure (non-inspection discovery is not implemented yet).

### Standard runbook (backfill → export → verify)

1. Backfill inspections with a large enough `--days` (see `probe_history.py` for API range), using **`--resume`** so completed calendar days stay in `scraped_calendar_days`.
2. Run **`python3 scraper.py`** (or Phase 1 only / Phase 2 only as needed); ensure `migrate_db` has run so **`enrichment_failures`** exists.
3. Export dashboard JSON: **`python3 export_data.py`** from `scraper/` (writes [`public/data/`](public/data/)).
4. Run **`python3 completeness_audit.py`** — confirm `summary.json` permit count matches SQLite and review orphan ratio / calendar gaps.

### Completeness audit

After scraping (and `python export_data.py`), run:

```bash
cd scraper
python3 completeness_audit.py
# optional machine-readable report:
python3 completeness_audit.py --json-out ../reports/completeness_report.json
```

This reports: calendar gaps in `scraped_calendar_days`, inspection date span, **orphan** Permit EntityIDs (seen on inspections but missing from `permits`), permit issue-year histogram, suffix mix, address/parcel collision samples, enrichment failure counts, and **`public/data/summary.json` vs SQLite** permit counts.

### Schema migrations

If you pull an older SQLite file, run:

```bash
cd scraper
python3 models.py
```

That runs `init_db` + `migrate_db` (adds columns/tables such as **`enrichment_failures`**).

## Data collected

| Table         | Description                                          |
|---------------|------------------------------------------------------|
| `inspections` | All inspections found across the date range          |
| `permits`     | Full permit details for entities linked to inspections|
| `fees`        | Fees and amounts associated with permits             |
| `contacts`    | People/companies associated with permits             |
| `plans`       | Plan reviews (schema ready, populated if discovered) |
| `code_cases`  | Code enforcement cases (same)                        |
| `licenses`    | Business and professional licenses (same)            |

All tables include a `raw_json` column with the full API response preserved.

## Source

Data comes from: https://santafenm-energovpub.tylerhost.net/Apps/selfservice
