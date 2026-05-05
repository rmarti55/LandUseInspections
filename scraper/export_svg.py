"""
Build a single Illustrator-friendly SVG from normalized GIS path data.

Reads:
  public/data/gis_svg_layers.json
  public/data/gis_layers.json

Writes:
  public/data/santa_fe_gis_layers.svg

Layer order (bottom to top): City Limits, Zoning, Historic Districts.

Usage:
    python export_svg.py
"""

import json
import os
import re
from xml.sax.saxutils import escape

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "data")
SVG_PATH_OUT = os.path.join(DATA_DIR, "santa_fe_gis_layers.svg")


def _sanitize_id(prefix: str, index: int, raw: object) -> str:
    safe = re.sub(r"[^\w\-:.]", "_", str(raw))[:120]
    if not safe:
        safe = str(index)
    return f"{prefix}_{index}_{safe}"


def _attr_esc(value: object) -> str:
    return escape(str(value), {"'": "&apos;", '"': "&quot;"})


def main() -> None:
    svg_path = os.path.join(DATA_DIR, "gis_svg_layers.json")
    manifest_path = os.path.join(DATA_DIR, "gis_layers.json")

    with open(svg_path) as f:
        svg_data = json.load(f)
    with open(manifest_path) as f:
        manifest = json.load(f)

    viewbox = svg_data["viewBox"]
    width = int(svg_data["width"])
    height = int(svg_data["height"])

    meta_by_id = {layer["id"]: layer for layer in manifest["layers"]}

    chunks: list[str] = []
    chunks.append('<?xml version="1.0" encoding="UTF-8"?>')
    chunks.append(
        '<svg xmlns="http://www.w3.org/2000/svg" '
        'xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" '
        'xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{width}" height="{height}" '
        f'viewBox="{viewbox}" preserveAspectRatio="xMidYMid meet">'
    )
    chunks.append(
        '<title>Santa Fe — City limits, zoning, historic districts '
        "(normalized to city outline)</title>"
    )
    chunks.append(
        f'<desc>Generated from gis_svg_layers.json · fetched {manifest.get("fetchedAt", "?")}'
        "</desc>"
    )

    layer_defs = [
        ("city_limits", "City Limits"),
        ("zoning", "Zoning"),
        ("historic_districts", "Historic Districts"),
    ]

    for layer_key, inkscape_label in layer_defs:
        layer_meta = meta_by_id[layer_key]
        style = layer_meta["style"]
        feats = svg_data["layers"][layer_key]["features"]

        chunks.append(
            f'<g id="{layer_key}" inkscape:groupmode="layer" '
            f'inkscape:label="{_attr_esc(inkscape_label)}">'
        )

        if layer_key == "city_limits":
            for i, feat in enumerate(feats):
                pid = _sanitize_id("city_lim", i, feat.get("label") or "outline")
                label = feat.get("label") or "City limits"
                d = feat["d"]
                stroke = style.get("color", "#000000")
                sw = style.get("weight", 2)
                dash = style.get("dashArray", "")
                da_attr = f' stroke-dasharray="{_attr_esc(dash)}"' if dash else ""
                chunks.append(
                    f'<path id="{pid}" '
                    f'data-label="{_attr_esc(label)}" '
                    f'd="{d}" '
                    f'fill="none" '
                    f'stroke="{_attr_esc(stroke)}" '
                    f'stroke-width="{sw}" '
                    f'stroke-linejoin="round" '
                    f'stroke-linecap="round"{da_attr}/>'
                )

        elif layer_key == "zoning":
            fc = style.get("color", "#6b7280")
            fo = style.get("fillOpacity", 0.12)
            sw = style.get("weight", 1)
            for i, feat in enumerate(feats):
                zname = (
                    feat.get("properties", {}).get("ZDESC")
                    or feat.get("label")
                    or f"zone_{i}"
                )
                pid = _sanitize_id(
                    "zoning",
                    i,
                    feat.get("properties", {}).get("OBJECTID", zname),
                )
                d = feat["d"]
                chunks.append(
                    f'<path id="{pid}" '
                    f'data-label="{_attr_esc(zname)}" '
                    f'd="{d}" '
                    f'fill="{_attr_esc(fc)}" '
                    f'fill-opacity="{fo}" '
                    f'stroke="{_attr_esc(fc)}" '
                    f'stroke-width="{sw}" '
                    f'stroke-linejoin="round"/>'
                )

        elif layer_key == "historic_districts":
            palette = style.get("colors") or {}
            sw = style.get("weight", 2)
            fo = style.get("fillOpacity", 0.35)
            for i, feat in enumerate(feats):
                pname = (
                    feat.get("properties", {}).get("HDSTNAM")
                    or feat.get("label")
                    or f"district_{i}"
                )
                color = palette.get(str(pname), "#6b7280")
                pid = _sanitize_id("hd", i, pname)
                d = feat["d"]
                chunks.append(
                    f'<path id="{pid}" '
                    f'data-label="{_attr_esc(pname)}" '
                    f'd="{d}" '
                    f'fill="{_attr_esc(color)}" '
                    f'fill-opacity="{fo}" '
                    f'stroke="{_attr_esc(color)}" '
                    f'stroke-width="{sw}" '
                    f'stroke-linejoin="round"/>'
                )

        chunks.append("</g>")

    chunks.append("</svg>")

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SVG_PATH_OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(chunks))

    print("Wrote", SVG_PATH_OUT)
    print(
        f"  viewBox: {viewbox} · paths: limits="
        f"{len(svg_data['layers']['city_limits']['features'])}, "
        f"zoning={len(svg_data['layers']['zoning']['features'])}, "
        f"historic={len(svg_data['layers']['historic_districts']['features'])}"
    )


if __name__ == "__main__":
    main()
