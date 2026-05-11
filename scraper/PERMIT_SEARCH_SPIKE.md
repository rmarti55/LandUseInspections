# Permit search API spike (non-inspection discovery)

## Goal

Today, **permits only enter the database when a linked inspection appears** in the Phase 1 calendar scrape ([`scraper.py`](scraper.py) → `_collect_entity_ids` → `enrich_permits`). Permits with no inspection in the scraped window are invisible. A **permit search** (or list) API could close that gap.

## Config hook

[`config.py`](config.py) defines `permit_setup` → `/energov/permits/search/setup`. This is **not** used by the scraper yet.

## Suggested spike steps (manual or small script)

1. **Browser DevTools** (or `curl`): open the Self-Service portal’s permit search UI, perform a search, capture the **POST** URL and JSON body the app sends.
2. Compare captured path to `BASE_URL + /api` + documented `permit_setup` and any **search/results** endpoint (Tyler EnerGov often uses a setup call plus a separate search POST).
3. Document for each call:
   - Required headers (already aligned with `HEADERS` in config).
   - Request body fields (pagination, date filters, status, module id).
   - Response shape: where **permit id / PermitNumber / EntityId** live.
4. **Feasibility**
   - If search supports **date range + paging** with stable total counts: a new Phase 1b could enumerate permit IDs and merge with inspection-derived IDs before enrichment.
   - If search is **heavily constrained** (e.g. requires text query, caps results): completeness gains may be limited; prefer longer inspection backfill (`--days`) first.
5. **Rate limits**: reuse `REQUEST_DELAY_SECONDS` and the same session pattern as [`EnerGovClient`](scraper.py).

## Risks

- Terms of use / acceptable load: keep delays, avoid parallel hammering.
- Schema drift: Tyler may rename fields; keep `raw_json` storage as today.

## Outcome of this document

No implementation commitment—only a **repeatable procedure** to decide whether permit search enumeration is worth building after inspection backfill and [`completeness_audit.py`](completeness_audit.py) metrics.
