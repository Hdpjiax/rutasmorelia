from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "geo-cache" / "valhalla"
OUTPUT_ROOT = ROOT / "work" / "route-pipeline"
PUBLIC_ROUTES = ROOT / "apps" / "web" / "public" / "routes"
PILOT_SLUG = "alberca-gertrudis"
PILOT_CODE = "79"
PILOT_KML = ROOT / "rutastransporte" / "01_RUTAS_DE_COMBI" / "79_ALBERCA_GERTRUDIS" / "KML_alberga_g" / "Alberca_Gertrudis_kml.kml"
PILOT_PDF = ROOT / "rutastransporte" / "01_RUTAS_DE_COMBI" / "79_ALBERCA_GERTRUDIS" / "MAPAS_alberca_g" / "Alberca Gertrudis.pdf"


@dataclass(frozen=True)
class RouteDefinition:
    slug: str
    code: str
    name: str
    color: str
    transport_type: str
    kml: Path
    pdf: Path | None


ROUTES = {
    PILOT_SLUG: RouteDefinition(
        slug=PILOT_SLUG,
        code=PILOT_CODE,
        name="Alberca Gertrudis",
        color="#FFC800",
        transport_type="combi",
        kml=PILOT_KML,
        pdf=PILOT_PDF,
    )
}

def _load_manifest_routes() -> None:
    manifest_path = ROOT / "tools" / "routes_manifest.csv"
    if not manifest_path.is_file():
        return
    import csv
    with open(manifest_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = row.get("route_id")
            folder_name = row.get("folder_name", "")
            if not code:
                code = folder_name.split("_")[0] if "_" in folder_name else folder_name[:10]
            if code == PILOT_CODE:
                continue
            slug = folder_name.lower().replace("_", "-").replace(" ", "-")
            slug = "-".join(filter(None, slug.split("-")))
            kml_rel = row.get("kml_path", "")
            if not kml_rel:
                continue
            kml_path = ROOT / kml_rel
            pdf_path = None
            folder_path = ROOT / "rutastransporte" / row.get("category", "") / folder_name
            if folder_path.is_dir():
                for path in folder_path.rglob("*.pdf"):
                    if path.is_file():
                        pdf_path = path
                        break
            color = row.get("color_hex", "#FFC800")
            if not color or not color.startswith("#"):
                color = "#FFC800"
            ROUTES[slug] = RouteDefinition(
                slug=slug,
                code=code,
                name=row.get("route_name", folder_name),
                color=color,
                transport_type="combi",
                kml=kml_path,
                pdf=pdf_path,
            )

_load_manifest_routes()


@dataclass(frozen=True)
class QualityThresholds:
    densify_m: float = 10.0
    search_radii_m: tuple[int, ...] = (15, 30, 50)
    p95_distance_m: float = 20.0
    max_distance_m: float = 50.0
    endpoint_distance_m: float = 50.0
    # Alberca Gertrudis components remain below this after 10 m densification.
    # Keeping each direction component whole prevents independent chunks from
    # choosing opposite parallel carriageways at their seam.
    max_trace_points: int = 5_000
    overlap_points: int = 100
    breakage_distance_m: int = 120
