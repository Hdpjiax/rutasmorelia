import xml.etree.ElementTree as ET
from pathlib import Path
import re

ROOT = Path("c:/RutasMorelia")
KML_NS = "http://www.opengis.net/kml/2.2"
XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"

targets = [
    ROOT / "rutastransporte/01_RUTAS_DE_COMBI/78_ALBERCA_METROPOLIS/KML_alberca_m/Alberca_Metropolis_kml.kml",
    ROOT / "rutastransporte/01_RUTAS_DE_COMBI/3_COMBI_AMARILLA_1_CENTRO/KML/Amarilla_1_centro.kml",
    ROOT / "rutastransporte/01_RUTAS_DE_COMBI/4_COMBI_AMARILLA_2/KML/Amarilla_2.kml",
    ROOT / "rutastransporte/01_RUTAS_DE_COMBI/2_COMBI_AMARILLA_TENENCIA_MORELOS/KML/Amarilla Tenencia Morelos.kml",
    ROOT / "rutastransporte/01_RUTAS_DE_COMBI/5_COMBI_AZUL_A_SORIANA-CBTA/KML/Azul_A_Soriana-CBTA.kml",
]

for p in targets:
    if not p.exists():
        print(f"File not found: {p}")
        continue
    print(f"\nFile: {p.name}")
    try:
        text = p.read_text(encoding="utf-8-sig")
        if "xsi:" in text and "xmlns:xsi=" not in text:
            text = re.sub(r"(<kml\b[^>]*)(>)", rf'\1 xmlns:xsi="{XSI_NS}"\2', text, count=1)
        root = ET.fromstring(text)
        pms = root.findall(f".//{{{KML_NS}}}Placemark")
        for idx, pm in enumerate(pms):
            name_node = pm.find(f"{{{KML_NS}}}name")
            name = name_node.text.strip() if name_node is not None else "None"
            coords_nodes = pm.findall(f".//{{{KML_NS}}}LineString/{{{KML_NS}}}coordinates")
            coords_count = sum(len(node.text.strip().split()) for node in coords_nodes if node.text)
            print(f"  Placemark {idx+1}: name={name}, coordinates_count={coords_count}")
    except Exception as e:
        print(f"  Error: {e}")
