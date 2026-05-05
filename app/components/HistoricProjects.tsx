"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { Project } from "../types";

type FilterMode = "all" | "historic" | "non-historic";
type SuffixBucket = "building" | "other";

const BUILDING_SUFFIXES = new Set(["BLDR", "BLDC", "ADDR"]);
const OTHER_SUFFIXES = new Set(["EXPR", "EXTR", "EXPC", "WALR", "INTR", "WALC", "MFHM", "FDDS"]);

function normalizeISODay(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const t = Date.parse(`${day}T12:00:00`);
  if (Number.isNaN(t)) return null;
  return day;
}

function formatDayForDisplay(isoDay: string): string {
  return new Date(`${isoDay}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Min/max of valid calendar days; null if no valid dates. */
function formatDateSpan(dates: (string | null | undefined)[]): { min: string; max: string } | null {
  const days = dates
    .map(normalizeISODay)
    .filter((d): d is string => d !== null);
  if (days.length === 0) return null;
  const sorted = [...days].sort();
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  return { min: formatDayForDisplay(first), max: formatDayForDisplay(last) };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function buildDurationBuckets(projects: Project[]) {
  const buckets = [
    { label: "0-30d", min: 0, max: 30 },
    { label: "31-90d", min: 31, max: 90 },
    { label: "91-180d", min: 91, max: 180 },
    { label: "181-365d", min: 181, max: 365 },
    { label: "1-2yr", min: 366, max: 730 },
    { label: "2yr+", min: 731, max: Infinity },
  ];

  return buckets.map((b) => {
    const hist = projects.filter(
      (p) =>
        p.is_historic &&
        p.duration_days !== null &&
        p.duration_days >= b.min &&
        p.duration_days <= b.max
    ).length;
    const nonHist = projects.filter(
      (p) =>
        !p.is_historic &&
        p.duration_days !== null &&
        p.duration_days >= b.min &&
        p.duration_days <= b.max
    ).length;
    return { name: b.label, historic: hist, nonHistoric: nonHist };
  });
}

export default function HistoricProjects({ projects }: { projects: Project[] }) {
  const [filter, setFilter] = useState<FilterMode>("all");
  const [suffixBucket, setSuffixBucket] = useState<SuffixBucket>("building");
  const [sortCol, setSortCol] = useState<string>("duration_days");
  const [sortAsc, setSortAsc] = useState(false);

  const bucketProjects = useMemo(() => {
    const targetSuffixes = suffixBucket === "building" ? BUILDING_SUFFIXES : OTHER_SUFFIXES;
    return projects.filter((p) =>
      p.permit_suffixes?.some((s) => targetSuffixes.has(s))
    );
  }, [projects, suffixBucket]);

  const historic = useMemo(() => bucketProjects.filter((p) => p.is_historic), [bucketProjects]);
  const nonHistoric = useMemo(() => bucketProjects.filter((p) => !p.is_historic), [bucketProjects]);

  const dateCoverage = useMemo(() => {
    const issueSpan = formatDateSpan(bucketProjects.map((p) => p.first_issue_date));
    const finalSpan = formatDateSpan(bucketProjects.map((p) => p.final_inspection_date));
    return { issueSpan, finalSpan };
  }, [bucketProjects]);

  const stats = useMemo(() => {
    const histDurations = historic
      .map((p) => p.duration_days)
      .filter((d): d is number => d !== null && d >= 0);
    const nonHistDurations = nonHistoric
      .map((p) => p.duration_days)
      .filter((d): d is number => d !== null && d >= 0);

    const histOpen = historic.filter((p) => p.is_open);
    const nonHistOpen = nonHistoric.filter((p) => p.is_open);

    const histOpenAges = histOpen
      .map((p) => daysSince(p.first_issue_date))
      .filter((d): d is number => d !== null);
    const nonHistOpenAges = nonHistOpen
      .map((p) => daysSince(p.first_issue_date))
      .filter((d): d is number => d !== null);

    return {
      total: bucketProjects.length,
      historicCount: historic.length,
      nonHistoricCount: nonHistoric.length,
      medianHistoric: median(histDurations),
      medianNonHistoric: median(nonHistDurations),
      meanHistoric: histDurations.length
        ? Math.round(histDurations.reduce((a, b) => a + b, 0) / histDurations.length)
        : 0,
      meanNonHistoric: nonHistDurations.length
        ? Math.round(nonHistDurations.reduce((a, b) => a + b, 0) / nonHistDurations.length)
        : 0,
      histOpenCount: histOpen.length,
      nonHistOpenCount: nonHistOpen.length,
      histOpenPct: historic.length
        ? Math.round((histOpen.length / historic.length) * 100)
        : 0,
      nonHistOpenPct: nonHistoric.length
        ? Math.round((nonHistOpen.length / nonHistoric.length) * 100)
        : 0,
      histOpenAvgAge: histOpenAges.length
        ? Math.round(histOpenAges.reduce((a, b) => a + b, 0) / histOpenAges.length)
        : 0,
      nonHistOpenAvgAge: nonHistOpenAges.length
        ? Math.round(nonHistOpenAges.reduce((a, b) => a + b, 0) / nonHistOpenAges.length)
        : 0,
    };
  }, [bucketProjects, historic, nonHistoric]);

  const durationBuckets = useMemo(() => buildDurationBuckets(bucketProjects), [bucketProjects]);

  const filteredProjects = useMemo(() => {
    let list = bucketProjects;
    if (filter === "historic") list = historic;
    else if (filter === "non-historic") list = nonHistoric;
    return [...list].sort((a, b) => {
      let av: string | number | null = null;
      let bv: string | number | null = null;
      switch (sortCol) {
        case "address":
          av = a.normalized_address;
          bv = b.normalized_address;
          break;
        case "permit_count":
          av = a.permit_count;
          bv = b.permit_count;
          break;
        case "first_issue_date":
          av = a.first_issue_date || "";
          bv = b.first_issue_date || "";
          break;
        case "final_inspection_date":
          av = a.final_inspection_date || "";
          bv = b.final_inspection_date || "";
          break;
        case "duration_days":
          av = a.duration_days ?? 999999;
          bv = b.duration_days ?? 999999;
          break;
        case "valuation":
          av = a.total_valuation;
          bv = b.total_valuation;
          break;
        default:
          av = a.duration_days ?? 999999;
          bv = b.duration_days ?? 999999;
      }
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av < bv) return sortAsc ? -1 : 1;
      if (av > bv) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [bucketProjects, historic, nonHistoric, filter, sortCol, sortAsc]);

  function handleSort(col: string) {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  }

  if (projects.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        No project data available. Run the export to generate projects.json.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card px-4 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Show:</span>
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setSuffixBucket("building")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                suffixBucket === "building"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Building Projects
            </button>
            <button
              type="button"
              onClick={() => setSuffixBucket("other")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-l border-gray-200 ${
                suffixBucket === "other"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Other Construction
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          {suffixBucket === "building" ? (
            <>
              <span className="font-medium text-gray-700">Building Projects</span>{" "}
              — new builds, additions, and remodels (BLDR, BLDC, ADDR).
            </>
          ) : (
            <>
              <span className="font-medium text-gray-700">Other Construction</span>{" "}
              — express permits, exterior/interior work, walls, manufactured housing
              (EXPR, EXTR, EXPC, WALR, INTR, WALC, MFHM, FDDS).
            </>
          )}
        </p>
        {dateCoverage.issueSpan ? (
          <p className="text-xs text-gray-500 leading-relaxed">
            <span className="font-medium text-gray-700">First permit issued</span>
            {" — "}
            earliest to latest in this view: {dateCoverage.issueSpan.min} –{" "}
            {dateCoverage.issueSpan.max}.
          </p>
        ) : (
          <p className="text-xs text-gray-500 leading-relaxed">
            <span className="font-medium text-gray-700">First permit issued</span>
            {" — "}
            no issue dates in this cohort.
          </p>
        )}
        {dateCoverage.finalSpan ? (
          <p className="text-xs text-gray-500 leading-relaxed">
            <span className="font-medium text-gray-700">Final inspection</span>
            {" "}
            (closed projects only) — earliest to latest recorded: {dateCoverage.finalSpan.min} –{" "}
            {dateCoverage.finalSpan.max}.
          </p>
        ) : (
          <p className="text-xs text-gray-500 leading-relaxed">
            <span className="font-medium text-gray-700">Final inspection</span>
            {" "}
            (closed projects only) — none recorded in this cohort.
          </p>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <p className="text-3xl font-bold text-gray-900">{stats.total.toLocaleString()}</p>
          <p className="text-sm text-gray-500 mt-1">Total Projects</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-amber-700">{stats.historicCount.toLocaleString()}</p>
          <p className="text-sm text-gray-500 mt-1">Historic</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-blue-700">{stats.medianHistoric}d</p>
          <p className="text-sm text-gray-500 mt-1">Median Duration (Historic)</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-gray-700">{stats.medianNonHistoric}d</p>
          <p className="text-sm text-gray-500 mt-1">Median Duration (Non-Historic)</p>
        </div>
      </div>

      {/* Duration Comparison Chart */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-2">Project Duration Distribution</h2>
        <p className="text-sm text-gray-500 mb-4">
          Days from first permit issued to final inspection passed. Historic mean:{" "}
          <span className="font-medium text-amber-700">{stats.meanHistoric}d</span> vs
          non-historic mean:{" "}
          <span className="font-medium text-gray-700">{stats.meanNonHistoric}d</span>
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={durationBuckets} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="historic" name="Historic" fill="#d97706" radius={[4, 4, 0, 0]} />
            <Bar dataKey="nonHistoric" name="Non-Historic" fill="#6b7280" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Open Projects Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="text-base font-semibold text-amber-800 mb-3">
            Historic — Open Projects
          </h3>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-amber-700">{stats.histOpenCount}</p>
              <p className="text-xs text-gray-500">Open ({stats.histOpenPct}%)</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-700">{stats.histOpenAvgAge}d</p>
              <p className="text-xs text-gray-500">Avg Age (days open)</p>
            </div>
          </div>
        </div>
        <div className="card">
          <h3 className="text-base font-semibold text-gray-700 mb-3">
            Non-Historic — Open Projects
          </h3>
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-gray-700">{stats.nonHistOpenCount}</p>
              <p className="text-xs text-gray-500">Open ({stats.nonHistOpenPct}%)</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-700">{stats.nonHistOpenAvgAge}d</p>
              <p className="text-xs text-gray-500">Avg Age (days open)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Projects Table */}
      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold">Projects</h2>
          <div className="flex gap-2">
            {(["all", "historic", "non-historic"] as FilterMode[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === f
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {f === "all" ? "All" : f === "historic" ? "Historic" : "Non-Historic"}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <Th col="address" current={sortCol} asc={sortAsc} onSort={handleSort}>
                  Address
                </Th>
                <th className="px-3 py-2 font-medium">Type</th>
                <Th col="permit_count" current={sortCol} asc={sortAsc} onSort={handleSort}>
                  Permits
                </Th>
                <Th col="first_issue_date" current={sortCol} asc={sortAsc} onSort={handleSort}>
                  First Issued
                </Th>
                <Th col="final_inspection_date" current={sortCol} asc={sortAsc} onSort={handleSort}>
                  Final Insp.
                </Th>
                <Th col="duration_days" current={sortCol} asc={sortAsc} onSort={handleSort}>
                  Duration
                </Th>
                <th className="px-3 py-2 font-medium">Status</th>
                <Th col="valuation" current={sortCol} asc={sortAsc} onSort={handleSort}>
                  Valuation
                </Th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.slice(0, 200).map((p) => (
                <tr
                  key={p.normalized_address}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-3 py-2 font-medium text-gray-900 max-w-[200px] truncate">
                    {p.normalized_address}
                  </td>
                  <td className="px-3 py-2">
                    {p.is_historic ? (
                      <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-800">
                        Historic
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                        Standard
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">{p.permit_count}</td>
                  <td className="px-3 py-2 text-gray-600">{p.first_issue_date || "—"}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {p.final_inspection_date || "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {p.duration_days !== null ? `${p.duration_days}d` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {p.is_open ? (
                      <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
                        Open
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                        Closed
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-600">
                    {p.total_valuation
                      ? `$${Math.round(p.total_valuation).toLocaleString()}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredProjects.length > 200 && (
            <p className="text-sm text-gray-400 text-center py-3">
              Showing 200 of {filteredProjects.length.toLocaleString()} projects
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Th({
  col,
  current,
  asc,
  onSort,
  children,
}: {
  col: string;
  current: string;
  asc: boolean;
  onSort: (col: string) => void;
  children: React.ReactNode;
}) {
  const active = current === col;
  return (
    <th
      className="px-3 py-2 font-medium cursor-pointer select-none hover:text-gray-900"
      onClick={() => onSort(col)}
    >
      {children}
      {active && <span className="ml-1">{asc ? "↑" : "↓"}</span>}
    </th>
  );
}
