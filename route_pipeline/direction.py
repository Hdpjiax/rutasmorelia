from __future__ import annotations

import re
import unicodedata
from dataclasses import replace

from .kml import Direction


def _norm(value: str) -> str:
    text = unicodedata.normalize("NFD", value or "")
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"\s+", " ", text).strip().lower()


def direction_kind(name: str) -> str:
    label = _norm(name)
    if any(token in label for token in ("vuelta", "regreso", "retorno", "return")):
        return "vuelta"
    if any(token in label for token in ("ida", "salida", "outbound")):
        return "ida"
    return "unknown"


def normalize_route_directions(directions: list[Direction]) -> list[Direction]:
    """Order directions as ida (1) then vuelta (2) using placemark names, not file order."""
    if not directions:
        return []
    if len(directions) == 1:
        kind = direction_kind(directions[0].name)
        title = directions[0].name if kind != "unknown" else "Ida"
        return [Direction(1, title, directions[0].components)]

    ida = next((item for item in directions if direction_kind(item.name) == "ida"), None)
    vuelta = next((item for item in directions if direction_kind(item.name) == "vuelta"), None)
    unknown = [item for item in directions if direction_kind(item.name) == "unknown"]

    ordered: list[Direction] = []
    if ida:
        ordered.append(replace(ida, index=1))
    if vuelta:
        ordered.append(replace(vuelta, index=2))
    for item in unknown:
        ordered.append(item)

    if len(ordered) < 2:
        ordered = directions[:2]

    result: list[Direction] = []
    for index, item in enumerate(ordered[:2], start=1):
        kind = direction_kind(item.name)
        title = item.name
        if kind == "ida":
            title = "Ida"
        elif kind == "vuelta":
            title = "Vuelta"
        result.append(Direction(index, title, item.components))
    return result