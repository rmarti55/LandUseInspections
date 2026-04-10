"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { FeeSummary } from "../types";

export default function FeesSummaryChart({ fees }: { fees: FeeSummary[] }) {
  const top15 = fees.slice(0, 15);

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-1">Fees Collected</h2>
      <p className="text-sm text-gray-500 mb-4">Top fee types by total amount</p>

      {top15.length === 0 ? (
        <p className="text-gray-400 text-center py-8">No data yet</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={Math.max(250, top15.length * 28)}>
            <BarChart data={top15} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="number"
                tick={{ fontSize: 12 }}
                tickFormatter={(v) =>
                  v >= 1_000_000
                    ? `$${(v / 1_000_000).toFixed(1)}M`
                    : v >= 1_000
                      ? `$${(v / 1_000).toFixed(0)}K`
                      : `$${v}`
                }
              />
              <YAxis
                dataKey="fee_name"
                type="category"
                width={190}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value) => [`$${Number(value).toLocaleString()}`, "Total"]}
              />
              <Bar dataKey="total" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <div className="overflow-x-auto mt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">Fee</th>
                  <th className="px-3 py-2 font-medium text-right">Count</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2 font-medium text-right">Average</th>
                </tr>
              </thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.fee_name} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2">{f.fee_name}</td>
                    <td className="px-3 py-2 text-right">{f.count.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      ${f.total.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      ${Math.round(f.average).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
