'use strict';

window.ToneAnalyzer = (() => {
  const DIRECTION_COUNT = 3;
  const IMAGE_PALETTE_SIZE = 5;
  const DIRECTION_PALETTE_SIZE = 5;
  const DIRECTION_PALETTE_CANDIDATE_SIZE = 12;
  const CROSS_DIRECTION_COLOR_DISTANCE = 0.055;
  const ANALYSIS_SIZE = 64;
  const PIXEL_STEP = 2;
  const IMAGE_KMEANS_ITERATIONS = 10;
  const DIRECTION_KMEANS_ITERATIONS = 30;
  const COLOR_MERGE_DISTANCE = 0.045;
  const featureCache = new Map();

  /**
   * TEMPORARY MIGRATION CODE — ToneCore Step 1B / 1C Shadow Run
   *
   * Purpose:
   * - Keep OLD ToneAnalyzer output as production truth.
   * - Run NEW ToneCore on the same RGBA snapshot in the background.
   * - Automatically classify structural / numerical drift.
   *
   * Sunset policy:
   * Remove this shadow/diff scaffold after:
   * 1) fixed 24-image regression passes,
   * 2) B1 runner passes,
   * 3) ToneCore becomes the production path.
   */
  const DIFF_POLICY = Object.freeze({
    structuralEpsilon: 1e-12,
    metricEpsilon: 1e-8,
    colorDeltaEEpsilon: 1e-8,
    ratioEpsilon: 1e-8,
    paletteRatioThreshold: 0.01,
    boundaryEpsilon: 1e-8,
    paletteLengthMismatchAutoPass: false,
  });

  const SHADOW_METRIC_FIELDS = Object.freeze([
    'meanLightness',
    'meanChroma',
    'temperature',
    'contrast',
    'visualWeight',
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
    'paletteReferenceScore',
    'paletteUsabilityPenalty',
    'closeupPenalty',
    'monotonePenalty',
  ]);

  const TONE_CORE_SHADOW_ENABLED = resolveToneCoreShadowEnabled();
  const toneCoreShadowQueue = [];
  let toneCoreShadowScheduled = false;
  let toneCoreMissingWarningShown = false;
  const toneCoreShadowReport = createToneCoreShadowReport();

  const FEATURE_DIMENSIONS = [
    { key: 'meanLightness', weight: 1.0, minScale: 0.08 },
    { key: 'meanChroma', weight: 1.35, minScale: 0.025 },
    { key: 'temperature', weight: 1.15, minScale: 0.16 },
    { key: 'contrast', weight: 1.05, minScale: 0.08 },
    { key: 'visualWeight', weight: 0.9, minScale: 0.08 },
    { key: 'neutralRatio', weight: 0.8, minScale: 0.08 },
    { key: 'darkRatio', weight: 0.95, minScale: 0.08 },
    { key: 'highChromaRatio', weight: 0.95, minScale: 0.06 },
    { key: 'hueConcentration', weight: 0.72, minScale: 0.08 },
    { key: 'accentRatio', weight: 0.82, minScale: 0.05 },
    { key: 'hueX', weight: 1.25, minScale: 0.15 },
    { key: 'hueY', weight: 1.25, minScale: 0.15 },
  ];

  /**
   * 對所有圖片做像素分析，再用完整色彩感知特徵分成 A／B／C。
   *
   * @param {Array<object>} photos
   * @param {{onProgress?: Function, concurrency?: number}} options
   * @returns {Promise<{directions: Array<object>, meta: object}>}
   */
  async function analyze(photos, options = {}) {
    const usablePhotos = Array.isArray(photos) ? photos.filter(Boolean) : [];

    if (!usablePhotos.length) {
      return emptyAnalysis(0);
    }

    let completed = 0;
    const concurrency = clamp(Number(options.concurrency) || 5, 1, 8);

    const features = await mapLimit(
      usablePhotos,
      concurrency,
      async (photo, index) => {
        const feature = await getPhotoFeature(photo, index);
        completed += 1;

        if (typeof options.onProgress === 'function') {
          options.onProgress(completed, usablePhotos.length, feature);
        }

        return feature;
      },
    );

    const validFeatures = features.filter(Boolean);
    if (!validFeatures.length) {
      return emptyAnalysis(usablePhotos.length);
    }

    /*
     * A/B/C 現在由後端 BranchBuilder / SearchPlanner 先定義，
     * 這裡不再另外跑 K-means 自己發明三個方向。
     * ToneAnalyzer 的責任只剩：
     * 1. 讀取像素色彩特徵
     * 2. 結合內容相關度 / 主題元素 / 色彩適配打分
     * 3. 回傳每張圖是否達到品質底線
     */
    const scoring = scoreFeatures(validFeatures, usablePhotos, options);
    const qualifiedFeatures = scoring.qualifiedFeatures;
    const pixelAnalyzedCount = validFeatures.filter(
      (feature) => feature.source === 'pixels',
    ).length;
    const fallbackCount = validFeatures.length - pixelAnalyzedCount;

    return {
      directions: [],
      scoredPhotos: scoring.scoredPhotos,
      meta: {
        requestedCount: usablePhotos.length,
        analyzedCount: validFeatures.length,
        qualifiedCount: qualifiedFeatures.length,
        excludedCount: Math.max(0, validFeatures.length - qualifiedFeatures.length),
        pixelAnalyzedCount,
        fallbackCount,
        minSeparation: 0,
        lowSeparation: false,
      },
    };
  }

  function emptyAnalysis(requestedCount, features = [], scoredPhotos = []) {
    const pixelAnalyzedCount = features.filter(
      (feature) => feature?.source === 'pixels',
    ).length;

    return {
      directions: [],
      scoredPhotos,
      meta: {
        requestedCount,
        analyzedCount: features.length,
        qualifiedCount: 0,
        excludedCount: features.length,
        pixelAnalyzedCount,
        fallbackCount: Math.max(0, features.length - pixelAnalyzedCount),
        minSeparation: 0,
        lowSeparation: true,
      },
    };
  }

  function clearCache() {
    featureCache.clear();
  }

  async function getPhotoFeature(photo, index) {
    const photoId = String(photo?.id || `photo-${index}`);
    const analysisUrl = String(
      photo?.analysis_url || photo?.image_small || '',
    );
    const cacheKey = `${photoId}|${analysisUrl}`;

    if (featureCache.has(cacheKey)) {
      return featureCache.get(cacheKey);
    }

    let feature;

    try {
      feature = await analyzePhotoPixels(photo, index);
    } catch (error) {
      feature = createFallbackFeature(photo, index, error);
    }

    featureCache.set(cacheKey, feature);
    return feature;
  }

  async function analyzePhotoPixels(photo, index) {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      throw new Error('目前環境無法使用 Canvas 像素分析。');
    }

    const analysisUrl = String(
      photo?.analysis_url || photo?.image_small || '',
    );

    if (!analysisUrl) {
      throw new Error('圖片缺少分析網址。');
    }

    const image = await loadImage(analysisUrl);
    const canvas = document.createElement('canvas');
    canvas.width = ANALYSIS_SIZE;
    canvas.height = ANALYSIS_SIZE;

    const context = canvas.getContext('2d', {
      alpha: false,
      willReadFrequently: true,
    });

    if (!context) {
      throw new Error('無法建立 Canvas 2D context。');
    }

    context.drawImage(image, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);

    let imageData;
    try {
      imageData = context.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
    } catch (error) {
      throw new Error('圖片來源限制了像素讀取，已改用 API 代表色備援。');
    }

    const pixels = samplePixels(imageData.data, ANALYSIS_SIZE, ANALYSIS_SIZE);

    if (pixels.length < 24) {
      throw new Error('可分析像素不足。');
    }

    const palette = extractPalette(pixels, IMAGE_PALETTE_SIZE);
    const metrics = calculateImageMetrics(pixels, palette);

    /*
     * Step 1B / 1C Shadow Run:
     * Snapshot the RGBA buffer before leaving this function. The production
     * result below still uses the OLD implementation. ToneCore runs later in
     * a bounded idle queue and cannot affect the returned feature.
     */
    if (TONE_CORE_SHADOW_ENABLED) {
      enqueueToneCoreShadow({
        photoId: String(photo?.id || `photo-${index}`),
        rgba: new Uint8ClampedArray(imageData.data),
        width: ANALYSIS_SIZE,
        height: ANALYSIS_SIZE,
        oldPalette: cloneShadowPalette(palette),
        oldMetrics: pickShadowMetrics(metrics),
      });
    }

    return {
      photoId: String(photo?.id || `photo-${index}`),
      source: 'pixels',
      perceptualHash: calculateDHash(imageData, ANALYSIS_SIZE, ANALYSIS_SIZE),
      palette,
      ...metrics,
    };
  }

  function resolveToneCoreShadowEnabled() {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      const params = new URLSearchParams(window.location?.search || '');
      const queryValue = params.get('tone_shadow');

      if (queryValue === '1') {
        return true;
      }
      if (queryValue === '0') {
        return false;
      }

      return window.localStorage?.getItem('yoyo_tone_shadow') === '1';
    } catch (_error) {
      return false;
    }
  }

  function createToneCoreShadowReport() {
    return {
      enabled: TONE_CORE_SHADOW_ENABLED,
      queued: 0,
      processed: 0,
      passStrict: 0,
      passNumerical: 0,
      warnThresholdBoundary: 0,
      failNumerical: 0,
      failStructural: 0,
      executionError: 0,
      lastResult: null,
    };
  }

  function resetToneCoreShadowReport() {
    Object.assign(toneCoreShadowReport, {
      enabled: TONE_CORE_SHADOW_ENABLED,
      queued: 0,
      processed: 0,
      passStrict: 0,
      passNumerical: 0,
      warnThresholdBoundary: 0,
      failNumerical: 0,
      failStructural: 0,
      executionError: 0,
      lastResult: null,
    });
  }

  function getToneCoreShadowReport() {
    return {
      ...toneCoreShadowReport,
      pending: toneCoreShadowQueue.length,
      policy: { ...DIFF_POLICY },
    };
  }

  function cloneShadowPalette(palette) {
    return (Array.isArray(palette) ? palette : []).map((color) => ({
      hex: color.hex,
      ratio: color.ratio,
      analysisWeight: color.analysisWeight,
      lab: color.lab ? { ...color.lab } : null,
      lch: color.lch ? { ...color.lch } : null,
    }));
  }

  function pickShadowMetrics(metrics) {
    const picked = {};
    SHADOW_METRIC_FIELDS.forEach((field) => {
      picked[field] = metrics?.[field];
    });
    return picked;
  }

  function enqueueToneCoreShadow(job) {
    if (!TONE_CORE_SHADOW_ENABLED) {
      return;
    }

    if (!window.ToneCore?.extractImageToneFeatures) {
      toneCoreShadowReport.executionError += 1;
      if (!toneCoreMissingWarningShown) {
        toneCoreMissingWarningShown = true;
        console.warn(
          '⚠️ [ToneCore Shadow] ToneCore 尚未載入；正式流程仍使用 OLD ToneAnalyzer。',
        );
      }
      return;
    }

    toneCoreShadowQueue.push(job);
    toneCoreShadowReport.queued += 1;
    scheduleToneCoreShadowQueue();
  }

  function scheduleToneCoreShadowQueue() {
    if (toneCoreShadowScheduled || !toneCoreShadowQueue.length) {
      return;
    }

    toneCoreShadowScheduled = true;
    const run = () => {
      toneCoreShadowScheduled = false;
      processNextToneCoreShadowJob();
      if (toneCoreShadowQueue.length) {
        scheduleToneCoreShadowQueue();
      }
    };

    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(run, { timeout: 500 });
    } else {
      window.setTimeout(run, 0);
    }
  }

  function processNextToneCoreShadowJob() {
    const job = toneCoreShadowQueue.shift();
    if (!job) {
      return;
    }

    let result;

    try {
      const newCoreResult = window.ToneCore.extractImageToneFeatures(
        job.rgba,
        job.width,
        job.height,
      );

      result = classifyToneCoreShadowDiff(
        job.oldPalette,
        newCoreResult.palette,
        job.oldMetrics,
        newCoreResult,
        job.photoId,
      );
    } catch (error) {
      result = {
        photoId: job.photoId,
        status: 'ERROR_NEW_CORE',
        message: String(error?.message || error),
        maxMetricDelta: null,
        maxPaletteDeltaE: null,
        maxRatioDelta: null,
      };
    }

    recordToneCoreShadowResult(result);

    // Important: no RGBA/ImageData/Canvas is retained in the report.
    job.rgba = null;
    job.oldPalette = null;
    job.oldMetrics = null;
  }

  function recordToneCoreShadowResult(result) {
    toneCoreShadowReport.processed += 1;
    toneCoreShadowReport.lastResult = { ...result };

    switch (result.status) {
      case 'PASS_STRICT':
        toneCoreShadowReport.passStrict += 1;
        console.log(`✅ [ToneCore Diff] ${result.photoId}: PASS_STRICT`);
        break;
      case 'PASS_NUMERICAL':
        toneCoreShadowReport.passNumerical += 1;
        console.warn(`🟡 [ToneCore Diff] ${result.photoId}: PASS_NUMERICAL`, result);
        break;
      case 'WARN_THRESHOLD_BOUNDARY':
        toneCoreShadowReport.warnThresholdBoundary += 1;
        console.warn(`🟠 [ToneCore Diff] ${result.photoId}: WARN_THRESHOLD_BOUNDARY`, result);
        break;
      case 'FAIL_NUMERICAL_DRIFT':
        toneCoreShadowReport.failNumerical += 1;
        console.error(`🔴 [ToneCore Diff] ${result.photoId}: FAIL_NUMERICAL_DRIFT`, result);
        break;
      case 'FAIL_STRUCTURAL_DRIFT':
        toneCoreShadowReport.failStructural += 1;
        console.error(`🔴 [ToneCore Diff] ${result.photoId}: FAIL_STRUCTURAL_DRIFT`, result);
        break;
      default:
        toneCoreShadowReport.executionError += 1;
        console.error(`🔴 [ToneCore Diff] ${result.photoId}: ${result.status}`, result);
        break;
    }
  }

  function classifyToneCoreShadowDiff(
    oldPalette,
    newPalette,
    oldMetrics,
    newMetrics,
    photoId,
  ) {
    const strict = runStrictToneCoreDiff(
      oldPalette,
      newPalette,
      oldMetrics,
      newMetrics,
    );

    if (strict.pass) {
      return {
        photoId,
        status: 'PASS_STRICT',
        maxMetricDelta: strict.maxMetricDelta,
        maxPaletteDeltaE: strict.maxPaletteDeltaE,
        maxRatioDelta: strict.maxRatioDelta,
      };
    }

    const normalized = runNormalizedToneCoreDiff(
      oldPalette,
      newPalette,
      oldMetrics,
      newMetrics,
    );

    return {
      photoId,
      ...normalized,
      strictFailure: strict.reason,
    };
  }

  function runStrictToneCoreDiff(oldPalette, newPalette, oldMetrics, newMetrics) {
    if (!Array.isArray(oldPalette) || !Array.isArray(newPalette)) {
      return {
        pass: false,
        reason: 'palette_not_array',
        maxMetricDelta: null,
        maxPaletteDeltaE: null,
        maxRatioDelta: null,
      };
    }

    if (oldPalette.length !== newPalette.length) {
      return {
        pass: false,
        reason: 'palette_length_mismatch',
        maxMetricDelta: maxMetricDelta(oldMetrics, newMetrics),
        maxPaletteDeltaE: null,
        maxRatioDelta: null,
      };
    }

    let maxPaletteDeltaE = 0;
    let maxRatioDelta = 0;

    for (let index = 0; index < oldPalette.length; index += 1) {
      const oldColor = oldPalette[index];
      const newColor = newPalette[index];

      if (oldColor?.hex !== newColor?.hex) {
        return {
          pass: false,
          reason: `palette_hex_mismatch_at_${index}`,
          maxMetricDelta: maxMetricDelta(oldMetrics, newMetrics),
          maxPaletteDeltaE: safeDeltaEOk(oldColor?.lab, newColor?.lab),
          maxRatioDelta: safeAbsoluteDelta(oldColor?.ratio, newColor?.ratio),
        };
      }

      const colorDelta = safeDeltaEOk(oldColor?.lab, newColor?.lab);
      const ratioDelta = safeAbsoluteDelta(oldColor?.ratio, newColor?.ratio);
      const analysisWeightDelta = safeAbsoluteDelta(
        oldColor?.analysisWeight,
        newColor?.analysisWeight,
      );

      if (
        colorDelta == null ||
        ratioDelta == null ||
        analysisWeightDelta == null ||
        colorDelta > DIFF_POLICY.structuralEpsilon ||
        ratioDelta > DIFF_POLICY.structuralEpsilon ||
        analysisWeightDelta > DIFF_POLICY.structuralEpsilon
      ) {
        return {
          pass: false,
          reason: `palette_numeric_mismatch_at_${index}`,
          maxMetricDelta: maxMetricDelta(oldMetrics, newMetrics),
          maxPaletteDeltaE: colorDelta,
          maxRatioDelta: ratioDelta,
        };
      }

      maxPaletteDeltaE = Math.max(maxPaletteDeltaE, colorDelta);
      maxRatioDelta = Math.max(maxRatioDelta, ratioDelta);
    }

    const metricComparison = compareMetrics(
      oldMetrics,
      newMetrics,
      DIFF_POLICY.structuralEpsilon,
    );

    return {
      pass: metricComparison.pass,
      reason: metricComparison.pass ? null : metricComparison.reason,
      maxMetricDelta: metricComparison.maxDelta,
      maxPaletteDeltaE,
      maxRatioDelta,
    };
  }

  function runNormalizedToneCoreDiff(oldPalette, newPalette, oldMetrics, newMetrics) {
    const oldLength = Array.isArray(oldPalette) ? oldPalette.length : -1;
    const newLength = Array.isArray(newPalette) ? newPalette.length : -1;
    const metricComparison = compareMetrics(
      oldMetrics,
      newMetrics,
      DIFF_POLICY.metricEpsilon,
    );

    if (oldLength < 0 || newLength < 0) {
      return {
        status: 'FAIL_STRUCTURAL_DRIFT',
        reason: 'palette_not_array',
        maxMetricDelta: metricComparison.maxDelta,
        maxPaletteDeltaE: null,
        maxRatioDelta: null,
      };
    }

    if (oldLength !== newLength) {
      const boundary = diagnosePaletteLengthBoundary(oldPalette, newPalette);
      if (boundary.isBoundaryCase) {
        return {
          status: 'WARN_THRESHOLD_BOUNDARY',
          reason: 'palette_length_boundary_case',
          oldLength,
          newLength,
          boundaryRatio: boundary.boundaryRatio,
          maxMetricDelta: metricComparison.maxDelta,
          maxPaletteDeltaE: boundary.maxPaletteDeltaE,
          maxRatioDelta: boundary.maxRatioDelta,
          metricsWithinTolerance: metricComparison.pass,
        };
      }

      return {
        status: 'FAIL_STRUCTURAL_DRIFT',
        reason: 'palette_length_mismatch',
        oldLength,
        newLength,
        maxMetricDelta: metricComparison.maxDelta,
        maxPaletteDeltaE: boundary.maxPaletteDeltaE,
        maxRatioDelta: boundary.maxRatioDelta,
      };
    }

    const paletteMatch = findOptimalPaletteMatching(oldPalette, newPalette);
    const palettePass =
      paletteMatch.maxDeltaE <= DIFF_POLICY.colorDeltaEEpsilon &&
      paletteMatch.maxRatioDelta <= DIFF_POLICY.ratioEpsilon;

    if (palettePass && metricComparison.pass) {
      return {
        status: 'PASS_NUMERICAL',
        reason: 'normalized_equivalent',
        maxMetricDelta: metricComparison.maxDelta,
        maxPaletteDeltaE: paletteMatch.maxDeltaE,
        maxRatioDelta: paletteMatch.maxRatioDelta,
        permutation: paletteMatch.permutation,
      };
    }

    return {
      status: 'FAIL_NUMERICAL_DRIFT',
      reason: !palettePass ? 'palette_numeric_drift' : metricComparison.reason,
      maxMetricDelta: metricComparison.maxDelta,
      maxPaletteDeltaE: paletteMatch.maxDeltaE,
      maxRatioDelta: paletteMatch.maxRatioDelta,
      permutation: paletteMatch.permutation,
    };
  }

  function diagnosePaletteLengthBoundary(oldPalette, newPalette) {
    const lengthDifference = Math.abs(oldPalette.length - newPalette.length);
    if (lengthDifference !== 1) {
      return {
        isBoundaryCase: false,
        boundaryRatio: null,
        maxPaletteDeltaE: null,
        maxRatioDelta: null,
      };
    }

    const longer = oldPalette.length > newPalette.length ? oldPalette : newPalette;
    const shorter = oldPalette.length > newPalette.length ? newPalette : oldPalette;
    const match = findBestSubsetPaletteMatching(longer, shorter);
    const unmatched = longer[match.unmatchedIndex];
    const boundaryRatio = Number(unmatched?.ratio);
    const closeToBoundary =
      Number.isFinite(boundaryRatio) &&
      Math.abs(boundaryRatio - DIFF_POLICY.paletteRatioThreshold) <=
        DIFF_POLICY.boundaryEpsilon;

    return {
      isBoundaryCase: closeToBoundary,
      boundaryRatio,
      maxPaletteDeltaE: match.maxDeltaE,
      maxRatioDelta: match.maxRatioDelta,
    };
  }

  function findBestSubsetPaletteMatching(longer, shorter) {
    let best = {
      totalCost: Number.POSITIVE_INFINITY,
      maxDeltaE: Number.POSITIVE_INFINITY,
      maxRatioDelta: Number.POSITIVE_INFINITY,
      unmatchedIndex: -1,
    };

    for (let omittedIndex = 0; omittedIndex < longer.length; omittedIndex += 1) {
      const subset = longer.filter((_, index) => index !== omittedIndex);
      const match = longer.length > shorter.length
        ? findOptimalPaletteMatching(subset, shorter)
        : findOptimalPaletteMatching(shorter, subset);

      if (match.totalCost < best.totalCost) {
        best = {
          ...match,
          unmatchedIndex: omittedIndex,
        };
      }
    }

    return best;
  }

  function findOptimalPaletteMatching(oldPalette, newPalette) {
    if (oldPalette.length !== newPalette.length) {
      return {
        totalCost: Number.POSITIVE_INFINITY,
        maxDeltaE: Number.POSITIVE_INFINITY,
        maxRatioDelta: Number.POSITIVE_INFINITY,
        permutation: [],
      };
    }

    if (!oldPalette.length) {
      return {
        totalCost: 0,
        maxDeltaE: 0,
        maxRatioDelta: 0,
        permutation: [],
      };
    }

    let best = {
      totalCost: Number.POSITIVE_INFINITY,
      maxDeltaE: Number.POSITIVE_INFINITY,
      maxRatioDelta: Number.POSITIVE_INFINITY,
      permutation: [],
    };

    permutationsOfIndices(newPalette.length).forEach((permutation) => {
      let totalCost = 0;
      let maxDeltaE = 0;
      let maxRatioDelta = 0;
      let valid = true;

      for (let oldIndex = 0; oldIndex < oldPalette.length; oldIndex += 1) {
        const newIndex = permutation[oldIndex];
        const deltaE = safeDeltaEOk(
          oldPalette[oldIndex]?.lab,
          newPalette[newIndex]?.lab,
        );
        const ratioDelta = safeAbsoluteDelta(
          oldPalette[oldIndex]?.ratio,
          newPalette[newIndex]?.ratio,
        );

        if (deltaE == null || ratioDelta == null) {
          valid = false;
          break;
        }

        totalCost += deltaE;
        maxDeltaE = Math.max(maxDeltaE, deltaE);
        maxRatioDelta = Math.max(maxRatioDelta, ratioDelta);
      }

      if (valid && totalCost < best.totalCost) {
        best = {
          totalCost,
          maxDeltaE,
          maxRatioDelta,
          permutation: [...permutation],
        };
      }
    });

    return best;
  }

  function permutationsOfIndices(length) {
    const source = Array.from({ length }, (_, index) => index);
    const output = [];

    function permute(prefix, remaining) {
      if (!remaining.length) {
        output.push(prefix);
        return;
      }

      remaining.forEach((value, index) => {
        permute(
          [...prefix, value],
          [...remaining.slice(0, index), ...remaining.slice(index + 1)],
        );
      });
    }

    permute([], source);
    return output;
  }

  function compareMetrics(oldMetrics, newMetrics, epsilon) {
    let maxDelta = 0;

    for (const field of SHADOW_METRIC_FIELDS) {
      const oldValue = oldMetrics?.[field];
      const newValue = newMetrics?.[field];

      if (!numericEquivalent(oldValue, newValue, epsilon)) {
        return {
          pass: false,
          reason: `metric_mismatch:${field}`,
          maxDelta: safeAbsoluteDelta(oldValue, newValue),
        };
      }

      const delta = safeAbsoluteDelta(oldValue, newValue);
      if (delta != null) {
        maxDelta = Math.max(maxDelta, delta);
      }
    }

    return { pass: true, reason: null, maxDelta };
  }

  function maxMetricDelta(oldMetrics, newMetrics) {
    let maxDelta = 0;

    SHADOW_METRIC_FIELDS.forEach((field) => {
      const delta = safeAbsoluteDelta(oldMetrics?.[field], newMetrics?.[field]);
      if (delta != null) {
        maxDelta = Math.max(maxDelta, delta);
      }
    });

    return maxDelta;
  }

  function numericEquivalent(oldValue, newValue, epsilon) {
    if (Object.is(oldValue, newValue)) {
      return true;
    }

    if (Number.isFinite(oldValue) && Number.isFinite(newValue)) {
      return Math.abs(oldValue - newValue) <= epsilon;
    }

    return false;
  }

  function safeAbsoluteDelta(first, second) {
    if (Object.is(first, second)) {
      return 0;
    }
    if (Number.isFinite(first) && Number.isFinite(second)) {
      return Math.abs(first - second);
    }
    return null;
  }

  function safeDeltaEOk(firstLab, secondLab) {
    if (!firstLab || !secondLab) {
      return null;
    }

    const delta = window.ToneCore?.deltaEOk
      ? window.ToneCore.deltaEOk(firstLab, secondLab)
      : deltaEOk(firstLab, secondLab);

    return Number.isFinite(delta) ? delta : null;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timeoutId = window.setTimeout(() => {
        image.src = '';
        reject(new Error('載入分析縮圖逾時。'));
      }, 10000);

      image.crossOrigin = 'anonymous';
      image.decoding = 'async';

      image.onload = () => {
        window.clearTimeout(timeoutId);
        resolve(image);
      };

      image.onerror = () => {
        window.clearTimeout(timeoutId);
        reject(new Error('無法載入分析縮圖。'));
      };

      image.src = url;
    });
  }

  /**
   * 64-bit dHash：不需要額外 API / key，用來辨識「幾乎同一張」的圖片。
   * 它不是語意模型，不會拿來判斷圖片是不是 Y2K；只負責近似去重。
   */
  function calculateDHash(imageData, width, height) {
    const data = imageData?.data;
    if (!data || width < 2 || height < 2) {
      return '';
    }

    let bits = '';

    for (let row = 0; row < 8; row += 1) {
      const y = Math.round((row / 7) * (height - 1));

      for (let column = 0; column < 8; column += 1) {
        const x1 = Math.round((column / 8) * (width - 1));
        const x2 = Math.round(((column + 1) / 8) * (width - 1));

        const offset1 = (y * width + x1) * 4;
        const offset2 = (y * width + x2) * 4;

        const gray1 =
          data[offset1] * 0.299 +
          data[offset1 + 1] * 0.587 +
          data[offset1 + 2] * 0.114;
        const gray2 =
          data[offset2] * 0.299 +
          data[offset2 + 1] * 0.587 +
          data[offset2 + 2] * 0.114;

        bits += gray1 > gray2 ? '1' : '0';
      }
    }

    let hex = '';
    for (let index = 0; index < bits.length; index += 4) {
      hex += Number.parseInt(bits.slice(index, index + 4), 2).toString(16);
    }

    return hex.padStart(16, '0');
  }

  function samplePixels(data, width, height) {
    const pixels = [];
    const margin = 2;

    for (let y = margin; y < height - margin; y += PIXEL_STEP) {
      for (let x = margin; x < width - margin; x += PIXEL_STEP) {
        const offset = (y * width + x) * 4;
        const alpha = data[offset + 3] / 255;

        if (alpha < 0.85) {
          continue;
        }

        const rgb = {
          r: data[offset],
          g: data[offset + 1],
          b: data[offset + 2],
        };
        const lab = rgbToOklab(rgb);
        const lch = oklabToOklch(lab);
        const weight = pixelAnalysisWeight(lch);

        pixels.push({
          rgb,
          lab,
          lch,
          weight,
        });
      }
    }

    return pixels;
  }

  /**
   * 高光、純黑陰影保留作比例統計，但降低它們主導代表色的權重。
   */
  function pixelAnalysisWeight({ L, C }) {
    let weight = 1;

    if (L < 0.045 || L > 0.985) {
      weight *= 0.12;
    } else if (L < 0.1) {
      weight *= 0.38;
    } else if (L > 0.95) {
      weight *= 0.42;
    }

    if (C > 0.12) {
      weight *= 1.3;
    } else if (C < 0.015) {
      weight *= 0.82;
    }

    return weight;
  }

  function extractPalette(pixels, requestedK) {
    const uniqueBuckets = new Set(
      pixels.map(({ rgb }) =>
        `${rgb.r >> 3}-${rgb.g >> 3}-${rgb.b >> 3}`,
      ),
    ).size;
    const k = Math.max(1, Math.min(requestedK, uniqueBuckets));
    const centroids = initializeLabCentroids(pixels, k);
    let assignments = new Array(pixels.length).fill(0);

    for (let iteration = 0; iteration < IMAGE_KMEANS_ITERATIONS; iteration += 1) {
      let changed = false;

      pixels.forEach((pixel, pixelIndex) => {
        const nextCluster = nearestLabIndex(pixel.lab, centroids);

        if (assignments[pixelIndex] !== nextCluster) {
          assignments[pixelIndex] = nextCluster;
          changed = true;
        }
      });

      const nextCentroids = centroids.map((centroid, centroidIndex) => {
        const members = pixels.filter(
          (_, pixelIndex) => assignments[pixelIndex] === centroidIndex,
        );

        return members.length
          ? weightedLabMean(members)
          : farthestLabPixel(pixels, centroids).lab;
      });

      centroids.splice(0, centroids.length, ...nextCentroids);

      if (!changed) {
        break;
      }
    }

    const rawClusters = centroids.map((centroid, centroidIndex) => {
      const members = pixels.filter(
        (_, pixelIndex) => assignments[pixelIndex] === centroidIndex,
      );
      const rawRatio = members.length / pixels.length;
      const analysisWeight = members.reduce(
        (sum, pixel) => sum + pixel.weight,
        0,
      );

      return {
        lab: centroid,
        lch: oklabToOklch(centroid),
        hex: oklabToHex(centroid),
        ratio: rawRatio,
        analysisWeight,
      };
    });

    const merged = mergeSimilarColors(
      rawClusters.filter((color) => color.ratio >= 0.01),
      COLOR_MERGE_DISTANCE,
    );
    const totalRatio = merged.reduce((sum, color) => sum + color.ratio, 0) || 1;

    return merged
      .map((color) => ({
        ...color,
        ratio: color.ratio / totalRatio,
      }))
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 6);
  }

  function initializeLabCentroids(pixels, k) {
    const globalMean = weightedLabMean(pixels);
    const centroids = [farthestLabPixel(pixels, [globalMean]).lab];

    while (centroids.length < k) {
      centroids.push(farthestLabPixel(pixels, centroids).lab);
    }

    return centroids.map((centroid) => ({ ...centroid }));
  }

  function nearestLabIndex(lab, centroids) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    centroids.forEach((centroid, index) => {
      const currentDistance = deltaEOk(lab, centroid, 1.18);

      if (currentDistance < bestDistance) {
        bestDistance = currentDistance;
        bestIndex = index;
      }
    });

    return bestIndex;
  }

  function farthestLabPixel(pixels, centroids) {
    let selected = pixels[0];
    let bestScore = -1;

    pixels.forEach((pixel) => {
      const nearestDistance = centroids.length
        ? Math.min(
            ...centroids.map((centroid) =>
              deltaEOk(pixel.lab, centroid, 1.18),
            ),
          )
        : 0;
      const score = nearestDistance * Math.sqrt(pixel.weight);

      if (score > bestScore) {
        bestScore = score;
        selected = pixel;
      }
    });

    return selected;
  }

  function weightedLabMean(items) {
    const totalWeight = items.reduce(
      (sum, item) => sum + (item.weight || 1),
      0,
    ) || 1;

    return {
      L: items.reduce(
        (sum, item) => sum + item.lab.L * (item.weight || 1),
        0,
      ) / totalWeight,
      a: items.reduce(
        (sum, item) => sum + item.lab.a * (item.weight || 1),
        0,
      ) / totalWeight,
      b: items.reduce(
        (sum, item) => sum + item.lab.b * (item.weight || 1),
        0,
      ) / totalWeight,
    };
  }

  function mergeSimilarColors(colors, threshold) {
    const sorted = [...colors].sort((a, b) => b.ratio - a.ratio);
    const merged = [];

    sorted.forEach((candidate) => {
      const match = merged.find(
        (color) => deltaEOk(color.lab, candidate.lab) < threshold,
      );

      if (!match) {
        merged.push({ ...candidate, lab: { ...candidate.lab } });
        return;
      }

      const totalRatio = match.ratio + candidate.ratio;
      match.lab = {
        L: (match.lab.L * match.ratio + candidate.lab.L * candidate.ratio) / totalRatio,
        a: (match.lab.a * match.ratio + candidate.lab.a * candidate.ratio) / totalRatio,
        b: (match.lab.b * match.ratio + candidate.lab.b * candidate.ratio) / totalRatio,
      };
      match.ratio = totalRatio;
      match.analysisWeight += candidate.analysisWeight || 0;
      match.lch = oklabToOklch(match.lab);
      match.hex = oklabToHex(match.lab);
    });

    return merged;
  }

  function calculateImageMetrics(pixels, palette) {
    const effectiveWeight = pixels.reduce((sum, pixel) => sum + pixel.weight, 0) || 1;
    const meanLightness = pixels.reduce(
      (sum, pixel) => sum + pixel.lch.L * pixel.weight,
      0,
    ) / effectiveWeight;
    const meanChroma = pixels.reduce(
      (sum, pixel) => sum + pixel.lch.C * pixel.weight,
      0,
    ) / effectiveWeight;

    const lightnessValues = pixels.map((pixel) => pixel.lch.L).sort((a, b) => a - b);
    const contrast = clamp(
      percentile(lightnessValues, 0.9) - percentile(lightnessValues, 0.1),
      0,
      1,
    );
    const neutralRatio = ratioMatching(pixels, (pixel) => pixel.lch.C < 0.04);
    const darkRatio = ratioMatching(pixels, (pixel) => pixel.lch.L < 0.32);
    const highChromaRatio = ratioMatching(pixels, (pixel) => pixel.lch.C > 0.14);

    let hueXTotal = 0;
    let hueYTotal = 0;
    let chromaTotal = 0;
    let temperatureTotal = 0;

    pixels.forEach(({ lch, weight }) => {
      if (lch.C < 0.018 || !Number.isFinite(lch.H)) {
        return;
      }

      const hueRadians = degreesToRadians(lch.H);
      const hueWeight = lch.C * weight;
      hueXTotal += Math.cos(hueRadians) * hueWeight;
      hueYTotal += Math.sin(hueRadians) * hueWeight;
      chromaTotal += hueWeight;
      temperatureTotal +=
        Math.cos(degreesToRadians(lch.H - 60)) * hueWeight;
    });

    const hueX = chromaTotal ? hueXTotal / chromaTotal : 0;
    const hueY = chromaTotal ? hueYTotal / chromaTotal : 0;
    const hueConcentration = chromaTotal
      ? clamp(Math.hypot(hueXTotal, hueYTotal) / chromaTotal, 0, 1)
      : 0;
    const temperature = chromaTotal
      ? clamp(temperatureTotal / chromaTotal, -1, 1)
      : 0;
    const accentRatio = calculateAccentRatio(
      palette,
      meanLightness,
      meanChroma,
    );
    const visualWeight = clamp(
      (1 - meanLightness) * 0.5 +
        darkRatio * 0.34 +
        clamp(meanChroma / 0.22, 0, 1) * 0.16,
      0,
      1,
    );
    const paletteReference = calculatePaletteReferenceMetrics(
      palette,
      contrast,
      accentRatio,
      hueConcentration,
    );

    return {
      meanLightness,
      meanChroma,
      temperature,
      contrast,
      visualWeight,
      neutralRatio,
      darkRatio,
      highChromaRatio,
      hueConcentration,
      accentRatio,
      hueX,
      hueY,
      dominantColorRatio: paletteReference.dominantColorRatio,
      significantColorCount: paletteReference.significantColorCount,
      paletteEntropy: paletteReference.paletteEntropy,
      paletteSpread: paletteReference.paletteSpread,
      paletteReferenceScore: paletteReference.paletteReferenceScore,
      paletteUsabilityPenalty: paletteReference.paletteUsabilityPenalty,
      closeupPenalty: paletteReference.closeupPenalty,
      monotonePenalty: paletteReference.monotonePenalty,
    };
  }

  function calculateAccentRatio(palette, meanLightness, meanChroma) {
    const ratio = palette.reduce((sum, color) => {
      const chromaAccent = color.lch.C > Math.max(0.11, meanChroma * 1.35);
      const lightnessAccent = Math.abs(color.lch.L - meanLightness) > 0.24;
      const limitedArea = color.ratio <= 0.28;

      return sum + (limitedArea && (chromaAccent || lightnessAccent) ? color.ratio : 0);
    }, 0);

    return clamp(ratio, 0, 1);
  }

  function calculatePaletteReferenceMetrics(palette, contrast, accentRatio, hueConcentration) {
    const usablePalette = Array.isArray(palette) ? palette.filter(Boolean) : [];

    if (!usablePalette.length) {
      return {
        dominantColorRatio: 1,
        significantColorCount: 0,
        paletteEntropy: 0,
        paletteSpread: 0,
        paletteReferenceScore: 0.18,
        paletteUsabilityPenalty: 0.32,
        closeupPenalty: 0.18,
        monotonePenalty: 0.2,
      };
    }

    const sortedPalette = [...usablePalette].sort((first, second) => (second.ratio || 0) - (first.ratio || 0));
    const dominantColorRatio = clamp(Number(sortedPalette[0]?.ratio) || 0, 0, 1);
    const significantColorCount = sortedPalette.filter((color) => (Number(color.ratio) || 0) >= 0.08).length;

    const normalizedRatios = sortedPalette
      .map((color) => Math.max(0, Number(color.ratio) || 0))
      .filter((ratio) => ratio > 0);
    const ratioTotal = normalizedRatios.reduce((sum, ratio) => sum + ratio, 0) || 1;
    const entropyBase = Math.log(Math.max(2, normalizedRatios.length));
    const paletteEntropy = entropyBase
      ? clamp(
          -normalizedRatios.reduce((sum, ratio) => {
            const probability = ratio / ratioTotal;
            return probability > 0 ? sum + probability * Math.log(probability) : sum;
          }, 0) / entropyBase,
          0,
          1,
        )
      : 0;

    const pairwiseDistances = [];
    for (let firstIndex = 0; firstIndex < sortedPalette.length; firstIndex += 1) {
      const first = sortedPalette[firstIndex];
      if (!first?.lab) {
        continue;
      }

      for (let secondIndex = firstIndex + 1; secondIndex < sortedPalette.length; secondIndex += 1) {
        const second = sortedPalette[secondIndex];
        if (!second?.lab) {
          continue;
        }

        const pairWeight = Math.sqrt((Number(first.ratio) || 0) * (Number(second.ratio) || 0));
        if (pairWeight <= 0) {
          continue;
        }

        pairwiseDistances.push({
          distance: deltaEOk(first.lab, second.lab),
          weight: pairWeight,
        });
      }
    }

    const totalPairWeight = pairwiseDistances.reduce((sum, pair) => sum + pair.weight, 0);
    const paletteSpread = totalPairWeight
      ? clamp(
          pairwiseDistances.reduce((sum, pair) => sum + pair.distance * pair.weight, 0) / totalPairWeight,
          0,
          1,
        )
      : 0;

    const richnessScore = clamp((significantColorCount - 1) / 3, 0, 1);
    const spreadScore = clamp(paletteSpread / 0.11, 0, 1);
    const dominanceBalance = clamp((0.82 - dominantColorRatio) / 0.42, 0, 1);
    const accentSupport = clamp(accentRatio / 0.22, 0, 1);
    const contrastSupport = clamp(contrast / 0.4, 0, 1);
    const multiColorBonus = significantColorCount >= 3 ? 0.08 : 0;

    const paletteReferenceScore = clamp(
      richnessScore * 0.24 +
        paletteEntropy * 0.24 +
        spreadScore * 0.2 +
        dominanceBalance * 0.14 +
        accentSupport * 0.1 +
        contrastSupport * 0.08 +
        multiColorBonus,
      0,
      1,
    );

    const monotonePenalty =
      dominantColorRatio >= 0.72 && significantColorCount <= 2
        ? clamp((dominantColorRatio - 0.72) / 0.18 + (2 - significantColorCount) * 0.18, 0, 1)
        : 0;
    const closeupPenalty =
      dominantColorRatio >= 0.76 &&
      paletteSpread < 0.07 &&
      accentRatio < 0.12 &&
      hueConcentration > 0.72
        ? clamp(
            0.35 +
              clamp((dominantColorRatio - 0.76) / 0.18, 0, 0.35) +
              clamp((0.07 - paletteSpread) / 0.07, 0, 0.2),
            0,
            1,
          )
        : 0;
    const paletteUsabilityPenalty = clamp(
      monotonePenalty * 0.6 +
        closeupPenalty * 0.4 +
        Math.max(0, 0.42 - paletteReferenceScore) * 0.55,
      0,
      1,
    );

    return {
      dominantColorRatio,
      significantColorCount,
      paletteEntropy,
      paletteSpread,
      paletteReferenceScore,
      paletteUsabilityPenalty,
      closeupPenalty,
      monotonePenalty,
    };
  }

  function createFallbackFeature(photo, index, error) {
    const hex = normalizeHex(photo?.color) || '#E9E8E4';
    const rgb = hexToRgb(hex);
    const lab = rgbToOklab(rgb);
    const lch = oklabToOklch(lab);
    const hueRadians = Number.isFinite(lch.H) ? degreesToRadians(lch.H) : 0;
    const chromatic = lch.C >= 0.018;
    const temperature = chromatic
      ? Math.cos(degreesToRadians(lch.H - 60))
      : 0;
    const neutralRatio = lch.C < 0.04 ? 1 : 0;
    const darkRatio = lch.L < 0.32 ? 1 : 0;
    const highChromaRatio = lch.C > 0.14 ? 1 : 0;

    return {
      photoId: String(photo?.id || `photo-${index}`),
      source: 'fallback',
      fallbackReason: error instanceof Error ? error.message : '像素分析失敗。',
      perceptualHash: '',
      palette: [
        {
          hex,
          ratio: 1,
          lab,
          lch,
          analysisWeight: 1,
        },
      ],
      meanLightness: lch.L,
      meanChroma: lch.C,
      temperature,
      contrast: 0,
      visualWeight: clamp((1 - lch.L) * 0.62 + darkRatio * 0.38, 0, 1),
      neutralRatio,
      darkRatio,
      highChromaRatio,
      hueConcentration: chromatic ? 1 : 0,
      accentRatio: 0,
      hueX: chromatic ? Math.cos(hueRadians) : 0,
      hueY: chromatic ? Math.sin(hueRadians) : 0,
      dominantColorRatio: 1,
      significantColorCount: 1,
      paletteEntropy: 0,
      paletteSpread: 0,
      paletteReferenceScore: 0.24,
      paletteUsabilityPenalty: 0.28,
      closeupPenalty: 0.2,
      monotonePenalty: 0.24,
    };
  }

  const MATCH_TOLERANCES = {
    meanLightness: 0.34,
    meanChroma: 0.13,
    temperature: 1.0,
    contrast: 0.48,
    visualWeight: 0.48,
    neutralRatio: 0.65,
    darkRatio: 0.65,
    highChromaRatio: 0.5,
    hueConcentration: 0.65,
    accentRatio: 0.42,
  };

  function scoreFeatures(features, photos, options) {
    const targetProfile = options.targetProfile || {};
    const featureWeights = options.featureWeights || {};
    const constraints = Array.isArray(options.constraints) ? options.constraints : [];
    const exclusionTerms = Array.isArray(options.exclusionTerms)
      ? options.exclusionTerms.map((term) => String(term).toLowerCase()).filter(Boolean)
      : [];
    const scoringConfig = options.scoringConfig || {};
    const finalWeights = scoringConfig.final_score_weights || {};
    const exclusionConfig = scoringConfig.semantic_exclusion || {};
    const qualificationConfig = scoringConfig.qualification || {};
    /*
     * 既有設定檔不動。
     * 在分析層限制「只看顏色」的比重，並把主題元素列為獨立訊號。
     */
    const semanticWeight = Math.max(0.32, Number(finalWeights.semantic) || 0.32);
    const themeElementWeight = 0.18;
    const paletteReferenceWeight = 0.22;
    const colorWeight = Math.min(0.26, Math.max(0, Number(finalWeights.color_match) || 0.24));
    const overlapWeight = Math.min(0.08, Math.max(0, Number(finalWeights.query_overlap) || 0.08));
    const constraintWeight = Math.max(0, Number(finalWeights.constraint_penalty) || 0.4);
    const positiveWeightTotal =
      semanticWeight + themeElementWeight + paletteReferenceWeight + colorWeight + overlapWeight || 1;
    const exclusionPerHit = Math.max(0, Number(exclusionConfig.per_hit_penalty) || 0.28);
    const exclusionMax = clamp(Number(exclusionConfig.max_penalty) || 0.75, 0, 1);
    const minimumScore = clamp(Number(qualificationConfig.minimum_score) || 0.5, 0, 1);
    const minimumCount = Math.max(3, Number(qualificationConfig.minimum_count) || 12);
    const retainRatio = clamp(Number(qualificationConfig.retain_ratio) || 0.7, 0.05, 1);
    const photoMap = new Map(
      photos.map((photo) => [String(photo?.id || ''), photo]),
    );

    const scoredFeatures = features.map((feature) => {
      const photo = photoMap.get(feature.photoId) || {};
      const semanticScore = clamp(
        Number(photo.content_relevance_score ?? photo.semantic_score) || 0,
        0,
        1,
      );
      const themeElementScore = clamp(
        Number(photo?.content_validation?.theme_element_score) || 0,
        0,
        1,
      );
      const queryOverlapScore = clamp(Number(photo.query_overlap_score) || 0, 0, 1);
      const rawColorMatch = calculateColorMatch(feature, targetProfile, featureWeights);
      /*
       * CORS / Canvas 失敗時只有單一 API 代表色，不能把它當完整圖片色彩。
       * 因此 fallback 的色彩分數往中性 0.5 收縮，避免錯誤代表色主導 Best-Fit。
       */
      const colorReliability = feature.source === 'pixels' ? 1 : 0.25;
      const colorMatch = clamp(
        0.5 + (rawColorMatch - 0.5) * colorReliability,
        0,
        1,
      );
      const rawPaletteReferenceScore = clamp(Number(feature.paletteReferenceScore) || 0, 0, 1);
      const paletteReferenceReliability = feature.source === 'pixels' ? 1 : 0.45;
      const paletteReferenceScore = clamp(
        0.45 + (rawPaletteReferenceScore - 0.45) * paletteReferenceReliability,
        0,
        1,
      );
      const paletteUsabilityPenalty = clamp(
        Number(feature.paletteUsabilityPenalty) || 0,
        0,
        1,
      );
      const numericPenalty = calculateConstraintPenalty(feature, constraints);
      const searchableText = `${photo.alt || ''} ${photo.photographer || ''}`.toLowerCase();
      const semanticExclusionHits = exclusionTerms.filter(
        (term) => term && searchableText.includes(term),
      ).length;
      const semanticExclusionPenalty = clamp(semanticExclusionHits * exclusionPerHit, 0, exclusionMax);
      const constraintPenalty = clamp(
        numericPenalty + semanticExclusionPenalty,
        0,
        1,
      );
      const gateStatus = String(photo.content_gate_status || 'CANDIDATE').toUpperCase();
      const gateMultiplier = gateStatus === 'PASS' ? 1 : 0.94;
      const positiveScore =
        (semanticScore * semanticWeight +
          themeElementScore * themeElementWeight +
          paletteReferenceScore * paletteReferenceWeight +
          colorMatch * colorWeight +
          queryOverlapScore * overlapWeight) /
        positiveWeightTotal;
      const finalScore = clamp(
        (positiveScore - constraintPenalty * constraintWeight - paletteUsabilityPenalty * 0.28) * gateMultiplier,
        0,
        1,
      );

      return {
        ...feature,
        semanticScore,
        themeElementScore,
        queryOverlapScore,
        paletteReferenceScore,
        paletteUsabilityPenalty,
        dominantColorRatio: clamp(Number(feature.dominantColorRatio) || 0, 0, 1),
        significantColorCount: Math.max(0, Number(feature.significantColorCount) || 0),
        paletteSpread: clamp(Number(feature.paletteSpread) || 0, 0, 1),
        colorMatch,
        colorReliability,
        constraintPenalty,
        gateStatus,
        finalScore,
      };
    });

    scoredFeatures.sort((a, b) => b.finalScore - a.finalScore);
    const desiredCount = Math.min(
      scoredFeatures.length,
      Math.max(minimumCount, Math.ceil(scoredFeatures.length * retainRatio)),
    );
    let qualifiedFeatures = scoredFeatures.filter(
      (feature) => feature.finalScore >= minimumScore,
    );

    /*
     * minimum_score 是真正品質底線。
     * 圖片不夠時寧可少顯示，也不再為了湊 minimum_count 強塞低分圖。
     */
    qualifiedFeatures = qualifiedFeatures.slice(0, desiredCount);

    const qualifiedIds = new Set(qualifiedFeatures.map((feature) => feature.photoId));
    const scoredPhotos = scoredFeatures.map((feature) => ({
      photoId: feature.photoId,
      semanticScore: feature.semanticScore,
      themeElementScore: feature.themeElementScore,
      queryOverlapScore: feature.queryOverlapScore,
      paletteReferenceScore: feature.paletteReferenceScore,
      paletteUsabilityPenalty: feature.paletteUsabilityPenalty,
      dominantColorRatio: feature.dominantColorRatio,
      significantColorCount: feature.significantColorCount,
      paletteSpread: feature.paletteSpread,
      colorMatch: feature.colorMatch,
      colorReliability: feature.colorReliability,
      constraintPenalty: feature.constraintPenalty,
      gateStatus: feature.gateStatus,
      finalScore: feature.finalScore,
      qualified: qualifiedIds.has(feature.photoId),
      source: feature.source,
      perceptualHash: feature.perceptualHash || '',
    }));

    return { qualifiedFeatures, scoredPhotos };
  }

  function calculateColorMatch(feature, targetProfile, featureWeights) {
    const keys = Object.keys(featureWeights).filter(
      (key) => targetProfile[key] != null && feature[key] != null,
    );

    if (!keys.length) {
      return 0.62;
    }

    let total = 0;
    let totalWeight = 0;

    keys.forEach((key) => {
      const weight = Math.max(0, Number(featureWeights[key]) || 0);
      const tolerance = MATCH_TOLERANCES[key] || 1;
      const difference = Math.abs(Number(feature[key]) - Number(targetProfile[key]));
      const similarity = 1 - Math.min(1, difference / tolerance);
      total += similarity * weight;
      totalWeight += weight;
    });

    return totalWeight ? clamp(total / totalWeight, 0, 1) : 0.62;
  }

  function calculateConstraintPenalty(feature, constraints) {
    let weightedPenalty = 0;
    let totalWeight = 0;

    constraints.forEach((constraint) => {
      const value = Number(feature[constraint.feature]);
      if (!Number.isFinite(value)) {
        return;
      }

      const threshold = Number(constraint.threshold) || 0;
      const tolerance = Math.max(0.0001, Number(constraint.tolerance) || 1);
      const weight = Math.max(0.1, Number(constraint.weight) || 1);
      let violation = 0;

      if (constraint.mode === 'maximum' && value > threshold) {
        violation = (value - threshold) / tolerance;
      }
      if (constraint.mode === 'minimum' && value < threshold) {
        violation = (threshold - value) / tolerance;
      }

      weightedPenalty += clamp(violation, 0, 1) * weight;
      totalWeight += weight;
    });

    return totalWeight ? clamp(weightedPenalty / totalWeight, 0, 1) : 0;
  }

  function standardizeFeatureVectors(features) {
    const statistics = FEATURE_DIMENSIONS.map(({ key, minScale }) => {
      const values = features.map((feature) => Number(feature[key]) || 0);
      const meanValue = average(values);
      const variance = average(values.map((value) => (value - meanValue) ** 2));

      return {
        mean: meanValue,
        scale: Math.max(Math.sqrt(variance), minScale),
      };
    });

    return features.map((feature) =>
      FEATURE_DIMENSIONS.map(({ key, weight }, dimensionIndex) => {
        const value = Number(feature[key]) || 0;
        const { mean, scale } = statistics[dimensionIndex];
        return ((value - mean) / scale) * weight;
      }),
    );
  }

  function kMeansVectors(samples, k, iterations) {
    const centroids = initializeVectorCentroids(samples, k);
    let clusters = Array.from({ length: k }, () => []);

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      clusters = Array.from({ length: k }, () => []);

      samples.forEach((sample) => {
        clusters[nearestVectorIndex(sample.vector, centroids)].push(sample);
      });

      const nextCentroids = clusters.map((cluster, index) => {
        if (cluster.length) {
          return averageVector(cluster.map((item) => item.vector));
        }

        const otherCentroids = centroids.filter(
          (_, centroidIndex) => centroidIndex !== index,
        );
        return farthestVectorSample(samples, otherCentroids).vector;
      });

      const stable = centroids.every(
        (centroid, index) => vectorDistance(centroid, nextCentroids[index]) < 0.001,
      );

      centroids.splice(0, centroids.length, ...nextCentroids.map((item) => [...item]));

      if (stable) {
        break;
      }
    }

    clusters = Array.from({ length: k }, () => []);
    samples.forEach((sample) => {
      clusters[nearestVectorIndex(sample.vector, centroids)].push(sample);
    });

    return { clusters, centroids };
  }

  function initializeVectorCentroids(samples, k) {
    const globalMean = averageVector(samples.map((sample) => sample.vector));
    const centroids = [farthestVectorSample(samples, [globalMean]).vector];

    while (centroids.length < k) {
      centroids.push(farthestVectorSample(samples, centroids).vector);
    }

    return centroids.map((vector) => [...vector]);
  }

  function nearestVectorIndex(vector, centroids) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    centroids.forEach((centroid, index) => {
      const currentDistance = vectorDistance(vector, centroid);

      if (currentDistance < bestDistance) {
        bestDistance = currentDistance;
        bestIndex = index;
      }
    });

    return bestIndex;
  }

  function farthestVectorSample(samples, centroids) {
    let selected = samples[0];
    let bestDistance = -1;

    samples.forEach((sample) => {
      const nearestDistance = centroids.length
        ? Math.min(
            ...centroids.map((centroid) =>
              vectorDistance(sample.vector, centroid),
            ),
          )
        : 0;

      if (nearestDistance > bestDistance) {
        bestDistance = nearestDistance;
        selected = sample;
      }
    });

    return selected;
  }

  function buildDirection(cluster, centerVector, totalSamples) {
    if (!cluster.length) {
      return null;
    }

    const metrics = {};
    FEATURE_DIMENSIONS.forEach(({ key }) => {
      metrics[key] = average(cluster.map((feature) => Number(feature[key]) || 0));
    });

    const paletteCandidates = buildDirectionPalette(
      cluster,
      DIRECTION_PALETTE_CANDIDATE_SIZE,
    );
    const palette = paletteCandidates.slice(0, DIRECTION_PALETTE_SIZE);
    const accessibility = evaluatePaletteAccessibility(palette);
    const brightness = brightnessLabel(metrics.meanLightness);
    const chroma = chromaLabel(metrics.meanChroma);
    const temperature = temperatureLabel(metrics.temperature, metrics.neutralRatio);
    const contrast = contrastLabel(metrics.contrast);
    const visualWeight = visualWeightLabel(metrics.visualWeight);
    const family = hueFamilyFromVector(
      metrics.hueX,
      metrics.hueY,
      metrics.meanChroma,
      metrics.neutralRatio,
    );
    const clusterShare = cluster.length / totalSamples;

    return {
      code: '',
      name: directionName(family, brightness, chroma, visualWeight),
      description:
        `此方向由完整圖片像素分析形成，整體偏${temperature}、${brightness}、` +
        `${chroma}，呈現${contrast}與${visualWeight}。`,
      sampleCount: cluster.length,
      share: Math.round(clusterShare * 100),
      matchScore: Math.round(average(cluster.map((feature) => feature.finalScore || 0)) * 100),
      photoIds: cluster.map((feature) => feature.photoId),
      palette,
      paletteCandidates,
      tags: [brightness, chroma, temperature, contrast],
      metrics,
      accessibility,
      centerVector,
    };
  }

  /**
   * 讓 A／B／C 的代表色票彼此有感知差異。
   *
   * 原本每一群都獨立挑選「最深、最淺、主色」，在黑暗或低彩度題目中，
   * 三群很容易同時選到近黑、灰與淺灰。這裡以 OKLab Delta E 做跨方向去重，
   * 仍只從該群圖片實際擷取到的候選色中挑選，不憑空生成顏色。
   */
  function diversifyDirections(directions) {
    const usedColors = [];

    const withDistinctPalettes = directions.map((direction) => {
      const candidates = Array.isArray(direction.paletteCandidates)
        ? direction.paletteCandidates
        : direction.palette;
      const palette = selectDistinctDirectionPalette(
        candidates,
        usedColors,
        DIRECTION_PALETTE_SIZE,
      );

      usedColors.push(...palette);

      return {
        ...direction,
        palette,
        accessibility: evaluatePaletteAccessibility(palette),
      };
    });

    return ensureDistinctDirectionNames(withDistinctPalettes)
      .map(({ paletteCandidates, ...direction }) => direction);
  }

  function selectDistinctDirectionPalette(candidates, usedColors, limit) {
    const deduped = [];

    (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
      if (!candidate?.lab || !candidate?.lch) {
        return;
      }

      const duplicate = deduped.some(
        (color) => deltaEOk(color.lab, candidate.lab) < 0.018,
      );
      if (!duplicate) {
        deduped.push(candidate);
      }
    });

    const selected = [];
    const remaining = [...deduped];

    while (selected.length < limit && remaining.length) {
      const ranked = remaining
        .map((candidate) => {
          const distanceToUsed = usedColors.length
            ? Math.min(...usedColors.map((color) => deltaEOk(color.lab, candidate.lab)))
            : CROSS_DIRECTION_COLOR_DISTANCE * 2;
          const distanceToSelected = selected.length
            ? Math.min(...selected.map((color) => deltaEOk(color.lab, candidate.lab)))
            : CROSS_DIRECTION_COLOR_DISTANCE * 2;
          const ratioScore = Math.min((Number(candidate.ratio) || 0) * 10, 1);
          const chromaScore = Math.min((Number(candidate.lch.C) || 0) / 0.18, 1);
          const globalDiversity = Math.min(
            distanceToUsed / (CROSS_DIRECTION_COLOR_DISTANCE * 1.8),
            1,
          );
          const localDiversity = Math.min(
            distanceToSelected / (CROSS_DIRECTION_COLOR_DISTANCE * 1.5),
            1,
          );
          const duplicatePenalty = distanceToUsed < CROSS_DIRECTION_COLOR_DISTANCE
            ? (CROSS_DIRECTION_COLOR_DISTANCE - distanceToUsed) * 9
            : 0;

          return {
            candidate,
            score:
              globalDiversity * 0.42 +
              localDiversity * 0.28 +
              ratioScore * 0.22 +
              chromaScore * 0.08 -
              duplicatePenalty,
          };
        })
        .sort((a, b) => b.score - a.score);

      const next = ranked[0]?.candidate;
      if (!next) {
        break;
      }

      selected.push(next);
      const index = remaining.indexOf(next);
      if (index >= 0) {
        remaining.splice(index, 1);
      }
    }

    if (!selected.length) {
      return [];
    }

    const totalRatio = selected.reduce(
      (sum, color) => sum + Math.max(0, Number(color.ratio) || 0),
      0,
    ) || selected.length;

    return selected
      .map((color) => ({
        ...color,
        ratio: (Math.max(0, Number(color.ratio) || 0) || 1) / totalRatio,
      }))
      .sort((a, b) => a.lch.L - b.lch.L);
  }

  function ensureDistinctDirectionNames(directions) {
    const groups = new Map();

    directions.forEach((direction, index) => {
      const name = direction.name || '色彩方向';
      if (!groups.has(name)) {
        groups.set(name, []);
      }
      groups.get(name).push(index);
    });

    return directions.map((direction, index) => {
      const duplicates = groups.get(direction.name || '色彩方向') || [];
      if (duplicates.length <= 1) {
        return direction;
      }

      const qualifier = directionPaletteQualifier(direction.palette, direction.metrics);
      const sameQualifierBefore = directions
        .slice(0, index)
        .filter((item) => item.name === direction.name)
        .some(
          (item) => directionPaletteQualifier(item.palette, item.metrics) === qualifier,
        );

      return {
        ...direction,
        name: `${direction.name}・${sameQualifierBefore ? `分支${index + 1}` : qualifier}`,
      };
    });
  }

  function directionPaletteQualifier(palette, metrics) {
    const chromatic = [...(Array.isArray(palette) ? palette : [])]
      .filter((color) => (Number(color?.lch?.C) || 0) >= 0.035)
      .sort((a, b) => {
        const scoreA = (a.lch.C || 0) * (0.5 + Math.min((a.ratio || 0) * 8, 1));
        const scoreB = (b.lch.C || 0) * (0.5 + Math.min((b.ratio || 0) * 8, 1));
        return scoreB - scoreA;
      })[0];

    if (chromatic) {
      const hue = ((Number(chromatic.lch.h) || 0) % 360 + 360) % 360;
      if (hue < 20 || hue >= 345) return '紅調';
      if (hue < 55) return '暖棕';
      if (hue < 100) return '金調';
      if (hue < 165) return '綠調';
      if (hue < 205) return '青灰';
      if (hue < 265) return '深藍';
      if (hue < 325) return '紫調';
      return '粉霧';
    }

    const lightness = Number(metrics?.meanLightness) || 0;
    if (lightness < 0.34) return '黑灰';
    if (lightness > 0.68) return '淺灰';
    return '霧灰';
  }

  function buildDirectionPalette(cluster, limit) {
    const candidates = [];

    cluster.forEach((feature) => {
      feature.palette.forEach((color) => {
        candidates.push({
          ...color,
          ratio: color.ratio / cluster.length,
          analysisWeight: (color.analysisWeight || 1) / cluster.length,
        });
      });
    });

    const merged = mergeSimilarColors(candidates, COLOR_MERGE_DISTANCE)
      .filter((color) => color.ratio >= 0.002)
      .sort((a, b) => b.ratio - a.ratio);

    if (merged.length <= limit) {
      return merged.sort((a, b) => a.lch.L - b.lch.L);
    }

    const selected = [];
    const addCandidate = (candidate) => {
      if (!candidate) {
        return;
      }

      const alreadySelected = selected.some(
        (color) => deltaEOk(color.lab, candidate.lab) < 0.02,
      );

      if (!alreadySelected) {
        selected.push(candidate);
      }
    };

    const darkest = [...merged].sort((a, b) => a.lch.L - b.lch.L)[0];
    const lightest = [...merged].sort((a, b) => b.lch.L - a.lch.L)[0];
    const dominant = merged[0];
    const accent = [...merged].sort((a, b) => {
      const scoreA = a.lch.C * (0.55 + Math.min(a.ratio * 8, 1));
      const scoreB = b.lch.C * (0.55 + Math.min(b.ratio * 8, 1));
      return scoreB - scoreA;
    })[0];

    addCandidate(darkest);
    addCandidate(lightest);
    addCandidate(dominant);
    addCandidate(accent);

    while (selected.length < limit) {
      const remaining = merged.filter(
        (candidate) =>
          !selected.some((color) => deltaEOk(color.lab, candidate.lab) < 0.02),
      );

      if (!remaining.length) {
        break;
      }

      const next = remaining
        .map((candidate) => {
          const minDistance = Math.min(
            ...selected.map((color) => deltaEOk(color.lab, candidate.lab)),
          );
          const importance = Math.min(candidate.ratio * 8, 1);
          const chromaValue = Math.min(candidate.lch.C / 0.22, 1);

          return {
            candidate,
            score: minDistance * 0.62 + importance * 0.25 + chromaValue * 0.13,
          };
        })
        .sort((a, b) => b.score - a.score)[0]?.candidate;

      addCandidate(next);
    }

    return selected
      .slice(0, limit)
      .sort((a, b) => a.lch.L - b.lch.L);
  }

  function evaluatePaletteAccessibility(palette) {
    if (!palette.length) {
      return {
        ratio: 1,
        passesAA: false,
        foreground: '#000000',
        background: '#FFFFFF',
        suggestedText: '#000000',
      };
    }

    const darkest = [...palette].sort((a, b) => a.lch.L - b.lch.L)[0];
    const lightest = [...palette].sort((a, b) => b.lch.L - a.lch.L)[0];
    const checker = window.ContrastChecker;

    if (!checker) {
      return {
        ratio: 1,
        passesAA: false,
        foreground: darkest.hex,
        background: lightest.hex,
        suggestedText: '#000000',
      };
    }

    const result = checker.evaluate(darkest.hex, lightest.hex);

    return {
      ratio: result.ratio,
      passesAA: result.normalTextAA,
      foreground: darkest.hex,
      background: lightest.hex,
      suggestedText: checker.chooseReadableText(lightest.hex),
    };
  }

  function brightnessLabel(value) {
    if (value >= 0.72) {
      return '高明度';
    }

    if (value >= 0.48) {
      return '中等明度';
    }

    return '低明度';
  }

  function chromaLabel(value) {
    if (value < 0.055) {
      return '低彩度';
    }

    if (value < 0.13) {
      return '柔和彩度';
    }

    return '高彩度';
  }

  function temperatureLabel(value, neutralRatio) {
    if (neutralRatio >= 0.7 || Math.abs(value) < 0.16) {
      return '中性';
    }

    return value > 0 ? '暖色' : '冷色';
  }

  function contrastLabel(value) {
    if (value < 0.28) {
      return '低對比';
    }

    if (value < 0.5) {
      return '中等對比';
    }

    return '高對比';
  }

  function visualWeightLabel(value) {
    if (value < 0.4) {
      return '輕盈視覺';
    }

    if (value < 0.65) {
      return '中等視覺重量';
    }

    return '厚重視覺';
  }

  function hueFamilyFromVector(hueX, hueY, meanChroma, neutralRatio) {
    if (meanChroma < 0.045 || neutralRatio > 0.72 || Math.hypot(hueX, hueY) < 0.08) {
      return 'neutral';
    }

    let hue = radiansToDegrees(Math.atan2(hueY, hueX));
    if (hue < 0) {
      hue += 360;
    }

    if (hue >= 345 || hue < 20) return 'red';
    if (hue < 55) return 'orange';
    if (hue < 100) return 'yellow';
    if (hue < 165) return 'green';
    if (hue < 205) return 'cyan';
    if (hue < 265) return 'blue';
    if (hue < 325) return 'purple';
    return 'pink';
  }

  function directionName(family, brightness, chroma, visualWeight) {
    if (chroma === '高彩度' && brightness !== '低明度') {
      return family === 'blue' || family === 'cyan'
        ? '鮮明現代'
        : '活力亮彩';
    }

    const names = {
      neutral:
        brightness === '高明度'
          ? '柔和明亮'
          : visualWeight === '厚重視覺'
            ? '經典深沉'
            : '自然沉穩',
      red: brightness === '高明度' ? '柔和雅緻' : '經典成熟',
      orange: brightness === '低明度' ? '經典暖調' : '自然暖調',
      yellow: brightness === '高明度' ? '清新暖陽' : '沉靜金調',
      green:
        brightness === '高明度'
          ? '清新自然'
          : visualWeight === '厚重視覺'
            ? '森林沉穩'
            : '自然沉穩',
      cyan: brightness === '高明度' ? '清透冷調' : '安靜青灰',
      blue: brightness === '高明度' ? '清透冷調' : '專業冷靜',
      purple: brightness === '高明度' ? '優雅霧紫' : '深邃高級',
      pink: brightness === '高明度' ? '柔和浪漫' : '成熟柔霧',
    };

    return names[family] || '現代平衡';
  }

  function normalizeHex(value) {
    const text = String(value || '').trim().replace('#', '');

    if (/^[0-9a-fA-F]{6}$/.test(text)) {
      return `#${text}`.toUpperCase();
    }

    if (/^[0-9a-fA-F]{3}$/.test(text)) {
      return `#${text
        .split('')
        .map((character) => character + character)
        .join('')}`.toUpperCase();
    }

    return null;
  }

  function hexToRgb(hex) {
    const normalized = normalizeHex(hex) || '#000000';

    return {
      r: Number.parseInt(normalized.slice(1, 3), 16),
      g: Number.parseInt(normalized.slice(3, 5), 16),
      b: Number.parseInt(normalized.slice(5, 7), 16),
    };
  }

  function rgbToOklab({ r, g, b }) {
    const red = srgbChannelToLinear(r / 255);
    const green = srgbChannelToLinear(g / 255);
    const blue = srgbChannelToLinear(b / 255);

    const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
    const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
    const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;

    const lRoot = Math.cbrt(l);
    const mRoot = Math.cbrt(m);
    const sRoot = Math.cbrt(s);

    return {
      L: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
      a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
      b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
    };
  }

  function oklabToOklch({ L, a, b }) {
    const C = Math.hypot(a, b);
    let H = C < 0.00001 ? Number.NaN : radiansToDegrees(Math.atan2(b, a));

    if (Number.isFinite(H) && H < 0) {
      H += 360;
    }

    return { L, C, H };
  }

  function oklabToHex(lab) {
    const { r, g, b } = oklabToRgb(lab);
    return `#${[r, g, b]
      .map((channel) => Math.round(clamp(channel, 0, 1) * 255).toString(16).padStart(2, '0'))
      .join('')}`.toUpperCase();
  }

  function oklabToRgb({ L, a, b }) {
    const lRoot = L + 0.3963377774 * a + 0.2158037573 * b;
    const mRoot = L - 0.1055613458 * a - 0.0638541728 * b;
    const sRoot = L - 0.0894841775 * a - 1.291485548 * b;

    const l = lRoot ** 3;
    const m = mRoot ** 3;
    const s = sRoot ** 3;

    const redLinear = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const greenLinear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const blueLinear = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

    return {
      r: linearChannelToSrgb(redLinear),
      g: linearChannelToSrgb(greenLinear),
      b: linearChannelToSrgb(blueLinear),
    };
  }

  function srgbChannelToLinear(value) {
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  }

  function linearChannelToSrgb(value) {
    return value <= 0.0031308
      ? 12.92 * value
      : 1.055 * Math.max(value, 0) ** (1 / 2.4) - 0.055;
  }

  /**
   * OKLab 中的感知距離；chromaWeight > 1 時提高色彩敏感度。
   */
  function deltaEOk(first, second, chromaWeight = 1) {
    return Math.sqrt(
      (first.L - second.L) ** 2 +
        ((first.a - second.a) * chromaWeight) ** 2 +
        ((first.b - second.b) * chromaWeight) ** 2,
    );
  }

  async function mapLimit(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;

    const runners = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (nextIndex < items.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          results[currentIndex] = await worker(items[currentIndex], currentIndex);
        }
      },
    );

    await Promise.all(runners);
    return results;
  }

  function ratioMatching(items, predicate) {
    if (!items.length) {
      return 0;
    }

    return items.filter(predicate).length / items.length;
  }

  function percentile(sortedValues, fraction) {
    if (!sortedValues.length) {
      return 0;
    }

    const index = clamp(
      Math.round((sortedValues.length - 1) * fraction),
      0,
      sortedValues.length - 1,
    );

    return sortedValues[index];
  }

  function averageVector(vectors) {
    const sums = Array(vectors[0].length).fill(0);

    vectors.forEach((vector) => {
      vector.forEach((value, index) => {
        sums[index] += value;
      });
    });

    return sums.map((sum) => sum / vectors.length);
  }

  function vectorDistance(first, second) {
    return Math.sqrt(
      first.reduce(
        (sum, value, index) => sum + (value - second[index]) ** 2,
        0,
      ),
    );
  }

  function average(values) {
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  }

  function degreesToRadians(value) {
    return (value * Math.PI) / 180;
  }

  function radiansToDegrees(value) {
    return (value * 180) / Math.PI;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  return {
    analyze,
    clearCache,
    rgbToOklab,
    oklabToOklch,
    deltaEOk,
    getToneCoreShadowReport,
    resetToneCoreShadowReport,
  };
})();
