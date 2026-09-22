/**
 * tone-core.contract.test.js
 * YOYO ToneCore v1.0.0 — Edge-case + invariant contract tests.
 *
 * 放在 tools/b1/tone-core.js 同一層
 * 執行：
 * node tone-core.contract.test.js
 */

const assert = require('assert');
const ToneCore = require('./tone-core.js');

const ANALYSIS_SIZE = 64;

// ============================================================
// Synthetic RGBA helpers
// ============================================================

function createSyntheticRGBA(width, height, pixelFn) {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const [r, g, b, a] = pixelFn(x, y);

      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }

  return data;
}


/**
 * 精確控制 ToneCore 實際會取樣到的有效 pixel 數。
 *
 * 目前 Contract：
 * margin = 2
 * step = 2
 */
function createExactValidPixels(targetCount) {
  let count = 0;

  return createSyntheticRGBA(
    ANALYSIS_SIZE,
    ANALYSIS_SIZE,
    (x, y) => {
      const isSamplePoint =
        x >= ToneCore.CONTRACT.pixelMargin &&
        x < ANALYSIS_SIZE - ToneCore.CONTRACT.pixelMargin &&
        y >= ToneCore.CONTRACT.pixelMargin &&
        y < ANALYSIS_SIZE - ToneCore.CONTRACT.pixelMargin &&
        (x - ToneCore.CONTRACT.pixelMargin) %
          ToneCore.CONTRACT.pixelStep ===
          0 &&
        (y - ToneCore.CONTRACT.pixelMargin) %
          ToneCore.CONTRACT.pixelStep ===
          0;

      if (isSamplePoint && count < targetCount) {
        count += 1;

        // 有效灰色 pixel
        return [128, 128, 128, 255];
      }

      // 無效透明 pixel
      return [0, 0, 0, 0];
    }
  );
}


// ============================================================
// Deep finite-number invariant
// ============================================================

function assertFiniteDeep(value, path = 'result') {
  if (typeof value === 'number') {
    assert.ok(
      Number.isFinite(value),
      `${path} must be finite; got ${value}`
    );

    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertFiniteDeep(item, `${path}[${index}]`);
    });

    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      /**
       * Achromatic color 沒有實際 Hue。
       * ToneCore Contract 規定此時 H = null。
       */
      if (key === 'H' && child === null) {
        continue;
      }

      assertFiniteDeep(child, `${path}.${key}`);
    }
  }
}


// ============================================================
// ToneCore output invariants
// ============================================================

function assertInvariants(result, testName) {
  assert.ok(
    result && typeof result === 'object',
    `${testName}: result must be object`
  );

  assert.ok(
    Array.isArray(result.palette),
    `${testName}: palette must be array`
  );

  assert.ok(
    result.palette.length > 0 &&
      result.palette.length <= ToneCore.CONTRACT.paletteSize,
    `${testName}: palette length must be 1..${ToneCore.CONTRACT.paletteSize}`
  );

  /**
   * ToneCore v1 的輸出是 FLAT。
   *
   * 正確：
   * result.meanLightness
   *
   * 不是：
   * result.metrics.meanLightness
   */
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(result, 'metrics'),
    false,
    `${testName}: ToneCore v1 output must stay flat (no result.metrics wrapper)`
  );

  // 所有 numeric output 必須 finite
  assertFiniteDeep(result);

  // ==========================================================
  // Palette invariant
  // ==========================================================

  let ratioSum = 0;

  for (const [index, color] of result.palette.entries()) {
    assert.ok(
      color.ratio > 0 && color.ratio <= 1,
      `${testName}: palette[${index}].ratio out of range: ${color.ratio}`
    );

    assert.match(
      color.hex,
      /^#[0-9A-Fa-f]{6}$/,
      `${testName}: palette[${index}].hex invalid: ${color.hex}`
    );

    ratioSum += color.ratio;
  }

  assert.ok(
    Math.abs(ratioSum - 1) < 1e-10,
    `${testName}: palette ratios must sum to 1; got ${ratioSum}`
  );


  // ==========================================================
  // Required feature contract
  // ==========================================================

  const expectedMetricKeys = [
    'meanLightness',
    'meanChroma',
    'temperature',
    'contrast',

    'neutralRatio',
    'darkRatio',
    'highChromaRatio',

    'hueConcentration',
    'accentRatio',
    'hueX',
    'hueY',

    'dominantColorRatio',
    'significantColorCount',
    'paletteEntropy',
    'paletteSpread',

    'visualWeight',
    'paletteReferenceScore',
    'paletteUsabilityPenalty',
    'closeupPenalty',
    'monotonePenalty'
  ];

  for (const key of expectedMetricKeys) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(result, key),
      `${testName}: missing ${key}`
    );

    assert.ok(
      Number.isFinite(result[key]),
      `${testName}: ${key} must be finite`
    );
  }

  console.log(`✅ [PASS] ${testName}`);
}


// ============================================================
// Start
// ============================================================

console.log(
  '=== YOYO ToneCore Edge-Case Contract Tests ===\n'
);

try {

  // ==========================================================
  // ① Pure grayscale
  // ==========================================================

  const grayData = createSyntheticRGBA(
    ANALYSIS_SIZE,
    ANALYSIS_SIZE,
    () => [128, 128, 128, 255]
  );

  const grayRes =
    ToneCore.extractImageToneFeatures(
      grayData,
      ANALYSIS_SIZE,
      ANALYSIS_SIZE
    );

  assertInvariants(
    grayRes,
    '① Pure grayscale'
  );

  assert.ok(
    grayRes.meanChroma < 1e-3,
    `grayscale meanChroma should ~0; got ${grayRes.meanChroma}`
  );

  assert.strictEqual(
    grayRes.hueX,
    0
  );

  assert.strictEqual(
    grayRes.hueY,
    0
  );

  assert.strictEqual(
    grayRes.hueConcentration,
    0
  );


  // ==========================================================
  // ② Pure black
  // ==========================================================

  const blackData = createSyntheticRGBA(
    ANALYSIS_SIZE,
    ANALYSIS_SIZE,
    () => [0, 0, 0, 255]
  );

  const blackRes =
    ToneCore.extractImageToneFeatures(
      blackData,
      ANALYSIS_SIZE,
      ANALYSIS_SIZE
    );

  assertInvariants(
    blackRes,
    '② Pure black'
  );


  // ==========================================================
  // ③ Pure white
  // ==========================================================

  const whiteData = createSyntheticRGBA(
    ANALYSIS_SIZE,
    ANALYSIS_SIZE,
    () => [255, 255, 255, 255]
  );

  const whiteRes =
    ToneCore.extractImageToneFeatures(
      whiteData,
      ANALYSIS_SIZE,
      ANALYSIS_SIZE
    );

  assertInvariants(
    whiteRes,
    '③ Pure white'
  );


  // ==========================================================
  // ④ Pure saturated color
  // ==========================================================

  const redData = createSyntheticRGBA(
    ANALYSIS_SIZE,
    ANALYSIS_SIZE,
    () => [255, 0, 0, 255]
  );

  const redRes =
    ToneCore.extractImageToneFeatures(
      redData,
      ANALYSIS_SIZE,
      ANALYSIS_SIZE
    );

  assertInvariants(
    redRes,
    '④ Pure saturated color'
  );

  assert.ok(
    redRes.meanChroma > 0.1,
    `red meanChroma should be high; got ${redRes.meanChroma}`
  );


  // ==========================================================
  // ⑤ Fully transparent
  // ==========================================================

  const transparentData =
    createSyntheticRGBA(
      ANALYSIS_SIZE,
      ANALYSIS_SIZE,
      () => [0, 0, 0, 0]
    );

  assert.throws(
    () =>
      ToneCore.extractImageToneFeatures(
        transparentData,
        ANALYSIS_SIZE,
        ANALYSIS_SIZE
      ),
    /可分析像素不足/,
    '⑤ Fully transparent must throw insufficient-pixels error'
  );

  console.log(
    '✅ [PASS] ⑤ Fully transparent'
  );


  // ==========================================================
  // ⑥ < 24 valid pixels
  // ==========================================================

  const data23 =
    createExactValidPixels(23);

  assert.strictEqual(
    ToneCore.samplePixels(
      data23,
      ANALYSIS_SIZE,
      ANALYSIS_SIZE
    ).length,
    23
  );

  assert.throws(
    () =>
      ToneCore.extractImageToneFeatures(
        data23,
        ANALYSIS_SIZE,
        ANALYSIS_SIZE
      ),
    /可分析像素不足/,
    '⑥ 23 valid pixels must throw'
  );

  console.log(
    '✅ [PASS] ⑥ < 24 valid pixels'
  );


  // ==========================================================
  // ⑦ Exactly 24 valid pixels
  // ==========================================================

  const data24 =
    createExactValidPixels(24);

  assert.strictEqual(
    ToneCore.samplePixels(
      data24,
      ANALYSIS_SIZE,
      ANALYSIS_SIZE
    ).length,
    24,
    'samplePixels must count exactly 24 valid samples'
  );

  const res24 =
    ToneCore.extractImageToneFeatures(
      data24,
      ANALYSIS_SIZE,
      ANALYSIS_SIZE
    );

  assertInvariants(
    res24,
    '⑦ Exactly 24 valid pixels'
  );


  // ==========================================================
  // ⑧ Mixed transparent + opaque
  // ==========================================================

  const mixedData =
    createSyntheticRGBA(
      ANALYSIS_SIZE,
      ANALYSIS_SIZE,
      (x) =>
        x < 32
          ? [255, 0, 0, 0]
          : [0, 0, 255, 255]
    );

  const mixedRes =
    ToneCore.extractImageToneFeatures(
      mixedData,
      ANALYSIS_SIZE,
      ANALYSIS_SIZE
    );

  assertInvariants(
    mixedRes,
    '⑧ Mixed transparent + opaque'
  );

  /**
   * 左邊雖然是紅色，
   * 但 alpha = 0，
   * 不應進入 palette。
   */
  for (const color of mixedRes.palette) {
    assert.notStrictEqual(
      color.hex.toUpperCase(),
      '#FF0000',
      'transparent red must not enter palette'
    );
  }


  // ==========================================================
  // ⑨ Alpha threshold boundary
  // ==========================================================

  /**
   * Contract：
   * alphaThreshold = 0.85
   *
   * 一邊略低於門檻，
   * 一邊剛好達到門檻。
   */

  const thresholdByte =
    Math.ceil(
      ToneCore.CONTRACT.alphaThreshold * 255
    );

  const belowByte =
    thresholdByte - 1;

  const alphaBoundary =
    createSyntheticRGBA(
      ANALYSIS_SIZE,
      ANALYSIS_SIZE,
      (x) =>
        x < 32
          ? [255, 0, 0, belowByte]
          : [0, 255, 0, thresholdByte]
    );

  const alphaRes =
    ToneCore.extractImageToneFeatures(
      alphaBoundary,
      ANALYSIS_SIZE,
      ANALYSIS_SIZE
    );

  assertInvariants(
    alphaRes,
    '⑨ Alpha threshold boundary'
  );


  // ==========================================================
  // ALL PASS
  // ==========================================================

  console.log(
    '\n🎉 ALL EDGE-CASE CONTRACT TESTS PASSED!'
  );

} catch (error) {

  console.error(
    '\n🚨 TEST FAILED:',
    error.stack || error.message
  );

  process.exit(1);
}