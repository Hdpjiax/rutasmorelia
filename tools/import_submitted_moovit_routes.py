"""Replace selected route KMLs with the Moovit shapes linked by submitted PDFs."""
from __future__ import annotations

import csv
import hashlib
import html
import json
import re
import shutil
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = Path.home() / "Downloads"
ROUTES = {
    "38": ("Naranja 1 ISSSTE", "https://moovitapp.com/tripplan/morelia-6204/lines/NARANJA_1/154082943/7121722/es-419?ref=2&poiType=line&customerId=4908", None),
    "39": ("Naranja 1 [La Soledad]", "https://moovitapp.com/tripplan/morelia-6204/lines/NARANJA_1/154082944/7121723/es-419?ref=2&poiType=line&customerId=4908", "Naranja 1 [La Soledad].pdf"),
    "40": ("Naranja 2 [3 De Agosto]", "https://moovitapp.com/tripplan/morelia-6204/lines/NARANJA_2/154082946/7121725/es-419?ref=2&poiType=line&customerId=4908", "Naranja 2 [3 De Agosto].pdf"),
    "41": ("Naranja 2 Santa Fe", "https://moovitapp.com/tripplan/morelia-6204/lines/NARANJA_2/154082945/7121724/es-419?ref=2&poiType=line&customerId=4908", "NARANJA 2 (↔ Santa Fe).pdf"),
    "42": ("Naranja 3 [Centro - Puerta Del Sol]", "https://moovitapp.com/tripplan/morelia-6204/lines/NARANJA_3/154082950/7121729/es-419?ref=2&poiType=line&customerId=4908", "Naranja 3 [Centro - Puerta Del Sol].pdf"),
    "44": ("Naranja 3 [Sta. María - Erandeni]", "https://moovitapp.com/tripplan/morelia-6204/lines/NARANJA_3/154082949/7121728/es-419?ref=2&poiType=line&customerId=4908", "Naranja 3 [Sta. María - Erandeni].pdf"),
    "45": ("Naranja 3 [Sta. María - Ita]", "https://moovitapp.com/tripplan/morelia-6204/lines/NARANJA_3/154082947/7121726/es-419?ref=2&poiType=line&customerId=4908", "Naranja 3 [Sta. María - Ita].pdf"),
    "46": ("Naranja 3 [Trico - Metrópolis]", "https://moovitapp.com/tripplan/morelia-6204/lines/NARANJA_3/154082948/7121727/es-419?ref=2&poiType=line&customerId=4908", "Naranja 3 [Trico - Metrópolis].pdf"),
    "86": ("ISSSTE/Soledad", "https://moovitapp.com/tripplan/morelia-6204/lines/ISSSTE_SOLEDAD/154082874/7121652/es-419?ref=2&poiType=line&customerId=4908", "ISSSTE-SOLEDAD.pdf"),
}


def decode_polyline(value: str, precision: int = 5) -> list[tuple[float, float]]:
    result: list[tuple[float, float]] = []
    index = latitude = longitude = 0
    while index < len(value):
        deltas = []
        for _ in range(2):
            number = shift = 0
            while True:
                byte = ord(value[index]) - 63
                index += 1
                number |= (byte & 31) << shift
                shift += 5
                if byte < 32:
                    break
            deltas.append(~(number >> 1) if number & 1 else number >> 1)
        latitude += deltas[0]
        longitude += deltas[1]
        result.append((longitude / 100000, latitude / 100000))
    return result


def manifest_paths() -> dict[str, tuple[Path, Path]]:
    paths = {}
    with (ROOT / "tools" / "routes_manifest.csv").open(encoding="utf-8", newline="") as file:
        for row in csv.DictReader(file):
            if row["route_id"] not in ROUTES:
                continue
            kml = ROOT / row["kml_path"]
            folder = ROOT / "rutastransporte" / row["category"] / row["folder_name"]
            pdfs = sorted(folder.rglob("*.pdf"))
            if not pdfs:
                raise FileNotFoundError(f"No existe PDF de destino para {row['route_id']}")
            paths[row["route_id"]] = (kml, pdfs[0])
    return paths


def main() -> None:
    paths = manifest_paths()
    summary = []
    for code, (name, url, submitted_pdf) in ROUTES.items():
        request = Request(url, headers={"User-Agent": "ViaMorelia reviewed route importer"})
        page = urlopen(request, timeout=45).read().decode("utf-8")
        match = re.search(r'<script id="serverApp-state" type="application/json">(.*?)</script>', page, re.S)
        if not match:
            raise RuntimeError(f"Moovit no devolvió geometría para {code}")
        state = json.loads(match.group(1))
        option = state["appState"]["line"]["lineDirections"][0]["lineOptions"][0]
        coordinates = decode_polyline(option["shape"]["encodedShape"])
        stops = option["stops"]
        coordinate_text = " ".join(f"{lon:.6f},{lat:.6f},0" for lon, lat in coordinates)
        stop_nodes = "\n".join(
            "<Placemark><name>{}</name><Point><coordinates>{:.6f},{:.6f},0</coordinates></Point></Placemark>".format(
                html.escape(stop["name"]), stop["location"]["longitude"] / 1_000_000,
                stop["location"]["latitude"] / 1_000_000,
            ) for stop in stops
        )
        kml = f'''<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>{html.escape(name)}</name>
<Placemark><name>{html.escape(name)}</name><LineString><tessellate>1</tessellate><coordinates>{coordinate_text}</coordinates></LineString></Placemark>
{stop_nodes}
</Document></kml>'''
        kml_path, pdf_path = paths[code]
        kml_path.write_text(kml, encoding="utf-8")
        if submitted_pdf:
            shutil.copy2(DOWNLOADS / submitted_pdf, pdf_path)
        summary.append({
            "code": code, "name": name, "shape_points": len(coordinates), "stops": len(stops),
            "sha256": hashlib.sha256(kml.encode()).hexdigest(), "kml": str(kml_path),
        })
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
