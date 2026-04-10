"""
Probe the EnerGov todaysinspections API to find the earliest and latest
dates that return inspection data, using binary search to minimise requests.
"""

import sys
import time
from datetime import date, timedelta

import requests

import config


def count_inspections(session: requests.Session, target: date) -> int:
    """Return TotalFound for a single date without storing anything."""
    url = f"{config.BASE_URL}/api{config.ENDPOINTS['todays_inspections']}"
    body = {
        "ExcludeCompleted": False,
        "IsSortedInAscendingOrder": True,
        "PageNumber": 1,
        "PageSize": 1,
        "ScheduledDate": config.to_energov_date(target.isoformat()),
        "ScheduledDateShow": target.strftime("%m/%d/%Y"),
        "SortField": "",
        "EntityId": "",
        "ModuleId": 0,
        "Keyword": "",
        "ExactMatch": False,
    }
    r = session.post(url, json=body, timeout=60)
    r.raise_for_status()
    return r.json().get("TotalFound", 0)


def probe(session: requests.Session, target: date) -> int:
    """Probe a date and print progress."""
    time.sleep(config.REQUEST_DELAY_SECONDS)
    n = count_inspections(session, target)
    print(f"  Probing {target.isoformat()}... {n} results")
    return n


def binary_search_earliest(session: requests.Session, lo: date, hi: date) -> date:
    """
    Find the approximate earliest date with data between lo (no data
    expected) and hi (data expected).  Returns a date within ~7 days of
    the true boundary.
    """
    while (hi - lo).days > 7:
        mid = lo + (hi - lo) / 2
        if probe(session, mid) > 0:
            hi = mid
        else:
            lo = mid
    return lo


def sweep_days(session: requests.Session, start: date, end: date) -> date | None:
    """Walk forward day-by-day and return the first date with results."""
    d = start
    while d <= end:
        if probe(session, d) > 0:
            return d
        d += timedelta(days=1)
    return None


def main() -> None:
    session = requests.Session()
    session.headers.update(config.HEADERS)

    today = date.today()
    far_back = date(2010, 1, 1)

    # ------------------------------------------------------------------
    # 1. Confirm today/yesterday has data (find a known-good recent date)
    # ------------------------------------------------------------------
    print("Finding a recent date with data...")
    recent_good = None
    for offset in range(0, 14):
        d = today - timedelta(days=offset)
        if probe(session, d) > 0:
            recent_good = d
            break

    if recent_good is None:
        print("ERROR: No inspection data found in the last 14 days.")
        sys.exit(1)

    print(f"  -> Most recent date with data: {recent_good.isoformat()}\n")

    # ------------------------------------------------------------------
    # 2. Confirm far-back date has NO data (sanity check)
    # ------------------------------------------------------------------
    print(f"Checking that {far_back.isoformat()} has no data...")
    if probe(session, far_back) > 0:
        print("Surprisingly, 2010-01-01 has data! Trying 2005-01-01...")
        far_back = date(2005, 1, 1)
        if probe(session, far_back) > 0:
            print("Data goes back to at least 2005. Cannot determine start.")
            sys.exit(0)
    print()

    # ------------------------------------------------------------------
    # 3. Binary search to narrow the boundary to a ~7-day window
    # ------------------------------------------------------------------
    print("Binary searching for earliest inspection data...")
    boundary_lo = binary_search_earliest(session, far_back, recent_good)
    boundary_hi = boundary_lo + timedelta(days=8)
    print(f"  -> Boundary is between {boundary_lo.isoformat()} and {boundary_hi.isoformat()}\n")

    # ------------------------------------------------------------------
    # 4. Day-by-day sweep to pinpoint the exact first date
    # ------------------------------------------------------------------
    print("Sweeping day-by-day to find exact earliest date...")
    earliest = sweep_days(session, boundary_lo, boundary_hi)

    if earliest is None:
        earliest = boundary_hi
        print(f"  (no hit in sweep window; using {earliest.isoformat()})")

    # ------------------------------------------------------------------
    # 5. Report
    # ------------------------------------------------------------------
    span = recent_good - earliest
    years = span.days // 365
    months = (span.days % 365) // 30

    print()
    print("=" * 55)
    print(f"  Earliest date with inspection data: {earliest.isoformat()}")
    print(f"  Latest date with inspection data:   {recent_good.isoformat()}")
    print(f"  Data spans approximately {years} years, {months} months")
    print("=" * 55)


if __name__ == "__main__":
    main()
