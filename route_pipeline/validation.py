from __future__ import annotations

from dataclasses import asdict, dataclass

from .config import QualityThresholds
from .geometry import Coordinate, densify, distance_m, distances_to_line, line_length_m, percentile
from .valhalla_engine import MatchedComponent


@dataclass
class ComponentReport:
    direction: int
    component: int
    source_points: int
    output_points: int
    edge_count: int
    source_length_m: float
    output_length_m: float
    search_radius_m: int
    source_to_output_p95_m: float
    source_to_output_max_m: float
    endpoint_start_m: float
    endpoint_end_m: float
    disconnected_edge_ranges: int
    illegal_edges: int
    oneway_conflicts: int
    dangling_branches: int
    quality_pass: bool
    errors: list[str]

    def to_dict(self) -> dict:
        return asdict(self)


def _illegal_edge_count(edges: list[dict]) -> int:
    illegal = 0
    for edge in edges:
        traversability = edge.get("traversability")
        # "backward" can be the legal traversal direction relative to the OSM
        # way orientation. Valhalla's costing already enforces access/oneway.
        if traversability == "none":
            illegal += 1
    return illegal


def _oneway_conflict_count(edges: list[dict]) -> int:
    return sum(1 for edge in edges if edge.get("traversability") == "backward")


def _edge_discontinuities(edges: list[dict]) -> int:
    discontinuities = 0
    previous_end: int | None = None
    for edge in edges:
        begin, end = edge.get("begin_shape_index"), edge.get("end_shape_index")
        if isinstance(begin, int) and previous_end is not None and begin > previous_end + 1:
            discontinuities += 1
        if isinstance(end, int):
            previous_end = end
    return discontinuities


def validate_component(
    direction_index: int,
    component_index: int,
    source: list[Coordinate],
    matched: MatchedComponent,
    thresholds: QualityThresholds,
) -> ComponentReport:
    sampled_source = densify(source, thresholds.densify_m)
    distances = distances_to_line(sampled_source, matched.coordinates)
    p95 = percentile(distances, 0.95)
    maximum = max(distances, default=float("inf"))
    start = distance_m(source[0], matched.coordinates[0]) if matched.coordinates else float("inf")
    end = distance_m(source[-1], matched.coordinates[-1]) if matched.coordinates else float("inf")
    disconnected = _edge_discontinuities(matched.edges)
    illegal = _illegal_edge_count(matched.edges)
    oneway_conflicts = _oneway_conflict_count(matched.edges)
    errors: list[str] = []
    if not matched.edges:
        errors.append("sin_aristas")
    if disconnected:
        errors.append("aristas_desconectadas")
    if illegal:
        errors.append("sentido_ilegal")
    if p95 > thresholds.p95_distance_m:
        errors.append("p95_fuera_de_corredor")
    if maximum > thresholds.max_distance_m:
        errors.append("maximo_fuera_de_corredor")
    if start > thresholds.endpoint_distance_m or end > thresholds.endpoint_distance_m:
        errors.append("extremos_no_coinciden")
    # trace_attributes returns a single ordered edge chain. Extra graph branches are never accepted.
    dangling = sum(1 for edge in matched.edges if edge.get("begin_shape_index") == edge.get("end_shape_index"))
    if dangling:
        errors.append("ramas_sin_longitud")
    return ComponentReport(
        direction=direction_index,
        component=component_index,
        source_points=len(source),
        output_points=len(matched.coordinates),
        edge_count=len(matched.edges),
        source_length_m=round(line_length_m(source), 3),
        output_length_m=round(line_length_m(matched.coordinates), 3),
        search_radius_m=matched.search_radius_m,
        source_to_output_p95_m=round(p95, 3),
        source_to_output_max_m=round(maximum, 3),
        endpoint_start_m=round(start, 3),
        endpoint_end_m=round(end, 3),
        disconnected_edge_ranges=disconnected,
        illegal_edges=illegal,
        oneway_conflicts=oneway_conflicts,
        dangling_branches=dangling,
        quality_pass=not errors,
        errors=errors,
    )
