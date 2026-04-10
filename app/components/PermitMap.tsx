"use client";

import { useEffect, useState } from "react";
import { Permit } from "../types";

const SANTA_FE_CENTER: [number, number] = [35.687, -105.938];

export default function PermitMap({ permits }: { permits: Permit[] }) {
  const [MapComponent, setMapComponent] = useState<React.ComponentType<{
    permits: Permit[];
  }> | null>(null);

  useEffect(() => {
    import("./LeafletMap").then((mod) => setMapComponent(() => mod.default));
  }, []);

  const mapped = permits.filter((p) => p.latitude && p.longitude);

  if (!MapComponent) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Permit Locations</h2>
        <div className="h-[500px] bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
          Loading map…
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold mb-1">Permit Locations</h2>
      <p className="text-sm text-gray-500 mb-4">
        {mapped.length.toLocaleString()} of {permits.length.toLocaleString()} permits geocoded
      </p>
      <MapComponent permits={mapped} />
    </div>
  );
}
