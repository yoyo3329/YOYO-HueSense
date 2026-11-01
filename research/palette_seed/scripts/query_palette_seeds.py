#!/usr/bin/env python3
"""Course 1: read-only MySQL 8.4 five-color seed queries; no generated palettes."""
import argparse
import hashlib
import json
import os
import re
import sys

HEX = re.compile(r"^#[0-9A-F]{6}$")
PALETTE_SQL = """
SELECT p.external_key, p.palette_name, p.palette_family, p.swatch_count,
       p.seed_status, p.content_sha256, sc.position_index, c.hex_code,
       s.source_key, s.source_url, s.source_path, s.commit_sha,
       s.license_label, s.license_review
FROM hs_palette_seed p
JOIN hs_palette_seed_color sc ON sc.palette_id = p.palette_id
JOIN hs_seed_color c ON c.color_id = sc.color_id
JOIN hs_seed_source s ON s.source_key = p.source_key
WHERE p.external_key = %s
ORDER BY sc.position_index
"""
LIST_SQL = """
SELECT p.external_key, p.palette_name, p.palette_family,
       p.source_key, p.seed_status, COUNT(sc.color_id) AS member_count
FROM hs_palette_seed p
LEFT JOIN hs_palette_seed_color sc ON sc.palette_id = p.palette_id
GROUP BY p.palette_id, p.external_key, p.palette_name,
         p.palette_family, p.source_key, p.seed_status
ORDER BY p.source_key, p.external_key
LIMIT %s
"""
LIST_SOURCE_SQL = """
SELECT p.external_key, p.palette_name, p.palette_family,
       p.source_key, p.seed_status, COUNT(sc.color_id) AS member_count
FROM hs_palette_seed p
LEFT JOIN hs_palette_seed_color sc ON sc.palette_id = p.palette_id
WHERE p.source_key = %s
GROUP BY p.palette_id, p.external_key, p.palette_name,
         p.palette_family, p.source_key, p.seed_status
ORDER BY p.source_key, p.external_key
LIMIT %s
"""

class SeedDataError(ValueError):
    """Joined rows failed integrity validation."""

def format_palette(rows):
    if not rows:
        return None
    head = rows[0]
    colors, positions = [], []
    for r in rows:
        if r["external_key"] != head["external_key"]:
            raise SeedDataError("SQL_JOIN_MIXED_PALETTES")
        if r["source_key"] != head["source_key"]:
            raise SeedDataError("SQL_JOIN_MIXED_SOURCES")
        colors.append(str(r["hex_code"]))
        positions.append(int(r["position_index"]))
    if len(colors) != 5 or positions != [1, 2, 3, 4, 5]:
        raise SeedDataError("FIVE_COLOR_MEMBERSHIP_INVALID")
    if int(head["swatch_count"]) != 5:
        raise SeedDataError("DECLARED_SWATCH_COUNT_INVALID")
    if len(set(colors)) != 5 or any(not HEX.fullmatch(c) for c in colors):
        raise SeedDataError("HEX_OR_DUPLICATE_INVALID")
    digest = hashlib.sha256(json.dumps(colors, separators=(",", ":")).encode()).hexdigest()
    if head["content_sha256"] != digest:
        raise SeedDataError("SOURCE_PALETTE_HASH_MISMATCH")
    return {
        "status": "FOUND_ORIGINAL_SEED",
        "seed_id": head["external_key"],
        "name": head["palette_name"],
        "family": head["palette_family"],
        "colors": colors,
        "original_positions": positions,
        "source": {
            "key": head["source_key"],
            "url": head["source_url"],
            "path": head["source_path"],
            "commit_sha": head["commit_sha"],
            "license": head["license_label"],
            "license_review": head["license_review"],
        },
        "record_status": head["seed_status"],
        "content_sha256": digest,
        "generated": False,
        "roles_assigned": False,
        "brand_or_psychological_validated": False,
    }

def get_seed(connection, seed_id):
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(PALETTE_SQL, (seed_id,))
        return format_palette(cursor.fetchall())
    finally:
        cursor.close()

def list_seeds(connection, limit=20, source=None):
    limit = int(limit)
    if not 1 <= limit <= 100:
        raise ValueError("limit must be 1..100")
    cursor = connection.cursor(dictionary=True)
    try:
        if source is None:
            cursor.execute(LIST_SQL, (limit,))
        else:
            cursor.execute(LIST_SOURCE_SQL, (source, limit))
        rows = [dict(r) for r in cursor.fetchall()]
        for r in rows:
            r["member_count"] = int(r["member_count"])
        return rows
    finally:
        cursor.close()

def connect(host, port, user, database, password):
    try:
        import mysql.connector
    except ImportError as exc:
        raise RuntimeError("Missing mysql-connector-python; use Course 1 Docker or install pinned requirements.") from exc
    return mysql.connector.connect(
        host=host, port=port, user=user, password=password,
        database=database, connection_timeout=10
    )

def main(argv=None):
    parser = argparse.ArgumentParser(description="Query original five-swatch palettes from MySQL.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--seed-id", help="Example: carto:Peach:5")
    group.add_argument("--list", action="store_true", help="List available seed IDs")
    parser.add_argument("--source", choices=("carto", "colorbrewer"), help="With --list only")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--host", default=os.getenv("HUESENSE_DB_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.getenv("HUESENSE_DB_PORT", "3307")))
    parser.add_argument("--user", default=os.getenv("HUESENSE_DB_USER", "huesense_seed"))
    parser.add_argument("--database", default=os.getenv("HUESENSE_DB_NAME", "huesense_seed"))
    args = parser.parse_args(argv)
    if args.seed_id and args.source:
        parser.error("--source requires --list")
    if not 1 <= args.limit <= 100:
        parser.error("--limit must be 1..100")
    password = os.getenv("HUESENSE_DB_PASSWORD")
    if not password:
        parser.error("HUESENSE_DB_PASSWORD not set; run via the Course 1 Docker environment.")
    try:
        cn = connect(args.host, args.port, args.user, args.database, password)
        try:
            if args.list:
                rows = list_seeds(cn, args.limit, args.source)
                result = {"status": "OK", "count": len(rows), "seeds": rows,
                          "note": "Cartographic source families do not indicate brand psychology."}
            else:
                result = get_seed(cn, args.seed_id)
                if result is None:
                    print(json.dumps({"status": "NOT_FOUND", "seed_id": args.seed_id}, ensure_ascii=False))
                    return 2
        finally:
            cn.close()
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except SeedDataError as exc:
        print(json.dumps({"status": "INTEGRITY_ERROR", "reason": str(exc)}), file=sys.stderr)
        return 3
    except Exception as exc:
        print(json.dumps({"status": "QUERY_FAILED", "type": type(exc).__name__}), file=sys.stderr)
        return 4

if __name__ == "__main__":
    raise SystemExit(main())
