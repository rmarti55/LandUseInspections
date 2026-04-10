"use client";

import { Summary } from "../types";

const fmt = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
      ? `$${(n / 1_000).toFixed(0)}K`
      : `$${n.toFixed(0)}`;

export default function StatsCards({ data }: { data: Summary }) {
  const cards = [
    { label: "Total Inspections", value: data.inspections.toLocaleString(), icon: "🔍" },
    { label: "Total Permits", value: data.permits.toLocaleString(), icon: "📋" },
    { label: "Total Valuation", value: fmt(data.totalValuation), icon: "💰" },
    { label: "Total Fees Collected", value: fmt(data.totalFees), icon: "🏦" },
    { label: "Inspection Pass Rate", value: `${data.passRate}%`, icon: "✅" },
    { label: "Permits Mapped", value: data.geocoded.toLocaleString(), icon: "📍" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((c) => (
        <div key={c.label} className="card text-center">
          <div className="text-2xl mb-1">{c.icon}</div>
          <div className="text-2xl font-bold text-gray-900">{c.value}</div>
          <div className="text-xs text-gray-500 mt-1">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
