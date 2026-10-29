import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from b2_greedy_select import generate, normalize_hex, to_oklab, distance, read_pool, SOURCE_FILE

class B2Test(unittest.TestCase):
    def test_reference_white_black(self):
        l, a, b = to_oklab("#FFFFFF")
        self.assertAlmostEqual(l, 1.0, places=6)
        self.assertAlmostEqual(a, 0.0, places=6)
        self.assertAlmostEqual(b, 0.0, places=6)
        self.assertAlmostEqual(distance(to_oklab("#000000"), to_oklab("#FFFFFF")), 1.0, places=6)

    def test_format_and_case(self):
        self.assertEqual(normalize_hex("#a85c45"), "#A85C45")
        for bad in ["a85c45", "#AAAA", "#GG1122", "", "white"]:
            with self.assertRaises(ValueError): normalize_hex(bad)

    def test_real_dataset(self):
        doc, pool = read_pool()
        self.assertEqual(len(doc["palettes"]), 63)
        self.assertEqual(len(pool), 291)
        self.assertEqual(len(read_pool(source="carto")[1]), len(set(
            c for p in doc["palettes"] if p["source"] == "carto" for c in p["colors"]
        )))
        self.assertNotIn("#A85C45", pool)
        self.assertEqual(len(read_pool(source="colorbrewer")[1]), len(set(
            c for p in doc["palettes"] if p["source"] == "colorbrewer" for c in p["colors"]
        )))

    def test_deterministic_five_and_provenance(self):
        first = generate("#A85C45")
        second = generate("#a85c45")
        self.assertEqual(first, second)
        self.assertEqual(len(first["colors"]), 5)
        self.assertEqual(first["colors"][0], "#A85C45")
        self.assertEqual(len(set(first["colors"])), 5)
        self.assertEqual(len(first["steps"]), 4)
        self.assertEqual(first["anchor_origin"], "USER_INPUT")
        self.assertFalse(first["new_hex_created"])
        self.assertFalse(first["harmony_or_brand_validated"])
        pool = read_pool()[1]
        for step in first["steps"]:
            self.assertIn(step["selected_hex"], pool)
            self.assertEqual(step["from_seed_ids"], pool[step["selected_hex"]])

    def test_each_choice_is_true_greedy_maximin(self):
        out = generate("#A85C45")
        pool = sorted(read_pool()[1])
        chosen = [out["anchor_hex"]]
        for step in out["steps"]:
            available = [c for c in pool if c not in chosen]
            expected = sorted(available, key=lambda c: (-min(distance(to_oklab(c), to_oklab(s)) for s in chosen), c))[0]
            self.assertEqual(step["selected_hex"], expected)
            chosen.append(expected)

    def test_anchor_in_existing_pool_not_duplicated(self):
        result = generate("#FFFFFF") if "#FFFFFF" in read_pool()[1] else generate("#F7F7F7")
        self.assertEqual(len(set(result["colors"])), 5)
        self.assertEqual(result["anchor_origin"], "USER_INPUT_ALSO_IN_POOL")

    def test_source_filter_and_variable_count(self):
        for source in ("carto", "colorbrewer"):
            result = generate(source=source, count=3)
            self.assertEqual(len(result["colors"]), 3)
            self.assertEqual(result["pool_source"], source)

    def test_insufficient_pool_failure(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "single.json"
            path.write_text(json.dumps({"version":"test","sources":{"carto":{}},
                "palettes":[{"id":"only","source":"carto","colors":["#000000","#111111","#222222","#333333","#444444"]}]}))
            with self.assertRaisesRegex(ValueError, "INSUFFICIENT_POOL_CANDIDATES"):
                generate("#A85C45", dataset_path=path, count=5) if False else generate("#A85C45", dataset_path=path, count=5) if False else self._insufficient(path)

    def _insufficient(self, path):
        # Anchor + 5 identical? Duplicate checks must reject before selection.
        path.write_text(json.dumps({"version":"test","sources":{"carto":{}},
           "palettes":[]}))
        return generate("#A85C45", dataset_path=path, count=5)

    def test_cli_json(self):
        script = Path(__file__).resolve().parents[1] / "scripts" / "b2_greedy_select.py"
        proc = subprocess.run([sys.executable, str(script), "--anchor", "#A85C45"],
                              capture_output=True, text=True, check=True)
        out = json.loads(proc.stdout)
        self.assertEqual(len(out["colors"]), 5)

if __name__ == "__main__":
    unittest.main()
