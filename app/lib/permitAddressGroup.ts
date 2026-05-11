import type { Permit, PermitAddressGroup } from "../types";
import {
  classifyPermitLandUse,
  getEffectiveYear,
  type LandUseCategory,
} from "./permitCategory";

export const BUILDING_SUFFIXES = new Set(["BLDR", "BLDC", "ADDR"]);
export const OTHER_SUFFIXES = new Set([
  "EXPR", "EXTR", "EXPC", "WALR", "INTR", "WALC", "MFHM", "FDDS",
]);

/** Extract the suffix code from a permit number like "2026-49601-BLDR" */
export function getPermitSuffix(p: Permit): string | null {
  const num = p.permit_number;
  if (!num) return null;
  const last = num.split("-").pop();
  if (!last || /^\d+$/.test(last)) return null;
  return last.toUpperCase();
}

function isGeocodedPermit(p: Permit): boolean {
  return (
    p.latitude != null &&
    p.longitude != null &&
    !Number.isNaN(p.latitude) &&
    !Number.isNaN(p.longitude)
  );
}

/**
 * Street-only normalization aligned with scraper/export `_normalize_address`
 * (uppercase, strip city tail, unit/suite tail).
 */
export function normalizeStreetAddress(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "NO_ADDRESS";
  let a = raw.replace(/\r\n/g, ", ").replace(/\n/g, ", ");
  a = a.replace(/\s+/g, " ").trim().toUpperCase();
  const idx = a.indexOf(" SANTA FE");
  if (idx >= 0) a = a.slice(0, idx).trim();
  a = a.replace(/\s*UNIT\/SUITE:.*$/i, "").trim();
  return a || "NO_ADDRESS";
}

/** Prefer parcel when present so slightly different address strings still collapse. */
export function permitLocationKey(p: Permit): string {
  const pn = p.parcel_number?.trim();
  if (pn) return `parcel:${pn.toUpperCase()}`;
  return `addr:${normalizeStreetAddress(p.address)}`;
}

function compareByApplyDesc(a: Permit, b: Permit): number {
  return (b.apply_date || "").localeCompare(a.apply_date || "");
}

function pickDisplayAddress(permits: Permit[]): string {
  let best = "";
  let bestLen = Infinity;
  for (const p of permits) {
    const raw = (p.address || "").replace(/\r\n/g, "\n").trim();
    if (!raw) continue;
    const firstLine = raw.split("\n")[0].trim();
    if (firstLine.length < bestLen) {
      bestLen = firstLine.length;
      best = firstLine;
    }
  }
  if (best) return best;
  const f = permits[0];
  return f?.address?.replace(/\r\n/g, "\n").trim() || "Address unknown";
}

export function buildPermitAddressGroups(permits: Permit[]): PermitAddressGroup[] {
  const by = new Map<string, Permit[]>();
  for (const p of permits) {
    if (!isGeocodedPermit(p)) continue;
    const k = permitLocationKey(p);
    let arr = by.get(k);
    if (!arr) {
      arr = [];
      by.set(k, arr);
    }
    arr.push(p);
  }

  const groups: PermitAddressGroup[] = [];
  for (const [id, plist] of by) {
    let latSum = 0;
    let lngSum = 0;
    let n = 0;
    for (const p of plist) {
      if (p.latitude != null && p.longitude != null) {
        latSum += p.latitude;
        lngSum += p.longitude;
        n += 1;
      }
    }
    if (!n) continue;
    const sorted = [...plist].sort(compareByApplyDesc);
    groups.push({
      id,
      displayAddress: pickDisplayAddress(sorted),
      latitude: latSum / n,
      longitude: lngSum / n,
      permits: sorted,
    });
  }
  return groups;
}

export function maxEffectiveYearInCategory(
  permits: Permit[],
  category: LandUseCategory,
): number | null {
  let max: number | null = null;
  for (const p of permits) {
    if (classifyPermitLandUse(p) !== category) continue;
    const eff = getEffectiveYear(p);
    if (!eff) continue;
    if (max === null || eff.year > max) max = eff.year;
  }
  return max;
}

export function maxEffectiveYearWhere(
  permits: Permit[],
  pred: (p: Permit) => boolean,
): number | null {
  let max: number | null = null;
  for (const p of permits) {
    if (!pred(p)) continue;
    const eff = getEffectiveYear(p);
    if (!eff) continue;
    if (max === null || eff.year > max) max = eff.year;
  }
  return max;
}
