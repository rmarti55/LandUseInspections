import type { Permit } from "../types";

export type LandUseCategory = "residential" | "commercial" | "other";

export type EffectiveDateSource = "issue_date" | "apply_date";

export interface EffectiveYear {
  year: number;
  source: EffectiveDateSource;
}

function parseYear(iso: string | null | undefined): number | null {
  if (iso == null || String(iso).trim() === "") return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCFullYear();
}

/** Prefer issue_date; fall back to apply_date. */
export function getEffectiveYear(permit: Permit): EffectiveYear | null {
  const issueY = parseYear(permit.issue_date);
  if (issueY !== null) return { year: issueY, source: "issue_date" };
  const applyY = parseYear(permit.apply_date);
  if (applyY !== null) return { year: applyY, source: "apply_date" };
  return null;
}

/**
 * Derive land-use bucket from permit naming. Multi-family is residential.
 * "Other" (certificates, grading, etc.) is excluded from the two map layers by default.
 */
export function classifyPermitLandUse(permit: Permit): LandUseCategory {
  const t = (permit.permit_type || "").toLowerCase();
  const w = (permit.work_class || "").toLowerCase();

  if (t.includes("commercial")) return "commercial";
  if (t.includes("residential")) return "residential";
  if (t.includes("single family") || t.includes("single-family"))
    return "residential";
  if (t.includes("multi-family") || t.includes("multi family"))
    return "residential";

  if (w.includes("commercial")) return "commercial";
  if (w.includes("single family") || w.includes("single-family"))
    return "residential";
  if (w.includes("multi family") || w.includes("multi-family"))
    return "residential";

  return "other";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0"))
      .join("")
  );
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Fill color by year within the global scale (residential: blue → green, commercial: orange → purple). */
export function yearFillColor(
  year: number,
  scaleMin: number,
  scaleMax: number,
  category: "residential" | "commercial",
): string {
  const t =
    scaleMax === scaleMin ? 0.5 : (year - scaleMin) / (scaleMax - scaleMin);
  const start =
    category === "residential"
      ? hexToRgb("#2563eb")
      : hexToRgb("#ea580c");
  const end =
    category === "residential"
      ? hexToRgb("#16a34a")
      : hexToRgb("#9333ea");
  return rgbToHex(
    lerp(start.r, end.r, t),
    lerp(start.g, end.g, t),
    lerp(start.b, end.b, t),
  );
}

/** Neutral gradient for non-residential/commercial pins (e.g. CoC). */
export function yearFillNeutral(
  year: number,
  scaleMin: number,
  scaleMax: number,
): string {
  const start = hexToRgb("#94a3b8");
  const end = hexToRgb("#1e293b");
  const t =
    scaleMax === scaleMin ? 0.5 : (year - scaleMin) / (scaleMax - scaleMin);
  return rgbToHex(
    lerp(start.r, end.r, t),
    lerp(start.g, end.g, t),
    lerp(start.b, end.b, t),
  );
}

/** Min/max issue-or-apply year for any permit (e.g. Certificates of Compliance on the map). */
export function dateYearExtent(permits: Permit[]): {
  minYear: number;
  maxYear: number;
} | null {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of permits) {
    const eff = getEffectiveYear(p);
    if (!eff) continue;
    minY = Math.min(minY, eff.year);
    maxY = Math.max(maxY, eff.year);
  }
  if (!Number.isFinite(minY)) return null;
  return { minYear: minY, maxYear: maxY };
}

export function landUseYearExtent(permits: Permit[]): {
  minYear: number;
  maxYear: number;
} | null {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of permits) {
    const cat = classifyPermitLandUse(p);
    if (cat !== "residential" && cat !== "commercial") continue;
    const eff = getEffectiveYear(p);
    if (!eff) continue;
    minY = Math.min(minY, eff.year);
    maxY = Math.max(maxY, eff.year);
  }
  if (!Number.isFinite(minY)) return null;
  return { minYear: minY, maxYear: maxY };
}
