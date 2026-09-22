'use strict';

/**
 * YOYO Tone Feature Core v1
 *
 * Headless / pure color-feature module extracted from tone-analyzer.js.
 * No DOM, Canvas, Image, CORS, branch scoring, fallback, dHash, or A/B/C routing.
 *
 * Browser: window.ToneCore
 * Node.js: require('./tone-core.js')
 */
(function toneCoreFactory(root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (root && typeof root === 'object') {
    root.ToneCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const CONTRACT = Object.freeze({
    name: 'YOYO Tone Feature Contract',
    version: '1.0.0',
    analysisSize: 64,
    pixelStep: 2,
    pixelMargin: 2,
    alphaThreshold: 0.85,
    paletteSize: 5,
    kmeansIterations: 10,
    colorMergeDistance: 0.045,
    clusterChromaWeight: 1.18,
    workingColorSpace: 'OKLab',
    derivedColorSpace: 'OKLCH',
  });

  /**
   * Main headless entry point.
   * The caller is responsible for image decoding/resizing. To stay production-aligned,
   * pass RGBA pixels normalized to CONTRACT.analysisSize x CONTRACT.analysisSize.
   */
  function extractImageToneFeatures(rgba, width, height) {
    const pixels = samplePixels(rgba, width, height);

    if (pixels.length < 24) {
      throw new Error('可分析像素不足。');
    }

    const palette = extractPalette(pixels, CONTRACT.paletteSize);
    const metrics = calculateImageMetrics(pixels, palette);

    return {
      palette,
      ...metrics,
    };
  }

  function samplePixels(data, width, height) {
    const pixels = [];
    const margin = CONTRACT.pixelMargin;

    for (let y = margin; y < height - margin; y += CONTRACT.pixelStep) {
      for (let x = margin; x < width - margin; x += CONTRACT.pixelStep) {
        const offset = (y * width + x) * 4;
        const alpha = data[offset + 3] / 255;

        if (alpha < CONTRACT.alphaThreshold) {
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

  function extractPalette(pixels, requestedK = CONTRACT.paletteSize) {
    const uniqueBuckets = new Set(
      pixels.map(({ rgb }) => `${rgb.r >> 3}-${rgb.g >> 3}-${rgb.b >> 3}`),
    ).size;
    const k = Math.max(1, Math.min(requestedK, uniqueBuckets));
    const centroids = initializeLabCentroids(pixels, k);
    let assignments = new Array(pixels.length).fill(0);

    for (let iteration = 0; iteration < CONTRACT.kmeansIterations; iteration += 1) {
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
      CONTRACT.colorMergeDistance,
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
      const currentDistance = deltaEOk(
        lab,
        centroid,
        CONTRACT.clusterChromaWeight,
      );

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
              deltaEOk(pixel.lab, centroid, CONTRACT.clusterChromaWeight),
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

  function mergeSimilarColors(colors, threshold = CONTRACT.colorMergeDistance) {
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
      temperatureTotal += Math.cos(degreesToRadians(lch.H - 60)) * hueWeight;
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

    const sortedPalette = [...usablePalette].sort(
      (first, second) => (second.ratio || 0) - (first.ratio || 0),
    );
    const dominantColorRatio = clamp(Number(sortedPalette[0]?.ratio) || 0, 0, 1);
    const significantColorCount = sortedPalette.filter(
      (color) => (Number(color.ratio) || 0) >= 0.08,
    ).length;

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

        const pairWeight = Math.sqrt(
          (Number(first.ratio) || 0) * (Number(second.ratio) || 0),
        );
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
          pairwiseDistances.reduce(
            (sum, pair) => sum + pair.distance * pair.weight,
            0,
          ) / totalPairWeight,
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
        ? clamp(
            (dominantColorRatio - 0.72) / 0.18 +
              (2 - significantColorCount) * 0.18,
            0,
            1,
          )
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

  // Achromatic / near-achromatic colors have no meaningful hue.
  // Use null instead of NaN so runtime output and serialized JSON
  // follow the same explicit contract.
  let H = C < 0.00001
    ? null
    : radiansToDegrees(Math.atan2(b, a));

  if (Number.isFinite(H) && H < 0) {
    H += 360;
  }

  return { L, C, H };
}

  function oklabToHex(lab) {
    const { r, g, b } = oklabToRgb(lab);
    return `#${[r, g, b]
      .map((channel) =>
        Math.round(clamp(channel, 0, 1) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
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

  function degreesToRadians(value) {
    return (value * Math.PI) / 180;
  }

  function radiansToDegrees(value) {
    return (value * 180) / Math.PI;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  return Object.freeze({
    CONTRACT,
    extractImageToneFeatures,
    samplePixels,
    pixelAnalysisWeight,
    extractPalette,
    initializeLabCentroids,
    nearestLabIndex,
    farthestLabPixel,
    weightedLabMean,
    mergeSimilarColors,
    calculateImageMetrics,
    calculateAccentRatio,
    calculatePaletteReferenceMetrics,
    rgbToOklab,
    oklabToOklch,
    oklabToRgb,
    oklabToHex,
    deltaEOk,
  });
});
