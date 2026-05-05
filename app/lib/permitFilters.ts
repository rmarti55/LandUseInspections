import type {
  Permit,
  PermitKind,
  PermitSector,
  PermitType,
  TimelinePoint,
} from "../types";

export type SectorFilter = "all" | "commercial" | "residential";
export type KindFilter = "all" | "construction" | "trade" | "other";

function sectorOf(p: Permit): string {
  return p.sector ?? "unknown";
}

function kindOf(p: Permit): string {
  return p.permit_kind ?? "unknown";
}

function isOtherKind(k: string): boolean {
  return ["site_civil", "compliance", "other", "unknown"].includes(k);
}

export function matchesPermitFilters(
  p: Permit,
  sector: SectorFilter,
  kind: KindFilter
): boolean {
  if (sector === "commercial" && sectorOf(p) !== "commercial") return false;
  if (
    sector === "residential" &&
    sectorOf(p) !== "residential" &&
    sectorOf(p) !== "multi_family"
  ) {
    return false;
  }
  if (kind === "construction" && kindOf(p) !== "construction") return false;
  if (kind === "trade" && kindOf(p) !== "trade") return false;
  if (kind === "other" && !isOtherKind(kindOf(p))) return false;
  return true;
}

export function filterPermits(
  permits: Permit[],
  sector: SectorFilter,
  kind: KindFilter
): Permit[] {
  return permits.filter((p) => matchesPermitFilters(p, sector, kind));
}

export function buildPermitsTimeline(permits: Permit[]): TimelinePoint[] {
  const byMonth = new Map<string, { count: number; total_valuation: number }>();
  for (const p of permits) {
    const d = p.apply_date;
    if (!d || d.length < 7) continue;
    const month = d.slice(0, 7);
    const cur = byMonth.get(month) ?? { count: 0, total_valuation: 0 };
    cur.count += 1;
    cur.total_valuation += Number(p.valuation) || 0;
    byMonth.set(month, cur);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      count: v.count,
      total_valuation: v.total_valuation,
    }));
}

export function aggregatePermitTypes(permits: Permit[]): PermitType[] {
  type Acc = {
    count: number;
    sumVal: number;
    sumDays: number;
    dayCount: number;
    sector?: PermitSector;
    permit_kind?: PermitKind;
  };
  const m = new Map<string, Acc>();

  function daysBetween(a: string, b: string): number | null {
    if (!a || !b) return null;
    const da = new Date(a.slice(0, 10)).getTime();
    const db = new Date(b.slice(0, 10)).getTime();
    if (Number.isNaN(da) || Number.isNaN(db) || db < da) return null;
    return (db - da) / (1000 * 60 * 60 * 24);
  }

  for (const p of permits) {
    const t = p.permit_type?.trim() || "Unknown";
    const cur = m.get(t) ?? { count: 0, sumVal: 0, sumDays: 0, dayCount: 0 };
    if (cur.count === 0) {
      if (p.sector) cur.sector = p.sector;
      if (p.permit_kind) cur.permit_kind = p.permit_kind;
    }
    cur.count += 1;
    cur.sumVal += Number(p.valuation) || 0;
    const days = daysBetween(p.apply_date, p.issue_date);
    if (days != null) {
      cur.sumDays += days;
      cur.dayCount += 1;
    }
    m.set(t, cur);
  }

  return [...m.entries()]
    .map(([permit_type, acc]) => ({
      permit_type,
      count: acc.count,
      avg_valuation: acc.count ? acc.sumVal / acc.count : 0,
      total_valuation: acc.sumVal,
      avg_days_to_issue: acc.dayCount ? acc.sumDays / acc.dayCount : 0,
      sector: acc.sector,
      permit_kind: acc.permit_kind,
    }))
    .sort((a, b) => b.count - a.count);
}

export function countByField(
  permits: Permit[],
  field: "sector" | "permit_kind"
): { name: string; count: number }[] {
  const tallies = new Map<string, number>();
  for (const p of permits) {
    const v = (field === "sector" ? sectorOf(p) : kindOf(p)) || "unknown";
    tallies.set(v, (tallies.get(v) ?? 0) + 1);
  }
  return [...tallies.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function permitMetrics(permits: Permit[]) {
  let totalValuation = 0;
  let geocoded = 0;
  for (const p of permits) {
    totalValuation += Number(p.valuation) || 0;
    if (p.latitude != null && p.longitude != null) geocoded += 1;
  }
  return {
    count: permits.length,
    totalValuation,
    geocoded,
  };
}
