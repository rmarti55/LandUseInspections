"use client";

import { useEffect, useMemo, useState } from "react";
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
  PermitContacts,
  Builder,
  StatusCount,
  FeeSummary,
  DemographicAppendixData,
  Project,
} from "../types";
import {
  filterPermits,
  permitMetrics,
  type KindFilter,
  type SectorFilter,
} from "../lib/permitFilters";
import { isCertificateOfCompliance } from "../lib/permitKind";
import CocBreakdown from "./CocBreakdown";
import ContinuityConnection from "./ContinuityConnection";
import HistoricProjects from "./HistoricProjects";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "historic", label: "Construction Projects" },
  { id: "map", label: "Map" },
  { id: "permits", label: "Permits" },
  { id: "builders", label: "Who's Building" },
  { id: "trends", label: "Trends" },
  { id: "inspections", label: "Inspections" },
  { id: "fees", label: "Fees" },
  { id: "continuity", label: "Continuity" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const FILTERED_TABS: Set<TabId> = new Set(["overview", "map", "permits", "trends"]);

const SECTOR_OPTIONS: { id: SectorFilter; label: string }[] = [
  { id: "all", label: "All sectors" },
  { id: "residential", label: "Residential" },
  { id: "commercial", label: "Commercial" },
];

const KIND_OPTIONS: { id: KindFilter; label: string }[] = [
  { id: "all", label: "All kinds" },
  { id: "construction", label: "Construction" },
  { id: "trade", label: "Trade" },
  { id: "other", label: "Other" },
];

async function load<T>(name: string): Promise<T> {
  const res = await fetch(`/data/${name}.json`);
  return res.json();
}

export default function Dashboard() {
  const [tab, setTab] = useState<TabId>("overview");
  const [sectorFilter, setSectorFilter] = useState<SectorFilter>("all");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [permits, setPermits] = useState<Permit[]>([]);
  const [permitContacts, setPermitContacts] = useState<PermitContacts>({});
  const [builders, setBuilders] = useState<Builder[]>([]);
  const [inspStatus, setInspStatus] = useState<StatusCount[]>([]);
  const [inspTimeline, setInspTimeline] = useState<{ month: string; count: number }[]>(
    []
  );
  const [fees, setFees] = useState<FeeSummary[]>([]);
  const [demographics, setDemographics] = useState<DemographicAppendixData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [cocOnly, setCocOnly] = useState(false);

  useEffect(() => {
    load<Summary>("summary").then(setSummary);
    load<Permit[]>("permits").then(setPermits);
    load<PermitContacts>("permit_contacts").then(setPermitContacts);
    load<Builder[]>("builders").then(setBuilders);
    load<StatusCount[]>("inspection_status").then(setInspStatus);
    load<{ month: string; count: number }[]>("inspection_timeline").then(setInspTimeline);
    load<FeeSummary[]>("fees_summary").then(setFees);
    load<DemographicAppendixData>("demographics_appendix_d").then(setDemographics);
    load<Project[]>("projects").then(setProjects);
  }, []);

  const filteredPermits = useMemo(
    () => filterPermits(permits, sectorFilter, kindFilter),
    [permits, sectorFilter, kindFilter]
  );

  const sliceMetrics = useMemo(
    () => permitMetrics(filteredPermits),
    [filteredPermits]
  );

  const cocCount = useMemo(
    () => permits.filter(isCertificateOfCompliance).length,
    [permits]
  );

  const permitsForMap = cocOnly ? permits : filteredPermits;
  const permitsForTable = cocOnly ? permits : filteredPermits;

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
            {FILTERED_TABS.has(tab) && (
              <div className="card py-3 px-4 flex flex-col sm:flex-row flex-wrap gap-3 sm:items-center sm:justify-between">
                <p className="text-sm text-gray-600">
                  Permit filters apply to overview permit counts, map, permits list, and
                  trends. Multi-family is included in Residential.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Sector
                  </span>
                  {SECTOR_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setSectorFilter(o.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        sectorFilter === o.id
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Kind
                  </span>
                  {KIND_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setKindFilter(o.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        kindFilter === o.id
                          ? "bg-emerald-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === "overview" && (
              <>
                <StatsCards summary={summary} permitMetrics={sliceMetrics} />
                {cocCount > 0 ? (
                  <div className="card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        New business activity
                      </h2>
                      <p className="text-sm text-gray-600 mt-1">
                        {cocCount.toLocaleString()} Certificate of Compliance
                        permit{cocCount === 1 ? "" : "s"} — zoning sign-off for
                        business uses and events at an address.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setCocOnly(true);
                          setTab("map");
                        }}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-teal-600 text-white hover:bg-teal-700"
                      >
                        View on map
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCocOnly(true);
                          setTab("permits");
                        }}
                        className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50"
                      >
                        View in table
                      </button>
                    </div>
                  </div>
                ) : null}
                <CocBreakdown permits={permits} />
                <InspectionCharts status={inspStatus} timeline={inspTimeline} />
              </>
            )}
            {tab === "historic" && <HistoricProjects projects={projects} />}
            {tab === "map" && (
              <PermitMap
                permits={permitsForMap}
                cocOnly={cocOnly}
                onCocOnlyChange={setCocOnly}
              />
            )}
            {tab === "permits" && (
              <PermitsTable
                permits={permitsForTable}
                contacts={permitContacts}
                cocOnly={cocOnly}
                onCocOnlyChange={setCocOnly}
              />
            )}
            {tab === "builders" && <BuildersChart builders={builders} />}
            {tab === "trends" && <TrendsCharts permits={filteredPermits} />}
            {tab === "inspections" && (
              <InspectionCharts status={inspStatus} timeline={inspTimeline} />
            )}
            {tab === "fees" && <FeesSummaryChart fees={fees} />}
            {tab === "continuity" && demographics && (
              <ContinuityConnection data={demographics} permits={permits} />
            )}
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
