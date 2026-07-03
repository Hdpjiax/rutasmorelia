"""Create the Jesús del Monte KML from the route data linked by its PDF."""
from __future__ import annotations

import html
import json
import re
from pathlib import Path
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
SOURCE_URL = (
    "https://moovitapp.com/tripplan/morelia-6204/lines/"
    "JES%C3%9AS_DEL_MONTE/154082875/7121653/es-419"
    "?ref=2&poiType=line&customerId=4908"
)
OUTPUT = ROOT / "rutastransporte" / "02_RUTAS_DE_AUTOBUSES_FORANEOS" / "19_JESUS_DEL_MONTE" / "KML" / "Jesus_Del_Monte.kml"


def decode_polyline(value: str, precision: int = 5) -> list[tuple[float, float]]:
    coordinates: list[tuple[float, float]] = []
    index = latitude = longitude = 0
    factor = 10**precision
    while index < len(value):
        deltas = []
        for _ in range(2):
            result = shift = 0
            while True:
                byte = ord(value[index]) - 63
                index += 1
                result |= (byte & 31) << shift
                shift += 5
                if byte < 32:
                    break
            deltas.append(~(result >> 1) if result & 1 else result >> 1)
        latitude += deltas[0]
        longitude += deltas[1]
        coordinates.append((longitude / factor, latitude / factor))
    return coordinates


def main() -> None:
    request = Request(SOURCE_URL, headers={"User-Agent": "ViaMorelia route importer"})
    page = urlopen(request, timeout=45).read().decode("utf-8")
    match = re.search(r'<script id="serverApp-state" type="application/json">(.*?)</script>', page, re.S)
    if not match:
        raise RuntimeError("No se encontró el estado de la ruta enlazada por el PDF")
    state = json.loads(match.group(1))
    option = state["appState"]["line"]["lineDirections"][0]["lineOptions"][0]
    coordinates = decode_polyline(option["shape"]["encodedShape"])
    stops = option["stops"]
    coordinate_text = " ".join(f"{lon:.6f},{lat:.6f},0" for lon, lat in coordinates)
    stop_placemarks = "\n".join(
        "<Placemark><name>{}</name><Point><coordinates>{:.6f},{:.6f},0</coordinates></Point></Placemark>".format(
            html.escape(stop["name"]), stop["location"]["longitude"] / 1_000_000, stop["location"]["latitude"] / 1_000_000
        )
        for stop in stops
    )
    document = f'''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<name>Jesús del Monte</name>
<Placemark><name>Autobús</name><LineString><tessellate>1</tessellate><coordinates>{coordinate_text}</coordinates></LineString></Placemark>
{stop_placemarks}
</Document></kml>'''
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(document, encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), "shape_points": len(coordinates), "stops": len(stops)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
