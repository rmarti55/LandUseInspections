"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Permit } from "../types";
import {
  aggregatePermitTypes,
  buildPermitsTimeline,
  countByField,
} from "../lib/permitFilters";

function shortMonth(m: string) {
  const [y, mo] = m.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[parseInt(mo) - 1]} '${y.slice(2)}`;
}

function formatSector(name: string): string {
  const labels: Record<string, string> = {
    commercial: "Commercial",
    residential: "Residential",
    multi_family: "Multi-family",
    unknown: "Unknown",
  };
  return labels[name] ?? name;
}

function formatKind(name: string): string {
  const labels: Record<string, string> = {
    construction: "Construction",
    trade: "Trade",
    site_civil: "Site / civil",
    compliance: "Compliance",
    other: "Other",
    unknown: "Unknown",
  };
  return labels[name] ?? name;
}

export default function TrendsCharts({ permits }: { permits: Permit[] }) {
  const timeline = useMemo(() => buildPermitsTimeline(permits), [permits]);
  const types = useMemo(() => aggregatePermitTypes(permits), [permits]);
  const sectorRows = useMemo(
    () =>
      countByField(permits, "sector").map((r) => ({
        ...r,
        label: formatSector(r.name),
      })),
    [permits]
  );
  const kindRows = useMemo(
    () =>
      countByField(permits, "permit_kind").map((r) => ({
        ...r,
        label: formatKind(r.name),
      })),
    [permits]
  );

  const top15 = types.slice(0, 15);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Permits Over Time</h2>
        {timeline.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="month"
                tickFormatter={shortMonth}
                tick={{ fontSize: 12 }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                labelFormatter={(label) => shortMonth(String(label))}
                formatter={(value) => [Number(value).toLocaleString(), "Permits"]}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#2563eb"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">By sector</h2>
        {sectorRows.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No data yet</p>
        ) : (
          <ResponsiveContainer
            width="100%"
            height={Math.max(220, sectorRows.length * 36)}
          >
            <BarChart data={sectorRows} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis
                dataKey="label"
                type="category"
                width={120}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value) => [Number(value).toLocaleString(), "Permits"]}
              />
              <Bar dataKey="count" fill="#7c3aed" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">By permit kind</h2>
        {kindRows.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No data yet</p>
        ) : (
          <ResponsiveContainer
            width="100%"
            height={Math.max(220, kindRows.length * 36)}
          >
            <BarChart data={kindRows} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis
                dataKey="label"
                type="category"
                width={130}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value) => [Number(value).toLocaleString(), "Permits"]}
              />
              <Bar dataKey="count" fill="#ea580c" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Permit types (top 15)</h2>
        {top15.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(300, top15.length * 28)}>
            <BarChart data={top15} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis
                dataKey="permit_type"
                type="category"
                width={200}
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                formatter={(value) => [Number(value).toLocaleString(), "Permits"]}
              />
              <Bar dataKey="count" fill="#16a34a" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {types.length > 0 && (
        <div className="card lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Permit type details</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Sector</th>
                  <th className="px-3 py-2 font-medium">Kind</th>
                  <th className="px-3 py-2 font-medium text-right">Count</th>
                  <th className="px-3 py-2 font-medium text-right">Avg Valuation</th>
                  <th className="px-3 py-2 font-medium text-right">Total Valuation</th>
                  <th className="px-3 py-2 font-medium text-right">Avg Days to Issue</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.permit_type} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2">{t.permit_type}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {t.sector ? formatSector(t.sector) : "—"}
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {t.permit_kind ? formatKind(t.permit_kind) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">{t.count}</td>
                    <td className="px-3 py-2 text-right">
                      {t.avg_valuation
                        ? `$${Math.round(t.avg_valuation).toLocaleString()}`
                        : ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {t.total_valuation
                        ? `$${Math.round(t.total_valuation).toLocaleString()}`
                        : ""}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {t.avg_days_to_issue ? `${t.avg_days_to_issue.toFixed(0)}d` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
