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
