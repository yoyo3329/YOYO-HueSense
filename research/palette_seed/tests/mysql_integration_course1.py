#!/usr/bin/env python3
"""Real MySQL 8.4 integration validation of Course 1 schema and JOIN queries.
Designed for ephemeral GitHub Actions MySQL service; never touches user DB.
"""
import json
import os
import sys
from pathlib import Path

import mysql.connector

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from query_palette_seeds import get_seed, list_seeds

def connect():
    return mysql.connector.connect(
        host=os.getenv("HUESENSE_DB_HOST", "127.0.0.1"),
        port=int(os.getenv("HUESENSE_DB_PORT", "3306")),
        user=os.getenv("HUESENSE_DB_USER", "huesense_seed"),
        password=os.environ["HUESENSE_DB_PASSWORD"],
        database=os.getenv("HUESENSE_DB_NAME", "huesense_seed"),
    )

def main():
    cn = connect()
    try:
        cur = cn.cursor()
        try:
            cur.execute("SELECT COUNT(*) FROM hs_palette_seed")
            count = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM hs_palette_seed_color")
            member_count = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM hs_seed_color")
            unique_hex = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM (SELECT palette_id FROM hs_palette_seed_color GROUP BY palette_id HAVING COUNT(*)<>5) bad")
            invalid = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM hs_palette_seed p LEFT JOIN hs_seed_source s ON p.source_key=s.source_key WHERE s.source_key IS NULL")
            missing_sources = cur.fetchone()[0]
        finally:
            cur.close()
        peach = get_seed(cn, "carto:Peach:5")
        expected = ["#FDE0C5", "#F9C098", "#F59E72", "#F17854", "#EB4A40"]
        assert peach is not None and peach["colors"] == expected, peach
        assert peach["source"]["key"] == "carto" and peach["source"]["commit_sha"]
        assert peach["generated"] is False and peach["roles_assigned"] is False
        assert get_seed(cn, "DOES_NOT_EXIST") is None
        assert (count, member_count, unique_hex, invalid, missing_sources) == (63, 315, 291, 0, 0)
        assert len(list_seeds(cn, limit=100)) == 63
        assert len(list_seeds(cn, limit=100, source="carto")) == 28
        assert len(list_seeds(cn, limit=100, source="colorbrewer")) == 35
        summary = {"database": "MySQL 8.4", "palettes": count, "memberships": member_count, "unique_hex": unique_hex, "bad_palettes": invalid, "missing_sources": missing_sources, "peach_order_verified": True, "status": "PASS"}
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    finally:
        cn.close()

if __name__ == "__main__":
    main()
