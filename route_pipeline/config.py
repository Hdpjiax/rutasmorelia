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
