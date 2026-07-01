from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .artifacts import write_artifacts
from .config import DATA_ROOT, OUTPUT_ROOT, QualityThresholds, RouteDefinition
from .geometry import distance_m, line_length_m
from .kml import Direction, parse_kml
from .valhalla_engine import actor_version, create_actor, match_component
from .validation import validate_component


def build_route(route: RouteDefinition, config_path: Path | None = None) -> tuple[Path, dict[str, Any]]:
    config_path = config_path or DATA_ROOT / "valhalla.json"
    if not config_path.is_file():
        raise FileNotFoundError(
            f"Falta {config_path}. Ejecute primero: python -m route_pipeline bootstrap-map --pbf <archivo.osm.pbf>"
        )
    directions, reference_overrides = _apply_reference_overrides(route, parse_kml(route.kml))
    if len(directions) != 2:
        raise ValueError(f"La ruta piloto debe contener exactamente ida y vuelta; se encontraron {len(directions)}")
    actor = create_actor(config_path)
    thresholds = QualityThresholds()
    matched = []
    reports = []
    ignored_components: list[dict[str, Any]] = []
    for direction in directions:
        direction_matches = []
        selected = _select_components(direction.index, direction.components, ignored_components)
        for component_index, component in selected:
            result = match_component(actor, component, thresholds)
            direction_matches.append(result)
            reports.append(validate_component(direction.index, component_index, component, result, thresholds))
        matched.append(direction_matches)
    metadata_path = DATA_ROOT / "metadata.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8")) if metadata_path.is_file() else {}
    metadata.update(
        {
            "built_at": datetime.now(timezone.utc).isoformat(),
            "actor_status": actor_version(actor),
            "kml": str(route.kml),
            "pdf": str(route.pdf) if route.pdf else None,
            "ignored_kml_components": ignored_components,
            "reference_overrides": reference_overrides,
        }
    )
    output = OUTPUT_ROOT / route.slug
    report = write_artifacts(output, route, directions, matched, reports, metadata)
    return output, report


def _apply_reference_overrides(
    route: RouteDefinition, directions: list[Direction]
) -> tuple[list[Direction], list[dict[str, Any]]]:
    """Apply user-reviewed, local corridor corrections without touching other geometry."""
    if route.slug != "alberca-gertrudis":
        return directions, []
    corrected: list[Direction] = []
    audit: list[dict[str, Any]] = []
    for direction in directions:
        components = [component[:] for component in direction.components]
        if direction.index == 1 and len(components) >= 3:
            component = components[2]
            start, end, latitude_shift = 325, 375, -0.00070
            taper_points = 12
            adjusted = []
            for index, (longitude, latitude) in enumerate(component):
                if start <= index <= end:
                    taper = max(0.0, min(1.0, (index - start) / taper_points, (end - index) / taper_points))
                    latitude += latitude_shift * taper
                adjusted.append((longitude, latitude))
            components[2] = adjusted
            audit.append(
                {
                    "direction": 1,
                    "component": 3,
                    "source_index_start": start,
                    "source_index_end": end,
                    "latitude_shift_degrees": latitude_shift,
                    "taper_points": taper_points,
                    "reason": "user_reviewed_lower_carriageway_at_prensa_libre",
                }
            )
        corrected.append(Direction(direction.index, direction.name, components))
    return corrected, audit


def _select_components(
    direction_index: int,
    components: list[list[tuple[float, float]]],
    ignored: list[dict[str, Any]],
) -> list[tuple[int, list[tuple[float, float]]]]:
    """Remove only near-zero markers already covered by a real component endpoint.

    ArcGIS KML exports often include a 2-point selection marker at a split. It is
    not a road and asking Valhalla to route between those points can create a
    false loop. Longer return fragments are deliberately preserved.
    """
    endpoints = [
        point
        for component in components
        if line_length_m(component) > 5.0
        for point in (component[0], component[-1])
    ]
    selected: list[tuple[int, list[tuple[float, float]]]] = []
    for component_index, component in enumerate(components, 1):
        length = line_length_m(component)
        covered = length <= 5.0 and endpoints and all(min(distance_m(point, endpoint) for endpoint in endpoints) <= 10 for point in component)
        if covered:
            ignored.append(
                {
                    "direction": direction_index,
                    "component": component_index,
                    "length_m": round(length, 3),
                    "reason": "redundant_sub_5m_kml_marker",
                }
            )
        else:
            selected.append((component_index, component))
    return selected


def validate_existing(route: RouteDefinition) -> dict[str, Any]:
    report_path = OUTPUT_ROOT / route.slug / "validation.json"
    if not report_path.is_file():
        raise FileNotFoundError("No existe una compilación para validar")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    geojson_path = OUTPUT_ROOT / route.slug / f"{route.code}.geojson"
    if not geojson_path.is_file():
        raise FileNotFoundError("Falta el GeoJSON ajustado")
    from .artifacts import canonical_hash

    actual_hash = canonical_hash(json.loads(geojson_path.read_text(encoding="utf-8")))
    report["artifact_integrity"] = actual_hash == report.get("artifact_sha256")
    report["quality_pass"] = bool(report.get("quality_pass") and report["artifact_integrity"])
    return report
