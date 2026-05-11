"use client";

import "leaflet/dist/leaflet.css";
import {
  CircleMarker,
  GeoJSON as GeoJSONLayer,
  LayerGroup,
  LayersControl,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import {
  getEffectiveYear,
  yearFillColor,
  yearFillNeutral,
} from "../lib/permitCategory";
import {
  maxEffectiveYearInCategory,
  maxEffectiveYearWhere,
} from "../lib/permitAddressGroup";
import { isCertificateOfCompliance } from "../lib/permitKind";
import type { Permit, GisLayerMeta, GisGeoJson, PermitAddressGroup } from "../types";
import type { Layer, PathOptions } from "leaflet";
import { useEffect } from "react";

const SANTA_FE_CENTER: [number, number] = [35.687, -105.938];

export interface GisLayerData {
  meta: GisLayerMeta;
  geojson: GisGeoJson;
}

export type LeafletMapProps = {
  residential: PermitAddressGroup[];
  commercial: PermitAddressGroup[];
  certificates: PermitAddressGroup[];
  colorScaleMin: number;
  colorScaleMax: number;
  cocOnly: boolean;
  gisLayers?: GisLayerData[];
  cityBounds?: { south: number; west: number; north: number; east: number };
};

const fmt = (n: number | null) =>
  n ? `$${n.toLocaleString()}` : "N/A";

function PermitBlockLandUse({ p }: { p: Permit }) {
  const eff = getEffectiveYear(p);
  return (
    <div className="border-b border-gray-100 last:border-0 pb-2 last:pb-0">
      <div className="font-bold">{p.permit_number}</div>
      <div>{p.permit_type}</div>
      <div className="text-gray-600 whitespace-pre-line text-xs">{p.address}</div>
      {eff ? (
        <div>
          Year:{" "}
          <span className="font-medium">
            {eff.year} ({eff.source === "issue_date" ? "issued" : "applied"})
          </span>
        </div>
      ) : null}
      <div>
        Status: <span className="font-medium">{p.status}</span>
      </div>
      <div>Valuation: {fmt(p.valuation)}</div>
      {p.square_feet ? (
        <div>{p.square_feet.toLocaleString()} sq ft</div>
      ) : null}
    </div>
  );
}

function PermitBlockCoc({ p }: { p: Permit }) {
  return (
    <div className="border-b border-gray-100 last:border-0 pb-2 last:pb-0">
      <div className="font-bold">{p.permit_number}</div>
      {p.description?.trim() ? (
        <div className="font-medium text-gray-900">{p.description.trim()}</div>
      ) : null}
      <div>{p.permit_type}</div>
      <div className="text-gray-600 whitespace-pre-line text-xs">{p.address}</div>
      <div>
        Status: <span className="font-medium">{p.status}</span>
      </div>
    </div>
  );
}

function PermitBlockCertificate({ p }: { p: Permit }) {
  const eff = getEffectiveYear(p);
  return (
    <div className="border-b border-gray-100 last:border-0 pb-2 last:pb-0">
      <div className="font-bold">{p.permit_number}</div>
      <div>{p.permit_type}</div>
      <div className="text-gray-600 whitespace-pre-line text-xs">{p.address}</div>
      {p.description ? (
        <div className="text-gray-700 text-xs">{p.description}</div>
      ) : null}
      {eff ? (
        <div>
          Year:{" "}
          <span className="font-medium">
            {eff.year} ({eff.source === "issue_date" ? "issued" : "applied"})
          </span>
        </div>
      ) : null}
      <div>
        Status: <span className="font-medium">{p.status}</span>
      </div>
      <div>Valuation: {fmt(p.valuation)}</div>
    </div>
  );
}

function AddressGroupPopupLandUse({ group }: { group: PermitAddressGroup }) {
  return (
    <div className="text-sm space-y-2 max-h-60 overflow-y-auto pr-1">
      <div className="font-semibold text-gray-900 sticky top-0 bg-white pb-1 border-b border-gray-100">
        {group.permits.length} permit{group.permits.length === 1 ? "" : "s"} ·{" "}
        {group.displayAddress}
      </div>
      {group.permits.map((p) => (
        <PermitBlockLandUse key={p.permit_id} p={p} />
      ))}
    </div>
  );
}

function AddressGroupPopupCoc({ group }: { group: PermitAddressGroup }) {
  return (
    <div className="text-sm space-y-2 max-h-60 overflow-y-auto pr-1">
      <div className="font-semibold text-gray-900 sticky top-0 bg-white pb-1 border-b border-gray-100">
        {group.permits.length} permit{group.permits.length === 1 ? "" : "s"} ·{" "}
        {group.displayAddress}
      </div>
      {group.permits.map((p) => (
        <PermitBlockCoc key={p.permit_id} p={p} />
      ))}
    </div>
  );
}

function AddressGroupPopupCertificates({ group }: { group: PermitAddressGroup }) {
  return (
    <div className="text-sm space-y-2 max-h-60 overflow-y-auto pr-1">
      <div className="font-semibold text-gray-900 sticky top-0 bg-white pb-1 border-b border-gray-100">
        {group.permits.length} certificate
        {group.permits.length === 1 ? "" : "s"} · {group.displayAddress}
      </div>
      {group.permits.map((p) => (
        <PermitBlockCertificate key={p.permit_id} p={p} />
      ))}
    </div>
  );
}

function LandUseAddressGroups({
  groups,
  category,
  colorScaleMin,
  colorScaleMax,
}: {
  groups: PermitAddressGroup[];
  category: "residential" | "commercial";
  colorScaleMin: number;
  colorScaleMax: number;
}) {
  return (
    <>
      {groups.map((g) => {
        const y =
          maxEffectiveYearInCategory(g.permits, category) ?? colorScaleMin;
        const fill = yearFillColor(y, colorScaleMin, colorScaleMax, category);
        return (
          <CircleMarker
            key={`${g.id}-${category}`}
            center={[g.latitude, g.longitude]}
            radius={6}
            pathOptions={{
              color: "#1f2937",
              weight: 1,
              fillColor: fill,
              fillOpacity: 0.78,
            }}
          >
            <Popup>
              <AddressGroupPopupLandUse group={g} />
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

const COC_MARKER = "#0d9488";

function CocOnlyAddressGroups({ groups }: { groups: PermitAddressGroup[] }) {
  return (
    <>
      {groups.map((g) => (
        <CircleMarker
          key={g.id}
          center={[g.latitude, g.longitude]}
          radius={7}
          pathOptions={{
            color: COC_MARKER,
            fillColor: COC_MARKER,
            fillOpacity: 0.75,
            weight: 1,
          }}
        >
          <Popup>
            <AddressGroupPopupCoc group={g} />
          </Popup>
        </CircleMarker>
      ))}
    </>
  );
}

function CertificateAddressGroups({
  groups,
  colorScaleMin,
  colorScaleMax,
}: {
  groups: PermitAddressGroup[];
  colorScaleMin: number;
  colorScaleMax: number;
}) {
  return (
    <>
      {groups.map((g) => {
        const y =
          maxEffectiveYearWhere(g.permits, isCertificateOfCompliance) ??
          colorScaleMin;
        const fill = yearFillNeutral(y, colorScaleMin, colorScaleMax);
        return (
          <CircleMarker
            key={`${g.id}-cert`}
            center={[g.latitude, g.longitude]}
            radius={6}
            pathOptions={{
              color: "#334155",
              weight: 1,
              fillColor: fill,
              fillOpacity: 0.82,
            }}
          >
            <Popup>
              <AddressGroupPopupCertificates group={g} />
            </Popup>
          </CircleMarker>
        );
      })}
    </>
  );
}

function FitCityBounds({
  bounds,
}: {
  bounds: { south: number; west: number; north: number; east: number };
}) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      { padding: [20, 20] }
    );
  }, [map, bounds]);
  return null;
}

function gisStyle(meta: GisLayerMeta, feature?: GeoJSON.Feature): PathOptions {
  const s = meta.style;
  if (meta.id === "historic_districts" && s.colors && feature?.properties) {
    const name = feature.properties[meta.displayField] as string;
    const color = s.colors[name] || "#6b7280";
    return {
      color,
      weight: s.weight ?? 2,
      fillColor: color,
      fillOpacity: s.fillOpacity ?? 0.25,
    };
  }
  return {
    color: s.color ?? "#6b7280",
    weight: s.weight ?? 1,
    fillColor: s.color ?? "#6b7280",
    fillOpacity: s.fillOpacity ?? 0.1,
    dashArray: s.dashArray,
  };
}

function gisOnEachFeature(meta: GisLayerMeta) {
  return (feature: GeoJSON.Feature, layer: Layer) => {
    if (!feature.properties) return;
    const label = feature.properties[meta.displayField];
    if (label) {
      (layer as unknown as { bindPopup: (html: string) => void }).bindPopup(
        `<div class="text-sm"><strong>${meta.name}</strong><br/>${label}</div>`
      );
    }
  };
}

export default function LeafletMap({
  residential,
  commercial,
  certificates,
  colorScaleMin,
  colorScaleMax,
  cocOnly,
  gisLayers,
  cityBounds,
}: LeafletMapProps) {
  const showLandUse = !cocOnly;
  const showCertificates = certificates.length > 0;
  const hasGis = gisLayers && gisLayers.length > 0;

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
      {cityBounds ? <FitCityBounds bounds={cityBounds} /> : null}
      <LayersControl position="topright">
        {hasGis
          ? gisLayers.map((gl) => (
              <LayersControl.Overlay
                key={gl.meta.id}
                checked={gl.meta.defaultVisible}
                name={gl.meta.name}
              >
                <GeoJSONLayer
                  data={gl.geojson}
                  style={(feature) => gisStyle(gl.meta, feature)}
                  onEachFeature={gisOnEachFeature(gl.meta)}
                />
              </LayersControl.Overlay>
            ))
          : null}
        {showLandUse ? (
          <>
            <LayersControl.Overlay checked name="Residential">
              <LayerGroup>
                <LandUseAddressGroups
                  groups={residential}
                  category="residential"
                  colorScaleMin={colorScaleMin}
                  colorScaleMax={colorScaleMax}
                />
              </LayerGroup>
            </LayersControl.Overlay>
            <LayersControl.Overlay checked name="Commercial">
              <LayerGroup>
                <LandUseAddressGroups
                  groups={commercial}
                  category="commercial"
                  colorScaleMin={colorScaleMin}
                  colorScaleMax={colorScaleMax}
                />
              </LayerGroup>
            </LayersControl.Overlay>
          </>
        ) : null}
        {showCertificates ? (
          <LayersControl.Overlay
            checked
            name={
              cocOnly
                ? "Certificate of Compliance"
                : "Certificates of Compliance"
            }
          >
            <LayerGroup>
              {cocOnly ? (
                <CocOnlyAddressGroups groups={certificates} />
              ) : (
                <CertificateAddressGroups
                  groups={certificates}
                  colorScaleMin={colorScaleMin}
                  colorScaleMax={colorScaleMax}
                />
              )}
            </LayerGroup>
          </LayersControl.Overlay>
        ) : null}
      </LayersControl>
    </MapContainer>
  );
}
