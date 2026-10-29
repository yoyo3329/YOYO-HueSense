#!/usr/bin/env python3
"""HueSense B2 deterministic OKLab max-min selection with legacy and normalized-pool inputs."""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_FILE = ROOT / "data" / "core_five_seeds.json"
NORMALIZED_POOL_FILE = ROOT / "data" / "single_color_pool.json"
HEX_PATTERN = re.compile(r"^#[0-9A-F]{6}$")
RULE_VERSION = "b2-oklab-maximin-v0.2"

def normalize_hex(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", value):
        raise ValueError("ANCHOR_HEX_INVALID: Expected six-digit #RRGGBB")
    return value.upper()

def to_linear_srgb(channel: int) -> float:
    c = channel / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def to_oklab(hex_value: str) -> tuple[float, float, float]:
    h = normalize_hex(hex_value)
    r, g, b = (to_linear_srgb(int(h[i:i + 2], 16)) for i in (1, 3, 5))
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883020371 * r + 0.2817188376 * g + 0.6299787005 * b
    x, y, z = l ** (1 / 3), m ** (1 / 3), s ** (1 / 3)
    return (
        0.2104542553 * x + 0.7936177850 * y - 0.0040720468 * z,
        1.9779984951 * x - 2.4285922050 * y + 0.4505937099 * z,
        0.0259040371 * x + 0.7827717662 * y - 0.8086757660 * z,
    )

def distance(p: tuple[float, ...], q: tuple[float, ...]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(p, q)))

def read_pool(dataset_path: Path = SOURCE_FILE, source: str = "all"):
    """Read either original seed palettes or normalized SQLite import JSON."""
    path = Path(dataset_path)
    doc = json.loads(path.read_text(encoding="utf-8"))
    provenance: dict[str, set[str]] = {}
    metadata: dict[str, dict] = {}
    if isinstance(doc.get("palettes"), list):
        if source not in ("all", "carto", "colorbrewer"):
            raise ValueError("SOURCE_FILTER_INVALID_FOR_SEED_PALETTES")
        for palette in doc["palettes"]:
            if palette.get("source") not in doc.get("sources", {}):
                raise ValueError("SOURCE_REFERENCE_MISSING")
            if len(palette.get("colors", [])) != 5 or len(set(palette["colors"])) != 5:
                raise ValueError("SOURCE_PALETTE_NOT_FIVE_OR_DUPLICATED")
            if source != "all" and palette["source"] != source:
                continue
            for raw in palette["colors"]:
                if not HEX_PATTERN.fullmatch(raw):
                    raise ValueError("SOURCE_COLOR_INVALID")
                provenance.setdefault(raw, set()).add(palette["id"])
                metadata.setdefault(raw, {"names": [], "source_refs": [], "evidence_refs": []})
    elif isinstance(doc.get("colors"), list):
        if source != "all":
            raise ValueError("SOURCE_FILTER_NOT_SUPPORTED_FOR_NORMALIZED_POOL")
        if doc.get("import_status") != "NORMALIZED_FROM_SQLITE":
            raise ValueError("NORMALIZED_POOL_NOT_VERIFIED")
        for color in doc["colors"]:
            raw = color.get("hex")
            if not isinstance(raw, str) or not re.fullmatch(r"#[0-9A-Fa-f]{6}", raw):
                raise ValueError("NORMALIZED_POOL_COLOR_INVALID")
            hex_code = raw.upper()
            provenance.setdefault(hex_code, set()).add("sqlite:" + str(doc.get("source_database", {}).get("filename", "unknown")))
            metadata[hex_code] = {
                "names": color.get("names", []),
                "source_refs": color.get("source_refs", []),
                "evidence_refs": color.get("evidence_refs", []),
                "color_ids": color.get("color_ids", []),
                "record_count": len(color.get("records", [])),
            }
    else:
        raise ValueError("SOURCE_DATA_INVALID: expected palettes or normalized colors")
    if not provenance:
        raise ValueError("EMPTY_COLOR_POOL")
    return doc, {color: sorted(seed_ids) for color, seed_ids in sorted(provenance.items())}, metadata

def generate(anchor: str = "#A85C45", *, source: str = "all",
             dataset_path: Path = SOURCE_FILE, count: int = 5) -> dict:
    anchor = normalize_hex(anchor)
    if count < 2 or count > 5:
        raise ValueError("COUNT_OUT_OF_RANGE: 2..5")
    doc, provenance, metadata = read_pool(dataset_path, source)
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
            if minimum > best_value + 1e-12:
                best_hex, best_value = candidate, minimum
        if best_hex is None:
            raise ValueError("SELECTION_FAILED")
        steps.append({
            "position": slot,
            "selected_hex": best_hex,
            "min_oklab_distance": round(best_value, 8),
            "evaluated_candidates": len(remaining),
            "from_seed_ids": provenance[best_hex],
            "source_metadata": metadata.get(best_hex, {}),
            "selection_reason": "MAXIMIZE_MINIMUM_OKLAB_DISTANCE",
        })
        selected.append(best_hex)
        remaining.remove(best_hex)
    source_db = doc.get("source_database", {})
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
        "source_database_sha256": source_db.get("sha256"),
        "source_database_filename": source_db.get("filename"),
        "colors": selected,
        "steps": steps,
        "new_hex_created": False,
        "role_assigned": False,
        "harmony_or_brand_validated": False,
        "note": "Greedy max-min diversity is a technical selection heuristic, not an aesthetic or emotion score.",
    }

def main():
    parser = argparse.ArgumentParser(description="Generate a traceable five-color B2 candidate.")
    parser.add_argument("--anchor", default="#A85C45")
    parser.add_argument("--source", default="all", choices=["all", "carto", "colorbrewer"])
    parser.add_argument("--count", type=int, default=5, choices=[2, 3, 4, 5])
    parser.add_argument("--dataset", type=Path, default=None,
                        help="Use a normalized SQLite import JSON; defaults to imported single-color pool when present, otherwise original seed snapshot.")
    args = parser.parse_args()
    dataset = args.dataset or (NORMALIZED_POOL_FILE if NORMALIZED_POOL_FILE.exists() else SOURCE_FILE)
    try:
        result = generate(args.anchor, source=args.source, count=args.count, dataset_path=dataset)
        result["source_dataset_kind"] = "NORMALIZED_SINGLE_COLOR_SQLITE" if "source_database" in json.loads(dataset.read_text(encoding="utf-8")) else "FIVE_COLOR_SEED_SNAPSHOT"
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except (ValueError, FileNotFoundError, json.JSONDecodeError) as exc:
        parser.exit(2, "B2_ERROR: " + str(exc) + "\n")

if __name__ == "__main__":
    main()
