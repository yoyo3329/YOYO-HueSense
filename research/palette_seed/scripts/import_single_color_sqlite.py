#!/usr/bin/env python3
"""Import a HueSense SQLite color research database into a provenance-preserving B2 pool.

This importer intentionally inspects the real database schema instead of assuming that
all prior versions use identical table names. It merges duplicate HEX values but retains
the original color rows, linked name/mapping records, and source/evidence records.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import sqlite3
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "data" / "HueSense_Research_DB_v02.sqlite"
DEFAULT_OUTPUT = ROOT / "data" / "single_color_pool.json"
HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
HEX_COLUMN_NAMES = {"hex", "hexcode", "hexvalue", "originalhex", "colorhex", "colourhex", "hexcolour", "hexcolor"}
ID_ALIASES = {
    "source": {"source", "sources", "datasource", "datasources", "referencesource"},
    "evidence": {"evidence", "evidences", "researchEvidence", "evidencerecord"},
    "word": {"word", "words", "colorname", "colorword", "colourname"},
    "tag": {"tag", "tags", "semantictag", "semantictags"},
    "category": {"category", "categories", "colorcategory", "basiccolorcategory"},
    "reference": {"reference", "references", "citation", "citations", "source"},
}
NAME_COLUMNS = {
    "name", "colorname", "colourname", "word", "wordzh", "worden",
    "term", "label", "conceptname", "tagzh", "tagen", "categoryname",
    "originalname", "displayname",
}

def ident(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'

def norm_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value).lower())

def valid_hex(value: Any) -> bool:
    return isinstance(value, str) and bool(HEX_RE.fullmatch(value.strip()))

def stable_row_key(table: str, row: dict[str, Any], pk_cols: list[str]) -> str:
    if pk_cols and all(row.get(col) is not None for col in pk_cols):
        return table + "[" + ",".join(f"{col}={row[col]}" for col in pk_cols) + "]"
    raw = json.dumps(row, ensure_ascii=False, sort_keys=True, default=str)
    return table + "[row-sha256=" + hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16] + "]"

def load_schema_and_rows(conn: sqlite3.Connection) -> dict[str, dict[str, Any]]:
    names = [r[0] for r in conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )]
    schema: dict[str, dict[str, Any]] = {}
    for table in names:
        info = list(conn.execute(f"PRAGMA table_info({ident(table)})"))
        columns = [r[1] for r in info]
        pk_cols = [r[1] for r in sorted((r for r in info if r[5]), key=lambda r: r[5])]
        fks = [dict(r) for r in conn.execute(f"PRAGMA foreign_key_list({ident(table)})")]
        rows = [dict(r) for r in conn.execute(f"SELECT * FROM {ident(table)}")]
        schema[table] = {
            "columns": columns, "pk_cols": pk_cols, "foreign_keys": fks, "rows": rows,
            "row_by_pk": defaultdict(list),
        }
        for row in rows:
            if pk_cols and all(row.get(c) is not None for c in pk_cols):
                schema[table]["row_by_pk"][tuple(str(row[c]) for c in pk_cols)].append(row)
            for col in columns:
                if norm_name(col) in {"colorid", "colourid", "sourceid", "evidenceid", "wordid", "tagid", "categoryid"} and row.get(col) is not None:
                    schema[table]["row_by_pk"][(str(row[col]),)].append(row)
    return schema

def detect_hex_table(schema: dict[str, dict[str, Any]], table_arg: str | None, column_arg: str | None):
    candidates = []
    for table, meta in schema.items():
        if table_arg and table.lower() != table_arg.lower():
            continue
        for col in meta["columns"]:
            if column_arg and col.lower() != column_arg.lower():
                continue
            normalized = norm_name(col)
            if not column_arg and normalized not in HEX_COLUMN_NAMES and not (
                normalized.endswith("hex") or normalized.startswith("hex")
            ):
                continue
            valid_rows = [row for row in meta["rows"] if valid_hex(row.get(col))]
            if not valid_rows:
                continue
            table_norm = norm_name(table)
            table_score = 100 if table_norm in {"color", "colors", "colour", "colours", "colormaster"} else (
                60 if "color" in table_norm or "colour" in table_norm else 0
            )
            col_score = 10 if normalized in {"hex", "hexcode", "hexvalue"} else 5
            candidates.append((table_score + col_score, len(valid_rows), table, col, len(valid_rows)))
    if not candidates:
        requested = f" (table={table_arg!r}, hex_column={column_arg!r})" if table_arg or column_arg else ""
        raise ValueError("HEX_TABLE_NOT_FOUND" + requested + "; run --inspect or pass --table and --hex-column")
    candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
    top = candidates[0]
    tied = [c for c in candidates if c[:2] == top[:2]]
    if len(tied) > 1 and not table_arg:
        raise ValueError("HEX_TABLE_AMBIGUOUS: " + "; ".join(f"{c[2]}.{c[3]} ({c[4]} valid rows)" for c in tied) + "; pass --table and --hex-column")
    return top[2], top[3], candidates

def resolve_fk_rows(schema, table, row):
    """Return one-hop rows referenced by declared FKs and conservative ID-name matches."""
    meta = schema[table]
    found = []
    seen = set()
    for fk in meta["foreign_keys"]:
        child_col, target_table = fk.get("from"), fk.get("table")
        if not child_col or target_table not in schema or row.get(child_col) is None:
            continue
        target_col = fk.get("to")
        target_meta = schema[target_table]
        if not target_col:
            target_col = target_meta["pk_cols"][0] if len(target_meta["pk_cols"]) == 1 else None
        if not target_col:
            continue
        for target_row in target_meta["rows"]:
            if str(target_row.get(target_col)) == str(row[child_col]):
                key = stable_row_key(target_table, target_row, target_meta["pk_cols"])
                if key not in seen:
                    found.append((target_table, target_row))
                    seen.add(key)
    # If a legacy SQLite schema omitted FK declarations, use clear *_id names only.
    for col in meta["columns"]:
        value = row.get(col)
        if value is None or not norm_name(col).endswith("id"):
            continue
        base = norm_name(col)[:-2]
        if base in {"color", "colour", "relation", "record", "raw"}:
            continue
        aliases = ID_ALIASES.get(base, {base, base + "s"})
        for target_table, target_meta in schema.items():
            if target_table == table or norm_name(target_table) not in aliases:
                continue
            target_cols = target_meta["pk_cols"] or [
                c for c in target_meta["columns"] if norm_name(c) == norm_name(col)
            ]
            for target_col in target_cols[:1]:
                for target_row in target_meta["rows"]:
                    if str(target_row.get(target_col)) == str(value):
                        key = stable_row_key(target_table, target_row, target_meta["pk_cols"])
                        if key not in seen:
                            found.append((target_table, target_row))
                            seen.add(key)
    return found

def import_database(database: Path, output: Path, *, table_arg: str | None = None,
                    column_arg: str | None = None) -> dict[str, Any]:
    database = Path(database)
    if not database.is_file():
        raise FileNotFoundError(f"SOURCE_DATABASE_MISSING: {database}")
    db_sha = hashlib.sha256(database.read_bytes()).hexdigest()
    conn = sqlite3.connect(f"file:{database.resolve().as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        schema = load_schema_and_rows(conn)
        table, hex_col, candidates = detect_hex_table(schema, table_arg, column_arg)
        meta = schema[table]
        pk_cols = meta["pk_cols"]
        color_rows = [r for r in meta["rows"] if valid_hex(r.get(hex_col))]
        grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in color_rows:
            grouped["#" + row[hex_col].strip().lstrip("#").upper()].append(row)

        # Map color identifiers to HEX so relation tables can be linked even without declared FKs.
        id_to_hex: dict[str, set[str]] = defaultdict(set)
        id_cols = list(pk_cols)
        for c in meta["columns"]:
            if norm_name(c) in {"colorid", "colourid"} and c not in id_cols:
                id_cols.append(c)
        for hex_code, rows in grouped.items():
            for row in rows:
                for id_col in id_cols:
                    if row.get(id_col) is not None:
                        id_to_hex[str(row[id_col])].add(hex_code)

        records_by_hex: dict[str, dict[str, dict[str, Any]]] = {h: {} for h in grouped}
        for hex_code, rows in grouped.items():
            for row in rows:
                key = stable_row_key(table, row, pk_cols)
                records_by_hex[hex_code][key] = {"table": table, "row": row}

        # Find all records that reference a color row, using declared FKs and legacy color_id fields.
        for child_table, child_meta in schema.items():
            if child_table == table:
                continue
            for row in child_meta["rows"]:
                matched_hexes: set[str] = set()
                for fk in child_meta["foreign_keys"]:
                    if str(fk.get("table", "")).lower() != table.lower():
                        continue
                    child_col = fk.get("from")
                    target_col = fk.get("to") or (pk_cols[0] if len(pk_cols) == 1 else None)
                    if child_col and target_col and row.get(child_col) is not None:
                        target_hexes = id_to_hex.get(str(row[child_col]), set())
                        # Match against any known key for the color table; direct color_id is the common case.
                        if target_hexes:
                            matched_hexes.update(target_hexes)
                for col in child_meta["columns"]:
                    if norm_name(col) in {"colorid", "colourid"} and row.get(col) is not None:
                        matched_hexes.update(id_to_hex.get(str(row[col]), set()))
                for hex_code in matched_hexes:
                    key = stable_row_key(child_table, row, child_meta["pk_cols"])
                    records_by_hex[hex_code][key] = {"table": child_table, "row": row}

        # Follow each color and direct relation record one hop to retain source/evidence/name rows.
        for hex_code, record_map in records_by_hex.items():
            initial = list(record_map.values())
            for record in initial:
                for target_table, target_row in resolve_fk_rows(schema, record["table"], record["row"]):
                    target_meta = schema[target_table]
                    key = stable_row_key(target_table, target_row, target_meta["pk_cols"])
                    record_map[key] = {"table": target_table, "row": target_row}

        output_colors = []
        for hex_code in sorted(records_by_hex):
            records = sorted(records_by_hex[hex_code].values(), key=lambda rec: (rec["table"].lower(), stable_row_key(rec["table"], rec["row"], schema[rec["table"]]["pk_cols"])))
            names, source_refs, evidence_refs, color_ids = [], [], [], []
            for record in records:
                table_name, row = record["table"], record["row"]
                tnorm = norm_name(table_name)
                if table_name == table:
                    for col in id_cols:
                        if row.get(col) is not None:
                            color_ids.append(str(row[col]))
                for col, value in row.items():
                    cnorm = norm_name(col)
                    if value is None or not isinstance(value, (str, int, float)):
                        continue
                    if cnorm in NAME_COLUMNS and str(value).strip():
                        item = {"table": table_name, "column": col, "value": str(value).strip()}
                        if item not in names:
                            names.append(item)
                ref = {"table": table_name, "record_key": stable_row_key(table_name, row, schema[table_name]["pk_cols"]), "row": row}
                if "source" in tnorm or "reference" in tnorm or "citation" in tnorm:
                    if ref not in source_refs:
                        source_refs.append(ref)
                if "evidence" in tnorm or any(k in {norm_name(c) for c in row} for k in {"evidencetype", "claimsummary", "measurementvalue", "evidencestatus"}):
                    if ref not in evidence_refs:
                        evidence_refs.append(ref)
            output_colors.append({
                "hex": hex_code,
                "color_ids": sorted(set(color_ids)),
                "names": names,
                "source_refs": source_refs,
                "evidence_refs": evidence_refs,
                "records": records,
            })

        result = {
            "dataset": "HueSense normalized single-color pool",
            "version": "1.0",
            "import_status": "NORMALIZED_FROM_SQLITE",
            "source_database": {
                "filename": database.name,
                "sha256": db_sha,
                "color_table": table,
                "hex_column": hex_col,
                "color_primary_key_columns": pk_cols,
                "source_table_count": len(schema),
                "source_table_names": sorted(schema),
                "valid_color_rows_before_deduplication": len(color_rows),
                "unique_hex_count": len(output_colors),
                "duplicate_hex_rows_merged": len(color_rows) - len(output_colors),
                "hex_table_candidates": [
                    {"table": c[2], "hex_column": c[3], "valid_hex_rows": c[4], "selection_score": c[0]}
                    for c in candidates
                ],
            },
            "normalization_rules": {
                "hex_case": "uppercase #RRGGBB",
                "duplicate_handling": "merge by normalized HEX; retain all distinct source rows, linked records, names, and evidence records",
                "source_evidence_policy": "no evidence score or semantic relationship is invented; only rows present in the source SQLite are copied",
            },
            "colors": output_colors,
        }
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(result, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
        return result
    finally:
        conn.close()

def inspect_database(database: Path) -> dict[str, Any]:
    if not Path(database).is_file():
        raise FileNotFoundError(f"SOURCE_DATABASE_MISSING: {database}")
    conn = sqlite3.connect(f"file:{Path(database).resolve().as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        schema = load_schema_and_rows(conn)
        candidates = []
        for table, meta in schema.items():
            for col in meta["columns"]:
                if norm_name(col) in HEX_COLUMN_NAMES or norm_name(col).endswith("hex") or norm_name(col).startswith("hex"):
                    count = sum(1 for row in meta["rows"] if valid_hex(row.get(col)))
                    if count:
                        candidates.append({"table": table, "hex_column": col, "valid_hex_rows": count, "primary_key_columns": meta["pk_cols"], "columns": meta["columns"]})
        return {"database": str(database), "table_count": len(schema), "tables": [
            {"name": name, "row_count": len(meta["rows"]), "columns": meta["columns"], "primary_key_columns": meta["pk_cols"], "foreign_keys": meta["foreign_keys"]}
            for name, meta in schema.items()
        ], "hex_candidates": candidates}
    finally:
        conn.close()

def main():
    parser = argparse.ArgumentParser(description="Normalize the actual HueSense single-color SQLite database without inventing evidence.")
    parser.add_argument("--database", type=Path, default=DEFAULT_DB)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--table", help="Explicit color table when automatic detection is ambiguous")
    parser.add_argument("--hex-column", help="Explicit HEX column when automatic detection is ambiguous")
    parser.add_argument("--inspect", action="store_true", help="Print real table/column/FK inventory; do not import")
    args = parser.parse_args()
    try:
        if args.inspect:
            print(json.dumps(inspect_database(args.database), ensure_ascii=False, indent=2, default=str))
        else:
            result = import_database(args.database, args.output, table_arg=args.table, column_arg=args.hex_column)
            print(json.dumps({
                "status": result["import_status"],
                "source_database": result["source_database"],
                "output": str(args.output),
                "source_evidence_rows_preserved": sum(len(c["source_refs"]) + len(c["evidence_refs"]) for c in result["colors"]),
            }, ensure_ascii=False, indent=2))
    except (ValueError, FileNotFoundError, sqlite3.Error, json.JSONDecodeError) as exc:
        parser.exit(2, "IMPORT_ERROR: " + str(exc) + "\n")

if __name__ == "__main__":
    main()
