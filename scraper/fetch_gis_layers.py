"""
Fetch GIS polygon layers from the City of Santa Fe ArcGIS REST services
and write canonical GeoJSON + normalized SVG data to public/data/.

Layers:
  - Historic Districts  (OverlayDistricts/MapServer/18)  — 5 polygons
  - Zoning              (OverlayDistricts/MapServer/25)  — ~851 polygons
  - City Limits         (OpenGov_GIS_Service/MapServer/12) — 1 polyline

Usage:
    python fetch_gis_layers.py
"""

import json
import math
import os
import ssl
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone

_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")

ARCGIS_BASE = "https://gis.santafenm.gov/server/rest/services"

LAYERS = [
    {
        "id": "historic_districts",
        "name": "Historic Districts",
        "service": "OverlayDistricts/MapServer",
        "layer_id": 18,
        "display_field": "HDSTNAM",
        "geometry_type": "polygon",
        "default_visible": True,
        "style": {
            "fillOpacity": 0.25,
            "weight": 2,
            "colors": {
                "Don Gaspar Area HD": "#e8457a",
                "Downtown And Eastside HD": "#e89645",
                "Historic Review HD": "#45a8c8",
                "Historic Transition HD": "#4db84d",
                "Westside-Guadalupe HD": "#5b82c4",
            },
        },
    },
    {
        "id": "zoning",
        "name": "Zoning",
        "service": "OverlayDistricts/MapServer",
        "layer_id": 25,
        "display_field": "ZDESC",
        "geometry_type": "polygon",
        "default_visible": False,
        "style": {
            "fillOpacity": 0.12,
            "weight": 1,
            "color": "#6b7280",
        },
    },
    {
        "id": "city_limits",
        "name": "City Limits",
        "service": "OpenGov_GIS_Service/MapServer",
        "layer_id": 12,
        "display_field": "SqMi",
        "geometry_type": "polyline",
        "default_visible": True,
        "style": {
            "color": "#1f2937",
            "weight": 2.5,
            "dashArray": "6 4",
        },
    },
]

MAX_RECORD_COUNT = 2000


def _query_url(service: str, layer_id: int) -> str:
    return f"{ARCGIS_BASE}/{service}/{layer_id}/query"


def _fetch_json(url: str, params: dict) -> dict:
    qs = urllib.parse.urlencode(params)
    full = f"{url}?{qs}"
    req = urllib.request.Request(full, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60, context=_SSL_CTX) as resp:
        return json.loads(resp.read().decode())


def fetch_geojson(service: str, layer_id: int) -> dict:
    """Fetch all features as GeoJSON in WGS84, handling pagination."""
    url = _query_url(service, layer_id)

    count_data = _fetch_json(url, {"where": "1=1", "returnCountOnly": "true", "f": "json"})
    total = count_data.get("count", 0)
    print(f"  Total features: {total}")

    all_features: list[dict] = []
    offset = 0
    while offset < total:
        params = {
            "where": "1=1",
            "outFields": "*",
            "outSR": "4326",
            "f": "geojson",
            "resultOffset": str(offset),
            "resultRecordCount": str(MAX_RECORD_COUNT),
        }
        data = _fetch_json(url, params)
        features = data.get("features", [])
        if not features:
            break
        all_features.extend(features)
        offset += len(features)
        if len(features) < MAX_RECORD_COUNT:
            break
        time.sleep(0.5)

    return {"type": "FeatureCollection", "features": all_features}


def fetch_projected(service: str, layer_id: int) -> dict:
    """Fetch all features as Esri JSON in Web Mercator (3857) for SVG projection."""
    url = _query_url(service, layer_id)

    count_data = _fetch_json(url, {"where": "1=1", "returnCountOnly": "true", "f": "json"})
    total = count_data.get("count", 0)

    all_features: list[dict] = []
    offset = 0
    while offset < total:
        params = {
            "where": "1=1",
            "outFields": "*",
            "outSR": "3857",
            "f": "json",
            "resultOffset": str(offset),
            "resultRecordCount": str(MAX_RECORD_COUNT),
        }
        data = _fetch_json(url, params)
        features = data.get("features", [])
        if not features:
            break
        all_features.extend(features)
        offset += len(features)
        if len(features) < MAX_RECORD_COUNT:
            break
        time.sleep(0.5)

    return all_features


def compute_bounds_3857(projected_features: list[dict]) -> dict:
    """Compute bounding box from projected Esri JSON features."""
    xmin = float("inf")
    ymin = float("inf")
    xmax = float("-inf")
    ymax = float("-inf")

    for feat in projected_features:
        geom = feat.get("geometry", {})
        rings = geom.get("rings") or geom.get("paths") or []
        for ring in rings:
            for x, y in ring:
                xmin = min(xmin, x)
                ymin = min(ymin, y)
                xmax = max(xmax, x)
                ymax = max(ymax, y)

    return {"xmin": xmin, "ymin": ymin, "xmax": xmax, "ymax": ymax}


def compute_bounds_latlng(geojson: dict) -> dict:
    """Compute bounding box from GeoJSON features."""
    lngmin = float("inf")
    latmin = float("inf")
    lngmax = float("-inf")
    latmax = float("-inf")

    def walk_coords(coords):
        nonlocal lngmin, latmin, lngmax, latmax
        if isinstance(coords[0], (int, float)):
            lngmin = min(lngmin, coords[0])
            latmin = min(latmin, coords[1])
            lngmax = max(lngmax, coords[0])
            latmax = max(latmax, coords[1])
        else:
            for c in coords:
                walk_coords(c)

    for feat in geojson.get("features", []):
        geom = feat.get("geometry")
        if geom and geom.get("coordinates"):
            walk_coords(geom["coordinates"])

    return {
        "south": latmin, "west": lngmin,
        "north": latmax, "east": lngmax,
    }


SVG_WIDTH = 1000


def normalize_to_svg(projected_features: list[dict], bounds: dict, display_field: str) -> list[dict]:
    """Convert projected coordinates to normalized SVG path data within a shared viewBox."""
    dx = bounds["xmax"] - bounds["xmin"]
    dy = bounds["ymax"] - bounds["ymin"]
    if dx == 0 or dy == 0:
        return []

    svg_height = round(SVG_WIDTH * dy / dx)
    scale = SVG_WIDTH / dx

    def to_svg(x: float, y: float) -> tuple[float, float]:
        sx = round((x - bounds["xmin"]) * scale, 2)
        sy = round((bounds["ymax"] - y) * scale, 2)
        return (sx, sy)

    results = []
    for feat in projected_features:
        geom = feat.get("geometry", {})
        attrs = feat.get("attributes", {})
        rings = geom.get("rings") or geom.get("paths") or []
        paths: list[str] = []

        for ring in rings:
            parts: list[str] = []
            for i, (x, y) in enumerate(ring):
                sx, sy = to_svg(x, y)
                cmd = "M" if i == 0 else "L"
                parts.append(f"{cmd}{sx},{sy}")
            if geom.get("rings"):
                parts.append("Z")
            paths.append("".join(parts))

        label = attrs.get(display_field, "") if display_field else ""
        results.append({
            "d": " ".join(paths),
            "label": str(label),
            "properties": {k: v for k, v in attrs.items()
                          if k not in ("Shape", "Shape.STArea()", "Shape.STLength()",
                                       "Shape_Leng", "Shape_Le_1", "Shape_Le_2")},
        })

    return results


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat()

    city_bounds_3857 = None
    city_bounds_latlng = None
    manifest_layers: list[dict] = []
    svg_layers: dict = {}

    # Fetch city limits first to establish bounds
    print("Fetching City Limits for bounds reference...")
    city_cfg = next(l for l in LAYERS if l["id"] == "city_limits")
    city_geojson = fetch_geojson(city_cfg["service"], city_cfg["layer_id"])
    city_projected = fetch_projected(city_cfg["service"], city_cfg["layer_id"])
    city_bounds_3857 = compute_bounds_3857(city_projected)
    city_bounds_latlng = compute_bounds_latlng(city_geojson)
    print(f"  City bounds (lat/lng): {city_bounds_latlng}")
    print(f"  City bounds (3857): {city_bounds_3857}")

    dx = city_bounds_3857["xmax"] - city_bounds_3857["xmin"]
    dy = city_bounds_3857["ymax"] - city_bounds_3857["ymin"]
    svg_height = round(SVG_WIDTH * dy / dx) if dx > 0 else SVG_WIDTH
    svg_viewbox = f"0 0 {SVG_WIDTH} {svg_height}"
    print(f"  SVG viewBox: {svg_viewbox}")

    for layer_cfg in LAYERS:
        lid = layer_cfg["id"]
        print(f"\nProcessing layer: {layer_cfg['name']} ({lid})")

        if lid == "city_limits":
            geojson = city_geojson
            projected = city_projected
        else:
            geojson = fetch_geojson(layer_cfg["service"], layer_cfg["layer_id"])
            projected = fetch_projected(layer_cfg["service"], layer_cfg["layer_id"])
            time.sleep(0.5)

        feature_count = len(geojson.get("features", []))
        layer_bounds = compute_bounds_latlng(geojson)

        geojson_path = os.path.join(OUT_DIR, f"gis_{lid}.geojson")
        with open(geojson_path, "w") as f:
            json.dump(geojson, f, separators=(",", ":"))
        print(f"  Wrote {geojson_path} ({feature_count} features)")

        svg_paths = normalize_to_svg(
            projected, city_bounds_3857, layer_cfg["display_field"]
        )
        svg_layers[lid] = {
            "name": layer_cfg["name"],
            "features": svg_paths,
        }
        print(f"  Normalized {len(svg_paths)} SVG paths")

        manifest_layers.append({
            "id": lid,
            "name": layer_cfg["name"],
            "sourceUrl": f"{ARCGIS_BASE}/{layer_cfg['service']}/{layer_cfg['layer_id']}",
            "displayField": layer_cfg["display_field"],
            "geometryType": layer_cfg["geometry_type"],
            "featureCount": feature_count,
            "defaultVisible": layer_cfg["default_visible"],
            "style": layer_cfg["style"],
            "bounds": layer_bounds,
        })

    manifest = {
        "fetchedAt": now,
        "cityBounds": {
            "latlng": city_bounds_latlng,
            "mercator3857": city_bounds_3857,
        },
        "svgViewBox": svg_viewbox,
        "layers": manifest_layers,
    }

    manifest_path = os.path.join(OUT_DIR, "gis_layers.json")
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, separators=(",", ":"))
    print(f"\nWrote manifest: {manifest_path}")

    svg_data = {
        "viewBox": svg_viewbox,
        "width": SVG_WIDTH,
        "height": svg_height,
        "bounds3857": city_bounds_3857,
        "layers": svg_layers,
    }
    svg_path = os.path.join(OUT_DIR, "gis_svg_layers.json")
    with open(svg_path, "w") as f:
        json.dump(svg_data, f, separators=(",", ":"))
    print(f"Wrote SVG layers: {svg_path}")

    print("\nDone.")


if __name__ == "__main__":
    main()
