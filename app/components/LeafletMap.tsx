"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import { Permit } from "../types";

const SANTA_FE_CENTER: [number, number] = [35.687, -105.938];

const STATUS_COLORS: Record<string, string> = {
  Issued: "#2563eb",
  Complete: "#16a34a",
  Expired: "#dc2626",
  Finalized: "#7c3aed",
};

function getColor(status: string): string {
  return STATUS_COLORS[status] || "#6b7280";
}

const fmt = (n: number | null) =>
  n ? `$${n.toLocaleString()}` : "N/A";

export default function LeafletMap({ permits }: { permits: Permit[] }) {
  return (
    <MapContainer
      center={SANTA_FE_CENTER}
      zoom={13}
      className="h-[500px] w-full rounded-lg z-0"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {permits.map((p) => (
        <CircleMarker
          key={p.permit_id}
          center={[p.latitude!, p.longitude!]}
          radius={6}
          pathOptions={{
            color: getColor(p.status),
            fillColor: getColor(p.status),
            fillOpacity: 0.7,
            weight: 1,
          }}
        >
          <Popup>
            <div className="text-sm space-y-1">
              <div className="font-bold">{p.permit_number}</div>
              <div>{p.permit_type}</div>
              <div className="text-gray-600">{p.address}</div>
              <div>Status: <span className="font-medium">{p.status}</span></div>
              <div>Valuation: {fmt(p.valuation)}</div>
              {p.square_feet ? <div>{p.square_feet.toLocaleString()} sq ft</div> : null}
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
