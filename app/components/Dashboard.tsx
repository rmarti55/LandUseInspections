"use client";

import { useEffect, useState } from "react";
import StatsCards from "./StatsCards";
import PermitMap from "./PermitMap";
import PermitsTable from "./PermitsTable";
import InspectionCharts from "./InspectionCharts";
import BuildersChart from "./BuildersChart";
import TrendsCharts from "./TrendsCharts";
import FeesSummaryChart from "./FeesSummary";
import type {
  Summary,
  Permit,
  TimelinePoint,
  Builder,
  StatusCount,
  FeeSummary,
  PermitType,
} from "../types";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "map", label: "Map" },
  { id: "permits", label: "Permits" },
  { id: "builders", label: "Who's Building" },
  { id: "trends", label: "Trends" },
  { id: "inspections", label: "Inspections" },
  { id: "fees", label: "Fees" },
] as const;

type TabId = (typeof TABS)[number]["id"];

async function load<T>(name: string): Promise<T> {
  const res = await fetch(`/data/${name}.json`);
  return res.json();
}

export default function Dashboard() {
  const [tab, setTab] = useState<TabId>("overview");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [permitsTimeline, setPermitsTimeline] = useState<TimelinePoint[]>([]);
  const [builders, setBuilders] = useState<Builder[]>([]);
  const [inspStatus, setInspStatus] = useState<StatusCount[]>([]);
  const [inspTimeline, setInspTimeline] = useState<TimelinePoint[]>([]);
  const [fees, setFees] = useState<FeeSummary[]>([]);
  const [permitTypes, setPermitTypes] = useState<PermitType[]>([]);

  useEffect(() => {
    load<Summary>("summary").then(setSummary);
    load<Permit[]>("permits").then(setPermits);
    load<TimelinePoint[]>("permits_timeline").then(setPermitsTimeline);
    load<Builder[]>("builders").then(setBuilders);
    load<StatusCount[]>("inspection_status").then(setInspStatus);
    load<TimelinePoint[]>("inspection_timeline").then(setInspTimeline);
    load<FeeSummary[]>("fees_summary").then(setFees);
    load<PermitType[]>("permit_types").then(setPermitTypes);
  }, []);

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900">
            Santa Fe Land Use Dashboard
          </h1>
          <p className="text-sm text-gray-500">
            Building permits, inspections, and development activity
          </p>
        </div>
        <nav className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto pb-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors ${
                tab === t.id
                  ? "bg-blue-50 text-blue-700 border-b-2 border-blue-600"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {!summary ? (
          <div className="text-center py-20 text-gray-400">Loading data…</div>
        ) : (
          <>
            {tab === "overview" && (
              <>
                <StatsCards data={summary} />
                <InspectionCharts status={inspStatus} timeline={inspTimeline} />
              </>
            )}
            {tab === "map" && <PermitMap permits={permits} />}
            {tab === "permits" && <PermitsTable permits={permits} />}
            {tab === "builders" && <BuildersChart builders={builders} />}
            {tab === "trends" && (
              <TrendsCharts timeline={permitsTimeline} types={permitTypes} />
            )}
            {tab === "inspections" && (
              <InspectionCharts status={inspStatus} timeline={inspTimeline} />
            )}
            {tab === "fees" && <FeesSummaryChart fees={fees} />}
          </>
        )}
      </main>

      <footer className="border-t border-gray-200 mt-12 py-6 text-center text-sm text-gray-400">
        Data source:{" "}
        <a
          href="https://santafenm-energovpub.tylerhost.net/Apps/selfservice"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-gray-600"
        >
          City of Santa Fe EnerGov Portal
        </a>
      </footer>
    </div>
  );
}
