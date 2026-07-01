from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .config import DATA_ROOT

DEFAULT_PBF_URL = "https://download.geofabrik.de/north-america/mexico-latest.osm.pbf"
MORELIA_BBOX = "-101.405,19.515,-100.985,19.889"  # city plus ~20 km safety margin


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _download(url: str, target: Path) -> None:
    partial = target.with_suffix(target.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": "ViaMorelia-route-pipeline/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response, partial.open("wb") as output:
        shutil.copyfileobj(response, output)
    partial.replace(target)


def _valhalla_binary(name: str) -> Path:
    import valhalla

    binary = Path(valhalla.PYVALHALLA_DIR) / "bin" / f"{name}.exe"
    if not binary.is_file():
        raise FileNotFoundError(f"No se encontró {binary}")
    return binary


def _native_environment() -> dict[str, str]:
    """Expose wheel-bundled DLLs to standalone Valhalla executables.

    Importing ``valhalla`` registers this directory for the Python extension,
    but Windows does not inherit that DLL search path for child executables.
    Without it the process exits with 0xC0000135 before printing an error.
    """
    import os
    import valhalla

    environment = os.environ.copy()
    wheel_libs = Path(valhalla.PYVALHALLA_DIR).parent / "pyvalhalla.libs"
    if not wheel_libs.is_dir():
        raise FileNotFoundError(f"Faltan las DLL nativas de pyvalhalla: {wheel_libs}")
    environment["PATH"] = f"{wheel_libs}{os.pathsep}{environment.get('PATH', '')}"
    return environment


def bootstrap(pbf: Path | None, download_url: str | None, force: bool = False) -> Path:
    DATA_ROOT.mkdir(parents=True, exist_ok=True)
    source = pbf.resolve() if pbf else DATA_ROOT / "mexico.osm.pbf"
    url = download_url or (DEFAULT_PBF_URL if pbf is None else None)
    if not source.is_file():
        if not url:
            raise FileNotFoundError(f"PBF inexistente: {source}")
        print(f"Descargando {url} -> {source}")
        _download(url, source)

    tile_dir = DATA_ROOT / "tiles"
    extract = DATA_ROOT / "morelia-valhalla.tar"
    config_path = DATA_ROOT / "valhalla.json"
    if force:
        shutil.rmtree(tile_dir, ignore_errors=True)
        extract.unlink(missing_ok=True)
    tile_dir.mkdir(parents=True, exist_ok=True)

    from valhalla import get_config

    config = get_config(tile_extract="", tile_dir=tile_dir, verbose=False)
    config["mjolnir"]["tile_extract"] = str(extract.resolve())
    config["mjolnir"]["tile_dir"] = str(tile_dir.resolve())
    # The Windows wheel's Spatialite crashes in `enhance` on self-intersecting
    # admin polygons present in the Mexico extract. Administrative labels are
    # irrelevant to road-axis matching, so disable that enrichment on Windows.
    config["mjolnir"]["admin"] = "" if sys.platform == "win32" else str((DATA_ROOT / "admins.sqlite").resolve())
    config["meili"]["default"]["search_radius"] = 15
    config["meili"]["default"]["gps_accuracy"] = 10
    config["meili"]["default"]["breakage_distance"] = 120
    config_path.write_text(json.dumps(config, indent=2), encoding="utf-8")

    if not any(tile_dir.rglob("*.gph")):
        native_environment = _native_environment()
        if config["mjolnir"]["admin"]:
            subprocess.run(
                [str(_valhalla_binary("valhalla_build_admins")), "-c", str(config_path), str(source)],
                check=True,
                env=native_environment,
            )
        tile_binary = str(_valhalla_binary("valhalla_build_tiles"))
        tile_command = [tile_binary, "-c", str(config_path)]
        # pyvalhalla 3.7.0 can access-violate in the enhance stage on Windows
        # when several workers load wheel-bundled GEOS/SQLite dependencies.
        # A single worker is slower but deterministic and resumable.
        if sys.platform == "win32":
            tile_command.extend(["-j", "1", "-e", "build"])
        tile_command.append(str(source))
        subprocess.run(
            tile_command,
            check=True,
            env=native_environment,
        )
        if sys.platform == "win32":
            subprocess.run(
                [
                    tile_binary,
                    "-c", str(config_path),
                    "-j", "1",
                    "-s", "enhance",
                    "-e", "cleanup",
                    str(source),
                ],
                check=True,
                env=native_environment,
            )
    if not extract.is_file():
        if sys.platform == "win32":
            # pyvalhalla 3.7.0's extract helper parses tar-style paths and
            # rejects Windows backslashes (for example 2\\000\\...). Actor can
            # read the tile directory directly, so keep the native Windows
            # setup service-free and do not manufacture a broken archive.
            config["mjolnir"].pop("tile_extract", None)
            config["mjolnir"].pop("traffic_extract", None)
            config_path.write_text(json.dumps(config, indent=2), encoding="utf-8")
        else:
            subprocess.run(
                [sys.executable, "-m", "valhalla.valhalla_build_extract", "-c", str(config_path), "-b", MORELIA_BBOX, "-O"],
                check=True,
            )

    metadata = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": str(source),
        "source_url": url,
        "source_sha256": sha256(source),
        "bbox": MORELIA_BBOX,
        "valhalla_version": _package_version(),
        "config_sha256": sha256(config_path),
    }
    (DATA_ROOT / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return config_path


def _package_version() -> str:
    try:
        from importlib.metadata import version

        return version("pyvalhalla")
    except Exception:
        return "unknown"
