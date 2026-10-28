# HueSense five-color palette seed library (isolated research module)

## Purpose
A dedicated **five-swatch palette seed database** for HueSense's C-stage preparation, distinct from:
- psychological word-color evidence (NRC, etc.);
- generated B1/B2 variations (not part of this patch);
- color roles, WCAG results, or user preference judgments.

Current pinned snapshot contains **63 palettes / 315 membership rows / 291 distinct HEX** from two traceable GitHub sources. Colors are **original ordered swatches, NOT roles**. No mood or brand compatibility scores are generated.

### Sources and legal boundaries
| Source | Exact original | Version pinned | 5-color schemes | License context |
|---|---|---|---:|---|
| ColorBrewer by Cynthia Brewer, maintained by Axis Maps | [source JSON](https://github.com/axismaps/colorbrewer/blob/master/export/colorbrewer.json) | `7d135fc4e19eda73f2eb1bf55fcdf4a04fe4881f` | 35 | ColorBrewer schemes: Apache 2.0 attribution as documented in d3-scale-chromatic LICENSE |
| CARTOColors | [source TypeScript](https://github.com/CartoDB/CartoColor/blob/master/src/carto.ts) | `1a850e4713a12c68373f1df1a7d42ff7869ed49c` | 28 | CC BY 4.0, attribution required |

Six CARTO `qualitative` arrays having 6 swatches under the key `5` are **excluded**, not shortened: Antique, Bold, Pastel, Prism, Safe, Vivid. The underlying upstream format uses an extra gray or neutral for those arrays. The exact five-swatch requirement is strict.

These schemes were originally made for **maps / information visualization**, not tested for Taiwanese food brand identity. No source claims of warm/friendly/heritage fit have been inferred. The source code, licensing and test figures are independent assertions.

### Architecture integration / isolation
This repository currently houses a **different, older image-retrieval research pipeline** (SAM2/OpenCLIP, Python Windows runner, Docker Web/Control Center). **Do not replace its `compose.yaml` or production execution architecture**. This addition is a separate `research/palette_seed` module. Database objects are prefixed `hs_` to avoid collisions.

Database flow:
```text
hs_seed_source (source_key)
        -> hs_palette_seed (palette_id, external_key, family, content SHA256)
           -> hs_palette_seed_color (palette_id, position_index, color_id)
              -> hs_seed_color (color_id, hex_code)
```
A subsequent, separately reviewed integration should map by unique normalized HEX to the previously built standalone `COLOR` table and map source identity by canonical URL. **Do not force legacy numeric IDs into this schema.** The current branch does not merge into the existing v0.2 SQLite because it is not in the GitHub repository.

### Reproducible local test
```powershell
py research/palette_seed/scripts/check_palette_seeds.py
py research/palette_seed/scripts/import_palette_seeds.py --validate-only
```
Requires only the Python standard library for offline validation.

### MySQL 8.4 setup (separate HueSense research DB or test schema)
1. Start your **own authorized test MySQL 8.4 service**, not the existing Docker stack until services are reviewed.
2. Apply `research/palette_seed/sql/001_palette_seed.sql` to the intended database.
3. Install `mysql-connector-python` in a dedicated environment, not the certified SAM2/OpenCLIP Python environment.
4. Set `HUESENSE_DB_PASSWORD` only locally; then run:
```powershell
py research/palette_seed/scripts/import_palette_seeds.py --host 127.0.0.1 --port 3307 --database huesense --user huesense
```
5. Query:
```sql
SELECT p.external_key, p.palette_family, sc.position_index, c.hex_code, s.source_url
FROM hs_palette_seed p
JOIN hs_palette_seed_color sc ON sc.palette_id=p.palette_id
JOIN hs_seed_color c ON c.color_id=sc.color_id
JOIN hs_seed_source s ON s.source_key=p.source_key
WHERE p.external_key='carto:Peach:5'
ORDER BY sc.position_index;
```
Run import repeatedly to check idempotency (IDs preserved, membership replaced per palette); confirm count, FK checks, 5 swatches per palette. MySQL container has **not been executed from this chat**, so import is a staged implementation, not a Docker PASS.

### Larger dataset without copying unclear licenses into Git
The dedicated optional importer accepts an **independently obtained local** `nice-color-palettes/1000.json` and emits **PENDING_SOURCE_LICENSE_REVIEW** rows:
```powershell
py research/palette_seed/scripts/import_optional_nice_color_palettes.py C:\path\1000.json
```
No automatic inclusion into vetted core. Package-level MIT does not prove each upstream COLOURlovers palette's standalone reuse rights.

For greater breadth, add more independently licensed true 5-swatch sources after recording upstream revision, file provenance, individual licensing, deduplication and quality tests. Bigger file size is not a valid quality measure.

### Next stages (intentionally excluded)
A. Find existing 5-swatch palette by filters; B1. derive new tones from HEX (Material Color Utilities); B2. sequentially select from candidate single-color pool (Colorgorical-inspired); assign roles and run WCAG checks; prebuild controlled SVG C-stage questions. Each operation should save its derivation and evidence separately from original palette data.

### Known issue
The existing `main` branch is an older image-based research program. These palette seeds belong to the newer fixed-choice brand questionnaire plan and are being proposed on a **separate pull request** for review. No legacy A2/B1 authority, tests, or app behavior is modified by this change.
