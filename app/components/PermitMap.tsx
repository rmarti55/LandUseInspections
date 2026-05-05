"use client";

import { useEffect, useMemo, useState } from "react";
import {
  classifyPermitLandUse,
  dateYearExtent,
  getEffectiveYear,
  landUseYearExtent,
} from "../lib/permitCategory";
import { isCertificateOfCompliance } from "../lib/permitKind";
import type { Permit, GisManifest, GisGeoJson } from "../types";
import CocFilterToggle from "./CocFilterToggle";
import CocBreakdown from "./CocBreakdown";
import type { LeafletMapProps, GisLayerData } from "./LeafletMap";

function YearRangeControls({
  minYear,
  maxYear,
  yearFrom,
  yearThrough,
  onFromChange,
  onThroughChange,
  disabled,
}: {
  minYear: number;
  maxYear: number;
  yearFrom: number;
  yearThrough: number;
  onFromChange: (y: number) => void;
  onThroughChange: (y: number) => void;
  disabled: boolean;
}) {
  return (
    <div
      className={`space-y-3 mb-4 ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex flex-col gap-1 text-sm min-w-[140px]">
          <span className="text-gray-600">From year</span>
          <input
            type="range"
            min={minYear}
            max={maxYear}
            value={yearFrom}
            onChange={(e) => {
              const y = Number(e.target.value);
              onFromChange(y);
              if (y > yearThrough) onThroughChange(y);
            }}
            className="w-full max-w-xs"
          />
          <span className="font-medium tabular-nums">{yearFrom}</span>
        </label>
        <label className="flex flex-col gap-1 text-sm min-w-[140px]">
          <span className="text-gray-600">Through year</span>
          <input
            type="range"
            min={minYear}
            max={maxYear}
            value={yearThrough}
            onChange={(e) => {
              const y = Number(e.target.value);
              onThroughChange(y);
              if (y < yearFrom) onFromChange(y);
            }}
            className="w-full max-w-xs"
          />
          <span className="font-medium tabular-nums">{yearThrough}</span>
        </label>
      </div>
    </div>
  );
}

function ColorLegend({
  minYear,
  maxYear,
  variant,
}: {
  minYear: number;
  maxYear: number;
  variant: "landuse" | "coc";
}) {
  if (variant === "coc") {
    return (
      <div className="flex flex-wrap gap-6 text-xs text-gray-600 mb-4">
        <div>
          <div className="font-medium text-gray-800 mb-1">
            Certificate year (fill)
          </div>
          <div
            className="h-3 rounded w-48 max-w-full mb-1"
            style={{
              background: "linear-gradient(to right, #94a3b8, #1e293b)",
            }}
          />
          <div className="flex justify-between tabular-nums">
            <span>{minYear}</span>
            <span>{maxYear}</span>
          </div>
        </div>
        <div className="self-end text-gray-500 max-w-md">
          Lighter pins are earlier issue or apply years; darker are more recent.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-6 text-xs text-gray-600 mb-4">
      <div>
        <div className="font-medium text-gray-800 mb-1">Residential (fill)</div>
        <div
          className="h-3 rounded w-48 max-w-full mb-1"
          style={{
            background: "linear-gradient(to right, #2563eb, #16a34a)",
          }}
        />
        <div className="flex justify-between tabular-nums">
          <span>{minYear}</span>
          <span>{maxYear}</span>
        </div>
      </div>
      <div>
        <div className="font-medium text-gray-800 mb-1">Commercial (fill)</div>
        <div
          className="h-3 rounded w-48 max-w-full mb-1"
          style={{
            background: "linear-gradient(to right, #ea580c, #9333ea)",
          }}
        />
        <div className="flex justify-between tabular-nums">
          <span>{minYear}</span>
          <span>{maxYear}</span>
        </div>
      </div>
      <div className="self-end text-gray-500 max-w-xs">
        Marker outline is neutral; fill encodes issue year (or apply date if not
        issued). Use the layer checkboxes on the map to show or hide each group.
      </div>
    </div>
  );
}

function isGeocoded(p: Permit): boolean {
  return (
    p.latitude != null &&
    p.longitude != null &&
    !Number.isNaN(p.latitude) &&
    !Number.isNaN(p.longitude)
  );
}

export default function PermitMap({
  permits,
  cocOnly,
  onCocOnlyChange,
}: {
  permits: Permit[];
  cocOnly: boolean;
  onCocOnlyChange: (value: boolean) => void;
}) {
  const [MapComponent, setMapComponent] = useState<React.ComponentType<
    LeafletMapProps
  > | null>(null);
  const [gisManifest, setGisManifest] = useState<GisManifest | null>(null);
  const [gisLayers, setGisLayers] = useState<GisLayerData[]>([]);

  useEffect(() => {
    import("./LeafletMap").then((mod) => setMapComponent(() => mod.default));
  }, []);

  useEffect(() => {
    fetch("/data/gis_layers.json")
      .then((r) => r.json())
      .then((manifest: GisManifest) => {
        setGisManifest(manifest);
        const layerFiles = manifest.layers.map((meta) =>
          fetch(`/data/gis_${meta.id}.geojson`)
            .then((r) => r.json())
            .then((geojson: GisGeoJson) => ({ meta, geojson }))
        );
        return Promise.all(layerFiles);
      })
      .then(setGisLayers)
      .catch(() => {});
  }, []);

  const mapped = useMemo(() => {
    const scoped = cocOnly
      ? permits.filter(isCertificateOfCompliance)
      : permits;
    return scoped.filter(isGeocoded);
  }, [permits, cocOnly]);

  const extent = useMemo(() => {
    if (cocOnly) return dateYearExtent(mapped);
    return landUseYearExtent(mapped);
  }, [mapped, cocOnly]);

  const fallbackYear = new Date().getUTCFullYear();
  const minYear = extent?.minYear ?? fallbackYear;
  const maxYear = extent?.maxYear ?? fallbackYear;

  const [yearFrom, setYearFrom] = useState(minYear);
  const [yearThrough, setYearThrough] = useState(maxYear);

  useEffect(() => {
    setYearFrom(minYear);
    setYearThrough(maxYear);
  }, [minYear, maxYear]);

  const { residential, commercial, certificates, visibleCount } =
    useMemo(() => {
      const res: Permit[] = [];
      const com: Permit[] = [];
      const cert: Permit[] = [];

      for (const p of mapped) {
        const eff = getEffectiveYear(p);
        if (!eff || eff.year < yearFrom || eff.year > yearThrough) continue;

        if (cocOnly) {
          if (isCertificateOfCompliance(p)) cert.push(p);
          continue;
        }

        const cat = classifyPermitLandUse(p);
        if (cat === "residential") res.push(p);
        else if (cat === "commercial") com.push(p);
      }

      return {
        residential: res,
        commercial: com,
        certificates: cert,
        visibleCount: cocOnly ? cert.length : res.length + com.length,
      };
    }, [mapped, yearFrom, yearThrough, cocOnly]);

  const geocodedLandUseWithYear = useMemo(() => {
    let n = 0;
    for (const p of mapped) {
      if (cocOnly) continue;
      const cat = classifyPermitLandUse(p);
      if (cat !== "residential" && cat !== "commercial") continue;
      if (getEffectiveYear(p)) n++;
    }
    return n;
  }, [mapped, cocOnly]);

  const cocTotal = useMemo(
    () => permits.filter(isCertificateOfCompliance).length,
    [permits],
  );

  const cocMappedTotal = useMemo(
    () =>
      permits.filter(isCertificateOfCompliance).filter(isGeocoded).length,
    [permits],
  );

  const allGeocodedCount = useMemo(
    () => permits.filter(isGeocoded).length,
    [permits],
  );

  if (!MapComponent) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">Permit map</h2>
        <div className="h-[500px] bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
          Loading map…
        </div>
      </div>
    );
  }

  const noYearData = extent === null && mapped.length > 0;

  const mapProps: LeafletMapProps = {
    residential: cocOnly ? [] : residential,
    commercial: cocOnly ? [] : commercial,
    certificates: cocOnly ? certificates : [],
    colorScaleMin: minYear,
    colorScaleMax: maxYear,
    cocOnly,
    gisLayers: gisLayers.length > 0 ? gisLayers : undefined,
    cityBounds: gisManifest?.cityBounds.latlng,
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-lg font-semibold mb-1">Permit map</h2>
        <div className="mb-4">
          <CocFilterToggle
            id="map-coc-filter"
            cocOnly={cocOnly}
            onCocOnlyChange={onCocOnlyChange}
          />
        </div>

        {cocOnly ? (
          <p className="text-sm text-gray-600 mb-2">
            Certificate of Compliance permits only: zoning / land-use sign-off
            for business uses and events. Fill color shows time (issue or apply
            year). Popups include the use description when present.
          </p>
        ) : (
          <p className="text-sm text-gray-600 mb-2">
            Only permits with coordinates appear here. After geocoding your
            export, refresh to load points. Certificates, grading, and other
            non-building types are omitted from the residential and commercial
            layers (map top-right).
          </p>
        )}

        <p className="text-sm text-gray-500 mb-4">
          {cocOnly ? (
            <>
              {cocMappedTotal.toLocaleString()} of {cocTotal.toLocaleString()}{" "}
              Certificate of Compliance permits geocoded
            </>
          ) : (
            <>
              {allGeocodedCount.toLocaleString()} of {permits.length.toLocaleString()}{" "}
              permits geocoded
              {geocodedLandUseWithYear > 0
                ? ` · ${geocodedLandUseWithYear.toLocaleString()} geocoded residential/commercial with a year`
                : null}
            </>
          )}
          {" · "}
          <span className="text-gray-700 font-medium">
            {visibleCount.toLocaleString()} shown
          </span>{" "}
          in range {yearFrom}–{yearThrough}
        </p>

        <YearRangeControls
          minYear={minYear}
          maxYear={maxYear}
          yearFrom={yearFrom}
          yearThrough={yearThrough}
          onFromChange={setYearFrom}
          onThroughChange={setYearThrough}
          disabled={noYearData || mapped.length === 0}
        />

        {noYearData ? (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
            {cocOnly
              ? "No issue or apply dates found for geocoded certificates, so the year filter is unavailable."
              : "No issue or apply dates found for geocoded residential/commercial permits, so the year filter is unavailable."}
          </p>
        ) : null}

        <ColorLegend
          minYear={minYear}
          maxYear={maxYear}
          variant={cocOnly ? "coc" : "landuse"}
        />

        <MapComponent {...mapProps} />
      </div>

      {gisManifest && gisLayers.length > 0 ? (
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">GIS Overlay Layers</h2>
          <p className="text-sm text-gray-500 mb-4">
            City boundary, historic districts, and zoning data from Santa Fe
            ArcGIS services. Toggle visibility with the layer control on the
            map (top-right).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {gisManifest.layers.map((layer) => (
              <div
                key={layer.id}
                className="border border-gray-200 rounded-lg p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="inline-block w-3 h-3 rounded-sm border border-gray-300"
                    style={{
                      backgroundColor:
                        layer.style.color ??
                        (layer.style.colors
                          ? Object.values(layer.style.colors)[0]
                          : "#6b7280"),
                      opacity: layer.style.fillOpacity ?? 0.5,
                    }}
                  />
                  <span className="font-medium text-sm text-gray-900">
                    {layer.name}
                  </span>
                </div>
                <div className="text-xs text-gray-500 space-y-0.5">
                  <div>
                    {layer.featureCount.toLocaleString()}{" "}
                    {layer.geometryType === "polygon" ? "polygons" : "lines"}
                  </div>
                  <div>
                    {layer.defaultVisible ? "Visible" : "Hidden"} by default
                  </div>
                </div>
                {layer.id === "historic_districts" && layer.style.colors ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(layer.style.colors).map(([name, color]) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 text-xs text-gray-600"
                      >
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-sm"
                          style={{ backgroundColor: color }}
                        />
                        {name.replace(/ HD$/, "")}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Fetched {new Date(gisManifest.fetchedAt).toLocaleDateString()} from{" "}
            <a
              href="https://gis.santafenm.gov/server/rest/services"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-gray-600"
            >
              gis.santafenm.gov
            </a>
          </p>
        </div>
      ) : null}

      {cocOnly ? <CocBreakdown permits={permits} /> : null}
    </div>
  );
}
