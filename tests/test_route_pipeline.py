from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from route_pipeline.config import PILOT_KML, QualityThresholds
from route_pipeline.bootstrap import _native_environment
from route_pipeline.geometry import densify, distance_m
from route_pipeline.kml import parse_kml
from route_pipeline.pipeline import _apply_reference_overrides, _select_components
from route_pipeline.config import ROUTES
from route_pipeline.validation import validate_component
from route_pipeline.valhalla_engine import MatchedComponent, _chunks, _trace_request


class KmlTests(unittest.TestCase):
    def test_pilot_preserves_directions_and_components(self):
        directions = parse_kml(PILOT_KML)
        self.assertEqual(2, len(directions))
        self.assertEqual([3, 7], [len(direction.components) for direction in directions])
        self.assertEqual([2, 364, 414], [len(component) for component in directions[0].components])

    def test_unbound_xsi_prefix_is_repaired(self):
        content = '''<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document xsi:schemaLocation="x"><Placemark><name>Ida</name><LineString><coordinates>-101,19 -101.1,19.1</coordinates></LineString></Placemark></Document></kml>'''
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "route.kml"
            path.write_text(content, encoding="utf-8")
            self.assertEqual(1, len(parse_kml(path)))

    def test_only_redundant_sub_five_meter_markers_are_ignored(self):
        directions = parse_kml(PILOT_KML)
        ignored = []
        selected = _select_components(1, directions[0].components, ignored)
        self.assertEqual([2, 3], [index for index, _ in selected])
        self.assertEqual("redundant_sub_5m_kml_marker", ignored[0]["reason"])
        # The two 36.8 m opposite fragments in the return remain available to
        # Valhalla because they can encode a real terminal turn.
        return_selected = _select_components(2, directions[1].components, ignored)
        self.assertIn(5, [index for index, _ in return_selected])
        self.assertIn(6, [index for index, _ in return_selected])

    def test_reviewed_corridor_override_changes_only_the_requested_slice(self):
        original = parse_kml(PILOT_KML)
        corrected, audit = _apply_reference_overrides(ROUTES["alberca-gertrudis"], original)
        before = original[0].components[2]
        after = corrected[0].components[2]
        self.assertEqual(before[:325], after[:325])
        self.assertEqual(before[376:], after[376:])
        self.assertLess(after[350][1], before[350][1])
        self.assertEqual("user_reviewed_lower_carriageway_at_prensa_libre", audit[0]["reason"])


class GeometryTests(unittest.TestCase):
    def test_native_environment_exposes_wheel_dlls(self):
        environment = _native_environment()
        self.assertIn("pyvalhalla.libs", environment["PATH"])

    def test_densify_never_exceeds_requested_spacing(self):
        line = densify([(-101.2, 19.7), (-101.2, 19.701)], 10)
        self.assertTrue(all(distance_m(a, b) <= 10.01 for a, b in zip(line, line[1:])))

    def test_chunks_overlap_and_do_not_drop_points(self):
        thresholds = QualityThresholds(max_trace_points=100, overlap_points=10)
        points = [(-101.2, 19.7 + index / 100_000) for index in range(250)]
        chunks = _chunks(points, thresholds)
        self.assertEqual(3, len(chunks))
        self.assertEqual(chunks[0][-10:], chunks[1][:10])
        self.assertEqual(points[-1], chunks[-1][-1])

    def test_request_is_directional_map_snap_with_bounded_radius(self):
        request = _trace_request([(-101.2, 19.7), (-101.19, 19.7)], 30, QualityThresholds())
        self.assertEqual("map_snap", request["shape_match"])
        self.assertEqual("bus", request["costing"])
        self.assertTrue(request["costing_options"]["bus"]["ignore_oneways"])
        self.assertEqual(30, request["trace_options"]["search_radius"])


class ValidationTests(unittest.TestCase):
    def test_exact_edge_chain_passes(self):
        source = [(-101.2, 19.7), (-101.199, 19.7)]
        matched = MatchedComponent(
            coordinates=source,
            edges=[{"id": 1, "begin_shape_index": 0, "end_shape_index": 1, "traversability": "forward"}],
            search_radius_m=15,
        )
        report = validate_component(1, 1, source, matched, QualityThresholds())
        self.assertTrue(report.quality_pass, report.errors)

    def test_disconnected_or_fabricated_output_is_rejected(self):
        source = [(-101.2, 19.7), (-101.199, 19.7)]
        matched = MatchedComponent(
            coordinates=[(-101.3, 19.8), (-101.299, 19.8)],
            edges=[
                {"id": 1, "begin_shape_index": 0, "end_shape_index": 0},
                {"id": 2, "begin_shape_index": 3, "end_shape_index": 4},
            ],
            search_radius_m=50,
        )
        report = validate_component(1, 1, source, matched, QualityThresholds())
        self.assertFalse(report.quality_pass)
        self.assertIn("aristas_desconectadas", report.errors)
        self.assertIn("maximo_fuera_de_corredor", report.errors)


if __name__ == "__main__":
    unittest.main()
