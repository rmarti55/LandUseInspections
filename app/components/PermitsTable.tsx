"use client";

import { useState, useMemo } from "react";
import type { Permit, PermitContacts } from "../types";

const PAGE_SIZE = 25;

function fmtDate(d: string | null): string {
  if (!d) return "";
  return d.slice(0, 10);
}

function fmtMoney(n: number | null): string {
  if (!n) return "";
  return `$${n.toLocaleString()}`;
}

function contactLabel(c: {
  first_name: string;
  last_name: string;
  company: string;
  contact_type: string;
}): string {
  const name =
    c.company?.trim() ||
    `${c.first_name || ""} ${c.last_name || ""}`.trim() ||
    "";
  const type = c.contact_type?.trim();
  if (type && name) return `${type}: ${name}`;
  if (type) return type;
  return name || "";
}

export default function PermitsTable({
  permits,
  contacts,
}: {
  permits: Permit[];
  contacts: PermitContacts;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof Permit>("apply_date");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return permits.filter(
      (p) =>
        !q ||
        p.permit_number?.toLowerCase().includes(q) ||
        p.permit_type?.toLowerCase().includes(q) ||
        p.address?.toLowerCase().includes(q) ||
        p.status?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }, [permits, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number")
        return sortAsc ? av - bv : bv - av;
      return sortAsc
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [filtered, sortKey, sortAsc]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const rows = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(key: keyof Permit) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
    setPage(0);
  }

  const cols: { key: keyof Permit; label: string; cls?: string }[] = [
    { key: "permit_number", label: "Permit #" },
    { key: "permit_type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "address", label: "Address" },
    { key: "valuation", label: "Valuation", cls: "text-right" },
    { key: "apply_date", label: "Applied" },
    { key: "issue_date", label: "Issued" },
  ];

  const arrow = (key: keyof Permit) =>
    sortKey === key ? (sortAsc ? " ↑" : " ↓") : "";

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <h2 className="text-lg font-semibold">
          Permits{" "}
          <span className="text-sm font-normal text-gray-500">
            ({filtered.length.toLocaleString()})
          </span>
        </h2>
        <input
          type="text"
          placeholder="Search permits…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              {cols.slice(0, 4).map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className={`px-3 py-2 font-medium cursor-pointer hover:text-gray-900 whitespace-nowrap ${c.cls || ""}`}
                >
                  {c.label}
                  {arrow(c.key)}
                </th>
              ))}
              <th className="px-3 py-2 font-medium text-left text-gray-500 whitespace-nowrap">
                Contacts
              </th>
              {cols.slice(4).map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className={`px-3 py-2 font-medium cursor-pointer hover:text-gray-900 whitespace-nowrap ${c.cls || ""}`}
                >
                  {c.label}
                  {arrow(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.permit_id}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="px-3 py-2 font-mono text-xs">{p.permit_number}</td>
                <td className="px-3 py-2 max-w-[200px] truncate">{p.permit_type}</td>
                <td className="px-3 py-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.status === "Issued"
                        ? "bg-blue-100 text-blue-800"
                        : p.status === "Complete"
                          ? "bg-green-100 text-green-800"
                          : p.status === "Expired"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-3 py-2 max-w-[220px] truncate">{p.address}</td>
                <td className="px-3 py-2 max-w-[260px] align-top text-gray-700">
                  <ul className="space-y-0.5 text-xs">
                    {(contacts[p.permit_id] ?? []).map((c, i) => {
                      const line = contactLabel(c);
                      if (!line) return null;
                      return (
                        <li key={i} className="truncate" title={line}>
                          {line}
                        </li>
                      );
                    })}
                  </ul>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {fmtMoney(p.valuation)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(p.apply_date)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(p.issue_date)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                  {permits.length === 0
                    ? "No permit data yet — run the scraper first"
                    : "No results match your search"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100"
            >
              Prev
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-100"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
