# YOYO ToneCore Step 1B + 1C Shadow Test

## Current migration state
- OLD `tone-analyzer.js` color math remains the production return path.
- NEW `tone-core.js` runs only as a shadow comparison path.
- No CLIP, B2, B3, branch routing, scoring, or fallback logic is changed.

## Enable Shadow Run
Open the normal local site with:

`?tone_shadow=1`

Example:

`http://localhost/.../public/?tone_shadow=1`

Alternatively in DevTools Console:

```js
localStorage.setItem('yoyo_tone_shadow', '1');
location.reload();
```

Disable:

```js
localStorage.removeItem('yoyo_tone_shadow');
location.reload();
```

or use `?tone_shadow=0`.

## Expected Console statuses
- `PASS_STRICT` — same-runtime structural zero drift.
- `PASS_NUMERICAL` — equivalent within Level 2 tolerance after optimal palette matching.
- `WARN_THRESHOLD_BOUNDARY` — palette length differs by one near the 0.01 filter boundary; do not cut over automatically.
- `FAIL_NUMERICAL_DRIFT` — numerical drift beyond tolerance.
- `FAIL_STRUCTURAL_DRIFT` — structural output changed.

## View aggregate report

```js
ToneAnalyzer.getToneCoreShadowReport()
```

Ideal migration result for the fixed 24-image benchmark:

- passStrict: 24
- passNumerical: 0
- warnThresholdBoundary: 0
- failNumerical: 0
- failStructural: 0
- executionError: 0

Reset counters:

```js
ToneAnalyzer.resetToneCoreShadowReport()
```

## Acceptance policy
- Structural epsilon: `1e-12`
- Numerical metric epsilon: `1e-8`
- OKLab delta-E epsilon: `1e-8`
- Palette ratio epsilon: `1e-8`
- Palette filter threshold: `0.01`
- Palette length mismatch never auto-passes.

## Sunset policy
This shadow/diff scaffold is temporary migration code. Remove it after:
1. Step 1C fixed-set regression passes.
2. B1 runner passes.
3. ToneCore is switched to the production return path.
