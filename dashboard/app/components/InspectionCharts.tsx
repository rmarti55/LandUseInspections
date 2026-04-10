"use client";

import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { StatusCount, TimelinePoint } from "../types";

const COLORS = [
  "#16a34a",
  "#dc2626",
  "#2563eb",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#6b7280",
];

function shortMonth(m: string) {
  const [y, mo] = m.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(mo) - 1]} '${y.slice(2)}`;
}

export default function InspectionCharts({
  status,
  timeline,
}: {
  status: StatusCount[];
  timeline: TimelinePoint[];
}) {
  const total = status.reduce((s, d) => s + d.count, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Inspection Outcomes</h2>
        {status.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No data yet</p>
        ) : (
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={status}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label
                  labelLine
                >
                  {status.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => {
                    const n = Number(value);
                    return [`${n.toLocaleString()} (${((n / total) * 100).toFixed(1)}%)`, "Count"];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mt-2">
              {status.map((s, i) => (
                <div key={s.status} className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="text-gray-600">{s.status}</span>
                  <span className="font-medium ml-auto">{s.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Inspections Over Time</h2>
        {timeline.length === 0 ? (
          <p className="text-gray-400 text-center py-8">No data yet</p>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="month"
                tickFormatter={shortMonth}
                tick={{ fontSize: 12 }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                labelFormatter={(label) => shortMonth(String(label))}
                formatter={(value) => [Number(value).toLocaleString(), "Inspections"]}
              />
              <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
