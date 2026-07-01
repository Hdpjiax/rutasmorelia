from __future__ import annotations

import hashlib
import html
import json
from pathlib import Path
from typing import Any

from .config import RouteDefinition
from .kml import Direction
from .valhalla_engine import MatchedComponent
from .validation import ComponentReport


def canonical_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _feature(direction: Direction, components: list[MatchedComponent], route: RouteDefinition) -> dict[str, Any]:
    return {
        "type": "Feature",
        "properties": {
            "id": f"{route.code}_{direction.index - 1}",
            "routeId": route.code,
            "routeName": route.name,
            "direction": "ida" if direction.index == 1 else "vuelta",
            "directionIndex": direction.index,
            "color": route.color,
            "casingColor": "#222222",
            "transportType": route.transport_type,
            "name": "Ida" if direction.index == 1 else "Vuelta",
        },
        "geometry": {
            "type": "MultiLineString",
            "coordinates": [[list(point) for point in component.coordinates] for component in components],
        },
    }


def write_artifacts(
    output: Path,
    route: RouteDefinition,
    directions: list[Direction],
    matched: list[list[MatchedComponent]],
    reports: list[ComponentReport],
    metadata: dict[str, Any],
) -> dict[str, Any]:
    output.mkdir(parents=True, exist_ok=True)
    raw = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"direction": direction.index, "name": direction.name, "kind": "official_kml"},
                "geometry": {"type": "MultiLineString", "coordinates": direction.components},
            }
            for direction in directions
        ],
    }
    geojson = {
        "type": "FeatureCollection",
        "features": [_feature(direction, matched[index], route) for index, direction in enumerate(directions)],
    }
    edges = {
        "route": route.slug,
        "directions": [
            [
                {
                    "component": component_index,
                    "edge_ids": [edge.get("id") for edge in component.edges],
                    "way_ids": [edge.get("way_id") for edge in component.edges],
                    "edges": component.edges,
                }
                for component_index, component in enumerate(components, 1)
            ]
            for components in matched
        ],
    }
    quality_pass = all(report.quality_pass for report in reports)
    report = {
        "schema_version": 1,
        "route": route.slug,
        "route_code": route.code,
        "method": "hybrid_kml_corridor_pyvalhalla_bus_ignore_oneways",
        "quality_pass": quality_pass,
        "manually_approved": False,
        "metadata": metadata,
        "components": [item.to_dict() for item in reports],
    }
    report["artifact_sha256"] = canonical_hash(geojson)
    (output / "source.geojson").write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    (output / f"{route.code}.geojson").write_text(json.dumps(geojson, ensure_ascii=False), encoding="utf-8")
    (output / "edges.json").write_text(json.dumps(edges, ensure_ascii=False, indent=2), encoding="utf-8")
    (output / "validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (output / "rejected-segments.json").write_text(
        json.dumps([item.to_dict() for item in reports if not item.quality_pass], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output / "review.html").write_text(_review_html(route, raw, geojson, report), encoding="utf-8")
    return report


def _review_html(route: RouteDefinition, source: dict, matched: dict, report: dict) -> str:
    source_json = json.dumps(source, ensure_ascii=False).replace("</", "<\\/")
    matched_json = json.dumps(matched, ensure_ascii=False).replace("</", "<\\/")
    status = "APROBACIÓN GEOMÉTRICA DISPONIBLE" if report["quality_pass"] else "RECHAZADA POR VALIDACIÓN"
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{html.escape(route.name)} · revisión</title>
<link href="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css" rel="stylesheet"><style>
html,body,#map{{height:100%;margin:0}} aside{{position:absolute;z-index:2;left:12px;top:12px;background:#fff;padding:12px 16px;font:13px system-ui;border-radius:8px;box-shadow:0 2px 12px #0003}} .bad{{color:#a00}} .good{{color:#275f13}}</style></head>
<body><aside><strong>{html.escape(route.name)}</strong><br><span class="{'good' if report['quality_pass'] else 'bad'}">{status}</span><br>Rojo: KML · Amarillo: Valhalla</aside><div id="map"></div>
<script src="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script><script>
const source={source_json}, matched={matched_json};
const map=new maplibregl.Map({{container:'map',style:localStorage.getItem('viamorelia-style')||'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',center:[-101.19,19.70],zoom:12}});
map.on('load',()=>{{map.addSource('kml',{{type:'geojson',data:source}});map.addLayer({{id:'kml',type:'line',source:'kml',paint:{{'line-color':'#e53935','line-width':5,'line-opacity':.55}}}});map.addSource('matched',{{type:'geojson',data:matched}});map.addLayer({{id:'matched',type:'line',source:'matched',paint:{{'line-color':'#ffc800','line-width':2.5}}}});const b=new maplibregl.LngLatBounds();for(const f of source.features)for(const line of f.geometry.coordinates)for(const c of line)b.extend(c);map.fitBounds(b,{{padding:35}})}});
</script></body></html>"""
