'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ToneCore = require('./tone-core.js');

let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  console.error('缺少 sharp。請先在此資料夾執行：npm install');
  process.exit(1);
}

const DEFAULT_INPUT = path.resolve(__dirname, 'y2k_color_mvp_evaluation_set_v1.json');
const DEFAULT_OUTPUT = path.resolve(__dirname, 'y2k_color_mvp_b1_observations.json');
const DEFAULT_PREVIEW = path.resolve(__dirname, 'b1_preview.html');
const CACHE_DIR = path.resolve(__dirname, 'b1_cache');
const PREVIEW_ASSET_DIR = path.resolve(__dirname, 'b1_preview_assets');

const REQUEST_TIMEOUT_MS = 15000;
const REQUEST_RETRIES = 2;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0 Safari/537.36';

const FALLBACK_MAP = Object.freeze({
  // Instagram Graphic: primary crawler endpoint may return non-image content.
  serpapi_google_images_5b5216b7f4ef04ba27a3: {
    url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQC02dipEUCVRywtyu2ZsdUOCMOJV-LImpfefUD78C-pg&s=10',
    analysisSource: 'google_image_thumbnail_fallback',
    featureReliability: 0.85,
    skipPrimary: false,
  },

  // TikTok Core: intentionally DO NOT request the TikTok primary URL.
  // This item goes directly to the Google Images thumbnail fallback.
  serpapi_google_images_af6e192e74a947847f38: {
    url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTMUFOLm7LAeM27vT4oHLgHEtLfZOEexfvzazoiPRz-QQ&s=10',
    analysisSource: 'google_image_thumbnail_fallback',
    featureReliability: 0.85,
    skipPrimary: true,
  },
});

const OBSERVED_FEATURE_FIELDS = [
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
];

const DERIVED_QUALITY_FEATURE_FIELDS = [
  'visualWeight',
  'paletteReferenceScore',
  'paletteUsabilityPenalty',
  'closeupPenalty',
  'monotonePenalty',
];

function safeFileName(value) {
  return String(value || 'item')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 140);
}

function hashText(value) {
  return crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 12);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadEvaluationSet(inputPath) {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`找不到輸入檔案：${inputPath}`);
  }

  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  let items;

  if (Array.isArray(payload)) {
    items = payload;
  } else if (payload && Array.isArray(payload.selected)) {
    items = payload.selected;
  } else if (payload && Array.isArray(payload.items)) {
    items = payload.items;
  } else {
    throw new Error("輸入 JSON 必須是 array，或包含 'selected' / 'items' array。");
  }

  return { payload, items };
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeout);
  }
}

async function getImageBufferFromUrl(itemId, url, cacheLabel = 'primary') {
  if (!url) {
    throw new Error('Missing image URL');
  }

  ensureDir(CACHE_DIR);
  const safeId = safeFileName(itemId || 'item');
  const cachePath = path.join(
    CACHE_DIR,
    `${safeId}_${safeFileName(cacheLabel)}_${hashText(url)}.img`,
  );

  if (fs.existsSync(cachePath) && fs.statSync(cachePath).size > 0) {
    return {
      buffer: fs.readFileSync(cachePath),
      fetchMode: 'cache',
      cachePath,
      requestedUrl: url,
    };
  }

  let lastError;
  for (let attempt = 1; attempt <= REQUEST_RETRIES + 1; attempt += 1) {
    try {
      const buffer = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
      if (!buffer.length) {
        throw new Error('Downloaded image is empty');
      }
      fs.writeFileSync(cachePath, buffer);
      return {
        buffer,
        fetchMode: 'download',
        cachePath,
        requestedUrl: url,
      };
    } catch (error) {
      lastError = error;
      if (attempt <= REQUEST_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 450 * attempt));
      }
    }
  }

  throw lastError || new Error('Image download failed');
}

async function normalizeToToneContract(imageBuffer, itemId) {
  const size = ToneCore.CONTRACT.analysisSize;
  const assetName = `${safeFileName(itemId)}.png`;
  const assetPath = path.join(PREVIEW_ASSET_DIR, assetName);

  ensureDir(PREVIEW_ASSET_DIR);

  // Browser production currently stretches the decoded image into a 64×64 canvas.
  // sharp fit:'fill' intentionally mirrors that geometry. rotate() applies EXIF orientation.
  const pipeline = sharp(imageBuffer, { animated: false, failOn: 'none' })
    .rotate()
    .resize(size, size, {
      fit: 'fill',
      withoutEnlargement: false,
    })
    .ensureAlpha();

  // Save the exact normalized visual used for offline B1 inspection.
  await pipeline.clone().png().toFile(assetPath);

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });

  if (info.width !== size || info.height !== size || info.channels !== 4) {
    throw new Error(
      `Unexpected normalized image shape: ${info.width}x${info.height}x${info.channels}`,
    );
  }

  return {
    rgba: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
    previewAsset: path.relative(__dirname, assetPath).replace(/\\/g, '/'),
  };
}

function pickFields(source, fields) {
  return Object.fromEntries(fields.map((field) => [field, source[field]]));
}

function sanitizePalette(palette) {
  return palette.map((color) => ({
    hex: color.hex,
    ratio: color.ratio,
    analysisWeight: color.analysisWeight,
    lab: color.lab,
    lch: color.lch,
  }));
}

async function observeOne(item, index, total) {
  const itemId = String(item.id || `idx_${index}`);
  process.stdout.write(
    `[${String(index + 1).padStart(2, '0')}/${total}] ${itemId} (${item.query_family || 'unknown'}) ... `,
  );

  try {
    const fallbackConfig = FALLBACK_MAP[itemId] || null;

    let sourceResult = null;
    let normalized = null;
    let analysisSource = 'primary_image_url';
    let featureReliability = 1.0;
    let fallbackUsed = false;
    let primaryError = null;

    // Important: decode/normalize is part of source validation.
    // A response can be HTTP 200 but still contain HTML or another unsupported payload.
    if (!(fallbackConfig && fallbackConfig.skipPrimary)) {
      try {
        sourceResult = await getImageBufferFromUrl(itemId, item.image_url, 'primary');
        normalized = await normalizeToToneContract(sourceResult.buffer, itemId);
      } catch (error) {
        primaryError = error;
        sourceResult = null;
        normalized = null;
      }
    } else {
      primaryError = new Error('Primary URL intentionally skipped by source policy');
    }

    if (!normalized) {
      if (!fallbackConfig || !fallbackConfig.url) {
        throw primaryError || new Error('Primary image acquisition failed and no fallback exists');
      }

      try {
        sourceResult = await getImageBufferFromUrl(itemId, fallbackConfig.url, 'google-fallback');
        normalized = await normalizeToToneContract(sourceResult.buffer, itemId);
        analysisSource = fallbackConfig.analysisSource;
        featureReliability = fallbackConfig.featureReliability;
        fallbackUsed = true;
      } catch (fallbackError) {
        const primaryMessage = primaryError ? primaryError.message : 'not attempted';
        throw new Error(
          `Primary error: ${primaryMessage}; Fallback error: ${fallbackError.message}`,
        );
      }
    }

    const result = ToneCore.extractImageToneFeatures(
      normalized.rgba,
      normalized.width,
      normalized.height,
    );

    const observation = {
      ...item,
      palette: sanitizePalette(result.palette),
      observed_features: pickFields(result, OBSERVED_FEATURE_FIELDS),
      derived_quality_features: pickFields(result, DERIVED_QUALITY_FEATURE_FIELDS),
      analysis_provenance: {
        analysis_mode: 'decoded_pixels',
        analysis_source: analysisSource,
        feature_reliability: featureReliability,
        fallback_used: fallbackUsed,
        primary_error: primaryError ? primaryError.message : null,
        tone_feature_contract: {
          ...ToneCore.CONTRACT,
        },
        image_normalization: {
          decoder: 'sharp/libvips',
          exif_autorotate: true,
          resize_width: normalized.width,
          resize_height: normalized.height,
          resize_fit: 'fill',
          channels: 4,
        },
        image_fetch_mode: sourceResult.fetchMode,
        requested_image_url: sourceResult.requestedUrl,
        cache_file: path.relative(__dirname, sourceResult.cachePath).replace(/\\/g, '/'),
        preview_asset: normalized.previewAsset,
      },
      observation_error: null,
    };

    console.log(fallbackUsed ? 'OK (Fallback)' : 'OK');
    return observation;
  } catch (error) {
    console.log(`FAIL (${error.message})`);
    return {
      ...item,
      palette: [],
      observed_features: null,
      derived_quality_features: null,
      analysis_provenance: {
        analysis_mode: 'failed',
        feature_reliability: 0,
        fallback_used: false,
        tone_feature_contract: {
          ...ToneCore.CONTRACT,
        },
      },
      observation_error: String(error && error.message ? error.message : error),
    };
  }
}

function metric(value, digits = 3) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '—';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function familyBadge(family) {
  return escapeHtml(family || 'unknown');
}

function renderPalette(palette) {
  if (!Array.isArray(palette) || !palette.length) {
    return '<div class="palette-empty">No palette</div>';
  }

  return `
    <div class="palette-strip">
      ${palette
        .map(
          (color) => `
          <div class="swatch" style="flex:${Math.max(0.03, color.ratio)};background:${escapeHtml(color.hex)}" title="${escapeHtml(color.hex)} ${(color.ratio * 100).toFixed(1)}%"></div>`,
        )
        .join('')}
    </div>
    <div class="palette-labels">
      ${palette
        .map(
          (color) => `<span>${escapeHtml(color.hex)} ${(color.ratio * 100).toFixed(1)}%</span>`,
        )
        .join('')}
    </div>`;
}

function buildScatterSvg(successItems) {
  const width = 660;
  const height = 420;
  const margin = 52;
  const plotW = width - margin * 2;
  const plotH = height - margin * 2;

  const maxC = Math.max(0.22, ...successItems.map((item) => item.observed_features.meanChroma || 0));

  const points = successItems
    .map((item) => {
      const C = item.observed_features.meanChroma || 0;
      const L = item.observed_features.meanLightness || 0;
      const x = margin + (C / maxC) * plotW;
      const y = margin + (1 - L) * plotH;
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="5"><title>${escapeHtml(item.query_family)} | ${escapeHtml(item.id)} | C=${metric(C)} L=${metric(L)}</title></circle>`;
    })
    .join('');

  return `
  <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Mean Chroma versus Mean Lightness">
    <rect width="${width}" height="${height}" fill="#fff"/>
    <line x1="${margin}" y1="${height - margin}" x2="${width - margin}" y2="${height - margin}" stroke="#777"/>
    <line x1="${margin}" y1="${margin}" x2="${margin}" y2="${height - margin}" stroke="#777"/>
    <text x="${width / 2}" y="${height - 12}" text-anchor="middle">Mean Chroma (C)</text>
    <text x="16" y="${height / 2}" transform="rotate(-90 16 ${height / 2})" text-anchor="middle">Mean Lightness (L)</text>
    <text x="${margin}" y="${height - margin + 22}" text-anchor="middle">0</text>
    <text x="${width - margin}" y="${height - margin + 22}" text-anchor="middle">${maxC.toFixed(2)}</text>
    <text x="${margin - 10}" y="${height - margin + 4}" text-anchor="end">0</text>
    <text x="${margin - 10}" y="${margin + 4}" text-anchor="end">1</text>
    <g fill="#22313a" fill-opacity="0.76">${points}</g>
  </svg>`;
}

function buildHueSvg(successItems) {
  const size = 420;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 150;

  const points = successItems
    .map((item) => {
      const xValue = item.observed_features.hueX || 0;
      const yValue = item.observed_features.hueY || 0;
      const x = cx + xValue * radius;
      const y = cy - yValue * radius;
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="5"><title>${escapeHtml(item.query_family)} | ${escapeHtml(item.id)} | hueX=${metric(xValue)} hueY=${metric(yValue)}</title></circle>`;
    })
    .join('');

  return `
  <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Hue vector projection">
    <rect width="${size}" height="${size}" fill="#fff"/>
    <circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#aaa"/>
    <line x1="${cx - radius}" y1="${cy}" x2="${cx + radius}" y2="${cy}" stroke="#ddd"/>
    <line x1="${cx}" y1="${cy - radius}" x2="${cx}" y2="${cy + radius}" stroke="#ddd"/>
    <circle cx="${cx}" cy="${cy}" r="2" fill="#555"/>
    <g fill="#22313a" fill-opacity="0.76">${points}</g>
  </svg>`;
}

function buildPreviewHtml(outputPayload) {
  const successful = outputPayload.items.filter(
    (item) => !item.observation_error && item.observed_features,
  );

  const cards = outputPayload.items
    .map((item) => {
      const p = item.analysis_provenance || {};
      const features = item.observed_features || {};
      const previewAsset = p.preview_asset;
      const imageBlock = previewAsset
        ? `<img src="${escapeHtml(previewAsset)}" alt="${escapeHtml(item.alt || item.id)}">`
        : '<div class="image-error">Image unavailable</div>';

      return `
      <article class="card">
        <div class="family">${familyBadge(item.query_family)}</div>
        ${imageBlock}
        <div class="content">
          <div class="rank">CLIP #${escapeHtml(item.clip_rank ?? '—')} · ${escapeHtml(item.source_domain || '')}</div>
          <h3>${escapeHtml(item.alt || item.id)}</h3>
          ${renderPalette(item.palette)}
          <dl class="metrics">
            <div><dt>L</dt><dd>${metric(features.meanLightness)}</dd></div>
            <div><dt>C</dt><dd>${metric(features.meanChroma)}</dd></div>
            <div><dt>Contrast</dt><dd>${metric(features.contrast)}</dd></div>
            <div><dt>Accent</dt><dd>${metric(features.accentRatio)}</dd></div>
            <div><dt>Neutral</dt><dd>${metric(features.neutralRatio)}</dd></div>
            <div><dt>Hue conc.</dt><dd>${metric(features.hueConcentration)}</dd></div>
          </dl>
          <div class="status ${item.observation_error ? 'bad' : 'good'}">${item.observation_error
            ? escapeHtml(item.observation_error)
            : `${escapeHtml(p.analysis_source || 'primary_image_url')} · reliability ${metric(p.feature_reliability, 2)}${p.fallback_used ? ' · fallback' : ''}`}</div>
        </div>
      </article>`;
    })
    .join('');

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>YOYO B1 Preview</title>
<style>
:root{font-family:Arial,"Noto Sans TC",sans-serif;color:#18272d;background:#f4f1e9}*{box-sizing:border-box}body{margin:0}.wrap{max-width:1440px;margin:auto;padding:34px}.eyebrow{font-size:12px;letter-spacing:.18em;color:#667b82;text-transform:uppercase}h1{font-size:36px;margin:.3em 0 .2em}.lead{color:#5f6e72;margin-bottom:28px}.summary{display:flex;gap:14px;flex-wrap:wrap;margin:20px 0 34px}.pill{background:#fff;border:1px solid #d8d6cf;border-radius:999px;padding:8px 13px;font-size:13px}.charts{display:grid;grid-template-columns:1.3fr .8fr;gap:18px;margin-bottom:28px}.panel{background:#fff;border:1px solid #ddd9cf;border-radius:16px;padding:18px}.panel h2{font-size:18px;margin:0 0 10px}.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px}.card{position:relative;background:#fff;border:1px solid #ddd9cf;border-radius:15px;overflow:hidden;box-shadow:0 8px 20px rgba(29,38,40,.05)}.card>img,.image-error{width:100%;aspect-ratio:1/1;object-fit:cover;background:#ece9df}.content{padding:14px}.family{position:absolute;top:10px;left:10px;z-index:2;background:#143238;color:white;border-radius:999px;font-size:11px;padding:5px 8px}.rank{font-size:11px;color:#728086}.card h3{font-size:14px;line-height:1.35;margin:7px 0 12px;min-height:38px}.palette-strip{display:flex;height:34px;border-radius:8px;overflow:hidden;border:1px solid #ddd}.swatch{min-width:8px}.palette-labels{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.palette-labels span{font-size:9px;color:#667}.palette-empty{font-size:12px;color:#999}.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:13px 0 0}.metrics div{background:#f5f5f2;border-radius:8px;padding:7px}.metrics dt{font-size:9px;color:#788}.metrics dd{margin:2px 0 0;font-size:13px;font-weight:700}.status{font-size:10px;margin-top:10px}.status.good{color:#31714d}.status.bad{color:#aa3737}.image-error{display:grid;place-items:center;color:#999}@media(max-width:900px){.charts{grid-template-columns:1fr}.wrap{padding:18px}}
</style>
</head>
<body>
<main class="wrap">
  <div class="eyebrow">YOYO · Script B1 · Tone Feature Contract ${escapeHtml(outputPayload.metadata.tone_feature_contract.version)}</div>
  <h1>Y2K Color MVP · B1 Observation Preview</h1>
  <p class="lead">單張圖片客觀色彩觀測。此頁只做人工診斷，不參與 B2 聚合。</p>
  <div class="summary">
    <span class="pill">Total ${outputPayload.metadata.total_items}</span>
    <span class="pill">Success ${outputPayload.metadata.success_count}</span>
    <span class="pill">Failed ${outputPayload.metadata.failure_count}</span>
    <span class="pill">Graphic ${outputPayload.family_counts?.graphic ?? '—'}</span>
    <span class="pill">Core ${outputPayload.family_counts?.core ?? '—'}</span>
    <span class="pill">Fashion ${outputPayload.family_counts?.fashion ?? '—'}</span>
    <span class="pill">Lifestyle ${outputPayload.family_counts?.lifestyle ?? '—'}</span>
  </div>
  <section class="charts">
    <div class="panel"><h2>Mean Chroma × Mean Lightness</h2>${buildScatterSvg(successful)}</div>
    <div class="panel"><h2>Hue Vector Projection</h2>${buildHueSvg(successful)}</div>
  </section>
  <section class="gallery">${cards}</section>
</main>
</body>
</html>`;
}

async function run() {
  const inputPath = path.resolve(process.argv[2] || DEFAULT_INPUT);
  const outputPath = path.resolve(process.argv[3] || DEFAULT_OUTPUT);
  const previewPath = path.resolve(process.argv[4] || DEFAULT_PREVIEW);

  console.log('YOYO Script B1 — Image Color Observation');
  console.log(`Input   : ${inputPath}`);
  console.log(`Output  : ${outputPath}`);
  console.log(`Preview : ${previewPath}`);
  console.log(`ToneCore: ${ToneCore.CONTRACT.name} v${ToneCore.CONTRACT.version}`);

  const { payload, items } = loadEvaluationSet(inputPath);
  console.log(`Items   : ${items.length}`);
  console.log('');

  const observations = [];
  for (let index = 0; index < items.length; index += 1) {
    // Intentionally sequential: predictable memory use and provider-friendly download rate.
    observations.push(await observeOne(items[index], index, items.length));
  }

  const successCount = observations.filter((item) => !item.observation_error).length;
  const failureCount = observations.length - successCount;

  const outputPayload = {
    metadata: {
      name: 'YOYO B1 Image Color Observations',
      step: 'B1_Observation',
      source_set: payload.name || path.basename(inputPath),
      source_run: payload.source_run || null,
      source_file: path.basename(inputPath),
      total_items: observations.length,
      success_count: successCount,
      failure_count: failureCount,
      no_cross_image_aggregation: true,
      tone_feature_contract: {
        ...ToneCore.CONTRACT,
      },
      offline_decoder: {
        library: 'sharp/libvips',
        exif_autorotate: true,
        resize_fit: 'fill',
        note: 'B1 uses decoded pixels and ToneCore; browser-vs-sharp decode/resampling equivalence is a separate cross-runtime concern.',
      },
    },
    selection_rule: payload.selection_rule || null,
    family_counts: payload.family_counts || null,
    items: observations,
  };

  fs.writeFileSync(outputPath, JSON.stringify(outputPayload, null, 2), 'utf8');
  fs.writeFileSync(previewPath, buildPreviewHtml(outputPayload), 'utf8');

  console.log('');
  console.log('B1 completed.');
  console.log(`Success : ${successCount}`);
  console.log(`Failed  : ${failureCount}`);
  console.log(`JSON    : ${outputPath}`);
  console.log(`Preview : ${previewPath}`);

  if (failureCount > 0) {
    console.log('注意：有失敗圖片。先檢查 observation_error，不要直接進 B2。');
    process.exitCode = 2;
  }
}

run().catch((error) => {
  console.error('\nB1 fatal error:', error);
  process.exitCode = 1;
});
