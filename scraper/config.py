import os

BASE_URL = "https://santafenm-energovpub.tylerhost.net/apps/selfservice"
TENANT_NAME = "SantaFeNMProd"
TENANT_ID = 1

HEADERS = {
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json;charset=UTF-8",
    "tenantid": str(TENANT_ID),
    "tenantname": TENANT_NAME,
    "tyler-tenanturl": TENANT_NAME,
    "tyler-tenant-culture": "en-US",
}

PAGE_SIZE = 100
REQUEST_DELAY_SECONDS = 1.5
DEFAULT_SCRAPE_DAYS = 365

_SCRAPER_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(_SCRAPER_DIR, "santa_fe_land_use.db")


def to_energov_date(iso_date: str) -> str:
    """Convert 'YYYY-MM-DD' to the ISO format EnerGov expects."""
    return f"{iso_date}T06:00:00.000Z"


# Module IDs used by the entity sub-record endpoints
MODULE_IDS = {
    "Permit": 1,
    "Plan": 2,
    "Code": 3,
    "Request": 4,
    "Application": 6,
    "Inspection": 7,
    "BusinessLicense": 8,
    "BusinessEntity": 9,
    "Cashier": 10,
    "ProfLicense": 11,
    "NONE": 0,
}

# ──────────────────────────────────────────────────────────────────
# API endpoint paths (relative to BASE_URL + "/api")
# No trailing slashes — the server is sensitive to them.
# ──────────────────────────────────────────────────────────────────

ENDPOINTS = {
    "tenants":              "/Home/GetTenants",
    "permit_setup":         "/energov/permits/search/setup",
    "menu":                 "/Home/MenuWithSubRecordsData",

    "todays_inspections":   "/energov/inspections/todaysinspections/",

    "permit_detail":        "/energov/permits/",
    "plan_detail":          "/energov/plans/",
    "code_case_detail":     "/energov/codecases/",
    "license_detail":       "/energov/licenses/",
    "inspection_detail":    "/energov/inspections/",

    "entity_fees":          "/energov/entity/fees/search",
    "entity_inspections":   "/energov/entity/inspections/search/search",
    "entity_contacts":      "/energov/entity/contacts/search/search",
    "entity_violations":    "/energov/entity/violations/search",
}
