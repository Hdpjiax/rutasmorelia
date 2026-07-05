"""Calibrate c1.jpg pixel space to lng/lat using orange route overlay."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
C1 = ROOT / "rutasdecombi" / "c1.jpg"


def orange_mask(img: np.ndarray) -> np.ndarray:
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]
    return (r > 180) & (g > 70) & (g < 210) & (b < 120)


def black_mask(img: np.ndarray) -> np.ndarray:
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]
    return (r < 80) & (g < 80) & (b < 80) & ~orange_mask(img)


def load_route() -> list[tuple[float, float]]:
    d = json.loads((ROOT / "apps/web/public/routes/39.geojson").read_text(encoding="utf-8"))
    pts: list[tuple[float, float]] = []
    for feature in d["features"]:
        geom = feature["geometry"]
        lines = geom["coordinates"] if geom["type"] == "MultiLineString" else [geom["coordinates"]]
        for line in lines:
            pts.extend([(float(x), float(y)) for x, y in line])
    return pts


def affine_from_points(pixels: np.ndarray, coords: np.ndarray) -> np.ndarray:
    ones = np.ones((pixels.shape[0], 1))
    design = np.hstack([pixels, ones])
    coeff_lng, _, _, _ = np.linalg.lstsq(design, coords[:, 0], rcond=None)
    coeff_lat, _, _, _ = np.linalg.lstsq(design, coords[:, 1], rcond=None)
    return np.vstack([coeff_lng, coeff_lat])


def pixel_to_geo(px: float, py: float, aff: np.ndarray) -> tuple[float, float]:
    lng = aff[0, 0] * px + aff[0, 1] * py + aff[0, 2]
    lat = aff[1, 0] * px + aff[1, 1] * py + aff[1, 2]
    return lng, lat


def cluster_by_y(points: list[tuple[int, int]], bands: int = 24) -> list[list[tuple[int, int]]]:
    if not points:
        return []
    ys = [p[1] for p in points]
    y_min, y_max = min(ys), max(ys)
    clusters: list[list[tuple[int, int]]] = [[] for _ in range(bands)]
    for x, y in points:
        if y_max == y_min:
            idx = 0
        else:
            idx = min(bands - 1, int((y - y_min) / (y_max - y_min) * bands))
        clusters[idx].append((x, y))
    return [sorted(cluster, key=lambda p: p[0]) for cluster in clusters if cluster]


def main() -> None:
    img = np.array(Image.open(C1).convert("RGB"))
    h, w = img.shape[:2]
    route = load_route()
    window = [
        p for p in route
        if -101.192 <= p[0] <= -101.155 and 19.714 <= p[1] <= 19.735
    ]
    orange_pts = list(zip(*np.where(orange_mask(img))))
    orange_xy = np.array([[x, y] for y, x in orange_pts], dtype=float)
    # Initial guess: map image box to route bbox.
    lngs = [p[0] for p in window]
    lats = [p[1] for p in window]
    guess_coords = []
    for x, y in orange_xy[:: max(1, len(orange_xy) // 300)]:
        tx = x / w
        ty = y / h
        lng = min(lngs) + tx * (max(lngs) - min(lngs))
        lat = max(lats) - ty * (max(lats) - min(lats))
        guess_coords.append((lng, lat))
    guess_coords = np.array(guess_coords)
    sample = orange_xy[:: max(1, len(orange_xy) // 300)]
    aff = affine_from_points(sample, guess_coords)

    by, bx = np.where(black_mask(img))
    black_pts = list(zip(bx.tolist(), by.tolist()))
    clusters = cluster_by_y(black_pts, bands=30)
    ordered: list[tuple[int, int]] = []
    for cluster in clusters:
        ordered.extend(cluster[:: max(1, len(cluster) // 3)])

    geo = [pixel_to_geo(x, y, aff) for x, y in ordered[::6]]
    out = ROOT / "scratch" / "c1_black_calibrated.geojson"
    out.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"kind": "black-calibrated"},
                        "geometry": {"type": "LineString", "coordinates": geo},
                    }
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print("window route pts", len(window))
    print("black ordered pts", len(geo))
    print("wrote", out)
    for i, (lng, lat) in enumerate(geo):
        print(f"{i:3d} {lng:.6f} {lat:.6f}")


if __name__ == "__main__":
    main()