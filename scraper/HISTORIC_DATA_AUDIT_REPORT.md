# Historic Project Data Audit Report

**Date:** 2026-05-05  
**Scope:** Santa Fe EnerGov self-service portal data as scraped into `santa_fe_land_use.db`

---

## Executive Summary

The existing data source **can identify historic projects with high confidence** using inspection type records already in the database. The key evidence:

- **674 inspections** with explicit historic inspection types exist in the DB
- **498 distinct permits** are linked to at least one historic inspection
- **352 unique addresses** have had historic inspection activity
- The `entity_inspections` endpoint confirms which active permits still **require** a historic inspection
- The `plan_detail` endpoint reveals formal **"Pre-Application - Historic Inquiry"** records with approval status

**Recommendation:** YES, the dashboard can expose historic project data today using the existing `inspections` table. Additional scraper enhancements would improve coverage but are not blockers.

---

## Data Sources for Historic Identification

### Source 1: Inspection Type (HIGH confidence, already in DB)

Three inspection types explicitly identify historic projects:

| Inspection Type | Count | Meaning |
|----------------|-------|---------|
| Historic Final | 564 | Final historic district compliance inspection |
| Historic Interim | 96 | Mid-construction historic check |
| Special Inspection - Historic | 14 | Ad-hoc historic review |

These are stored in `inspections.inspection_type` and linked to permits via `json_extract(raw_json, '$.EntityID')`.

**Coverage:** 498 permits, 352 addresses, spanning 2019-2026.

### Source 2: Entity Inspections Endpoint (HIGH confidence, live API)

The `entity_inspections` endpoint (`/energov/entity/inspections/search/search`) returns **pending/required inspections** for an entity. If `Historic Final` appears in results, the permit requires a historic inspection that has not yet passed.

**Confirmed behavior:**
- Permits with Historic Final already passed → endpoint returns 0 historic items
- Permits still needing Historic Final → endpoint returns it with `ParentInspectionStatus: Requested`
- Currently 4 active permits still require Historic Final

### Source 3: Plan Detail (MEDIUM confidence, sparsely scraped)

The `plan_detail` endpoint reveals formal historic review applications:

| Plan Type | Work Class | Status Examples |
|-----------|-----------|-----------------|
| Pre-Application - Historic Inquiry | Historic Inquiry | Fees Due, Approval Expired |
| Administrative Approval - Archaeological Plan Revision | Archaeological Plan Revision | Approved |

**Limitation:** Only 7 Plan-type entities are in the current DB (plans are only discovered via inspections). A dedicated plan search would find more.

### Source 4: Permit Description Text (LOW-MEDIUM confidence)

30 permits contain historic-related text in descriptions. Text patterns found:

- `"historic admin approval"` - explicit approval reference
- `"approved by Historic"` / `"APPROVED BY HISTORICAL"` - past-tense approval
- `"per historical department requirements/specs"` - compliance
- `"Historic approval final inspection"` - inspection reference
- `"Approval not needed from the Historic Department"` - negative (exempt)
- `"NO HISTORIC LETTER"` - explicitly not historic

---

## Inspection Status Breakdown (674 historic inspections)

| Status | Count | Meaning |
|--------|-------|---------|
| Passed | 480 | Historic inspection completed successfully |
| Re-inspection required | 111 | Failed, needs re-inspection |
| Canceled | 55 | Inspection was canceled |
| pm - Re-inspection required (with fee) | 23 | Failed with fee for re-inspection |
| Scheduled | 2 | Upcoming |
| Partial Pass | 2 | Partially passed |
| Requested | 1 | Requested, not yet scheduled |

---

## Permit Types That Require Historic Inspection

Based on 410 permits found in both tables:

| Permit Type | Count |
|-------------|-------|
| Residential Express- Re-roof | 98 |
| Building (Residential) Additions - Addition | 72 |
| Alterations with Exterior Changes to Single Family Detached | 40 |
| Other Remodel with Exterior Changes to Commercial Building | 27 |
| Residential Express- Window/Door Replacement | 27 |
| Residential Fence | 18 |
| Residential Wall | 17 |
| New Single Family Detached Dwelling Unit | 16 |
| Commercial Express- Re-roof | 16 |
| New Accessory Dwelling Unit | 10 |
| All others | 69 |

---

## District Correlation

Historic inspections strongly correlate with Council Districts 1 and 2 (downtown/historic core):

| District | Historic Permits | Total Permits | % Historic |
|----------|-----------------|---------------|-----------|
| Council District 1 | 171 | 4,524 | 3.8% |
| Council District 2 | 220 | 3,403 | 6.5% |
| Council District 3 | 3 | 1,477 | 0.2% |
| Council District 4 | 4 | 3,060 | 0.1% |

---

## Proposed Schema for Evidence Fields

```sql
-- Derived per-permit historic status (computed from inspections table)
-- No new scraping required for this view

CREATE VIEW historic_permit_status AS
SELECT 
    p.permit_id,
    p.permit_number,
    p.permit_type,
    p.status AS permit_status,
    p.address,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM inspections i 
            WHERE json_extract(i.raw_json, '$.EntityID') = p.permit_id
            AND i.inspection_type LIKE '%Historic%'
        ) THEN 1 ELSE 0
    END AS is_historic_project,
    
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM inspections i 
            WHERE json_extract(i.raw_json, '$.EntityID') = p.permit_id
            AND i.inspection_type = 'Historic Final'
            AND i.status = 'Passed'
        ) THEN 'passed'
        WHEN EXISTS (
            SELECT 1 FROM inspections i 
            WHERE json_extract(i.raw_json, '$.EntityID') = p.permit_id
            AND i.inspection_type = 'Historic Final'
            AND i.status IN ('Re-inspection required', 'pm - Re-inspection required (with fee)')
        ) THEN 'failed'
        WHEN EXISTS (
            SELECT 1 FROM inspections i 
            WHERE json_extract(i.raw_json, '$.EntityID') = p.permit_id
            AND i.inspection_type = 'Historic Interim'
        ) THEN 'interim_only'
        WHEN EXISTS (
            SELECT 1 FROM inspections i 
            WHERE json_extract(i.raw_json, '$.EntityID') = p.permit_id
            AND i.inspection_type = 'Special Inspection - Historic'
        ) THEN 'special_only'
        ELSE 'unknown'
    END AS historic_approval_status,
    
    (SELECT COUNT(*) FROM inspections i 
     WHERE json_extract(i.raw_json, '$.EntityID') = p.permit_id
     AND i.inspection_type LIKE '%Historic%'
    ) AS historic_inspection_count
FROM permits p;
```

**Proposed export fields for `permits.json`:**

| Field | Type | Source |
|-------|------|--------|
| `is_historic` | boolean | inspection_type match |
| `historic_status` | enum: `passed`, `failed`, `interim_only`, `special_only`, `pending` | inspection status logic |
| `historic_inspection_count` | number | count of historic inspections |
| `historic_final_date` | string/null | most recent Historic Final date |

---

## Gaps Requiring Additional Work

### Gap 1: Missing 88 permits (LOW priority)

88 entity IDs have historic inspections but no corresponding row in `permits` table. These permits were not enriched (likely discovered during scrape days where their EntityID appeared but `permit_detail` was not fetched due to errors or limits). Fix: re-run enrichment.

### Gap 2: Plan/Pre-Application History (MEDIUM priority)

Only 7 Plan-type entities are in the DB. There are likely hundreds of "Pre-Application - Historic Inquiry" plans in EnerGov that would provide formal approval records. To capture these:
- Add a plan search/discovery phase to the scraper
- Or link permits to plans via address/parcel matching

### Gap 3: Entity Inspections for "Required" Signal (LOW priority for dashboard)

The `entity_inspections` endpoint confirms real-time "still required" status, but this requires a live API call per permit. For the dashboard:
- A permit with Historic Final `Passed` = approved
- A permit with Historic Final `Re-inspection required` or no final = still pending
- This logic can be computed from the DB without live API calls

### Gap 4: District as Proxy (NOT recommended alone)

While Districts 1 and 2 have the vast majority of historic projects, district alone is NOT a reliable indicator (96.2% of D1 permits and 93.5% of D2 permits are NOT historic).

---

## Confidence Levels

| Signal | Confidence | Actionable Today? |
|--------|-----------|-------------------|
| `inspection_type LIKE '%Historic%'` | HIGH (definitive) | YES |
| Historic Final status = Passed | HIGH (definitive) | YES |
| `entity_inspections` shows Historic Final pending | HIGH (live) | YES (with API call) |
| Description text keywords | MEDIUM (heuristic) | YES (supplement only) |
| Plan type = "Historic Inquiry" | HIGH (definitive) | NO (insufficient data scraped) |
| District 1 or 2 | LOW (correlation only) | NO (too many false positives) |

---

## Recommendation

**The dashboard CAN safely expose historic project data today** using the `inspections` table joined to `permits` via EntityID. The core logic:

1. A permit **is historic** if it has any inspection with `inspection_type` containing "Historic"
2. A permit **has passed historic approval** if it has a `Historic Final` with `status = 'Passed'`
3. A permit **requires historic inspection** if it has historic inspections but none with Final Passed (or if `entity_inspections` endpoint shows Historic Final pending)
4. **Active projects with historic requirements** = permits in `Issued`/`Fees Paid`/`Fees Due` status that are historic but don't yet have Historic Final Passed

**No additional scrape pass is required** to implement the basic historic view. The 410 matched permits provide a solid foundation. Enriching the 88 missing permits and adding plan discovery are enhancements for later.
