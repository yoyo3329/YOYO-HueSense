#!/usr/bin/env python3
"""Build a source-traceable HueSense single-color research SQLite database."""
import csv, hashlib, json, sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CSV_PATH = DATA / "xkcd_color_survey_949.csv"
PALETTE_PATH = DATA / "core_five_seeds.json"
OUT = DATA / "HueSense_SingleColor_Research_v1.sqlite"
NOW = datetime.now(timezone.utc).isoformat()

SCHEMA = """
PRAGMA foreign_keys=ON;
CREATE TABLE data_source(source_id INTEGER PRIMARY KEY, source_key TEXT UNIQUE NOT NULL, source_name TEXT NOT NULL, canonical_url TEXT NOT NULL, source_version TEXT, source_commit TEXT, license_label TEXT, license_review_status TEXT NOT NULL, attribution TEXT, accessed_at TEXT NOT NULL);
CREATE TABLE color(color_id INTEGER PRIMARY KEY, hex_code TEXT UNIQUE NOT NULL CHECK(hex_code GLOB '#[0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F][0-9A-F]'), created_at TEXT NOT NULL);
CREATE TABLE color_name(color_name_id INTEGER PRIMARY KEY, color_id INTEGER NOT NULL REFERENCES color(color_id), source_id INTEGER NOT NULL REFERENCES data_source(source_id), name_original TEXT NOT NULL, language_code TEXT NOT NULL DEFAULT 'en', source_rank INTEGER, name_type TEXT NOT NULL DEFAULT 'crowdsourced_color_name', UNIQUE(color_id,source_id,name_original));
CREATE TABLE color_source_record(record_id INTEGER PRIMARY KEY, color_id INTEGER NOT NULL REFERENCES color(color_id), source_id INTEGER NOT NULL REFERENCES data_source(source_id), source_record_key TEXT NOT NULL, source_hex_original TEXT NOT NULL, source_payload_json TEXT NOT NULL, UNIQUE(source_id,source_record_key));
CREATE TABLE semantic_tag(semantic_tag_id INTEGER PRIMARY KEY, tag_key TEXT UNIQUE NOT NULL, label_zh_tw TEXT NOT NULL, label_en TEXT, tag_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'PROPOSED_NOT_EVIDENCE');
CREATE TABLE color_concept_evidence(evidence_id INTEGER PRIMARY KEY, source_id INTEGER NOT NULL REFERENCES data_source(source_id), citation TEXT NOT NULL, study_design TEXT, population TEXT, language_code TEXT, measurement_method TEXT, sample_size INTEGER, notes TEXT, verification_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW');
CREATE TABLE color_concept_relation(relation_id INTEGER PRIMARY KEY, color_id INTEGER NOT NULL REFERENCES color(color_id), semantic_tag_id INTEGER NOT NULL REFERENCES semantic_tag(semantic_tag_id), evidence_id INTEGER NOT NULL REFERENCES color_concept_evidence(evidence_id), relation_value REAL, value_type TEXT, context_json TEXT, UNIQUE(color_id,semantic_tag_id,evidence_id,value_type));
CREATE TABLE palette_seed(palette_seed_id INTEGER PRIMARY KEY, external_key TEXT UNIQUE NOT NULL, source_id INTEGER NOT NULL REFERENCES data_source(source_id), palette_name TEXT NOT NULL, palette_family TEXT, source_path TEXT, swatch_count INTEGER NOT NULL CHECK(swatch_count=5), validation_status TEXT NOT NULL);
CREATE TABLE palette_seed_color(palette_seed_id INTEGER NOT NULL REFERENCES palette_seed(palette_seed_id), position_index INTEGER NOT NULL CHECK(position_index BETWEEN 1 AND 5), color_id INTEGER NOT NULL REFERENCES color(color_id), PRIMARY KEY(palette_seed_id,position_index), UNIQUE(palette_seed_id,color_id));
CREATE INDEX idx_color_name_lookup ON color_name(name_original);
CREATE INDEX idx_color_source_record_color ON color_source_record(color_id);
CREATE INDEX idx_relation_tag ON color_concept_relation(semantic_tag_id);
CREATE INDEX idx_palette_family ON palette_seed(palette_family);
"""

def main():
    if not CSV_PATH.exists() or not PALETTE_PATH.exists():
        raise SystemExit("SOURCE_FILE_MISSING")
    if OUT.exists(): OUT.unlink()
    con=sqlite3.connect(OUT)
    con.executescript(SCHEMA)
    with CSV_PATH.open(encoding="utf-8-sig",newline="") as f: rows=list(csv.DictReader(f))
    if len(rows)!=949: raise ValueError(f"EXPECTED_949_XKCD_ROWS_GOT_{len(rows)}")
    xsrc=con.execute("""INSERT INTO data_source(source_key,source_name,canonical_url,source_version,source_commit,license_label,license_review_status,attribution,accessed_at) VALUES(?,?,?,?,?,?,?,?,?)""",
      ("xkcd_survey_derived","XKCD Color Survey derived ranked color names","https://github.com/nrennie/xkcd-color-survey/blob/main/data/clean/color_ranks.csv","main snapshot","UNPINNED_SOURCE_SNAPSHOT","Not confirmed here","LICENSE_REVIEW_REQUIRED","Verify upstream licensing before redistribution or commercial use.",NOW)).lastrowid
    for row in rows:
        name=row["color"].strip(); hx=row["hex"].strip().upper(); rank=int(row["rank"])
        if len(hx)!=7 or hx[0]!="#" or any(c not in "0123456789ABCDEF" for c in hx[1:]): raise ValueError("INVALID_HEX:"+hx)
        found=con.execute("SELECT color_id FROM color WHERE hex_code=?",(hx,)).fetchone()
        cid=found[0] if found else con.execute("INSERT INTO color(hex_code,created_at) VALUES(?,?)",(hx,NOW)).lastrowid
        con.execute("INSERT INTO color_name(color_id,source_id,name_original,language_code,source_rank) VALUES(?,?,?,?,?)",(cid,xsrc,name,"en",rank))
        con.execute("INSERT INTO color_source_record(color_id,source_id,source_record_key,source_hex_original,source_payload_json) VALUES(?,?,?,?,?)",(cid,xsrc,str(rank),hx,json.dumps(row,ensure_ascii=False,sort_keys=True)))
    pdata=json.loads(PALETTE_PATH.read_text(encoding="utf-8"))
    for key,src in pdata["sources"].items():
        con.execute("INSERT INTO data_source(source_key,source_name,canonical_url,source_version,source_commit,license_label,license_review_status,attribution,accessed_at) VALUES(?,?,?,?,?,?,?,?,?)",
          (key,key,src["url"],pdata.get("version"),src.get("commit"),src.get("license"),"DOCUMENTED_REVIEW_REQUIRED_FOR_RELEASE",src.get("license"),NOW))
    for p in pdata["palettes"]:
        sid=con.execute("SELECT source_id FROM data_source WHERE source_key=?",(p["source"],)).fetchone()[0]
        pid=con.execute("INSERT INTO palette_seed(external_key,source_id,palette_name,palette_family,source_path,swatch_count,validation_status) VALUES(?,?,?,?,?,?,?)",
          (p["id"],sid,p["name"],p.get("family"),p.get("source_path"),len(p["colors"]),"SOURCE_DATA_NOT_BRAND_VALIDATED")).lastrowid
        for pos,hx in enumerate(p["colors"],1):
            hx=hx.upper()
            found=con.execute("SELECT color_id FROM color WHERE hex_code=?",(hx,)).fetchone()
            cid=found[0] if found else con.execute("INSERT INTO color(hex_code,created_at) VALUES(?,?)",(hx,NOW)).lastrowid
            con.execute("INSERT INTO color_source_record(color_id,source_id,source_record_key,source_hex_original,source_payload_json) VALUES(?,?,?,?,?)",(cid,sid,p["id"]+":"+str(pos),hx,json.dumps({"palette_id":p["id"],"position":pos,"hex":hx})))
            con.execute("INSERT INTO palette_seed_color(palette_seed_id,position_index,color_id) VALUES(?,?,?)",(pid,pos,cid))
    con.commit()
    fk=con.execute("PRAGMA foreign_key_check").fetchall()
    bad=con.execute("SELECT COUNT(*) FROM (SELECT palette_seed_id,COUNT(*) n FROM palette_seed_color GROUP BY palette_seed_id HAVING n<>5)").fetchone()[0]
    report={"xkcd_source_rows":len(rows),"xkcd_color_names":con.execute("SELECT COUNT(*) FROM color_name WHERE source_id=?",(xsrc,)).fetchone()[0],"unique_hex_total":con.execute("SELECT COUNT(*) FROM color").fetchone()[0],"five_color_palettes":con.execute("SELECT COUNT(*) FROM palette_seed").fetchone()[0],"palette_membership_rows":con.execute("SELECT COUNT(*) FROM palette_seed_color").fetchone()[0],"semantic_evidence_rows":con.execute("SELECT COUNT(*) FROM color_concept_evidence").fetchone()[0],"semantic_relation_rows":con.execute("SELECT COUNT(*) FROM color_concept_relation").fetchone()[0],"foreign_key_errors":len(fk),"invalid_palette_sizes":bad}
    con.close()
    report["database_sha256"]=hashlib.sha256(OUT.read_bytes()).hexdigest()
    report["database_bytes"]=OUT.stat().st_size
    (DATA/"build_report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))
    if report["xkcd_color_names"]!=949 or report["five_color_palettes"]!=63 or report["palette_membership_rows"]!=315 or fk or bad: raise SystemExit("DATABASE_VALIDATION_FAILED")
if __name__=="__main__": main()
