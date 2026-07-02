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
    raw_directions = parse_kml(route.kml)
    should_swap_and_reverse = route.code not in ("79", "13")
    if should_swap_and_reverse and len(raw_directions) == 2:
        dir1 = Direction(1, raw_directions[1].name, raw_directions[1].components)
        dir2 = Direction(2, raw_directions[0].name, raw_directions[0].components)
        directions = [dir1, dir2]
    else:
        directions = raw_directions
    directions, reference_overrides = _apply_reference_overrides(route, directions)
    if len(directions) != 2:
        raise ValueError(f"La ruta piloto debe contener exactamente ida y vuelta; se encontraron {len(directions)}")
    if should_swap_and_reverse and len(directions) == 2:
        reversed_directions = []
        for d in directions:
            rev_comps = []
            for comp in reversed(d.components):
                rev_comps.append(list(reversed(comp)))
            reversed_directions.append(Direction(d.index, d.name, rev_comps))
        directions = reversed_directions
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
    corrected: list[Direction] = []
    audit: list[dict[str, Any]] = []

    if route.slug == "13-cafe-oro-2-leandro-valle":
        dir1_comps = [comp[:] for comp in directions[0].components]
        dir2_comps = [comp[:] for comp in directions[1].components]
        
        COORDS_AB = [
            (-101.150320, 19.697115),
            (-101.150487, 19.697228),
            (-101.150914, 19.697533),
            (-101.151044, 19.697578),
            (-101.151314, 19.697773),
            (-101.151559, 19.697945),
            (-101.152200, 19.698445),
            (-101.152725, 19.698857),
            (-101.153178, 19.699212),
            (-101.153355, 19.699350),
            (-101.153683, 19.699608),
            (-101.153849, 19.699738),
            (-101.154640, 19.700373),
            (-101.154814, 19.700524),
            (-101.155505, 19.701068),
            (-101.156002, 19.701456),
            (-101.156583, 19.701930),
            (-101.157066, 19.702291),
            (-101.158153, 19.703167),
            (-101.158224, 19.703222),
            (-101.159596, 19.704289),
            (-101.160111, 19.704670),
            (-101.160370, 19.704872),
            (-101.160621, 19.705061),
            (-101.160847, 19.705259),
            (-101.160906, 19.705310),
            (-101.161506, 19.705814),
            (-101.162269, 19.706423),
            (-101.162374, 19.706506),
            (-101.162601, 19.706685),
            (-101.162993, 19.707053),
            (-101.163330, 19.707376),
            (-101.163597, 19.707765),
            (-101.163599, 19.707796),
            (-101.163566, 19.707834),
            (-101.163736, 19.707988),
            (-101.164184, 19.708618),
            (-101.164235, 19.708675),
            (-101.164539, 19.709057),
            (-101.164843, 19.709448),
            (-101.165138, 19.709769),
            (-101.165274, 19.709964),
            (-101.165291, 19.710018),
            (-101.165297, 19.710082),
            (-101.165268, 19.710201),
            (-101.165287, 19.710320),
            (-101.165340, 19.710413),
            (-101.165434, 19.710471),
            (-101.165545, 19.710502),
            (-101.165614, 19.710521),
            (-101.165794, 19.710559),
            (-101.165972, 19.710637),
            (-101.166093, 19.710727),
            (-101.166126, 19.710756),
            (-101.166365, 19.710949),
            (-101.166992, 19.711429),
            (-101.167239, 19.712859),
            (-101.166235, 19.712884),
            (-101.165348, 19.712924),
            (-101.165382, 19.713212),
            (-101.164494, 19.713341),
            (-101.164055, 19.713395),
        ]
        COORDS_BA = [
            (-101.164055, 19.713395),
            (-101.163532, 19.713459),
            (-101.163436, 19.712962),
            (-101.163346, 19.712542),
            (-101.163295, 19.712272),
            (-101.163131, 19.711496),
            (-101.163796, 19.711202),
            (-101.163995, 19.711114),
            (-101.164569, 19.710867),
            (-101.165081, 19.710631),
            (-101.165434, 19.710471),
            (-101.165545, 19.710502),
            (-101.165697, 19.710476),
            (-101.165826, 19.710456),
            (-101.165984, 19.710413),
            (-101.166156, 19.710337),
            (-101.166366, 19.710139),
            (-101.166405, 19.710050),
            (-101.166394, 19.709961),
            (-101.166333, 19.709870),
            (-101.166225, 19.709815),
            (-101.166113, 19.709797),
            (-101.165954, 19.709771),
            (-101.165844, 19.709743),
            (-101.165737, 19.709700),
            (-101.165611, 19.709653),
            (-101.165476, 19.709586),
            (-101.165315, 19.709427),
            (-101.165159, 19.709239),
            (-101.165017, 19.709039),
            (-101.164746, 19.708675),
            (-101.164380, 19.708213),
            (-101.164334, 19.708155),
            (-101.164019, 19.707726),
            (-101.163863, 19.707527),
            (-101.163477, 19.707209),
            (-101.163078, 19.706787),
            (-101.162110, 19.705952),
            (-101.161039, 19.705127),
            (-101.160778, 19.704926),
            (-101.160171, 19.704482),
            (-101.157794, 19.702578),
            (-101.155337, 19.700636),
            (-101.154916, 19.700296),
            (-101.154800, 19.700210),
            (-101.154455, 19.699921),
            (-101.153872, 19.699448),
            (-101.151663, 19.697754),
            (-101.151460, 19.697608),
            (-101.151320, 19.697425),
            (-101.150983, 19.697194),
            (-101.150653, 19.696947),
            (-101.150409, 19.696765),
            (-101.150134, 19.696553),
            (-101.149951, 19.696404),
            (-101.149776, 19.696235),
            (-101.149676, 19.696093),
            (-101.149563, 19.695851),
            (-101.149513, 19.695673),
            (-101.149491, 19.695549),
            (-101.149485, 19.695386),
            (-101.149477, 19.695275),
            (-101.149474, 19.695182),
            (-101.149462, 19.695118),
            (-101.149437, 19.695077),
            (-101.149372, 19.695066),
            (-101.149262, 19.695064),
            (-101.149165, 19.695077),
            (-101.149122, 19.695136),
            (-101.149085, 19.695257),
            (-101.149080, 19.695357),
            (-101.149078, 19.695466),
            (-101.149083, 19.695704),
            (-101.149262, 19.695064),
        ]
        if len(dir2_comps) >= 1:
            c1_vuelta = dir2_comps[0]
            dir2_comps[0] = COORDS_AB + COORDS_BA[1:] + c1_vuelta[57:]
            audit.append({
                "direction": 2,
                "component": 1,
                "reason": "user_reviewed_hardcoded_clean_periferico_loop_vuelta",
            })
            if len(dir1_comps) >= 2:
                c2_ida = dir1_comps[1]
                dir1_comps[1] = c2_ida[:22] + COORDS_AB[20:] + COORDS_BA[1:]
                audit.append({
                    "direction": 1,
                    "component": 2,
                    "reason": "user_reviewed_hardcoded_clean_periferico_loop_ida",
                })
        corrected.append(Direction(directions[0].index, directions[0].name, dir1_comps))
        corrected.append(Direction(directions[1].index, directions[1].name, dir2_comps))
        return corrected, audit

    if route.slug != "alberca-gertrudis":
        return directions, []
    corrected: list[Direction] = []
    audit: list[dict[str, Any]] = []
    for direction in directions:
        components = [component[:] for component in direction.components]
        if direction.index == 1:
            # 1. Felix Ireta Area correction (first image):
            # Replace components[1] (Ida component 2) index 0 to 220 with Vuelta component 1 index 343 to 539 reversed
            if len(components) >= 2:
                vuelta_comp = directions[1].components[0]
                highway_segment = vuelta_comp[343:540]
                components[1] = highway_segment[::-1] + components[1][221:]
                audit.append({
                    "direction": 1,
                    "component": 2,
                    "reason": "user_reviewed_highway_at_felix_ireta_first_image",
                })
            
            # 2. Torreón Nuevo / Sierra Leona Area correction (second image):
            # Apply southward shift -0.0003 to components[2] index 310 to 365,
            # and replace index 365 to the end with hardcoded highway coords
            if len(components) >= 3:
                comp3 = components[2]
                start, end = 310, 365
                shift = -0.0003
                taper_points = 6
                adjusted = []
                for index, (longitude, latitude) in enumerate(comp3):
                    lat_val = latitude
                    if start <= index <= end:
                        taper = max(0.0, min(1.0, (index - start) / taper_points))
                        lat_val += shift * taper
                    adjusted.append((longitude, lat_val))
                
                highway_coords = [
                    (-101.215600, 19.743199),
                    (-101.216320, 19.743260),
                    (-101.216422, 19.743848),
                    (-101.216588, 19.743911),
                    (-101.216789, 19.744124),
                    (-101.216853, 19.744190),
                    (-101.216963, 19.744259),
                    (-101.217074, 19.744327),
                    (-101.217194, 19.744468),
                    (-101.217204, 19.744515),
                    (-101.217174, 19.744586),
                    (-101.216842, 19.745144),
                    (-101.216347, 19.745973),
                    (-101.217033, 19.746328),
                    (-101.217981, 19.746838),
                    (-101.219342, 19.747496),
                    (-101.219747, 19.747689),
                    (-101.219508, 19.748004),
                    (-101.219260, 19.748363),
                    (-101.218964, 19.748935),
                    (-101.218496, 19.749578),
                    (-101.218152, 19.750130),
                    (-101.218044, 19.750472),
                    (-101.217755, 19.751038),
                    (-101.217345, 19.751632),
                    (-101.217779, 19.751860),
                    (-101.217899, 19.751921),
                    (-101.217992, 19.751968),
                ]
                components[2] = adjusted[:365] + highway_coords
                audit.append({
                    "direction": 1,
                    "component": 3,
                    "reason": "user_reviewed_sierra_leona_and_highway_second_image",
                })
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
