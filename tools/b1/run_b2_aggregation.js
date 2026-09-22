#!/usr/bin/env node
'use strict';

/**
 * YOYO / HueSense — Script B2
 * Objective Color Aggregation
 *
 * Input:
 *   y2k_color_mvp_b1_observations.json
 *
 * Output:
 *   y2k_color_mvp_b2_aggregation.json
 *   b2_preview.html
 *
 * Contract:
 * - 只使用 observed_features
 * - palette
 * - analysis_provenance.feature_reliability
 * - 不使用 derived_quality_features 做客觀 Profile 聚合
 * - Scalar → reliability weighted mean + weighted quantiles
 * - Hue → reliability weighted B1 hueX / hueY
 * - Palette → OKLab agglomerative clustering
 * - Centroid 給機器
 * - Medoid 給人看
 * - 同時輸出 Micro / Family / Macro
 */

const fs = require('fs');
const path = require('path');


// ============================================================
// Paths
// ============================================================

const INPUT_PATH = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(
      __dirname,
      'y2k_color_mvp_b1_observations.json'
    );

const OUTPUT_PATH = path.join(
  __dirname,
  'y2k_color_mvp_b2_aggregation.json'
);

const PREVIEW_PATH = path.join(
  __dirname,
  'b2_preview.html'
);


// ============================================================
// Contract constants
// ============================================================

const B2_VERSION = '1.0.0';

const CLUSTER_MERGE_DISTANCE = 0.045;
const DEFAULT_CLUSTER_CHROMA_WEIGHT = 1.18;

const EPS = 1e-12;
const RATIO_EPS = 1e-8;

const SCALAR_FEATURES = [
  'meanLightness',
  'meanChroma',
  'temperature',
  'contrast',
  'neutralRatio',
  'darkRatio',
  'highChromaRatio',
  'hueConcentration',
  'accentRatio',
  'dominantColorRatio',
  'significantColorCount',
  'paletteEntropy',
  'paletteSpread'
];


// ============================================================
// Basic helpers
// ============================================================

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isFiniteNumber(value) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value)
  );
}

function clamp(value, min, max) {
  return Math.min(
    max,
    Math.max(min, value)
  );
}

function round(value, digits = 6) {

  if (!isFiniteNumber(value)) {
    return value;
  }

  const factor = 10 ** digits;

  return Math.round(
    (value + Number.EPSILON) * factor
  ) / factor;
}

function readJSON(filePath) {

  return JSON.parse(
    fs.readFileSync(
      filePath,
      'utf8'
    )
  );
}


// ============================================================
// Reliability
// ============================================================

function getReliability(item) {

  const reliability =
    item?.analysis_provenance
      ?.feature_reliability;

  assert(
    isFiniteNumber(reliability),
    `Missing feature_reliability: ${item?.id}`
  );

  assert(
    reliability > 0 &&
    reliability <= 1,
    `Invalid feature_reliability for ${item?.id}: ${reliability}`
  );

  return reliability;
}


// ============================================================
// B1 Validation
// ============================================================

function validateB1(data) {

  assert(
    data &&
    typeof data === 'object',
    'B1 input must be an object'
  );

  assert(
    Array.isArray(data.items),
    'B1 input must contain items[]'
  );

  assert(
    data.items.length > 0,
    'B1 items[] is empty'
  );

  for (
    const [index, item]
    of data.items.entries()
  ) {

    const label =
      item?.id ||
      `items[${index}]`;

    assert(
      item &&
      typeof item === 'object',
      `${label}: invalid item`
    );

    assert(
      typeof item.id === 'string' &&
      item.id,
      `${label}: missing id`
    );

    assert(
      typeof item.query_family === 'string' &&
      item.query_family,
      `${label}: missing query_family`
    );

    assert(
      item.observation_error == null,
      `${label}: observation_error is not null`
    );

    getReliability(item);

    assert(
      item.observed_features &&
      typeof item.observed_features === 'object',
      `${label}: missing observed_features`
    );

    for (
      const key of [
        ...SCALAR_FEATURES,
        'hueX',
        'hueY'
      ]
    ) {

      assert(
        isFiniteNumber(
          item.observed_features[key]
        ),
        `${label}: observed_features.${key} must be finite`
      );
    }

    assert(
      Array.isArray(item.palette) &&
      item.palette.length > 0,
      `${label}: invalid palette`
    );

    let ratioSum = 0;

    for (
      const [paletteIndex, swatch]
      of item.palette.entries()
    ) {

      assert(
        typeof swatch.hex === 'string' &&
        /^#[0-9A-Fa-f]{6}$/.test(
          swatch.hex
        ),
        `${label}: palette[${paletteIndex}].hex invalid`
      );

      assert(
        isFiniteNumber(swatch.ratio) &&
        swatch.ratio > 0 &&
        swatch.ratio <= 1,
        `${label}: palette[${paletteIndex}].ratio invalid`
      );

      assert(
        swatch.lab &&
        isFiniteNumber(swatch.lab.L) &&
        isFiniteNumber(swatch.lab.a) &&
        isFiniteNumber(swatch.lab.b),
        `${label}: palette[${paletteIndex}].lab invalid`
      );

      ratioSum += swatch.ratio;
    }

    assert(
      Math.abs(ratioSum - 1)
        <= RATIO_EPS,
      `${label}: palette ratio sum != 1 (${ratioSum})`
    );
  }
}


// ============================================================
// Weighted statistics
// ============================================================

function weightedMean(entries) {

  let totalWeight = 0;
  let weightedTotal = 0;

  for (const entry of entries) {

    totalWeight += entry.weight;

    weightedTotal +=
      entry.value *
      entry.weight;
  }

  assert(
    totalWeight > 0,
    'weightedMean total weight must > 0'
  );

  return (
    weightedTotal /
    totalWeight
  );
}


/**
 * Weighted inverse-CDF quantile
 *
 * 不做 interpolation。
 */
function weightedQuantile(
  entries,
  q
) {

  assert(
    q >= 0 &&
    q <= 1,
    `Invalid quantile: ${q}`
  );

  assert(
    entries.length > 0,
    'weightedQuantile requires entries'
  );

  const sorted = [
    ...entries
  ].sort((a, b) => {

    if (a.value !== b.value) {
      return a.value - b.value;
    }

    return (
      (a.tie || '')
        .localeCompare(
          b.tie || ''
        )
    );
  });

  const totalWeight =
    sorted.reduce(
      (sum, entry) =>
        sum + entry.weight,
      0
    );

  assert(
    totalWeight > 0,
    'weightedQuantile weight must > 0'
  );

  if (q <= 0) {
    return sorted[0].value;
  }

  if (q >= 1) {
    return sorted[
      sorted.length - 1
    ].value;
  }

  const target =
    q *
    totalWeight;

  let cumulative = 0;

  for (const entry of sorted) {

    cumulative += entry.weight;

    if (
      cumulative + EPS >=
      target
    ) {
      return entry.value;
    }
  }

  return sorted[
    sorted.length - 1
  ].value;
}


function weightedStd(
  entries,
  mean
) {

  let totalWeight = 0;
  let total = 0;

  for (const entry of entries) {

    totalWeight += entry.weight;

    const difference =
      entry.value -
      mean;

    total +=
      entry.weight *
      difference *
      difference;
  }

  return Math.sqrt(
    total /
    totalWeight
  );
}


function summarizeWeighted(entries) {

  assert(
    entries.length > 0,
    'summarizeWeighted requires entries'
  );

  const mean =
    weightedMean(entries);

  const p10 =
    weightedQuantile(
      entries,
      0.10
    );

  const p25 =
    weightedQuantile(
      entries,
      0.25
    );

  const median =
    weightedQuantile(
      entries,
      0.50
    );

  const p75 =
    weightedQuantile(
      entries,
      0.75
    );

  const p90 =
    weightedQuantile(
      entries,
      0.90
    );

  const min =
    Math.min(
      ...entries.map(
        entry =>
          entry.value
      )
    );

  const max =
    Math.max(
      ...entries.map(
        entry =>
          entry.value
      )
    );

  const effectiveWeight =
    entries.reduce(
      (sum, entry) =>
        sum + entry.weight,
      0
    );

  return {

    mean,

    median,

    p10,
    p25,
    p75,
    p90,

    min,
    max,

    iqr:
      p75 -
      p25,

    weighted_std:
      weightedStd(
        entries,
        mean
      ),

    effective_weight:
      effectiveWeight,

    sample_count:
      entries.length
  };
}


// ============================================================
// Hue aggregation
// ============================================================

function aggregateHue(items) {

  let sumX = 0;
  let sumY = 0;
  let totalWeight = 0;

  for (const item of items) {

    const reliability =
      getReliability(item);

    /**
     * 注意：
     *
     * B1 hueX / hueY 已經包含：
     *
     * - 像素 chroma weighting
     * - circular hue calculation
     * - within-image concentration
     *
     * 因此 B2 不再乘 meanChroma。
     */

    sumX +=
      item
        .observed_features
        .hueX *
      reliability;

    sumY +=
      item
        .observed_features
        .hueY *
      reliability;

    totalWeight +=
      reliability;
  }

  assert(
    totalWeight > 0,
    'aggregateHue weight must > 0'
  );

  const x =
    sumX /
    totalWeight;

  const y =
    sumY /
    totalWeight;

  const concentration =
    Math.hypot(
      x,
      y
    );

  let hue = null;

  if (
    concentration >
    EPS
  ) {

    hue =
      Math.atan2(
        y,
        x
      ) *
      180 /
      Math.PI;

    if (hue < 0) {
      hue += 360;
    }
  }

  return {

    hue_vector_x:
      x,

    hue_vector_y:
      y,

    dominant_hue:
      hue,

    global_hue_concentration:
      concentration,

    effective_weight:
      totalWeight,

    method:
      'weighted_mean_of_B1_hue_vectors',

    note:
      'B1 hueX/hueY already encode chroma-weighted circular hue; B2 does not multiply meanChroma again.'
  };
}


// ============================================================
// Micro / Family aggregation
// ============================================================

function aggregateGroup(items) {

  const output = {

    image_count:
      items.length,

    effective_weight:
      items.reduce(
        (sum, item) =>
          sum +
          getReliability(item),
        0
      )
  };

  for (
    const key of
    SCALAR_FEATURES
  ) {

    const entries =
      items.map(
        item => ({

          value:
            item
              .observed_features[
                key
              ],

          weight:
            getReliability(
              item
            ),

          tie:
            item.id
        })
      );

    output[key] =
      summarizeWeighted(
        entries
      );
  }

  output.hue_vector =
    aggregateHue(items);

  return output;
}


// ============================================================
// Macro equal-family aggregation
// ============================================================

function aggregateMacro(
  familyStatistics
) {

  const families =
    Object
      .keys(
        familyStatistics
      )
      .sort();

  assert(
    families.length > 0,
    'No families'
  );

  const output = {

    family_count:
      families.length,

    families,

    weighting:
      'equal_family_weight'
  };

  for (
    const key of
    SCALAR_FEATURES
  ) {

    const entries =
      families.map(
        family => ({

          value:
            familyStatistics[
              family
            ][key].mean,

          weight:
            1,

          tie:
            family
        })
      );

    output[key] =
      summarizeWeighted(
        entries
      );
  }


  /**
   * Hue Macro：
   *
   * 每個 family 的 vector
   * 各算 1 票。
   */

  let sumX = 0;
  let sumY = 0;

  for (
    const family
    of families
  ) {

    sumX +=
      familyStatistics[
        family
      ].hue_vector
        .hue_vector_x;

    sumY +=
      familyStatistics[
        family
      ].hue_vector
        .hue_vector_y;
  }

  const x =
    sumX /
    families.length;

  const y =
    sumY /
    families.length;

  const concentration =
    Math.hypot(
      x,
      y
    );

  let hue = null;

  if (
    concentration >
    EPS
  ) {

    hue =
      Math.atan2(
        y,
        x
      ) *
      180 /
      Math.PI;

    if (hue < 0) {
      hue += 360;
    }
  }

  output.hue_vector = {

    hue_vector_x:
      x,

    hue_vector_y:
      y,

    dominant_hue:
      hue,

    global_hue_concentration:
      concentration,

    effective_weight:
      families.length,

    method:
      'equal_family_mean_of_family_hue_vectors'
  };

  return output;
}


// ============================================================
// OKLab distance
// ============================================================

function deltaEOk(
  lab1,
  lab2,
  chromaWeight
) {

  const dL =
    lab1.L -
    lab2.L;

  const da =
    (
      lab1.a -
      lab2.a
    ) *
    chromaWeight;

  const db =
    (
      lab1.b -
      lab2.b
    ) *
    chromaWeight;

  return Math.sqrt(
    dL * dL +
    da * da +
    db * db
  );
}


// ============================================================
// Weighted Lab mean
// ============================================================

function weightedLabMean(
  members
) {

  let totalWeight = 0;

  let L = 0;
  let a = 0;
  let b = 0;

  for (
    const member
    of members
  ) {

    totalWeight +=
      member.weight;

    L +=
      member.lab.L *
      member.weight;

    a +=
      member.lab.a *
      member.weight;

    b +=
      member.lab.b *
      member.weight;
  }

  assert(
    totalWeight > 0,
    'weightedLabMean weight must > 0'
  );

  return {

    L:
      L /
      totalWeight,

    a:
      a /
      totalWeight,

    b:
      b /
      totalWeight
  };
}


// ============================================================
// Build palette swatches
// ============================================================

function buildPaletteSwatches(
  items
) {

  const swatches = [];

  for (
    const item
    of items
  ) {

    const reliability =
      getReliability(
        item
      );

    item.palette.forEach(
      (
        swatch,
        index
      ) => {

        const hex =
          swatch.hex
            .toUpperCase();

        swatches.push({

          member_key:
            `${item.id}::${String(index).padStart(2, '0')}::${hex}`,

          image_id:
            item.id,

          family:
            item.query_family,

          source_domain:
            item.source_domain ||
            null,

          clip_rank:
            item.clip_rank ??
            null,

          hex,

          ratio:
            swatch.ratio,

          reliability,

          /**
           * B2 Palette Weight Contract
           */
          weight:
            swatch.ratio *
            reliability,

          lab: {

            L:
              swatch.lab.L,

            a:
              swatch.lab.a,

            b:
              swatch.lab.b
          }
        });
      }
    );
  }

  return swatches;
}


// ============================================================
// Cluster helpers
// ============================================================

function makeCluster(
  members
) {

  const sortedMembers =
    [...members]
      .sort(
        (a, b) =>
          a.member_key.localeCompare(
            b.member_key
          )
      );

  return {

    members:
      sortedMembers,

    centroid:
      weightedLabMean(
        sortedMembers
      ),

    weight:
      sortedMembers.reduce(
        (sum, member) =>
          sum +
          member.weight,
        0
      ),

    key:
      sortedMembers
        .map(
          member =>
            member.member_key
        )
        .join('|')
  };
}


// ============================================================
// Agglomerative clustering
// ============================================================

function agglomerativeColorClusters(
  swatches,
  mergeDistance,
  chromaWeight
) {

  let clusters =
    swatches.map(
      swatch =>
        makeCluster([
          swatch
        ])
    );

  while (
    clusters.length >
    1
  ) {

    let best = null;

    for (
      let i = 0;
      i < clusters.length;
      i++
    ) {

      for (
        let j = i + 1;
        j < clusters.length;
        j++
      ) {

        const distance =
          deltaEOk(
            clusters[i].centroid,
            clusters[j].centroid,
            chromaWeight
          );

        const tieKey =
          `${clusters[i].key}|||${clusters[j].key}`;

        if (
          best === null ||

          distance <
          best.distance -
          EPS ||

          (
            Math.abs(
              distance -
              best.distance
            ) <= EPS &&

            tieKey <
            best.tieKey
          )
        ) {

          best = {

            i,
            j,

            distance,

            tieKey
          };
        }
      }
    }

    if (
      !best ||
      best.distance >
      mergeDistance +
      EPS
    ) {
      break;
    }

    const merged =
      makeCluster([

        ...clusters[
          best.i
        ].members,

        ...clusters[
          best.j
        ].members
      ]);

    const next = [];

    for (
      let index = 0;
      index <
      clusters.length;
      index++
    ) {

      if (
        index !== best.i &&
        index !== best.j
      ) {

        next.push(
          clusters[index]
        );
      }
    }

    next.push(
      merged
    );

    next.sort(
      (a, b) =>
        a.key.localeCompare(
          b.key
        )
    );

    clusters =
      next;
  }

  return clusters;
}


// ============================================================
// OKLab → sRGB
// ============================================================

function linearToSrgb(c) {

  return (
    c <= 0.0031308
      ?
      12.92 * c
      :
      1.055 *
      Math.pow(
        c,
        1 / 2.4
      ) -
      0.055
  );
}


function oklabToRgb(
  lab
) {

  const l_ =
    lab.L +
    0.3963377774 *
    lab.a +
    0.2158037573 *
    lab.b;

  const m_ =
    lab.L -
    0.1055613458 *
    lab.a -
    0.0638541728 *
    lab.b;

  const s_ =
    lab.L -
    0.0894841775 *
    lab.a -
    1.2914855480 *
    lab.b;

  const l =
    l_ * l_ * l_;

  const m =
    m_ * m_ * m_;

  const s =
    s_ * s_ * s_;

  const rLinear =
    4.0767416621 * l -
    3.3077115913 * m +
    0.2309699292 * s;

  const gLinear =
    -1.2684380046 * l +
    2.6097574011 * m -
    0.3413193965 * s;

  const bLinear =
    -0.0041960863 * l -
    0.7034186147 * m +
    1.7076147010 * s;

  return {

    r:
      Math.round(
        clamp(
          linearToSrgb(
            rLinear
          ),
          0,
          1
        ) *
        255
      ),

    g:
      Math.round(
        clamp(
          linearToSrgb(
            gLinear
          ),
          0,
          1
        ) *
        255
      ),

    b:
      Math.round(
        clamp(
          linearToSrgb(
            bLinear
          ),
          0,
          1
        ) *
        255
      )
  };
}


function rgbToHex(
  { r, g, b }
) {

  return (
    '#' +
    [r, g, b]
      .map(
        value =>
          value
            .toString(16)
            .padStart(
              2,
              '0'
            )
      )
      .join('')
      .toUpperCase()
  );
}


// ============================================================
// Lab → LCH
// ============================================================

function labToLch(
  lab
) {

  const C =
    Math.hypot(
      lab.a,
      lab.b
    );

  let H = null;

  if (C >= 1e-5) {

    H =
      Math.atan2(
        lab.b,
        lab.a
      ) *
      180 /
      Math.PI;

    if (H < 0) {
      H += 360;
    }
  }

  return {

    L:
      lab.L,

    C,

    H
  };
}


// ============================================================
// Medoid
// ============================================================

function pickMedoid(
  cluster,
  chromaWeight
) {

  let best = null;

  for (
    const member
    of cluster.members
  ) {

    const distance =
      deltaEOk(
        member.lab,
        cluster.centroid,
        chromaWeight
      );

    if (
      best === null ||

      distance <
      best.distance -
      EPS ||

      (
        Math.abs(
          distance -
          best.distance
        ) <= EPS &&

        member.weight >
        best.member.weight +
        EPS
      ) ||

      (
        Math.abs(
          distance -
          best.distance
        ) <= EPS &&

        Math.abs(
          member.weight -
          best.member.weight
        ) <= EPS &&

        member.member_key <
        best.member.member_key
      )
    ) {

      best = {

        member,

        distance
      };
    }
  }

  return best;
}


// ============================================================
// Color Mode summary
// ============================================================

function summarizeColorModes(
  clusters,
  items,
  effectiveGlobalWeight,
  chromaWeight
) {

  const reliabilityByImage =
    new Map(
      items.map(
        item => [
          item.id,
          getReliability(item)
        ]
      )
    );

  const modes =
    clusters.map(
      cluster => {

        const imageIds =
          [
            ...new Set(
              cluster.members.map(
                member =>
                  member.image_id
              )
            )
          ].sort();

        const families =
          [
            ...new Set(
              cluster.members.map(
                member =>
                  member.family
              )
            )
          ].sort();

        const weightedImageSupport =
          imageIds.reduce(
            (sum, id) =>
              sum +
              (
                reliabilityByImage
                  .get(id) ||
                0
              ),
            0
          );

        const medoid =
          pickMedoid(
            cluster,
            chromaWeight
          );

        const familyBreakdown = {};

        for (
          const family
          of families
        ) {

          const members =
            cluster.members.filter(
              member =>
                member.family ===
                family
            );

          const familyImageIds =
            [
              ...new Set(
                members.map(
                  member =>
                    member.image_id
                )
              )
            ];

          familyBreakdown[
            family
          ] = {

            image_support:
              familyImageIds.length,

            weighted_image_support:
              familyImageIds.reduce(
                (sum, id) =>
                  sum +
                  (
                    reliabilityByImage
                      .get(id) ||
                    0
                  ),
                0
              ),

            weighted_mass:
              members.reduce(
                (
                  sum,
                  member
                ) =>
                  sum +
                  member.weight,
                0
              )
          };
        }

        return {

          weighted_mass:
            cluster.weight,

          normalized_mass:
            cluster.weight /
            effectiveGlobalWeight,

          member_count:
            cluster.members.length,

          image_support:
            imageIds.length,

          weighted_image_support:
            weightedImageSupport,

          weighted_image_support_ratio:
            weightedImageSupport /
            effectiveGlobalWeight,

          family_support:
            families,

          family_support_count:
            families.length,

          family_breakdown:
            familyBreakdown,

          centroid_lab: {
            ...cluster.centroid
          },

          centroid_lch:
            labToLch(
              cluster.centroid
            ),

          centroid_hex:
            rgbToHex(
              oklabToRgb(
                cluster.centroid
              )
            ),

          representative_medoid: {

            hex:
              medoid.member.hex,

            source_image_id:
              medoid.member.image_id,

            source_family:
              medoid.member.family,

            source_domain:
              medoid.member.source_domain,

            source_clip_rank:
              medoid.member.clip_rank,

            source_ratio:
              medoid.member.ratio,

            source_reliability:
              medoid.member.reliability,

            source_weight:
              medoid.member.weight,

            distance_to_centroid:
              medoid.distance,

            lab: {
              ...medoid.member.lab
            }
          },

          members:
            cluster.members.map(
              member => ({

                image_id:
                  member.image_id,

                family:
                  member.family,

                source_domain:
                  member.source_domain,

                clip_rank:
                  member.clip_rank,

                hex:
                  member.hex,

                ratio:
                  member.ratio,

                reliability:
                  member.reliability,

                weight:
                  member.weight,

                lab: {
                  ...member.lab
                }
              })
            )
        };
      }
    );


  modes.sort(
    (a, b) => {

      if (
        Math.abs(
          b.weighted_mass -
          a.weighted_mass
        ) >
        EPS
      ) {

        return (
          b.weighted_mass -
          a.weighted_mass
        );
      }

      if (
        b.image_support !==
        a.image_support
      ) {

        return (
          b.image_support -
          a.image_support
        );
      }

      return (
        a
          .representative_medoid
          .hex
          .localeCompare(
            b
              .representative_medoid
              .hex
          )
      );
    }
  );


  modes.forEach(
    (
      mode,
      index
    ) => {

      mode.mode_rank =
        index + 1;

      mode.mode_id =
        `mode_${String(index + 1).padStart(2, '0')}`;
    }
  );

  return modes;
}


// ============================================================
// Round output
// ============================================================

function roundedClone(
  value,
  digits = 8
) {

  if (
    typeof value === 'number'
  ) {

    return round(
      value,
      digits
    );
  }

  if (
    Array.isArray(value)
  ) {

    return value.map(
      child =>
        roundedClone(
          child,
          digits
        )
    );
  }

  if (
    value &&
    typeof value === 'object'
  ) {

    const output = {};

    for (
      const [key, child]
      of Object.entries(
        value
      )
    ) {

      output[key] =
        roundedClone(
          child,
          digits
        );
    }

    return output;
  }

  return value;
}


// ============================================================
// Preview helpers
// ============================================================

function featureLabel(
  key
) {

  const labels = {

    meanLightness:
      'Mean Lightness',

    meanChroma:
      'Mean Chroma',

    temperature:
      'Temperature',

    contrast:
      'Image Lightness Contrast',

    neutralRatio:
      'Neutral Ratio',

    darkRatio:
      'Dark Ratio',

    highChromaRatio:
      'High Chroma Ratio',

    hueConcentration:
      'Image Hue Concentration',

    accentRatio:
      'Accent Ratio',

    dominantColorRatio:
      'Dominant Color Ratio',

    significantColorCount:
      'Significant Color Count',

    paletteEntropy:
      'Palette Entropy',

    paletteSpread:
      'Palette Spread'
  };

  return (
    labels[key] ||
    key
  );
}


function escapeHtml(
  value
) {

  return String(value)

    .replace(
      /&/g,
      '&amp;'
    )

    .replace(
      /</g,
      '&lt;'
    )

    .replace(
      />/g,
      '&gt;'
    )

    .replace(
      /"/g,
      '&quot;'
    )

    .replace(
      /'/g,
      '&#039;'
    );
}


// ============================================================
// Box Plot SVG
// ============================================================

function makeBoxPlotSVG(
  stats,
  key
) {

  let domainMin =
    stats.min;

  let domainMax =
    stats.max;

  const fixedDomains = {

    meanLightness:
      [0, 1],

    meanChroma:
      [
        0,
        Math.max(
          0.2,
          stats.max
        )
      ],

    temperature:
      [-1, 1],

    contrast:
      [0, 1],

    neutralRatio:
      [0, 1],

    darkRatio:
      [0, 1],

    highChromaRatio:
      [0, 1],

    hueConcentration:
      [0, 1],

    accentRatio:
      [0, 1],

    dominantColorRatio:
      [0, 1],

    significantColorCount:
      [0, 5],

    paletteEntropy:
      [0, 1],

    paletteSpread:
      [
        0,
        Math.max(
          0.6,
          stats.max
        )
      ]
  };


  if (
    fixedDomains[key]
  ) {

    [
      domainMin,
      domainMax
    ] =
      fixedDomains[key];
  }


  if (
    Math.abs(
      domainMax -
      domainMin
    ) <
    EPS
  ) {

    domainMax =
      domainMin + 1;
  }


  const width = 560;
  const height = 46;

  const padding = 18;

  const x = value =>

    padding +

    (
      clamp(
        value,
        domainMin,
        domainMax
      ) -
      domainMin
    ) /

    (
      domainMax -
      domainMin
    ) *

    (
      width -
      padding * 2
    );


  const y = 23;

  const q1 =
    x(stats.p25);

  const q3 =
    x(stats.p75);

  const median =
    x(stats.median);

  const mean =
    x(stats.mean);

  const p10 =
    x(stats.p10);

  const p90 =
    x(stats.p90);


  return `
<svg
  class="box-svg"
  viewBox="0 0 ${width} ${height}"
  preserveAspectRatio="none"
>
  <line
    x1="${p10}"
    y1="${y}"
    x2="${p90}"
    y2="${y}"
    class="whisker"
  />

  <line
    x1="${p10}"
    y1="${y - 7}"
    x2="${p10}"
    y2="${y + 7}"
    class="whisker"
  />

  <line
    x1="${p90}"
    y1="${y - 7}"
    x2="${p90}"
    y2="${y + 7}"
    class="whisker"
  />

  <rect
    x="${Math.min(q1, q3)}"
    y="${y - 10}"
    width="${Math.max(
      1,
      Math.abs(
        q3 -
        q1
      )
    )}"
    height="20"
    rx="5"
    class="box"
  />

  <line
    x1="${median}"
    y1="${y - 10}"
    x2="${median}"
    y2="${y + 10}"
    class="median"
  />

  <circle
    cx="${mean}"
    cy="${y}"
    r="4"
    class="mean-dot"
  />
</svg>`;
}


// ============================================================
// Generate B2 Preview HTML
// ============================================================

function generatePreviewHTML(
  data
) {

  const families =
    Object.keys(
      data.family_statistics
    );

  const keyMetrics = [

    'meanLightness',
    'meanChroma',
    'contrast',
    'temperature',
    'neutralRatio',
    'darkRatio',
    'accentRatio',
    'paletteEntropy'
  ];


  const microBoxRows =
    keyMetrics.map(
      key => {

        const stats =
          data
            .micro_statistics[
              key
            ];

        return `
<div class="box-row">

  <div class="metric-name">
    ${escapeHtml(
      featureLabel(key)
    )}
  </div>

  <div>
    ${makeBoxPlotSVG(
      stats,
      key
    )}
  </div>

  <div class="numbers">
    P10 ${round(stats.p10, 3)}
    ·
    P25 ${round(stats.p25, 3)}
    ·
    Median ${round(stats.median, 3)}
    ·
    P75 ${round(stats.p75, 3)}
    ·
    P90 ${round(stats.p90, 3)}
    ·
    Mean ${round(stats.mean, 3)}
  </div>

</div>`;
      }
    ).join('');


  const familyRows =
    families.map(
      family => {

        const stats =
          data
            .family_statistics[
              family
            ];

        const hue =
          stats
            .hue_vector
            .dominant_hue;

        return `
<tr>

  <td>
    <span class="family-pill">
      ${escapeHtml(family)}
    </span>
  </td>

  <td>
    ${stats.image_count}
  </td>

  <td>
    ${round(
      stats.effective_weight,
      2
    )}
  </td>

  <td>
    ${round(
      stats
        .meanLightness
        .mean,
      3
    )}
  </td>

  <td>
    ${round(
      stats
        .meanChroma
        .mean,
      3
    )}
  </td>

  <td>
    ${round(
      stats
        .contrast
        .mean,
      3
    )}
  </td>

  <td>
    ${round(
      stats
        .neutralRatio
        .mean,
      3
    )}
  </td>

  <td>
    ${
      hue == null
        ?
        '—'
        :
        round(hue, 1)
    }
  </td>

  <td>
    ${round(
      stats
        .hue_vector
        .global_hue_concentration,
      3
    )}
  </td>

</tr>`;
      }
    ).join('');


  const microMacroRows =
    keyMetrics.map(
      key => {

        const micro =
          data
            .micro_statistics[
              key
            ]
            .mean;

        const macro =
          data
            .macro_statistics[
              key
            ]
            .mean;

        return `
<tr>

  <td>
    ${escapeHtml(
      featureLabel(key)
    )}
  </td>

  <td>
    ${round(
      micro,
      4
    )}
  </td>

  <td>
    ${round(
      macro,
      4
    )}
  </td>

  <td>
    ${round(
      macro -
      micro,
      4
    )}
  </td>

</tr>`;
      }
    ).join('');


  const modeCards =
    data
      .color_modes
      .map(
        mode => {

          return `
<article class="mode-card">

  <div class="mode-top">

    <div class="mode-swatches">

      <div
        class="swatch"
        style="
          background:
          ${escapeHtml(
            mode.centroid_hex
          )}
        "
        title="
          Centroid
          ${escapeHtml(
            mode.centroid_hex
          )}
        "
      ></div>

      <div
        class="swatch medoid"
        style="
          background:
          ${escapeHtml(
            mode
              .representative_medoid
              .hex
          )}
        "
        title="
          Medoid
          ${escapeHtml(
            mode
              .representative_medoid
              .hex
          )}
        "
      ></div>

    </div>

    <div>

      <div class="mode-title">
        ${escapeHtml(
          mode.mode_id
        )}
      </div>

      <div class="muted">
        mass
        ${(
          mode.normalized_mass *
          100
        ).toFixed(1)}
        %
        ·
        ${mode.image_support}
        /
        ${data.metadata.total_images}
        images
      </div>

    </div>

  </div>

  <div class="mode-hexes">

    <b>Centroid</b>
    ${escapeHtml(
      mode.centroid_hex
    )}

    &nbsp;

    <b>Medoid</b>
    ${escapeHtml(
      mode
        .representative_medoid
        .hex
    )}

  </div>

  <div class="support-bar">

    <span
      style="
        width:
        ${Math.min(
          100,
          mode
            .weighted_image_support_ratio *
          100
        )}
        %
      "
    ></span>

  </div>

  <div class="mode-meta">

    <span>
      weighted mass
      ${round(
        mode.weighted_mass,
        3
      )}
    </span>

    <span>
      support
      ${round(
        mode.weighted_image_support,
        2
      )}
    </span>

    <span>
      ${escapeHtml(
        mode
          .family_support
          .join(' · ')
      )}
    </span>

  </div>

  <div class="medoid-source">

    medoid source:
    ${escapeHtml(
      mode
        .representative_medoid
        .source_family
    )}

    · CLIP #

    ${escapeHtml(
      mode
        .representative_medoid
        .source_clip_rank ??
      '—'
    )}

  </div>

</article>`;
        }
      )
      .join('');


  const hue =
    data
      .micro_statistics
      .hue_vector;

  const hueAngle =
    hue.dominant_hue == null
      ?
      0
      :
      hue.dominant_hue;

  const hueLength =
    Math.min(
      1,
      hue.global_hue_concentration
    );


  /**
   * 把整份 B2 JSON
   * 直接嵌入 HTML。
   *
   * 因此 HTML 可以直接雙擊，
   * 不需要 localhost。
   */

  const embeddedJSON =
    JSON.stringify(data)
      .replace(
        /</g,
        '\\u003c'
      );


  return `
<!doctype html>

<html lang="zh-Hant">

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="
    width=device-width,
    initial-scale=1
  "
>

<title>
YOYO B2 Aggregation Preview
</title>

<style>

:root {
  font-family:
    Inter,
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;

  color:
    #1d1d1f;

  background:
    #f5f2eb;
}

* {
  box-sizing:
    border-box;
}

body {
  margin:
    0;

  padding:
    32px;
}

main {
  max-width:
    1480px;

  margin:
    auto;
}

h1 {
  font-size:
    28px;

  margin:
    0 0 6px;
}

h2 {
  font-size:
    19px;

  margin:
    0 0 16px;
}

p {
  line-height:
    1.55;
}

.muted {
  color:
    #777;

  font-size:
    12px;
}

.header {
  display:
    flex;

  justify-content:
    space-between;

  gap:
    24px;

  align-items:
    flex-start;

  margin-bottom:
    22px;
}

.badge {
  font-size:
    12px;

  background:
    #111;

  color:
    #fff;

  border-radius:
    999px;

  padding:
    7px 10px;

  white-space:
    nowrap;
}

.cards {
  display:
    grid;

  grid-template-columns:
    repeat(
      4,
      minmax(
        0,
        1fr
      )
    );

  gap:
    12px;

  margin:
    18px 0 22px;
}

.stat {
  background:
    #fff;

  border:
    1px solid
    #ddd7cd;

  border-radius:
    16px;

  padding:
    16px;
}

.stat b {
  display:
    block;

  font-size:
    25px;

  margin-top:
    7px;
}

.panel {
  background:
    #fff;

  border:
    1px solid
    #ddd7cd;

  border-radius:
    18px;

  padding:
    20px;

  margin-bottom:
    18px;

  overflow:
    hidden;
}

.box-row {
  display:
    grid;

  grid-template-columns:
    190px
    minmax(
      300px,
      1fr
    )
    460px;

  gap:
    12px;

  align-items:
    center;

  padding:
    9px 0;

  border-bottom:
    1px solid
    #eee;
}

.box-row:last-child {
  border-bottom:
    0;
}

.metric-name {
  font-weight:
    650;
}

.numbers {
  font-size:
    11px;

  color:
    #666;
}

.box-svg {
  width:
    100%;

  height:
    46px;
}

.whisker {
  stroke:
    #777;

  stroke-width:
    1.5;
}

.box {
  fill:
    #ddd;

  stroke:
    #888;
}

.median {
  stroke:
    #111;

  stroke-width:
    2;
}

.mean-dot {
  fill:
    #111;
}

table {
  width:
    100%;

  border-collapse:
    collapse;

  font-size:
    13px;
}

th,
td {
  text-align:
    right;

  border-bottom:
    1px solid
    #eee;

  padding:
    10px 8px;
}

th:first-child,
td:first-child {
  text-align:
    left;
}

.family-pill {
  background:
    #eef0ef;

  border-radius:
    999px;

  padding:
    5px 8px;

  font-weight:
    650;
}

.hue-grid {
  display:
    grid;

  grid-template-columns:
    220px 1fr;

  gap:
    28px;

  align-items:
    center;
}

.hue-disc {
  width:
    180px;

  height:
    180px;

  border-radius:
    50%;

  background:
    conic-gradient(
      from 0deg,
      #f44,
      #ff0,
      #4d4,
      #0dd,
      #44f,
      #f4f,
      #f44
    );

  position:
    relative;

  margin:
    auto;
}

.hue-disc::after {
  content:
    "";

  position:
    absolute;

  inset:
    18px;

  border-radius:
    50%;

  background:
    #fff;
}

.hue-vector {
  position:
    absolute;

  left:
    90px;

  top:
    89px;

  width:
    ${Math.max(
      4,
      70 *
      hueLength
    )}px;

  height:
    3px;

  background:
    #111;

  transform-origin:
    0 50%;

  transform:
    rotate(
      ${hueAngle}deg
    );

  z-index:
    3;
}

.hue-vector::after {
  content:
    "";

  position:
    absolute;

  right:
    -3px;

  top:
    -4px;

  border-left:
    8px solid
    #111;

  border-top:
    5px solid
    transparent;

  border-bottom:
    5px solid
    transparent;
}

.hue-center {
  position:
    absolute;

  width:
    10px;

  height:
    10px;

  border-radius:
    50%;

  background:
    #111;

  left:
    85px;

  top:
    85px;

  z-index:
    4;
}

.modes {
  display:
    grid;

  grid-template-columns:
    repeat(
      4,
      minmax(
        0,
        1fr
      )
    );

  gap:
    12px;
}

.mode-card {
  border:
    1px solid
    #e1ddd5;

  border-radius:
    14px;

  padding:
    14px;

  background:
    #fcfbf8;
}

.mode-top {
  display:
    flex;

  gap:
    12px;

  align-items:
    center;
}

.mode-swatches {
  display:
    flex;
}

.swatch {
  width:
    54px;

  height:
    54px;

  border-radius:
    12px;

  border:
    1px solid
    rgba(
      0,
      0,
      0,
      .12
    );
}

.swatch.medoid {
  margin-left:
    -13px;

  border:
    3px solid
    #fff;

  box-shadow:
    0 0 0 1px
    rgba(
      0,
      0,
      0,
      .15
    );
}

.mode-title {
  font-weight:
    750;
}

.mode-hexes {
  font-size:
    12px;

  margin:
    12px 0 8px;
}

.support-bar {
  height:
    6px;

  border-radius:
    99px;

  background:
    #e9e5dd;

  overflow:
    hidden;
}

.support-bar span {
  display:
    block;

  height:
    100%;

  background:
    #333;
}

.mode-meta {
  font-size:
    11px;

  color:
    #555;

  display:
    flex;

  flex-wrap:
    wrap;

  gap:
    6px 10px;

  margin-top:
    8px;
}

.medoid-source {
  font-size:
    10px;

  color:
    #888;

  margin-top:
    8px;
}

.note {
  font-size:
    12px;

  background:
    #f6f4ef;

  border-radius:
    12px;

  padding:
    12px;

  margin-top:
    12px;
}

.footer {
  font-size:
    11px;

  color:
    #777;

  margin-top:
    18px;
}


@media (
  max-width:
  1100px
) {

  .cards,
  .modes {
    grid-template-columns:
      repeat(
        2,
        1fr
      );
  }

  .box-row {
    grid-template-columns:
      160px 1fr;
  }

  .numbers {
    grid-column:
      2;
  }

  .hue-grid {
    grid-template-columns:
      1fr;
  }
}


@media (
  max-width:
  650px
) {

  body {
    padding:
      15px;
  }

  .cards,
  .modes {
    grid-template-columns:
      1fr;
  }

  .header {
    display:
      block;
  }

  .box-row {
    display:
      block;
  }

  .numbers {
    margin-top:
      4px;
  }
}

</style>

</head>


<body>

<main>


<div class="header">

  <div>

    <h1>
      YOYO Script B2 —
      Aggregation Preview
    </h1>

    <p class="muted">
      Objective aggregation only ·
      derived_quality_features are
      excluded from B2 profile learning.
    </p>

  </div>

  <div class="badge">
    B2 Contract v
    ${escapeHtml(
      data
        .metadata
        .b2_contract
        .version
    )}
  </div>

</div>


<section class="cards">

  <div class="stat">

    <span class="muted">
      Images
    </span>

    <b>
      ${data.metadata.total_images}
    </b>

  </div>


  <div class="stat">

    <span class="muted">
      Effective weight
    </span>

    <b>
      ${round(
        data
          .metadata
          .effective_global_weight,
        2
      )}
    </b>

  </div>


  <div class="stat">

    <span class="muted">
      Families
    </span>

    <b>
      ${families.length}
    </b>

  </div>


  <div class="stat">

    <span class="muted">
      Natural color modes
    </span>

    <b>
      ${data.color_modes.length}
    </b>

  </div>

</section>


<section class="panel">

  <h2>
    Micro weighted distributions
  </h2>

  <p class="muted">
    Whiskers = P10–P90 ·
    box = P25–P75 ·
    line = median ·
    dot = weighted mean.
  </p>

  ${microBoxRows}

</section>


<section class="panel">

  <h2>
    Micro vs equal-family Macro
  </h2>

  <table>

    <thead>

      <tr>

        <th>
          Metric
        </th>

        <th>
          Micro μ
        </th>

        <th>
          Macro μ
        </th>

        <th>
          Macro − Micro
        </th>

      </tr>

    </thead>

    <tbody>

      ${microMacroRows}

    </tbody>

  </table>

  <div class="note">

    Macro is calculated from each
    family's reliability-weighted mean,
    then gives each family one equal vote.

    It is not an estimate of real-world
    Y2K prevalence.

  </div>

</section>


<section class="panel">

  <h2>
    Family statistics
  </h2>

  <table>

    <thead>

      <tr>

        <th>
          Family
        </th>

        <th>
          N
        </th>

        <th>
          Eff. W
        </th>

        <th>
          L
        </th>

        <th>
          C
        </th>

        <th>
          Contrast
        </th>

        <th>
          Neutral
        </th>

        <th>
          Hue°
        </th>

        <th>
          Hue conc.
        </th>

      </tr>

    </thead>

    <tbody>

      ${familyRows}

    </tbody>

  </table>

</section>


<section class="panel">

  <h2>
    Global hue vector
  </h2>

  <div class="hue-grid">

    <div class="hue-disc">

      <div class="hue-vector">
      </div>

      <div class="hue-center">
      </div>

    </div>

    <div>

      <p>

        <b>
          Dominant hue:
        </b>

        ${
          hue.dominant_hue == null
            ?
            'none'
            :
            round(
              hue.dominant_hue,
              1
            ) + '°'
        }

      </p>

      <p>

        <b>
          Global hue concentration:
        </b>

        ${round(
          hue.global_hue_concentration,
          4
        )}

      </p>

      <p class="muted">

        A short vector is meaningful:
        multiple hue directions cancel
        each other.

        B2 directly aggregates the
        B1 hueX / hueY vectors.

      </p>

    </div>

  </div>

</section>


<section class="panel">

  <h2>
    Natural OKLab Color Modes
  </h2>

  <p class="muted">

    Sorted by weighted mass.

    Left swatch = weighted centroid
    for machine calculation.

    Overlapping swatch =
    original-source medoid
    for human display.

    No fixed K.

  </p>

  <div class="modes">

    ${modeCards}

  </div>

</section>


<div class="footer">

  Cluster threshold ΔE_OK ≤
  ${
    data
      .metadata
      .b2_contract
      .palette_clustering
      .merge_distance
  };

  chroma weight
  ${
    data
      .metadata
      .b2_contract
      .palette_clustering
      .chroma_weight
  }.

  This threshold is an engineering
  heuristic and is recorded explicitly.

</div>


<script>

window.__B2_DATA__ =
${embeddedJSON};

</script>


</main>

</body>

</html>`;
}


// ============================================================
// MAIN
// ============================================================

function main() {

  console.log(
    'YOYO Script B2 — Objective Color Aggregation'
  );

  console.log(
    `Input   : ${INPUT_PATH}`
  );

  console.log(
    `Output  : ${OUTPUT_PATH}`
  );

  console.log(
    `Preview : ${PREVIEW_PATH}`
  );


  // ----------------------------------------------------------
  // Read B1
  // ----------------------------------------------------------

  const b1 =
    readJSON(
      INPUT_PATH
    );


  // ----------------------------------------------------------
  // Validate B1 Contract
  // ----------------------------------------------------------

  validateB1(
    b1
  );


  const items =
    b1.items;


  const families =
    [
      ...new Set(
        items.map(
          item =>
            item.query_family
        )
      )
    ].sort();


  const effectiveGlobalWeight =
    items.reduce(
      (
        sum,
        item
      ) =>
        sum +
        getReliability(
          item
        ),
      0
    );


  const clusterChromaWeight =
    b1
      ?.metadata
      ?.tone_feature_contract
      ?.clusterChromaWeight
    ??
    DEFAULT_CLUSTER_CHROMA_WEIGHT;


  // ----------------------------------------------------------
  // Micro
  // ----------------------------------------------------------

  const microStatistics =
    aggregateGroup(
      items
    );


  // ----------------------------------------------------------
  // Family
  // ----------------------------------------------------------

  const familyStatistics = {};

  for (
    const family
    of families
  ) {

    const familyItems =
      items.filter(
        item =>
          item.query_family ===
          family
      );

    familyStatistics[
      family
    ] =
      aggregateGroup(
        familyItems
      );
  }


  // ----------------------------------------------------------
  // Macro
  // ----------------------------------------------------------

  const macroStatistics =
    aggregateMacro(
      familyStatistics
    );


  // ----------------------------------------------------------
  // Palette
  // ----------------------------------------------------------

  const swatches =
    buildPaletteSwatches(
      items
    );


  const rawPaletteMass =
    swatches.reduce(
      (
        sum,
        swatch
      ) =>
        sum +
        swatch.weight,
      0
    );


  /**
   * 因為每張圖 palette ratio ≈ 1：
   *
   * Σ swatch ratio × reliability
   *
   * 應等於
   *
   * Σ image reliability
   */

  assert(
    Math.abs(
      rawPaletteMass -
      effectiveGlobalWeight
    ) <=
    1e-7,

    `Palette mass ${rawPaletteMass} != effective image weight ${effectiveGlobalWeight}`
  );


  const clusters =
    agglomerativeColorClusters(

      swatches,

      CLUSTER_MERGE_DISTANCE,

      clusterChromaWeight
    );


  const colorModes =
    summarizeColorModes(

      clusters,

      items,

      effectiveGlobalWeight,

      clusterChromaWeight
    );


  // ----------------------------------------------------------
  // Output
  // ----------------------------------------------------------

  const result = {

    metadata: {

      name:
        'YOYO B2 Objective Color Aggregation',

      step:
        'B2_Aggregation',

      version:
        B2_VERSION,

      source_file:
        path.basename(
          INPUT_PATH
        ),

      source_step:
        b1?.metadata?.step ||
        'B1_Observation',

      source_set:
        b1?.metadata?.source_set ||
        null,

      total_images:
        items.length,

      effective_global_weight:
        effectiveGlobalWeight,

      family_count:
        families.length,

      families,

      fallback_image_count:
        items.filter(
          item =>
            item
              ?.analysis_provenance
              ?.fallback_used ===
            true
        ).length,

      raw_palette_swatch_count:
        swatches.length,

      natural_color_mode_count:
        colorModes.length,

      no_derived_quality_features_in_objective_aggregation:
        true,

      b2_contract: {

        version:
          B2_VERSION,

        reliability_weighting:
          'linear feature_reliability; 0.85 contributes 0.85 vote, not an 85% probability claim',

        scalar_statistics:
          'reliability-weighted mean + inverse-CDF weighted quantiles; no winsorization',

        hue_aggregation:
          'reliability-weighted mean of B1 hueX/hueY; B1 vectors already encode within-image chroma weighting',

        micro_view:
          'all images weighted by feature_reliability',

        family_view:
          'within-family reliability-weighted aggregation',

        macro_view:
          'equal-family aggregation of family-level means/vectors; not a prevalence estimate',

        palette_weight:
          'swatch_weight = palette_ratio × image_feature_reliability',

        palette_clustering: {

          method:
            'deterministic agglomerative centroid-linkage in OKLab',

          merge_distance:
            CLUSTER_MERGE_DISTANCE,

          distance:
            'deltaE_OK-like Euclidean distance with chroma axis weight',

          chroma_weight:
            clusterChromaWeight,

          fixed_k:
            false,

          drop_small_modes:
            false,

          note:
            'merge_distance is an engineering heuristic, not a literature-derived psychological threshold'
        },

        representative_color:
          'centroid for machine distance; original-swatch medoid for human display',

        derived_quality_policy:
          'excluded from objective B2 aggregation'
      }
    },


    micro_statistics:
      microStatistics,


    family_statistics:
      familyStatistics,


    macro_statistics:
      macroStatistics,


    color_modes:
      colorModes
  };


  const rounded =
    roundedClone(
      result,
      8
    );


  // ----------------------------------------------------------
  // Write JSON
  // ----------------------------------------------------------

  fs.writeFileSync(

    OUTPUT_PATH,

    JSON.stringify(
      rounded,
      null,
      2
    ) + '\n',

    'utf8'
  );


  // ----------------------------------------------------------
  // Write HTML
  // ----------------------------------------------------------

  fs.writeFileSync(

    PREVIEW_PATH,

    generatePreviewHTML(
      rounded
    ),

    'utf8'
  );


  // ----------------------------------------------------------
  // Console summary
  // ----------------------------------------------------------

  console.log(
    `Images              : ${items.length}`
  );

  console.log(
    `Effective weight    : ${round(
      effectiveGlobalWeight,
      4
    )}`
  );

  console.log(
    `Families            : ${families.join(', ')}`
  );

  console.log(
    `Palette swatches    : ${swatches.length}`
  );

  console.log(
    `Natural color modes : ${colorModes.length}`
  );

  console.log(
    `Micro mean L        : ${round(
      microStatistics
        .meanLightness
        .mean,
      4
    )}`
  );

  console.log(
    `Macro mean L        : ${round(
      macroStatistics
        .meanLightness
        .mean,
      4
    )}`
  );

  console.log(
    `Global hue          : ${
      microStatistics
        .hue_vector
        .dominant_hue == null

        ?
        'none'

        :
        round(
          microStatistics
            .hue_vector
            .dominant_hue,
          2
        ) + '°'
    }`
  );

  console.log(
    `Hue concentration   : ${round(
      microStatistics
        .hue_vector
        .global_hue_concentration,
      4
    )}`
  );

  console.log(
    '\nB2 completed.'
  );
}


// ============================================================
// Execute
// ============================================================

try {

  main();

} catch (error) {

  console.error(
    '\nB2 FAILED:',
    error.stack ||
    error.message
  );

  process.exit(1);
}