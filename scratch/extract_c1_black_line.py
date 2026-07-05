"""Extract black/green overlay pixels from c1.jpg and georeference approximately."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
C1 = ROOT / "rutasdecombi" / "c1.jpg"

# Visible map bounds estimated from route geometry in the screenshot area.
LNG_MIN, LNG_MAX = -101.195, -101.155
LAT_MIN, LAT_MAX = 19.698, 19.735


def pixels_to_geo(xs: np.ndarray, ys: np.ndarray, w: int, h: int) -> list[tuple[float, float]]:
    lng = LNG_MIN + (xs / w) * (LNG_MAX - LNG_MIN)
    lat = LAT_MAX - (ys / h) * (LAT_MAX - LAT_MIN)
    return list(zip(lng.tolist(), lat.tolist()))


def trace_color(img: np.ndarray, kind: str) -> list[tuple[int, int]]:
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]
    if kind == "black":
        mask = (r < 70) & (g < 70) & (b < 70)
    elif kind == "green":
        mask = (g > 140) & (r < 120) & (b < 120)
    else:
        mask = (r > 200) & (g > 90) & (g < 180) & (b < 80)
    ys, xs = np.where(mask)
    return list(zip(xs.tolist(), ys.tolist()))


def sort_path(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if len(points) < 2:
        return points
    remaining = points[:]
    path = [remaining.pop(0)]
    while remaining:
        last = path[-1]
        dists = [((p[0] - last[0]) ** 2 + (p[1] - last[1]) ** 2, i) for i, p in enumerate(remaining)]
        _, idx = min(dists)
        path.append(remaining.pop(idx))
    return path


def downsample(path: list[tuple[int, int]], step: int = 8) -> list[tuple[int, int]]:
    return path[::step]


def main() -> None:
    img = np.array(Image.open(C1).convert("RGB"))
    h, w = img.shape[:2]
    for kind in ("black", "green", "orange"):
        px = trace_color(img, kind)
        print(kind, "pixels", len(px))
        if not px:
            continue
        ordered = sort_path(px)
        sampled = downsample(ordered, 12)
        geo = pixels_to_geo(
            np.array([p[0] for p in sampled]),
            np.array([p[1] for p in sampled]),
            w,
            h,
        )
        out = ROOT / "scratch" / f"c1_{kind}_line.geojson"
        out.write_text(
            json.dumps(
                {
                    "type": "FeatureCollection",
                    "features": [
                        {
                            "type": "Feature",
                            "properties": {"kind": kind},
                            "geometry": {"type": "LineString", "coordinates": geo},
                        }
                    ],
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        print("wrote", out, "points", len(geo))
        for i, (lng, lat) in enumerate(geo[:15]):
            print(f"  {i:2d} {lng:.6f} {lat:.6f}")


if __name__ == "__main__":
    main()