"""
Build a single Illustrator-friendly SVG from normalized GIS path data.

Reads:
  public/data/gis_svg_layers.json
  public/data/gis_layers.json

Writes:
  public/data/santa_fe_gis_layers.svg

Layer order (bottom to top): City Limits, Zoning, Historic Districts.

Zoning polygons are nested into sub-groups **one per ZDESC code** so Adobe
Illustrator shows recognizable layer names in the Layers panel; each path
includes a <title> with the zone code.

Usage:
    python export_svg.py
"""

from collections import defaultdict
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


def _safe_xml_fragment(s: str) -> str:
    """Fragment usable inside XML id; ASCII word chars ; no leading digit."""
    frag = re.sub(r"[^\w\-:.]", "_", str(s))[:100].strip("_")
    if not frag:
        frag = "_"
    if frag[0].isdigit() or not re.match(r"^[A-Za-z_]", frag):
        frag = "z_" + frag
    return frag


def _path_id_zoning(zcode: str, feat_props: dict, feat_index: int) -> str:
    zslug = _safe_xml_fragment(zcode)
    oid = feat_props.get("OBJECTID")
    oid1 = feat_props.get("OBJECTID_1")
    uniq = oid if oid is not None else (oid1 if oid1 is not None else feat_index)
    uniq_s = _safe_xml_fragment(str(uniq))
    return f"zon_{zslug}_{uniq_s}_i{feat_index}"


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
            title_txt = "City limits"
            for i, feat in enumerate(feats):
                pid = _sanitize_id("city_lim", i, feat.get("label") or "outline")
                label = feat.get("label") or title_txt
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
                    f'stroke-linecap="round"{da_attr}>'
                    f"<title>{_attr_esc(title_txt)}</title></path>"
                )

        elif layer_key == "zoning":
            fc = style.get("color", "#6b7280")
            fo = style.get("fillOpacity", 0.12)
            sw = style.get("weight", 1)
            buckets: dict[str, list[tuple[int, dict]]] = defaultdict(list)
            for i, feat in enumerate(feats):
                props = feat.get("properties") or {}
                zcode = (props.get("ZDESC") or feat.get("label") or "UNKNOWN").strip()
                if not zcode:
                    zcode = "UNKNOWN"
                buckets[zcode].append((i, feat))

            for zcode in sorted(buckets.keys()):
                gslug = _safe_xml_fragment(zcode)
                group_id = f"zoning_grp_{gslug}"
                chunks.append(
                    f'<g id="{group_id}" inkscape:groupmode="layer" '
                    f'inkscape:label="{_attr_esc(zcode)}">'
                )
                for feat_index, feat in buckets[zcode]:
                    props = feat.get("properties") or {}
                    pid = _path_id_zoning(zcode, props, feat_index)
                    d = feat["d"]
                    chunks.append(
                        f'<path id="{pid}" '
                        f'data-label="{_attr_esc(zcode)}" '
                        f'd="{d}" '
                        f'fill="{_attr_esc(fc)}" '
                        f'fill-opacity="{fo}" '
                        f'stroke="{_attr_esc(fc)}" '
                        f'stroke-width="{sw}" '
                        f'stroke-linejoin="round">'
                        f"<title>{_attr_esc(zcode)}</title></path>"
                    )
                chunks.append("</g>")

        elif layer_key == "historic_districts":
            palette = style.get("colors") or {}
            sw = style.get("weight", 2)
            fo = style.get("fillOpacity", 0.35)
            hd_buckets: dict[str, list[tuple[int, dict]]] = defaultdict(list)
            for i, feat in enumerate(feats):
                props = feat.get("properties") or {}
                name = (props.get("HDSTNAM") or feat.get("label") or "UNKNOWN").strip()
                if not name:
                    name = "UNKNOWN"
                hd_buckets[name].append((i, feat))

            for hname in sorted(hd_buckets.keys()):
                hslug = _safe_xml_fragment(hname)
                group_id = f"historic_grp_{hslug}"
                chunks.append(
                    f'<g id="{group_id}" inkscape:groupmode="layer" '
                    f'inkscape:label="{_attr_esc(hname)}">'
                )
                for feat_index, feat in hd_buckets[hname]:
                    props = feat.get("properties") or {}
                    pname = (
                        props.get("HDSTNAM")
                        or feat.get("label")
                        or f"district_{feat_index}"
                    )
                    color = palette.get(str(pname), "#6b7280")
                    pid = _sanitize_id("hd", feat_index, pname)
                    d = feat["d"]
                    chunks.append(
                        f'<path id="{pid}" '
                        f'data-label="{_attr_esc(pname)}" '
                        f'd="{d}" '
                        f'fill="{_attr_esc(color)}" '
                        f'fill-opacity="{fo}" '
                        f'stroke="{_attr_esc(color)}" '
                        f'stroke-width="{sw}" '
                        f'stroke-linejoin="round">'
                        f"<title>{_attr_esc(str(pname))}</title></path>"
                    )
                chunks.append("</g>")

        chunks.append("</g>")

    chunks.append("</svg>")

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(SVG_PATH_OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(chunks))

    feats_z = svg_data["layers"]["zoning"]["features"]
    z_buckets: dict[str, int] = defaultdict(int)
    for f in feats_z:
        p = f.get("properties") or {}
        zc = (p.get("ZDESC") or f.get("label") or "UNKNOWN").strip() or "UNKNOWN"
        z_buckets[zc] += 1

    print("Wrote", SVG_PATH_OUT)
    print(
        f"  viewBox: {viewbox} · paths: limits="
        f"{len(svg_data['layers']['city_limits']['features'])}, "
        f"zoning={len(feats_z)} ({len(z_buckets)} ZDESC sub-layers), "
        f"historic={len(svg_data['layers']['historic_districts']['features'])}"
    )


if __name__ == "__main__":
    main()
