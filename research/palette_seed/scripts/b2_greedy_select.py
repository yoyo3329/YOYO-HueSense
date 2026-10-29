#!/usr/bin/env python3
"""HueSense B2 v0.1: build a 5-HEX candidate by deterministic greedy OKLab max-min selection.

INPUT: one user-supplied anchor HEX, plus a pool of verified-format swatches extracted
from the existing source-pinned five-color palette JSON.
OUTPUT: anchor plus four DIFFERENT existing pool HEX; traceable step logs.
Not Colorgorical reproduction. No harmony, role, WCAG, emotion, or brand scoring.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import re
from pathlib import Path

SOURCE_FILE = Path(__file__).resolve().parents[1] / "data" / "core_five_seeds.json"
HEX_PATTERN = re.compile(r"^#[0-9A-F]{6}$")
RULE_VERSION = "b2-oklab-maximin-v0.1"

def normalize_hex(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        raise ValueError("ANCHOR_HEX_INVALID: Expected six-digit #RRGGBB")
    return value.upper()

def to_linear_srgb(channel: int) -> float:
    c = channel / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def to_oklab(hex_value: str) -> tuple[float, float, float]:
    """Björn Ottosson (2021 updated) linear sRGB -> OKLab coefficients."""
    h = normalize_hex(hex_value)
    r, g, b = (to_linear_srgb(int(h[i:i + 2], 16)) for i in (1, 3, 5))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    x, y, z = l ** (1 / 3), m ** (1 / 3), s ** (1 / 3)
    return (
        0.2104542553 * x + 0.7936177850 * y - 0.0040720468 * z,
        1.9779984951 * x - 2.4285922050 * y + 0.4505937099 * z,
        0.0259040371 * x + 0.7827717662 * y - 0.8086757660 * z,
    )

def distance(p: tuple[float, ...], q: tuple[float, ...]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(p, q)))

def read_pool(dataset_path: Path = SOURCE_FILE, source: str = "all"):
    if source not in ("all", "carto", "colorbrewer"):
        raise ValueError("SOURCE_FILTER_INVALID")
    doc = json.loads(Path(dataset_path).read_text(encoding="utf-8"))
    if not isinstance(doc.get("palettes"), list):
        raise ValueError("SOURCE_DATA_INVALID")
    provenance: dict[str, set[str]] = {}
    for palette in doc["palettes"]:
        if palette.get("source") not in doc.get("sources", {}):
            raise ValueError("SOURCE_REFERENCE_MISSING")
        if len(palette.get("colors", [])) != 5:
            raise ValueError("SOURCE_PALETTE_NOT_FIVE")
        if len(set(palette["colors"])) != 5:
            raise ValueError("SOURCE_PALETTE_DUPLICATED_SWATCHES")
        if source != "all" and palette["source"] != source:
            continue
        for color in palette["colors"]:
            if not HEX_PATTERN.fullmatch(color):
                raise ValueError("SOURCE_COLOR_INVALID")
            provenance.setdefault(color, set()).add(palette["id"])
    return doc, {color: sorted(seed_ids) for color, seed_ids in sorted(provenance.items())}

def generate(anchor: str = "#A85C45", *, source: str = "all", 
             dataset_path: Path = SOURCE_FILE, count: int = 5) -> dict:
    """Pure deterministic greedy: argmax candidate min OKLab distance from current set.

    A candidate HEX is never invented. Ties choose the lexical smallest HEX.
    This maximizes color separation, NOT combination harmony or brand quality.
    """
    anchor = normalize_hex(anchor)
    if count < 2 or count > 5:
        raise ValueError("COUNT_OUT_OF_RANGE: 2..5")
    doc, provenance = read_pool(dataset_path, source)
    remaining = sorted(color for color in provenance if color != anchor)
    if len(remaining) < count - 1:
        raise ValueError("INSUFFICIENT_POOL_CANDIDATES")
    positions = {c: to_oklab(c) for c in [anchor] + remaining}
    selected = [anchor]
    steps = []
    for slot in range(2, count + 1):
        best_hex, best_value = None, -1.0
        for candidate in remaining:
            minimum = min(distance(positions[candidate], positions[s]) for s in selected)
            if minimum > best_value + 1e-12:  # sorted order breaks ties reproducibly
                best_hex, best_value = candidate, minimum
        if best_hex is None:
            raise ValueError("SELECTION_FAILED")
        steps.append({
            "position": slot,
            "selected_hex": best_hex,
            "min_oklab_distance": round(best_value, 8),
            "evaluated_candidates": len(remaining),
            "from_seed_ids": provenance[best_hex],
            "selection_reason": "MAXIMIZE_MINIMUM_OKLAB_DISTANCE",
        })
        selected.append(best_hex)
        remaining.remove(best_hex)
    return {
        "status": "COMPOSED_UNCHECKED",
        "generation_method": "B2_GREEDY_POOL_SELECTION",
        "rule_version": RULE_VERSION,
        "anchor_hex": anchor,
        "anchor_origin": "USER_INPUT" if anchor not in provenance else "USER_INPUT_ALSO_IN_POOL",
        "pool_source": source,
        "pool_unique_hex": len(provenance),
        "source_dataset_version": str(doc.get("version", "unknown")),
        "source_dataset_sha256": hashlib.sha256(Path(dataset_path).read_bytes()).hexdigest(),
        "colors": selected,
        "steps": steps,
        "new_hex_created": False,
        "role_assigned": False,
        "harmony_or_brand_validated": False,
        "note": "Greedy max-min diversity is a technical selection heuristic, not an aesthetic or emotion score.",
    }

def main():
    parser = argparse.ArgumentParser(description="Generate traceable five-color B2 candidate, no quality checks.")
    parser.add_argument("--anchor", default="#A85C45")
    parser.add_argument("--source", default="all", choices=["all", "carto", "colorbrewer"])
    parser.add_argument("--count", type=int, default=5, choices=[2, 3, 4, 5])
    parser.add_argument("--dataset", type=Path, default=SOURCE_FILE)
    args = parser.parse_args()
    try:
        print(json.dumps(generate(args.anchor, source=args.source, count=args.count,
                                  dataset_path=args.dataset), ensure_ascii=False, indent=2))
    except (ValueError, FileNotFoundError, json.JSONDecodeError) as exc:
        parser.exit(2, "B2_ERROR: " + str(exc) + "\n")

if __name__ == "__main__":
    main()
