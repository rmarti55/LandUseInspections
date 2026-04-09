"""
Batch geocode permit addresses using the US Census Geocoder API.

Free, no API key required. Processes addresses one at a time with
rate limiting to be polite to the service.

Usage:
    python geocode.py              # geocode all un-geocoded permits
    python geocode.py --limit 50   # only do 50
    python geocode.py --force      # re-geocode everything
"""

import argparse
import logging
import re
import time
import urllib.parse

import requests

from config import DB_PATH
from models import get_connection, migrate_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

CENSUS_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
DELAY = 0.5


def clean_address(raw: str) -> str:
    """Normalize EnerGov address strings for the geocoder."""
    addr = raw.replace("\r\n", ", ").replace("\n", ", ")
    addr = re.sub(r"\s+", " ", addr).strip()
    addr = re.sub(r",\s*,", ",", addr)
    if "Santa Fe" not in addr and "NM" not in addr:
        addr += ", Santa Fe, NM"
    return addr


def geocode_one(address: str) -> tuple[float | None, float | None]:
    """Return (lat, lng) or (None, None)."""
    params = {
        "address": address,
        "benchmark": "Public_AR_Current",
        "format": "json",
    }
    try:
        r = requests.get(CENSUS_URL, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
        matches = data.get("result", {}).get("addressMatches", [])
        if matches:
            coords = matches[0]["coordinates"]
            return coords["y"], coords["x"]
    except Exception as exc:
        log.debug("Geocode failed for %s: %s", address, exc)
    return None, None


def main():
    parser = argparse.ArgumentParser(description="Geocode permit addresses")
    parser.add_argument("--limit", type=int, default=0,
                        help="Max addresses to geocode (0 = all)")
    parser.add_argument("--force", action="store_true",
                        help="Re-geocode already geocoded addresses")
    parser.add_argument("--db", default=DB_PATH)
    args = parser.parse_args()

    migrate_db(args.db)
    conn = get_connection(args.db)

    where = "" if args.force else "WHERE latitude IS NULL"
    rows = conn.execute(
        f"SELECT permit_id, address FROM permits {where}"
    ).fetchall()

    if args.limit:
        rows = rows[:args.limit]

    total = len(rows)
    if not total:
        log.info("Nothing to geocode.")
        return

    log.info("Geocoding %d addresses …", total)
    success = 0
    for i, row in enumerate(rows, 1):
        raw = row["address"]
        if not raw:
            continue
        addr = clean_address(raw)
        lat, lng = geocode_one(addr)
        if lat is not None:
            conn.execute(
                "UPDATE permits SET latitude=?, longitude=? WHERE permit_id=?",
                (lat, lng, row["permit_id"]),
            )
            success += 1

        if i % 25 == 0:
            conn.commit()
            log.info("  %d / %d  (%.0f%% matched)", i, total, success / i * 100)

        time.sleep(DELAY)

    conn.commit()
    conn.close()
    log.info("Done: %d / %d geocoded (%.0f%%)", success, total, success / total * 100)


if __name__ == "__main__":
    main()
