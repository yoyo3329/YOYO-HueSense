import json, sqlite3, subprocess, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class BuildDbTest(unittest.TestCase):
 def test_builder_and_integrity(self):
  p=subprocess.run([sys.executable,str(ROOT/"scripts"/"build_single_color_db.py")],capture_output=True,text=True)
  self.assertEqual(p.returncode,0,p.stdout+p.stderr)
  report=json.loads((ROOT/"data"/"build_report.json").read_text(encoding="utf-8"))
  self.assertEqual(report["xkcd_color_names"],949)
  self.assertEqual(report["five_color_palettes"],63)
  self.assertEqual(report["palette_membership_rows"],315)
  self.assertEqual(report["semantic_evidence_rows"],0)
  self.assertEqual(report["semantic_relation_rows"],0)
  self.assertEqual(report["foreign_key_errors"],0)
  self.assertEqual(report["invalid_palette_sizes"],0)
  db=sqlite3.connect(ROOT/"data"/"HueSense_SingleColor_Research_v1.sqlite")
  self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(),[])
  self.assertEqual(db.execute("SELECT COUNT(*) FROM color_name").fetchone()[0],949)
  db.close()
if __name__=="__main__": unittest.main()
