"use client";

import { useMemo } from "react";
import type { Permit } from "../types";
import { isCertificateOfCompliance } from "../lib/permitKind";

function addressFirstLine(addr: string): string {
  const line = addr.split(/\r?\n/)[0]?.trim() ?? "";
  return line || "(no address line)";
}

export default function CocBreakdown({ permits }: { permits: Permit[] }) {
  const coc = useMemo(
    () => permits.filter(isCertificateOfCompliance),
    [permits]
  );

  const byUse = useMemo(() => {
    const m = new Map<string, { display: string; count: number }>();
    for (const p of coc) {
      const raw = (p.description ?? "").trim();
      const key = raw.toLowerCase() || "(no description)";
      const cur = m.get(key);
      if (cur) cur.count += 1;
      else m.set(key, { display: raw || "(no description)", count: 1 });
    }
    return [...m.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.count - a.count);
  }, [coc]);

  const byStreet = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of coc) {
      const line = addressFirstLine(p.address ?? "");
      m.set(line, (m.get(line) ?? 0) + 1);
    }
    return [...m.entries()]
      .map(([line, count]) => ({ line, count }))
      .sort((a, b) => b.count - a.count);
  }, [coc]);

  if (coc.length === 0) return null;

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-1">
        Certificate of Compliance breakdown
      </h2>
      <p className="text-sm text-gray-500 mb-4">
        {coc.length.toLocaleString()} permit{coc.length === 1 ? "" : "s"} in
        this dataset. Address column is the first line of the permit address
        (not an official neighborhood).
      </p>
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            By use (description)
          </h3>
          <div className="overflow-x-auto max-h-64 overflow-y-auto border border-gray-100 rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium text-right w-16">#</th>
                </tr>
              </thead>
              <tbody>
                {byUse.map((row) => (
                  <tr
                    key={row.key}
                    className="border-t border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-3 py-1.5">{row.display}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {row.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            By address line / street
          </h3>
          <div className="overflow-x-auto max-h-64 overflow-y-auto border border-gray-100 rounded-lg">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Address line</th>
                  <th className="px-3 py-2 font-medium text-right w-16">#</th>
                </tr>
              </thead>
              <tbody>
                {byStreet.map((row) => (
                  <tr
                    key={row.line}
                    className="border-t border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-3 py-1.5">{row.line}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {row.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
