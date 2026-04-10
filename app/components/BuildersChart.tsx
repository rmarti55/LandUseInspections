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
import { Builder } from "../types";

export default function BuildersChart({ builders }: { builders: Builder[] }) {
  const top20 = builders.slice(0, 20);

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-1">Top Builders</h2>
      <p className="text-sm text-gray-500 mb-4">By number of permits</p>

      {top20.length === 0 ? (
        <p className="text-gray-400 text-center py-8">No data yet</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={Math.max(300, top20.length * 28)}>
            <BarChart data={top20} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis
                dataKey="name"
                type="category"
                width={180}
                tick={{ fontSize: 11 }}
              />
              <Tooltip
                formatter={(value) => [Number(value).toLocaleString(), "Permits"]}
              />
              <Bar dataKey="permit_count" fill="#2563eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>

          <div className="overflow-x-auto mt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium text-right">Permits</th>
                  <th className="px-3 py-2 font-medium text-right">Total Valuation</th>
                </tr>
              </thead>
              <tbody>
                {top20.map((b, i) => (
                  <tr key={b.name} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{b.name}</td>
                    <td className="px-3 py-2 text-right">{b.permit_count}</td>
                    <td className="px-3 py-2 text-right">
                      {b.total_valuation
                        ? `$${b.total_valuation.toLocaleString()}`
                        : ""}
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
