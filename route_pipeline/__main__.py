from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import webbrowser
from pathlib import Path

from .bootstrap import bootstrap
from .config import OUTPUT_ROOT, ROUTES
from .pipeline import build_route, validate_existing
from .publish import approve, publish


def _route(value: str):
    if value in ROUTES:
        return ROUTES[value]
    for route in ROUTES.values():
        if route.code == value:
            return route
    raise argparse.ArgumentTypeError(
        f"Ruta '{value}' no encontrada. Slugs válidos: {', '.join(ROUTES)}"
    )


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="python -m route_pipeline")
    commands = root.add_subparsers(dest="command", required=True)
    boot = commands.add_parser("bootstrap-map", help="Construye el grafo local de Valhalla")
    boot.add_argument("--pbf", type=Path)
    boot.add_argument("--download-url")
    boot.add_argument("--force", action="store_true")
    for name in ("build", "validate", "review", "approve", "publish"):
        command = commands.add_parser(name)
        command.add_argument("--route", type=_route, default=ROUTES["alberca-gertrudis"])
        if name == "build":
            command.add_argument("--config", type=Path)
        elif name == "approve":
            command.add_argument("--reviewer", required=True)
            command.add_argument("--pdf-reviewed", action="store_true", required=True)
        elif name == "publish":
            command.add_argument("--skip-supabase", action="store_true")
    return root


def main() -> int:
    args = parser().parse_args()
    try:
        if args.command == "bootstrap-map":
            print(bootstrap(args.pbf, args.download_url, args.force))
        elif args.command == "build":
            output, report = build_route(args.route, args.config)
            print(json.dumps({"output": str(output), "quality_pass": report["quality_pass"]}, ensure_ascii=False))
            return 0 if report["quality_pass"] else 2
        elif args.command == "validate":
            report = validate_existing(args.route)
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 0 if report["quality_pass"] else 2
        elif args.command == "review":
            target = OUTPUT_ROOT / args.route.slug / "review.html"
            if not target.is_file():
                raise FileNotFoundError("Primero ejecute build")
            webbrowser.open(target.resolve().as_uri())
            print(target)
        elif args.command == "approve":
            print(approve(args.route, args.reviewer, args.pdf_reviewed))
        elif args.command == "publish":
            print(publish(args.route, args.skip_supabase))
        return 0
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

