-- Run in Neon SQL Editor after sync to confirm counts and spot-check rows.
-- Compare with: python sync_sqlite_to_neon.py --dry-run

SELECT 'permits' AS tbl, COUNT(*)::bigint AS n FROM permits
UNION ALL SELECT 'plans', COUNT(*) FROM plans
UNION ALL SELECT 'inspections', COUNT(*) FROM inspections
UNION ALL SELECT 'code_cases', COUNT(*) FROM code_cases
UNION ALL SELECT 'licenses', COUNT(*) FROM licenses
UNION ALL SELECT 'fees', COUNT(*) FROM fees
UNION ALL SELECT 'contacts', COUNT(*) FROM contacts
UNION ALL SELECT 'todays_inspections', COUNT(*) FROM todays_inspections
UNION ALL SELECT 'scraped_calendar_days', COUNT(*) FROM scraped_calendar_days
UNION ALL SELECT 'enrichment_log', COUNT(*) FROM enrichment_log
ORDER BY tbl;

-- Sample newest permit by apply_date (text ISO dates sort correctly)
SELECT permit_id, permit_number, apply_date, address
FROM permits
WHERE apply_date IS NOT NULL AND apply_date <> ''
ORDER BY apply_date DESC NULLS LAST
LIMIT 3;
