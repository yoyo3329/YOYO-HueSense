import copy
import hashlib
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from query_palette_seeds import format_palette, get_seed, list_seeds, SeedDataError

class SeedQueryTests(unittest.TestCase):
    def setUp(self):
        self.colors = ["#FDE0C5", "#F9C098", "#F59E72", "#F17854", "#EB4A40"]
        digest = hashlib.sha256(json.dumps(self.colors, separators=(",", ":")).encode()).hexdigest()
        self.rows = [{
            "external_key": "carto:Peach:5",
            "palette_name": "Peach",
            "palette_family": "sequential",
            "swatch_count": 5,
            "seed_status": "SOURCE_VERIFIED_NOT_BRAND_VALIDATED",
            "content_sha256": digest,
            "position_index": i,
            "hex_code": h,
            "source_key": "carto",
            "source_url": "https://github.com/CartoDB/CartoColor",
            "source_path": "src/carto.ts",
            "commit_sha": "1" * 40,
            "license_label": "CC-BY-4.0",
            "license_review": "DOCUMENTED",
        } for i, h in enumerate(self.colors, 1)]

    def test_complete_palette(self):
        out = format_palette(self.rows)
        self.assertEqual(out["colors"], self.colors)
        self.assertFalse(out["generated"])
        self.assertFalse(out["roles_assigned"])
        self.assertFalse(out["brand_or_psychological_validated"])

    def test_empty(self):
        self.assertIsNone(format_palette([]))

    def test_wrong_count(self):
        with self.assertRaises(SeedDataError):
            format_palette(self.rows[:-1])

    def test_order_gap(self):
        broken = copy.deepcopy(self.rows)
        broken[3]["position_index"] = 5
        with self.assertRaises(SeedDataError):
            format_palette(broken)

    def test_modified_source_digest(self):
        broken = copy.deepcopy(self.rows)
        broken[0]["hex_code"] = "#FFFFFF"
        with self.assertRaises(SeedDataError):
            format_palette(broken)

    def test_duplicate(self):
        broken = copy.deepcopy(self.rows)
        broken[1]["hex_code"] = broken[0]["hex_code"]
        with self.assertRaises(SeedDataError):
            format_palette(broken)

    def test_prepared_parameter_binding(self):
        connection = MagicMock()
        cursor = connection.cursor.return_value
        cursor.fetchall.return_value = self.rows
        out = get_seed(connection, "carto:Peach:5' OR 1=1 --")
        self.assertEqual(out["colors"], self.colors)
        self.assertEqual(cursor.execute.call_args.args[1], ("carto:Peach:5' OR 1=1 --",))

    def test_list_limit(self):
        with self.assertRaises(ValueError):
            list_seeds(MagicMock(), 101)

if __name__ == "__main__":
    unittest.main()
