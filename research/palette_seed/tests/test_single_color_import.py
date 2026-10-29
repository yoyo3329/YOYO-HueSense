import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
from import_single_color_sqlite import import_database, inspect_database
from b2_greedy_select import generate

class SingleColorImportTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.db = self.root / "source.sqlite"
        self.out = self.root / "single_color_pool.json"
        con = sqlite3.connect(self.db)
        con.executescript("""
          PRAGMA foreign_keys=ON;
          CREATE TABLE data_source(source_id INTEGER PRIMARY KEY, source_name TEXT, source_url TEXT);
          CREATE TABLE evidence(evidence_id INTEGER PRIMARY KEY, source_id INTEGER NOT NULL REFERENCES data_source(source_id), evidence_type TEXT, claim_summary TEXT);
          CREATE TABLE color(color_id INTEGER PRIMARY KEY, color_name TEXT, hex_code TEXT NOT NULL);
          CREATE TABLE color_concept_relation(relation_id INTEGER PRIMARY KEY, color_id INTEGER NOT NULL REFERENCES color(color_id), evidence_id INTEGER NOT NULL REFERENCES evidence(evidence_id), relation_type TEXT, measurement_value REAL);
          INSERT INTO data_source VALUES(1, 'Example paper', 'https://example.org/paper');
          INSERT INTO evidence VALUES(10, 1, 'synthetic_fixture', 'Synthetic test fixture only; not real research evidence');
          INSERT INTO color VALUES(100, 'Warm red', '#aa1122');
          INSERT INTO color VALUES(101, 'Red duplicate spelling', '#AA1122');
          INSERT INTO color VALUES(102, 'Ocean blue', '#2255AA');
          INSERT INTO color VALUES(103, 'Leaf green', '#22AA55');
          INSERT INTO color VALUES(104, 'Gold', '#DDAA22');
          INSERT INTO color VALUES(105, 'Violet', '#8844AA');
          INSERT INTO color_concept_relation VALUES(1000, 100, 10, 'association', 0.7);
          INSERT INTO color_concept_relation VALUES(1001, 101, 10, 'association', 0.6);
          INSERT INTO color_concept_relation VALUES(1002, 102, 10, 'association', 0.4);
          INSERT INTO color_concept_relation VALUES(1003, 103, 10, 'association', 0.3);
          INSERT INTO color_concept_relation VALUES(1004, 104, 10, 'association', 0.2);
          INSERT INTO color_concept_relation VALUES(1005, 105, 10, 'association', 0.1);
        """)
        con.commit()
        con.close()

    def tearDown(self):
        self.temp.cleanup()

    def test_inspect_reports_actual_schema(self):
        result = inspect_database(self.db)
        self.assertEqual(result["table_count"], 4)
        self.assertTrue(any(x["table"] == "color" and x["hex_column"] == "hex_code" and x["valid_hex_rows"] == 6 for x in result["hex_candidates"]))

    def test_import_deduplicates_hex_but_preserves_records_and_evidence(self):
        result = import_database(self.db, self.out)
        self.assertEqual(result["source_database"]["valid_color_rows_before_deduplication"], 6)
        self.assertEqual(result["source_database"]["unique_hex_count"], 5)
        self.assertEqual(result["source_database"]["duplicate_hex_rows_merged"], 1)
        doc = json.loads(self.out.read_text(encoding="utf-8"))
        red = next(c for c in doc["colors"] if c["hex"] == "#AA1122")
        self.assertEqual(len(red["color_ids"]), 2)
        self.assertGreaterEqual(len(red["records"]), 4)
        self.assertTrue(red["evidence_refs"])
        self.assertTrue(red["source_refs"])
        self.assertEqual(result["import_status"], "NORMALIZED_FROM_SQLITE")

    def test_b2_accepts_normalized_pool_and_keeps_metadata(self):
        import_database(self.db, self.out)
        result = generate("#A85C45", dataset_path=self.out)
        self.assertEqual(result["pool_unique_hex"], 5)
        self.assertTrue(result["steps"])
        self.assertTrue(any(step.get("source_metadata", {}).get("evidence_refs") for step in result["steps"] if step["selected_hex"] in {"#AA1122", "#2255AA", "#22AA55", "#DDAA22", "#8844AA"}))

    def test_missing_database_is_explicit(self):
        with self.assertRaisesRegex(FileNotFoundError, "SOURCE_DATABASE_MISSING"):
            import_database(self.root / "missing.sqlite", self.out)

if __name__ == "__main__":
    unittest.main()
