from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
import zipfile
from dataclasses import dataclass
from pathlib import Path

from .geometry import Coordinate, deduplicate

KML_NS = "http://www.opengis.net/kml/2.2"
XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"


@dataclass(frozen=True)
class Direction:
    index: int
    name: str
    components: list[list[Coordinate]]

    @property
    def coordinates(self) -> list[Coordinate]:
        result: list[Coordinate] = []
        for component in self.components:
            if result and result[-1] == component[0]:
                result.extend(component[1:])
            else:
                result.extend(component)
        return result


def _coordinates(text: str | None) -> list[Coordinate]:
    result: list[Coordinate] = []
    for token in (text or "").split():
        parts = token.split(",")
        if len(parts) < 2:
            continue
        try:
            lon, lat = float(parts[0]), float(parts[1])
        except ValueError:
            continue
        if -180 <= lon <= 180 and -90 <= lat <= 90:
            result.append((lon, lat))
    return deduplicate(result)


def parse_kml(path: Path) -> list[Direction]:
    if path.suffix.lower() == ".kmz":
        with zipfile.ZipFile(path) as archive:
            names = [name for name in archive.namelist() if name.lower().endswith(".kml")]
            if not names:
                raise ValueError(f"El KMZ no contiene un archivo KML: {path}")
            text = archive.read(names[0]).decode("utf-8-sig")
    else:
        text = path.read_text(encoding="utf-8-sig")
    if "xsi:" in text and "xmlns:xsi=" not in text:
        text = re.sub(r"(<kml\b[^>]*)(>)", rf'\1 xmlns:xsi="{XSI_NS}"\2', text, count=1)
    root = ET.fromstring(text)
    directions: list[Direction] = []
    for placemark in root.findall(f".//{{{KML_NS}}}Placemark"):
        name_node = placemark.find(f"{{{KML_NS}}}name")
        name = (name_node.text or "Dirección").strip() if name_node is not None else "Dirección"
        components = [
            _coordinates(node.text)
            for node in placemark.findall(f".//{{{KML_NS}}}LineString/{{{KML_NS}}}coordinates")
        ]
        components = [component for component in components if len(component) >= 2]
        if components:
            directions.append(Direction(len(directions) + 1, name, components))
    if not directions:
        raise ValueError(f"El KML no contiene LineString válidos: {path}")
    return directions


def parse_geojson(path: Path) -> list[Direction]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    features = payload.get("features") or []
    directions: list[Direction] = []
    for feature in features:
        geometry = feature.get("geometry") or {}
        properties = feature.get("properties") or {}
        name = str(properties.get("route_name") or properties.get("name") or "Dirección")
        geom_type = geometry.get("type")
        components: list[list[Coordinate]] = []
        if geom_type == "LineString":
            raw = geometry.get("coordinates") or []
            line = [(float(pt[0]), float(pt[1])) for pt in raw if isinstance(pt, (list, tuple)) and len(pt) >= 2]
            if len(line) >= 2:
                components.append(deduplicate(line))
        elif geom_type == "MultiLineString":
            for raw in geometry.get("coordinates") or []:
                line = [(float(pt[0]), float(pt[1])) for pt in raw if isinstance(pt, (list, tuple)) and len(pt) >= 2]
                if len(line) >= 2:
                    components.append(deduplicate(line))
        if components:
            directions.append(Direction(len(directions) + 1, name, components))
    if not directions:
        raise ValueError(f"El GeoJSON no contiene líneas válidas: {path}")
    return directions


def parse_shape_file(path: Path) -> list[Direction]:
    suffix = path.suffix.lower()
    if suffix == ".geojson":
        return parse_geojson(path)
    if suffix in {".kml", ".kmz"}:
        return parse_kml(path)
    raise ValueError(f"Formato de fuente no soportado: {path}")
