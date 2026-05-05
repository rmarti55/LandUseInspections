"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type {
  DemographicAppendixData,
  DemographicMetricPoint,
  DemographicGeography,
  Permit,
} from "../types";

const GEO_COLORS: Record<DemographicGeography, string> = {
  urban_area: "#2563eb",
  historic_districts: "#dc2626",
};

const GEO_LABELS: Record<DemographicGeography, string> = {
  urban_area: "Urban Area",
  historic_districts: "Historic Districts",
};

const RACE_COLORS: Record<string, string> = {
  white: "#6366f1",
  latinx: "#f59e0b",
  native_american: "#10b981",
  asian: "#ec4899",
  black: "#8b5cf6",
  multiracial_other: "#6b7280",
};

const RACE_LABELS: Record<string, string> = {
  white: "White",
  latinx: "Latino/a",
  native_american: "Native American",
  asian: "Asian/PI",
  black: "Black",
  multiracial_other: "Other/Multi",
};

type Section =
  | "story"
  | "population"
  | "race"
  | "housing"
  | "income"
  | "costBurden"
  | "bridge"
  | "methodology";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "story", label: "The Story" },
  { id: "population", label: "Population" },
  { id: "race", label: "Race & Ethnicity" },
  { id: "housing", label: "Housing" },
  { id: "income", label: "Income & Poverty" },
  { id: "costBurden", label: "Cost Burden" },
  { id: "bridge", label: "Development Bridge" },
  { id: "methodology", label: "Methodology" },
];

function useMetric(
  metrics: DemographicMetricPoint[],
  metricName: string,
  unit?: string
) {
  return useMemo(() => {
    const filtered = metrics.filter(
      (m) => m.metric === metricName && (unit === undefined || m.unit === unit)
    );
    const years = [...new Set(filtered.map((m) => m.year))].sort();
    return years.map((year) => {
      const row: Record<string, number | string | null> = { year };
      for (const geo of ["urban_area", "historic_districts"] as const) {
        const pt = filtered.find(
          (m) => m.year === year && m.geography === geo
        );
        row[geo] = pt?.value ?? null;
      }
      return row;
    });
  }, [metrics, metricName, unit]);
}

function DualLineChart({
  data,
  unit,
  label,
}: {
  data: Record<string, number | string | null>[];
  unit: string;
  label: string;
}) {
  const fmt = (v: number) => {
    if (unit === "dollars") return `$${v.toLocaleString()}`;
    if (unit === "percent") return `${v}%`;
    return v.toLocaleString();
  };

  return (
    <div className="card">
      <h3 className="text-base font-semibold mb-3 text-gray-800">{label}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="year" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={fmt} />
          <Tooltip
            formatter={(value) => [fmt(Number(value)), label]}
            labelFormatter={(l) => `${l}`}
          />
          <Legend
            formatter={(value) =>
              GEO_LABELS[value as DemographicGeography] ?? value
            }
          />
          <Line
            type="monotone"
            dataKey="urban_area"
            stroke={GEO_COLORS.urban_area}
            strokeWidth={2}
            dot={{ r: 4 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="historic_districts"
            stroke={GEO_COLORS.historic_districts}
            strokeWidth={2}
            dot={{ r: 4 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DivergenceCard({
  label,
  uaStart,
  uaEnd,
  hdStart,
  hdEnd,
  unit,
}: {
  label: string;
  uaStart: number;
  uaEnd: number;
  hdStart: number;
  hdEnd: number;
  unit: string;
}) {
  const pctChange = (start: number, end: number) =>
    start === 0 ? null : Math.round(((end - start) / start) * 100);
  const uaPct = pctChange(uaStart, uaEnd);
  const hdPct = pctChange(hdStart, hdEnd);

  const fmt = (v: number) => {
    if (unit === "dollars") return `$${v.toLocaleString()}`;
    if (unit === "percent") return `${v}%`;
    return v.toLocaleString();
  };

  return (
    <div className="card flex flex-col gap-3">
      <h4 className="text-sm font-semibold text-gray-700">{label}</h4>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Urban Area
          </p>
          <p className="text-lg font-bold text-blue-700">
            {fmt(uaEnd)}
          </p>
          <p className="text-xs text-gray-500">
            from {fmt(uaStart)}{" "}
            {uaPct !== null && (
              <span
                className={uaPct >= 0 ? "text-green-600" : "text-red-600"}
              >
                ({uaPct > 0 ? "+" : ""}
                {uaPct}%)
              </span>
            )}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">
            Historic Districts
          </p>
          <p className="text-lg font-bold text-red-700">
            {fmt(hdEnd)}
          </p>
          <p className="text-xs text-gray-500">
            from {fmt(hdStart)}{" "}
            {hdPct !== null && (
              <span
                className={hdPct >= 0 ? "text-green-600" : "text-red-600"}
              >
                ({hdPct > 0 ? "+" : ""}
                {hdPct}%)
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function NoteCallout({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span className="font-semibold">Note: </span>
      {text}
    </div>
  );
}

export default function ContinuityConnection({
  data,
  permits,
}: {
  data: DemographicAppendixData;
  permits: Permit[];
}) {
  const [section, setSection] = useState<Section>("story");
  const { metrics, context } = data;

  const getVal = (metric: string, year: number, geo: DemographicGeography) =>
    metrics.find(
      (m) => m.metric === metric && m.year === year && m.geography === geo
    )?.value ?? 0;

  const populationData = useMetric(metrics, "total_population");
  const densityData = useMetric(metrics, "population_density");
  const incomeAdjData = useMetric(
    metrics,
    "median_household_income_2018_dollars"
  );
  const povertyRateData = useMetric(metrics, "poverty_rate");
  const vacancyRateData = useMetric(metrics, "vacancy_rate");
  const seasonalRateData = useMetric(metrics, "seasonal_vacancy_rate");
  const renterPctData = useMetric(metrics, "renter_occupied_pct");
  const ownerPctData = useMetric(metrics, "owner_occupied_pct");

  const latinxCountData = useMetric(metrics, "latinx_count");
  const whitePctData = useMetric(metrics, "white_pct");

  const raceStackedData = useMemo(() => {
    const years = [1980, 1990, 2000, 2010, 2018];
    const races = [
      "white",
      "latinx",
      "native_american",
      "asian",
      "black",
      "multiracial_other",
    ];
    return (geo: DemographicGeography) =>
      years.map((year) => {
        const row: Record<string, number | string> = { year };
        for (const race of races) {
          const pt = metrics.find(
            (m) =>
              m.metric === `${race}_pct` &&
              m.year === year &&
              m.geography === geo
          );
          row[race] = pt?.value ?? 0;
        }
        return row;
      });
  }, [metrics]);

  const costBurdenData = useMemo(() => {
    const years = [2000, 2010, 2018];
    return (prefix: "rent" | "owner", geo: DemographicGeography) =>
      years.map((year) => {
        const none =
          metrics.find(
            (m) =>
              m.metric === `${prefix}_no_burden_pct` &&
              m.year === year &&
              m.geography === geo
          )?.value ?? 0;
        const moderate =
          metrics.find(
            (m) =>
              m.metric === `${prefix}_moderate_burden_pct` &&
              m.year === year &&
              m.geography === geo
          )?.value ?? 0;
        const extreme =
          metrics.find(
            (m) =>
              m.metric === `${prefix}_extreme_burden_pct` &&
              m.year === year &&
              m.geography === geo
          )?.value ?? 0;
        return { year, none, moderate, extreme };
      });
  }, [metrics]);

  const permitsByYear = useMemo(() => {
    const counts: Record<number, number> = {};
    const vals: Record<number, number> = {};
    for (const p of permits) {
      const d = p.apply_date || p.issue_date;
      if (!d) continue;
      const y = parseInt(d.slice(0, 4));
      if (y >= 2000) {
        counts[y] = (counts[y] || 0) + 1;
        vals[y] = (vals[y] || 0) + (p.valuation || 0);
      }
    }
    return Object.keys(counts)
      .map(Number)
      .sort()
      .map((year) => ({
        year,
        count: counts[year],
        valuation: vals[year],
      }));
  }, [permits]);

  return (
    <div className="space-y-6">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap rounded-lg transition-colors ${
              section === s.id
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "story" && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Historic Districts Changed Differently Than Santa Fe Overall
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Between 1980 and 2018, the Santa Fe Urban Area grew rapidly while
              the Historic Districts experienced population loss, rising
              incomes, declining renter occupancy, and a dramatic increase in
              vacant and seasonal-use housing. These shifts tell a story of
              gentrification and changing character in the city&apos;s historic
              core.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <DivergenceCard
              label="Population"
              uaStart={getVal("total_population", 1980, "urban_area")}
              uaEnd={getVal("total_population", 2018, "urban_area")}
              hdStart={getVal("total_population", 1980, "historic_districts")}
              hdEnd={getVal("total_population", 2018, "historic_districts")}
              unit="count"
            />
            <DivergenceCard
              label="Median Income (2018$)"
              uaStart={getVal(
                "median_household_income_2018_dollars",
                1980,
                "urban_area"
              )}
              uaEnd={getVal(
                "median_household_income_2018_dollars",
                2018,
                "urban_area"
              )}
              hdStart={getVal(
                "median_household_income_2018_dollars",
                1980,
                "historic_districts"
              )}
              hdEnd={getVal(
                "median_household_income_2018_dollars",
                2018,
                "historic_districts"
              )}
              unit="dollars"
            />
            <DivergenceCard
              label="Vacancy Rate"
              uaStart={getVal("vacancy_rate", 1980, "urban_area")}
              uaEnd={getVal("vacancy_rate", 2018, "urban_area")}
              hdStart={getVal("vacancy_rate", 1980, "historic_districts")}
              hdEnd={getVal("vacancy_rate", 2018, "historic_districts")}
              unit="percent"
            />
            <DivergenceCard
              label="Latino Population"
              uaStart={getVal("latinx_count", 1980, "urban_area")}
              uaEnd={getVal("latinx_count", 2018, "urban_area")}
              hdStart={getVal("latinx_count", 1980, "historic_districts")}
              hdEnd={getVal("latinx_count", 2018, "historic_districts")}
              unit="count"
            />
          </div>

          {context.narrativeFindings.map((f) => (
            <div key={f.id} className="card">
              <h3 className="text-base font-semibold text-gray-800 mb-1">
                {f.title}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      )}

      {section === "population" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DualLineChart
              data={populationData}
              unit="count"
              label="Total Population"
            />
            <DualLineChart
              data={densityData}
              unit="count"
              label="Population Density (per sq mi)"
            />
          </div>
          <NoteCallout text={context.notes["block_estimation"]} />
        </div>
      )}

      {section === "race" && (
        <div className="space-y-6">
          <NoteCallout text={context.notes["race_definition_changes"]} />
          {(["urban_area", "historic_districts"] as const).map((geo) => (
            <div key={geo} className="card">
              <h3 className="text-base font-semibold mb-3 text-gray-800">
                Race & Ethnicity — {GEO_LABELS[geo]}
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={raceStackedData(geo)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
                  />
                  <Tooltip formatter={(value) => [`${Number(value)}%`, ""]} />
                  <Legend
                    formatter={(v) => RACE_LABELS[v as string] ?? v}
                  />
                  {Object.entries(RACE_COLORS).map(([key, color]) => (
                    <Bar
                      key={key}
                      dataKey={key}
                      stackId="race"
                      fill={color}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          ))}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DualLineChart
              data={latinxCountData}
              unit="count"
              label="Latino Population (count)"
            />
            <DualLineChart
              data={whitePctData}
              unit="percent"
              label="White Share of Population"
            />
          </div>
        </div>
      )}

      {section === "housing" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DualLineChart
              data={vacancyRateData}
              unit="percent"
              label="Vacancy Rate"
            />
            <DualLineChart
              data={seasonalRateData}
              unit="percent"
              label="Seasonal Vacancy Rate"
            />
            <DualLineChart
              data={renterPctData}
              unit="percent"
              label="Renter-Occupied Share"
            />
            <DualLineChart
              data={ownerPctData}
              unit="percent"
              label="Owner-Occupied Share"
            />
          </div>
          <NoteCallout text={context.notes["1980_tenure_missing"]} />
        </div>
      )}

      {section === "income" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DualLineChart
              data={incomeAdjData}
              unit="dollars"
              label="Median Household Income (2018 dollars)"
            />
            <DualLineChart
              data={povertyRateData}
              unit="percent"
              label="Poverty Rate"
            />
          </div>
          <DivergenceCard
            label="Income Crossover (2018$)"
            uaStart={getVal(
              "median_household_income_2018_dollars",
              1980,
              "urban_area"
            )}
            uaEnd={getVal(
              "median_household_income_2018_dollars",
              2018,
              "urban_area"
            )}
            hdStart={getVal(
              "median_household_income_2018_dollars",
              1980,
              "historic_districts"
            )}
            hdEnd={getVal(
              "median_household_income_2018_dollars",
              2018,
              "historic_districts"
            )}
            unit="dollars"
          />
        </div>
      )}

      {section === "costBurden" && (
        <div className="space-y-6">
          <NoteCallout text={context.notes["cost_burden_threshold_change"]} />
          {(["urban_area", "historic_districts"] as const).map((geo) => (
            <div key={geo} className="space-y-4">
              <h3 className="text-base font-semibold text-gray-800">
                {GEO_LABELS[geo]}
              </h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card">
                  <h4 className="text-sm font-semibold mb-3 text-gray-700">
                    Renter Cost Burden (2000-2018)
                  </h4>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={costBurdenData("rent", geo)}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e5e7eb"
                      />
                      <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `${v}%`}
                        domain={[0, 100]}
                      />
                      <Tooltip
                        formatter={(value) => [`${Number(value)}%`, ""]}
                      />
                      <Legend />
                      <Bar
                        dataKey="none"
                        name="No burden"
                        stackId="cb"
                        fill="#16a34a"
                      />
                      <Bar
                        dataKey="moderate"
                        name="Moderate (30-49%)"
                        stackId="cb"
                        fill="#f59e0b"
                      />
                      <Bar
                        dataKey="extreme"
                        name="Extreme (50%+)"
                        stackId="cb"
                        fill="#dc2626"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="card">
                  <h4 className="text-sm font-semibold mb-3 text-gray-700">
                    Owner Cost Burden (2000-2018)
                  </h4>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={costBurdenData("owner", geo)}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#e5e7eb"
                      />
                      <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => `${v}%`}
                        domain={[0, 100]}
                      />
                      <Tooltip
                        formatter={(value) => [`${Number(value)}%`, ""]}
                      />
                      <Legend />
                      <Bar
                        dataKey="none"
                        name="No burden"
                        stackId="cb"
                        fill="#16a34a"
                      />
                      <Bar
                        dataKey="moderate"
                        name="Moderate (30-49%)"
                        stackId="cb"
                        fill="#f59e0b"
                      />
                      <Bar
                        dataKey="extreme"
                        name="Extreme (50%+)"
                        stackId="cb"
                        fill="#dc2626"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {section === "bridge" && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              From Historic Context to Current Development
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              The demographic shifts documented above — population loss, rising
              incomes, growing vacancy, declining renter occupancy, and ethnic
              composition change — form the backdrop for today&apos;s building
              permit activity. The charts below show recent permit trends
              alongside the long-run housing context. This is not a causal
              claim; it is a continuity view connecting past change to present
              activity.
            </p>
          </div>

          {permitsByYear.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="card">
                <h3 className="text-base font-semibold mb-3 text-gray-800">
                  Building Permits by Year
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={permitsByYear}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e5e7eb"
                    />
                    <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value) => [Number(value).toLocaleString(), "Permits"]}
                    />
                    <Bar
                      dataKey="count"
                      name="Permits"
                      fill="#2563eb"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card">
                <h3 className="text-base font-semibold mb-3 text-gray-800">
                  Permit Valuation by Year
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={permitsByYear}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e5e7eb"
                    />
                    <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) =>
                        `$${(v / 1_000_000).toFixed(0)}M`
                      }
                    />
                    <Tooltip
                      formatter={(value) => [
                        `$${Number(value).toLocaleString()}`,
                        "Valuation",
                      ]}
                    />
                    <Bar
                      dataKey="valuation"
                      name="Total Valuation"
                      fill="#16a34a"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DualLineChart
              data={vacancyRateData}
              unit="percent"
              label="Vacancy Rate (1980-2018)"
            />
            <DualLineChart
              data={incomeAdjData}
              unit="dollars"
              label="Median Income in 2018$ (1980-2018)"
            />
          </div>
        </div>
      )}

      {section === "methodology" && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              About This Data
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {context.title}
              {context.author && ` — by ${context.author}`}
            </p>

            <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-2">
              Geographies
            </h3>
            {Object.entries(context.geographies).map(([key, desc]) => (
              <div key={key} className="mb-2">
                <span className="text-sm font-medium text-gray-700">
                  {GEO_LABELS[key as DemographicGeography] ?? key}:
                </span>{" "}
                <span className="text-sm text-gray-600">{desc}</span>
              </div>
            ))}

            <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-2">
              Methodology
            </h3>
            <ul className="space-y-2">
              {context.methodology.map((m, i) => (
                <li key={i} className="text-sm text-gray-600 leading-relaxed">
                  {m}
                </li>
              ))}
            </ul>

            <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-2">
              Limitations
            </h3>
            <ul className="space-y-2">
              {context.limitations.map((l, i) => (
                <li
                  key={i}
                  className="text-sm text-gray-600 leading-relaxed border-l-2 border-amber-300 pl-3"
                >
                  {l}
                </li>
              ))}
            </ul>

            <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-2">
              Definitions
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {Object.entries(context.definitions).map(([term, def]) => (
                <div key={term}>
                  <span className="text-sm font-medium text-gray-700">
                    {term}:
                  </span>{" "}
                  <span className="text-sm text-gray-600">{def}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3 className="text-sm font-semibold text-gray-800 mb-3">
              Census Data Sources
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="px-3 py-2 font-medium">Year</th>
                    <th className="px-3 py-2 font-medium">Topic</th>
                    <th className="px-3 py-2 font-medium">Census Source</th>
                    <th className="px-3 py-2 font-medium">Accessed Through</th>
                  </tr>
                </thead>
                <tbody>
                  {context.sources.map((s, i) => (
                    <tr
                      key={i}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-3 py-2">{s.year}</td>
                      <td className="px-3 py-2">{s.topic}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {s.censusSource}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {s.accessedThrough}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
