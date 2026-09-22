#!/usr/bin/env node
'use strict';

/**
 * YOYO / HueSense
 * B3 Threshold Sensitivity Experiment
 *
 * Purpose
 * ------------------------------------------------------------
 * 從同一批 B1 palette swatches 出發，分別以：
 *
 *   0.045
 *   0.055
 *   0.065
 *
 * 重跑完整 Agglomerative Clustering，
 * 再套用完全相同的 provisional B3-A classification。
 *
 * 最後以 0.045 baseline mode 為 reference unit，
 * 建立 cluster lineage，分析：
 *
 * 1. Classification flip
 * 2. Mass-weighted flip
 * 3. Support-weighted flip
 * 4. Core promotion / demotion
 * 5. Scope flip
 * 6. Family coverage instability
 *
 * IMPORTANT
 * ------------------------------------------------------------
 * - 這不是正式 B3 Contract。
 * - B3 classification rules 目前只是 sensitivity challenger。
 * - 不做任何 Y2K semantic naming。
 * - 不做 Warm Brown / Tech Silver / Cyber Blue 等命名。
 * - 不刪除任何 mode。
 */


const fs = require('fs');
const path = require('path');


// ============================================================
// Paths
// ============================================================

const B1_PATH = path.join(
  __dirname,
  'y2k_color_mvp_b1_observations.json'
);

const B2_PATH = path.join(
  __dirname,
  'y2k_color_mvp_b2_aggregation.json'
);

const OUTPUT_PATH = path.join(
  __dirname,
  'b3_threshold_sensitivity.json'
);


// ============================================================
// Experiment constants
// ============================================================

const THRESHOLDS = [
  0.045,
  0.055,
  0.065
];

const BASELINE_THRESHOLD = 0.045;

const DEFAULT_CHROMA_WEIGHT = 1.18;

const EPS = 1e-12;


// ============================================================
// Provisional B3-A Contract
//
// 注意：
// 這些規則只用來做 sensitivity experiment，
// 還不是 final production contract。
// ============================================================

const PROVISIONAL_RULES = {

  core: {
    min_family_coverage: 0.75,
    min_support_ratio: 0.20,
    min_mass_percentile: 0.70
  },

  cross_family_secondary: {
    min_family_coverage: 0.50,
    min_support_ratio: 0.10
  },

  family_specific_secondary: {
    min_family_weighted_image_support: 1.70,
    min_within_family_support_ratio: 0.25
  },

  scope_global: {
    min_family_coverage: 0.75,
    min_family_entropy: 0.65
  },

  scope_cross_family: {
    min_family_coverage: 0.50
  },

  accent_candidate: {
    min_chroma_percentile: 0.75,
    max_mass_percentile: 0.60
  },

  dark_candidate: {
    max_lightness_percentile: 0.25
  },

  light_candidate: {
    min_lightness_percentile: 0.75
  },

  neutral_candidate: {
    max_chroma_percentile: 0.25
  }
};


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


function readJSON(filePath) {

  assert(
    fs.existsSync(filePath),
    `找不到檔案：${filePath}`
  );

  return JSON.parse(
    fs.readFileSync(
      filePath,
      'utf8'
    )
  );
}


function round(value, digits = 8) {

  if (!isFiniteNumber(value)) {
    return value;
  }

  const factor =
    10 ** digits;

  return Math.round(
    (value + Number.EPSILON) *
    factor
  ) / factor;
}


function roundedClone(
  value,
  digits = 8
) {

  if (typeof value === 'number') {

    return round(
      value,
      digits
    );
  }

  if (Array.isArray(value)) {

    return value.map(
      item =>
        roundedClone(
          item,
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
      of Object.entries(value)
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


function uniqueSorted(values) {

  return [
    ...new Set(values)
  ].sort();
}


function thresholdKey(value) {

  return value.toFixed(3);
}


// ============================================================
// Reliability
// ============================================================

function getReliability(item) {

  const reliability =
    item
      ?.analysis_provenance
      ?.feature_reliability;

  assert(
    isFiniteNumber(reliability),
    `Missing feature_reliability: ${item?.id}`
  );

  assert(
    reliability > 0 &&
    reliability <= 1,
    `Invalid feature_reliability: ${item?.id}`
  );

  return reliability;
}


// ============================================================
// EXACT SAME B2 distance
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
// Lab → LCH
// ============================================================

function labToLch(lab) {

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
    L: lab.L,
    C,
    H
  };
}


// ============================================================
// B1 validation
// ============================================================

function validateB1(b1) {

  assert(
    b1 &&
    Array.isArray(b1.items),
    'B1 JSON missing items[]'
  );

  assert(
    b1.items.length > 0,
    'B1 items[] is empty'
  );

  for (const item of b1.items) {

    assert(
      typeof item.id === 'string' &&
      item.id,
      'B1 item missing id'
    );

    assert(
      typeof item.query_family === 'string' &&
      item.query_family,
      `${item.id}: missing query_family`
    );

    getReliability(item);

    assert(
      Array.isArray(item.palette) &&
      item.palette.length > 0,
      `${item.id}: missing palette`
    );

    for (const swatch of item.palette) {

      assert(
        typeof swatch.hex === 'string',
        `${item.id}: palette hex missing`
      );

      assert(
        isFiniteNumber(swatch.ratio),
        `${item.id}: palette ratio invalid`
      );

      assert(
        swatch.lab &&
        isFiniteNumber(swatch.lab.L) &&
        isFiniteNumber(swatch.lab.a) &&
        isFiniteNumber(swatch.lab.b),
        `${item.id}: palette lab invalid`
      );
    }
  }
}


// ============================================================
// Build family metadata
// ============================================================

function buildFamilyMetadata(b1) {

  const families =
    uniqueSorted(
      b1.items.map(
        item =>
          item.query_family
      )
    );

  const output = {};

  for (const family of families) {

    const items =
      b1.items.filter(
        item =>
          item.query_family ===
          family
      );

    output[family] = {

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
  }

  return {
    families,
    family_metadata:
      output
  };
}


// ============================================================
// Build original B1 swatches
// ============================================================

function buildSwatches(b1) {

  const swatches = [];

  for (const item of b1.items) {

    const reliability =
      getReliability(item);

    item.palette.forEach(
      (
        swatch,
        paletteIndex
      ) => {

        const hex =
          swatch.hex
            .toUpperCase();

        swatches.push({

          member_key:
            `${item.id}::${String(
              paletteIndex
            ).padStart(
              2,
              '0'
            )}::${hex}`,

          image_id:
            item.id,

          family:
            item.query_family,

          hex,

          ratio:
            swatch.ratio,

          reliability,

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
// Weighted Lab centroid
// ============================================================

function weightedLabMean(members) {

  let totalWeight = 0;

  let L = 0;
  let a = 0;
  let b = 0;

  for (const member of members) {

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
    'Cluster weight must > 0'
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
// Cluster
// ============================================================

function makeCluster(members) {

  const sortedMembers =
    [...members].sort(
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

    weighted_mass:
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
// Find closest pair
// ============================================================

function findBestPair(
  clusters,
  chromaWeight
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

  return best;
}


// ============================================================
// Full clustering from raw swatches
// ============================================================

function clusterAtThreshold(
  swatches,
  threshold,
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

    const best =
      findBestPair(
        clusters,
        chromaWeight
      );

    if (
      !best ||
      best.distance >
      threshold +
      EPS
    ) {
      break;
    }

    const clusterA =
      clusters[best.i];

    const clusterB =
      clusters[best.j];

    const merged =
      makeCluster([

        ...clusterA.members,

        ...clusterB.members
      ]);

    const next = [];

    for (
      let index = 0;
      index < clusters.length;
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
// Medoid
// ============================================================

function pickMedoid(
  cluster,
  chromaWeight
) {

  let best = null;

  for (const member of cluster.members) {

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

  return best.member;
}


// ============================================================
// Normalized Shannon entropy
//
// p = 0 時直接忽略，避免 log(0)。
// ============================================================

function normalizedEntropy(values) {

  assert(
    Array.isArray(values) &&
    values.length > 0,
    'Entropy requires values[]'
  );

  const total =
    values.reduce(
      (sum, value) =>
        sum + value,
      0
    );

  if (
    total <= EPS ||
    values.length <= 1
  ) {
    return 0;
  }

  let entropy = 0;

  for (const value of values) {

    if (value <= 0) {
      continue;
    }

    const p =
      value /
      total;

    entropy -=
      p *
      Math.log(p);
  }

  return (
    entropy /
    Math.log(
      values.length
    )
  );
}


// ============================================================
// Percentile rank
//
// 使用 tie-aware midrank。
// 最小值 = 0
// 最大值 = 1
// ============================================================

function assignPercentileRanks(
  modes,
  valueGetter,
  outputKey
) {

  const sorted =
    modes
      .map(
        (
          mode,
          index
        ) => ({

          index,

          value:
            valueGetter(mode)
        })
      )
      .sort(
        (a, b) =>
          a.value -
          b.value
      );

  const n =
    sorted.length;

  if (n === 1) {

    modes[
      sorted[0].index
    ][outputKey] = 1;

    return;
  }

  let start = 0;

  while (start < n) {

    let end = start;

    while (
      end + 1 < n &&
      Math.abs(
        sorted[end + 1].value -
        sorted[start].value
      ) <= EPS
    ) {

      end++;
    }

    const averageRank =
      (
        start +
        end
      ) /
      2;

    const percentile =
      averageRank /
      (
        n -
        1
      );

    for (
      let i = start;
      i <= end;
      i++
    ) {

      modes[
        sorted[i].index
      ][outputKey] =
        percentile;
    }

    start =
      end + 1;
  }
}


// ============================================================
// Build mode summaries
// ============================================================

function summarizeModes(
  clusters,
  context,
  threshold
) {

  const {
    b1,
    families,
    familyMetadata,
    effectiveGlobalWeight,
    chromaWeight
  } = context;


  const reliabilityByImage =
    new Map(
      b1.items.map(
        item => [
          item.id,
          getReliability(item)
        ]
      )
    );


  const modes =
    clusters.map(
      cluster => {

        const medoid =
          pickMedoid(
            cluster,
            chromaWeight
          );

        const centroidLch =
          labToLch(
            cluster.centroid
          );


        // ----------------------------------------------
        // Image support
        // ----------------------------------------------

        const imageIds =
          uniqueSorted(
            cluster.members.map(
              member =>
                member.image_id
            )
          );

        const weightedImageSupport =
          imageIds.reduce(
            (sum, imageId) =>
              sum +
              (
                reliabilityByImage
                  .get(imageId) ||
                0
              ),
            0
          );


        // ----------------------------------------------
        // Family breakdown
        // ----------------------------------------------

        const familyBreakdown = {};

        const familyMassValues = [];

        const familySupport = [];


        for (const family of families) {

          const familyMembers =
            cluster.members.filter(
              member =>
                member.family ===
                family
            );

          const familyMass =
            familyMembers.reduce(
              (sum, member) =>
                sum +
                member.weight,
              0
            );


          const familyImageIds =
            uniqueSorted(
              familyMembers.map(
                member =>
                  member.image_id
              )
            );


          const familyWeightedImageSupport =
            familyImageIds.reduce(
              (sum, imageId) =>
                sum +
                (
                  reliabilityByImage
                    .get(imageId) ||
                  0
                ),
              0
            );


          const familyTotalWeight =
            familyMetadata[
              family
            ].effective_weight;


          const withinFamilySupportRatio =
            familyTotalWeight > 0
              ?
              familyWeightedImageSupport /
              familyTotalWeight
              :
              0;


          familyBreakdown[
            family
          ] = {

            weighted_mass:
              familyMass,

            image_support:
              familyImageIds.length,

            weighted_image_support:
              familyWeightedImageSupport,

            within_family_support_ratio:
              withinFamilySupportRatio
          };


          familyMassValues.push(
            familyMass
          );


          if (
            familyMembers.length > 0
          ) {

            familySupport.push(
              family
            );
          }
        }


        // ----------------------------------------------
        // Family entropy
        // ----------------------------------------------

        const familyEntropy =
          normalizedEntropy(
            familyMassValues
          );


        const familyCoverage =
          familySupport.length /
          families.length;


        // ----------------------------------------------
        // Strongest family
        // ----------------------------------------------

        let strongestFamily = null;

        let strongestFamilyMass =
          -Infinity;


        for (const family of families) {

          const familyMass =
            familyBreakdown[
              family
            ].weighted_mass;

          if (
            familyMass >
            strongestFamilyMass
          ) {

            strongestFamilyMass =
              familyMass;

            strongestFamily =
              family;
          }
        }


        const strongestFamilyMassShare =
          cluster.weighted_mass > 0
            ?
            strongestFamilyMass /
            cluster.weighted_mass
            :
            0;


        const strongestFamilyInfo =
          familyBreakdown[
            strongestFamily
          ];


        return {

          threshold,

          cluster_key:
            cluster.key,

          member_count:
            cluster.members.length,

          member_keys:
            cluster.members.map(
              member =>
                member.member_key
            ),

          weighted_mass:
            cluster.weighted_mass,

          normalized_mass:
            cluster.weighted_mass /
            effectiveGlobalWeight,

          image_support:
            imageIds.length,

          weighted_image_support:
            weightedImageSupport,

          weighted_image_support_ratio:
            weightedImageSupport /
            effectiveGlobalWeight,

          family_support:
            familySupport,

          family_support_count:
            familySupport.length,

          family_coverage:
            familyCoverage,

          family_entropy:
            familyEntropy,

          family_breakdown:
            familyBreakdown,

          strongest_family:
            strongestFamily,

          strongest_family_mass_share:
            strongestFamilyMassShare,

          strongest_family_weighted_image_support:
            strongestFamilyInfo
              .weighted_image_support,

          strongest_family_within_support_ratio:
            strongestFamilyInfo
              .within_family_support_ratio,

          centroid_lab: {
            ...cluster.centroid
          },

          centroid_lch:
            centroidLch,

          representative_medoid: {

            hex:
              medoid.hex,

            source_image_id:
              medoid.image_id,

            source_family:
              medoid.family,

            ratio:
              medoid.ratio,

            reliability:
              medoid.reliability
          }
        };
      }
    );


  // ==========================================================
  // Percentile ranks
  // ==========================================================

  assignPercentileRanks(
    modes,
    mode =>
      mode.weighted_mass,
    'mass_percentile'
  );


  assignPercentileRanks(
    modes,
    mode =>
      mode.centroid_lch.C,
    'chroma_percentile'
  );


  assignPercentileRanks(
    modes,
    mode =>
      mode.centroid_lch.L,
    'lightness_percentile'
  );


  // ==========================================================
  // Provisional classification
  // ==========================================================

  for (const mode of modes) {

    applyProvisionalClassification(
      mode
    );
  }


  // ==========================================================
  // Sort exactly like B2 style
  // ==========================================================

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

      mode.mode_id =
        `mode_${String(
          index + 1
        ).padStart(
          2,
          '0'
        )}`;
    }
  );


  return modes;
}


// ============================================================
// Provisional B3 classification
// ============================================================

function applyProvisionalClassification(
  mode
) {

  const rules =
    PROVISIONAL_RULES;


  // ----------------------------------------------------------
  // Evidence Tier
  // ----------------------------------------------------------

  let evidenceTier =
    'rare';


  const qualifiesCore =

    mode.family_coverage >=
      rules
        .core
        .min_family_coverage

    &&

    mode.weighted_image_support_ratio >=
      rules
        .core
        .min_support_ratio

    &&

    mode.mass_percentile >=
      rules
        .core
        .min_mass_percentile;


  const qualifiesCrossFamilySecondary =

    mode.family_coverage >=
      rules
        .cross_family_secondary
        .min_family_coverage

    &&

    mode.weighted_image_support_ratio >=
      rules
        .cross_family_secondary
        .min_support_ratio;


  const qualifiesFamilySpecificSecondary =

    mode.strongest_family_weighted_image_support >=
      rules
        .family_specific_secondary
        .min_family_weighted_image_support

    &&

    mode.strongest_family_within_support_ratio >=
      rules
        .family_specific_secondary
        .min_within_family_support_ratio;


  if (qualifiesCore) {

    evidenceTier =
      'core';

  } else if (
    qualifiesCrossFamilySecondary ||
    qualifiesFamilySpecificSecondary
  ) {

    evidenceTier =
      'secondary';
  }


  // ----------------------------------------------------------
  // Scope
  // ----------------------------------------------------------

  let scope =
    'family_specific';


  const qualifiesGlobalScope =

    mode.family_coverage >=
      rules
        .scope_global
        .min_family_coverage

    &&

    mode.family_entropy >=
      rules
        .scope_global
        .min_family_entropy;


  if (qualifiesGlobalScope) {

    scope =
      'global';

  } else if (

    mode.family_coverage >=
      rules
        .scope_cross_family
        .min_family_coverage

  ) {

    scope =
      'cross_family';
  }


  // ----------------------------------------------------------
  // Role Candidates
  // ----------------------------------------------------------

  const accentCandidate =

    mode.chroma_percentile >=
      rules
        .accent_candidate
        .min_chroma_percentile

    &&

    mode.mass_percentile <=
      rules
        .accent_candidate
        .max_mass_percentile;


  const darkCandidate =

    mode.lightness_percentile <=
      rules
        .dark_candidate
        .max_lightness_percentile;


  const lightCandidate =

    mode.lightness_percentile >=
      rules
        .light_candidate
        .min_lightness_percentile;


  const neutralCandidate =

    mode.chroma_percentile <=
      rules
        .neutral_candidate
        .max_chroma_percentile;


  mode.classification = {

    evidence_tier:
      evidenceTier,

    scope,

    strongest_family:
      mode.strongest_family,

    role_candidates: {

      accent_candidate:
        accentCandidate,

      neutral_candidate:
        neutralCandidate,

      dark_candidate:
        darkCandidate,

      light_candidate:
        lightCandidate
    },

    excluded:
      false
  };
}


// ============================================================
// Classification counts
// ============================================================

function summarizeClassification(modes) {

  const evidence = {
    core: 0,
    secondary: 0,
    rare: 0
  };

  const scope = {
    global: 0,
    cross_family: 0,
    family_specific: 0
  };

  let accentCandidates = 0;

  for (const mode of modes) {

    evidence[
      mode
        .classification
        .evidence_tier
    ]++;

    scope[
      mode
        .classification
        .scope
    ]++;

    if (
      mode
        .classification
        .role_candidates
        .accent_candidate
    ) {

      accentCandidates++;
    }
  }

  return {

    evidence_tier:
      evidence,

    scope,

    accent_candidate_count:
      accentCandidates
  };
}


// ============================================================
// Build threshold run
// ============================================================

function buildThresholdRun(
  threshold,
  swatches,
  context
) {

  const clusters =
    clusterAtThreshold(
      swatches,
      threshold,
      context.chromaWeight
    );

  const modes =
    summarizeModes(
      clusters,
      context,
      threshold
    );

  return {

    threshold,

    mode_count:
      modes.length,

    classification_counts:
      summarizeClassification(
        modes
      ),

    modes
  };
}


// ============================================================
// Lineage helpers
// ============================================================

function modeContainsBaselineMode(
  descendantMode,
  baselineMode
) {

  const descendantSet =
    new Set(
      descendantMode.member_keys
    );

  for (
    const memberKey
    of baselineMode.member_keys
  ) {

    if (
      !descendantSet.has(
        memberKey
      )
    ) {

      return false;
    }
  }

  return true;
}


function findDescendant(
  baselineMode,
  targetModes
) {

  const matches =
    targetModes.filter(
      mode =>
        modeContainsBaselineMode(
          mode,
          baselineMode
        )
    );

  assert(
    matches.length === 1,
    `Lineage error for ${baselineMode.mode_id}: expected 1 descendant, got ${matches.length}`
  );

  return matches[0];
}


// ============================================================
// Attach source baseline modes
// ============================================================

function attachBaselineSources(
  baselineModes,
  targetModes
) {

  for (const targetMode of targetModes) {

    targetMode.source_baseline_modes = [];
  }

  for (const baselineMode of baselineModes) {

    const descendant =
      findDescendant(
        baselineMode,
        targetModes
      );

    descendant
      .source_baseline_modes
      .push(
        baselineMode.mode_id
      );
  }

  for (const targetMode of targetModes) {

    targetMode
      .source_baseline_modes
      .sort();
  }
}


// ============================================================
// Evidence tier order
// ============================================================

function evidenceTierValue(tier) {

  const values = {
    rare: 0,
    secondary: 1,
    core: 2
  };

  return values[tier];
}


// ============================================================
// Build baseline lineage records
// ============================================================

function buildLineages(
  runsByThreshold
) {

  const baselineRun =
    runsByThreshold[
      thresholdKey(
        BASELINE_THRESHOLD
      )
    ];

  const baselineModes =
    baselineRun.modes;


  // Attach source baseline mode IDs
  // to every threshold's descendants.

  for (const threshold of THRESHOLDS) {

    const run =
      runsByThreshold[
        thresholdKey(threshold)
      ];

    attachBaselineSources(
      baselineModes,
      run.modes
    );
  }


  const lineages = [];


  for (const baselineMode of baselineModes) {

    const lineageByThreshold = {};

    const evidenceTiers = [];

    const scopes = [];

    const coverages = [];


    for (const threshold of THRESHOLDS) {

      const run =
        runsByThreshold[
          thresholdKey(threshold)
        ];

      const descendant =
        findDescendant(
          baselineMode,
          run.modes
        );


      const classification =
        descendant.classification;


      lineageByThreshold[
        thresholdKey(threshold)
      ] = {

        descendant_mode_id:
          descendant.mode_id,

        source_baseline_modes:
          descendant
            .source_baseline_modes,

        descendant_member_count:
          descendant.member_count,

        weighted_mass:
          descendant.weighted_mass,

        normalized_mass:
          descendant.normalized_mass,

        weighted_image_support:
          descendant.weighted_image_support,

        weighted_image_support_ratio:
          descendant.weighted_image_support_ratio,

        family_coverage:
          descendant.family_coverage,

        family_entropy:
          descendant.family_entropy,

        strongest_family:
          descendant.strongest_family,

        evidence_tier:
          classification.evidence_tier,

        scope:
          classification.scope,

        accent_candidate:
          classification
            .role_candidates
            .accent_candidate
      };


      evidenceTiers.push(
        classification.evidence_tier
      );

      scopes.push(
        classification.scope
      );

      coverages.push(
        descendant.family_coverage
      );
    }


    const classificationStable =
      evidenceTiers.every(
        tier =>
          tier ===
          evidenceTiers[0]
      )
      &&
      scopes.every(
        scope =>
          scope ===
          scopes[0]
      );


    const evidenceTierStable =
      evidenceTiers.every(
        tier =>
          tier ===
          evidenceTiers[0]
      );


    const scopeStable =
      scopes.every(
        scope =>
          scope ===
          scopes[0]
      );


    const familyCoverageStable =
      coverages.every(
        coverage =>
          Math.abs(
            coverage -
            coverages[0]
          ) <= EPS
      );


    lineages.push({

      baseline_mode_id:
        baselineMode.mode_id,

      baseline_medoid_hex:
        baselineMode
          .representative_medoid
          .hex,

      baseline_weighted_mass:
        baselineMode.weighted_mass,

      baseline_normalized_mass:
        baselineMode.normalized_mass,

      baseline_weighted_image_support:
        baselineMode.weighted_image_support,

      baseline_weighted_image_support_ratio:
        baselineMode.weighted_image_support_ratio,

      baseline_family_coverage:
        baselineMode.family_coverage,

      baseline_family_entropy:
        baselineMode.family_entropy,

      baseline_classification:
        baselineMode.classification,

      lineage:
        lineageByThreshold,

      stability: {

        classification_stable:
          classificationStable,

        evidence_tier_stable:
          evidenceTierStable,

        scope_stable:
          scopeStable,

        family_coverage_stable:
          familyCoverageStable
      }
    });
  }


  return lineages;
}


// ============================================================
// Compare baseline vs one target threshold
// ============================================================

function compareThreshold(
  lineages,
  targetThreshold
) {

  const targetKey =
    thresholdKey(
      targetThreshold
    );

  let anyFlipCount = 0;

  let evidenceFlipCount = 0;

  let scopeFlipCount = 0;

  let familyCoverageFlipCount = 0;


  let flippedMass = 0;

  let evidenceFlippedMass = 0;

  let scopeFlippedMass = 0;

  let coverageFlippedMass = 0;


  let flippedSupport = 0;

  let totalSupportWeight = 0;


  let totalMass = 0;


  const promotions = [];

  const demotions = [];

  const flipDetails = [];


  for (const lineage of lineages) {

    const baseline =
      lineage.baseline_classification;

    const target =
      lineage
        .lineage[
          targetKey
        ];


    const evidenceFlip =

      baseline.evidence_tier !==
      target.evidence_tier;


    const scopeFlip =

      baseline.scope !==
      target.scope;


    const coverageFlip =

      Math.abs(
        lineage.baseline_family_coverage -
        target.family_coverage
      ) >
      EPS;


    const anyFlip =
      evidenceFlip ||
      scopeFlip;


    const mass =
      lineage.baseline_weighted_mass;


    const support =
      lineage.baseline_weighted_image_support;


    totalMass +=
      mass;

    totalSupportWeight +=
      support;


    if (anyFlip) {

      anyFlipCount++;

      flippedMass +=
        mass;

      flippedSupport +=
        support;
    }


    if (evidenceFlip) {

      evidenceFlipCount++;

      evidenceFlippedMass +=
        mass;
    }


    if (scopeFlip) {

      scopeFlipCount++;

      scopeFlippedMass +=
        mass;
    }


    if (coverageFlip) {

      familyCoverageFlipCount++;

      coverageFlippedMass +=
        mass;
    }


    const baselineTierValue =
      evidenceTierValue(
        baseline.evidence_tier
      );


    const targetTierValue =
      evidenceTierValue(
        target.evidence_tier
      );


    if (
      targetTierValue >
      baselineTierValue
    ) {

      promotions.push({

        baseline_mode_id:
          lineage.baseline_mode_id,

        medoid_hex:
          lineage.baseline_medoid_hex,

        from:
          baseline.evidence_tier,

        to:
          target.evidence_tier,

        descendant_mode_id:
          target.descendant_mode_id,

        source_baseline_modes:
          target.source_baseline_modes,

        merge_induced:
          target
            .source_baseline_modes
            .length > 1,

        baseline_family_coverage:
          lineage.baseline_family_coverage,

        descendant_family_coverage:
          target.family_coverage,

        baseline_support_ratio:
          lineage
            .baseline_weighted_image_support_ratio,

        descendant_support_ratio:
          target
            .weighted_image_support_ratio
      });
    }


    if (
      targetTierValue <
      baselineTierValue
    ) {

      demotions.push({

        baseline_mode_id:
          lineage.baseline_mode_id,

        medoid_hex:
          lineage.baseline_medoid_hex,

        from:
          baseline.evidence_tier,

        to:
          target.evidence_tier,

        descendant_mode_id:
          target.descendant_mode_id,

        source_baseline_modes:
          target.source_baseline_modes,

        baseline_family_coverage:
          lineage.baseline_family_coverage,

        descendant_family_coverage:
          target.family_coverage
      });
    }


    if (
      anyFlip ||
      coverageFlip
    ) {

      flipDetails.push({

        baseline_mode_id:
          lineage.baseline_mode_id,

        medoid_hex:
          lineage.baseline_medoid_hex,

        descendant_mode_id:
          target.descendant_mode_id,

        source_baseline_modes:
          target.source_baseline_modes,

        evidence_tier: {

          baseline:
            baseline.evidence_tier,

          target:
            target.evidence_tier,

          flipped:
            evidenceFlip
        },

        scope: {

          baseline:
            baseline.scope,

          target:
            target.scope,

          flipped:
            scopeFlip
        },

        family_coverage: {

          baseline:
            lineage
              .baseline_family_coverage,

          target:
            target.family_coverage,

          delta:
            target.family_coverage -
            lineage
              .baseline_family_coverage,

          stable:
            !coverageFlip
        },

        baseline_weighted_mass:
          mass,

        baseline_weighted_image_support:
          support
      });
    }
  }


  const baselineCount =
    lineages.length;


  return {

    baseline_threshold:
      BASELINE_THRESHOLD,

    target_threshold:
      targetThreshold,

    baseline_mode_count:
      baselineCount,

    classification_flip: {

      count:
        anyFlipCount,

      rate:
        anyFlipCount /
        baselineCount,

      mass_weighted_rate:
        totalMass > 0
          ?
          flippedMass /
          totalMass
          :
          0,

      mode_support_weighted_rate:
        totalSupportWeight > 0
          ?
          flippedSupport /
          totalSupportWeight
          :
          0,

      note:
        'Support-weighted rate uses baseline mode weighted_image_support as mode weights; image support can overlap across different modes.'
    },

    evidence_tier_flip: {

      count:
        evidenceFlipCount,

      rate:
        evidenceFlipCount /
        baselineCount,

      mass_weighted_rate:
        totalMass > 0
          ?
          evidenceFlippedMass /
          totalMass
          :
          0
    },

    scope_flip: {

      count:
        scopeFlipCount,

      rate:
        scopeFlipCount /
        baselineCount,

      mass_weighted_rate:
        totalMass > 0
          ?
          scopeFlippedMass /
          totalMass
          :
          0
    },

    family_coverage_instability: {

      count:
        familyCoverageFlipCount,

      rate:
        familyCoverageFlipCount /
        baselineCount,

      mass_weighted_rate:
        totalMass > 0
          ?
          coverageFlippedMass /
          totalMass
          :
          0
    },

    evidence_promotions: {

      count:
        promotions.length,

      merge_induced_count:
        promotions.filter(
          item =>
            item.merge_induced
        ).length,

      records:
        promotions
    },

    evidence_demotions: {

      count:
        demotions.length,

      records:
        demotions
    },

    flip_details:
      flipDetails
  };
}


// ============================================================
// Overall stability across all thresholds
// ============================================================

function summarizeOverallStability(
  lineages
) {

  let classificationUnstable = 0;

  let evidenceUnstable = 0;

  let scopeUnstable = 0;

  let coverageUnstable = 0;


  let classificationUnstableMass = 0;

  let coverageUnstableMass = 0;


  let totalMass = 0;

  let totalSupport = 0;

  let unstableSupport = 0;


  for (const lineage of lineages) {

    const stability =
      lineage.stability;

    const mass =
      lineage.baseline_weighted_mass;

    const support =
      lineage.baseline_weighted_image_support;


    totalMass +=
      mass;

    totalSupport +=
      support;


    if (
      !stability.classification_stable
    ) {

      classificationUnstable++;

      classificationUnstableMass +=
        mass;

      unstableSupport +=
        support;
    }


    if (
      !stability.evidence_tier_stable
    ) {

      evidenceUnstable++;
    }


    if (
      !stability.scope_stable
    ) {

      scopeUnstable++;
    }


    if (
      !stability.family_coverage_stable
    ) {

      coverageUnstable++;

      coverageUnstableMass +=
        mass;
    }
  }


  const n =
    lineages.length;


  return {

    baseline_mode_count:
      n,

    classification: {

      stable_count:
        n -
        classificationUnstable,

      unstable_count:
        classificationUnstable,

      unstable_rate:
        classificationUnstable /
        n,

      mass_weighted_instability_rate:
        totalMass > 0
          ?
          classificationUnstableMass /
          totalMass
          :
          0,

      mode_support_weighted_instability_rate:
        totalSupport > 0
          ?
          unstableSupport /
          totalSupport
          :
          0
    },

    evidence_tier: {

      stable_count:
        n -
        evidenceUnstable,

      unstable_count:
        evidenceUnstable,

      unstable_rate:
        evidenceUnstable /
        n
    },

    scope: {

      stable_count:
        n -
        scopeUnstable,

      unstable_count:
        scopeUnstable,

      unstable_rate:
        scopeUnstable /
        n
    },

    family_coverage: {

      stable_count:
        n -
        coverageUnstable,

      unstable_count:
        coverageUnstable,

      unstable_rate:
        coverageUnstable /
        n,

      mass_weighted_instability_rate:
        totalMass > 0
          ?
          coverageUnstableMass /
          totalMass
          :
          0
    }
  };
}


// ============================================================
// Remove giant member_keys from threshold mode output
//
// Lineage 已建立後，正式 JSON 不需要
// 每個 mode 重複塞完整 member_key。
// ============================================================

function cleanModeForOutput(mode) {

  const copy = {
    ...mode
  };

  delete copy.member_keys;

  return copy;
}


// ============================================================
// Console summary
// ============================================================

function printComparison(comparison) {

  console.log('');

  console.log(
    `=== 0.045 → ${comparison.target_threshold.toFixed(3)} ===`
  );

  console.log(
    `Classification flips : ${comparison.classification_flip.count}/${comparison.baseline_mode_count} (${(
      comparison.classification_flip.rate *
      100
    ).toFixed(1)}%)`
  );

  console.log(
    `Mass-weighted flips   : ${(
      comparison
        .classification_flip
        .mass_weighted_rate *
      100
    ).toFixed(1)}%`
  );

  console.log(
    `Support-weighted flips: ${(
      comparison
        .classification_flip
        .mode_support_weighted_rate *
      100
    ).toFixed(1)}%`
  );

  console.log(
    `Evidence tier flips   : ${comparison.evidence_tier_flip.count}`
  );

  console.log(
    `Scope flips           : ${comparison.scope_flip.count}`
  );

  console.log(
    `Coverage unstable     : ${comparison.family_coverage_instability.count}`
  );

  console.log(
    `Promotions            : ${comparison.evidence_promotions.count}`
  );

  console.log(
    `Merge-induced promo   : ${comparison.evidence_promotions.merge_induced_count}`
  );

  console.log(
    `Demotions             : ${comparison.evidence_demotions.count}`
  );
}


// ============================================================
// MAIN
// ============================================================

function main() {

  console.log(
    '=== YOYO B3 Threshold Sensitivity Experiment ==='
  );


  // ----------------------------------------------------------
  // Read real B1 + B2
  // ----------------------------------------------------------

  const b1 =
    readJSON(
      B1_PATH
    );

  const b2 =
    readJSON(
      B2_PATH
    );


  validateB1(
    b1
  );


  // ----------------------------------------------------------
  // Family metadata
  // ----------------------------------------------------------

  const familyInfo =
    buildFamilyMetadata(
      b1
    );

  const families =
    familyInfo.families;

  const familyMetadata =
    familyInfo.family_metadata;


  // ----------------------------------------------------------
  // Global effective weight
  // ----------------------------------------------------------

  const effectiveGlobalWeight =
    b1.items.reduce(
      (sum, item) =>
        sum +
        getReliability(item),
      0
    );


  // ----------------------------------------------------------
  // Chroma Weight
  // ----------------------------------------------------------

  const chromaWeight =

    b2
      ?.metadata
      ?.b2_contract
      ?.palette_clustering
      ?.chroma_weight

    ??

    b1
      ?.metadata
      ?.tone_feature_contract
      ?.clusterChromaWeight

    ??

    DEFAULT_CHROMA_WEIGHT;


  console.log(
    `Images           : ${b1.items.length}`
  );

  console.log(
    `Families         : ${families.join(', ')}`
  );

  console.log(
    `Effective weight : ${round(
      effectiveGlobalWeight,
      4
    )}`
  );

  console.log(
    `Chroma weight    : ${chromaWeight}`
  );


  // ----------------------------------------------------------
  // Raw B1 swatches
  // ----------------------------------------------------------

  const swatches =
    buildSwatches(
      b1
    );


  console.log(
    `Raw swatches     : ${swatches.length}`
  );


  // ----------------------------------------------------------
  // Context
  // ----------------------------------------------------------

  const context = {

    b1,

    families,

    familyMetadata,

    effectiveGlobalWeight,

    chromaWeight
  };


  // ----------------------------------------------------------
  // Independent full clustering at every threshold
  // ----------------------------------------------------------

  const runsByThreshold = {};


  for (const threshold of THRESHOLDS) {

    console.log('');

    console.log(
      `Running threshold ${threshold.toFixed(3)}...`
    );


    const run =
      buildThresholdRun(
        threshold,
        swatches,
        context
      );


    runsByThreshold[
      thresholdKey(threshold)
    ] =
      run;


    console.log(
      `Modes: ${run.mode_count}`
    );

    console.log(
      `Core / Secondary / Rare: ` +
      `${run.classification_counts.evidence_tier.core} / ` +
      `${run.classification_counts.evidence_tier.secondary} / ` +
      `${run.classification_counts.evidence_tier.rare}`
    );

    console.log(
      `Global / Cross / Family-specific: ` +
      `${run.classification_counts.scope.global} / ` +
      `${run.classification_counts.scope.cross_family} / ` +
      `${run.classification_counts.scope.family_specific}`
    );
  }


  // ----------------------------------------------------------
  // Baseline validation against B2
  // ----------------------------------------------------------

  const baselineRun =
    runsByThreshold[
      thresholdKey(
        BASELINE_THRESHOLD
      )
    ];


  assert(
    baselineRun.mode_count ===
    b2.color_modes.length,

    `Baseline mismatch: sensitivity=${baselineRun.mode_count}, B2=${b2.color_modes.length}`
  );


  console.log('');

  console.log(
    `Baseline sensitivity modes : ${baselineRun.mode_count}`
  );

  console.log(
    `B2 JSON modes              : ${b2.color_modes.length}`
  );

  console.log(
    '✅ Baseline 0.045 matches B2.'
  );


  // ----------------------------------------------------------
  // Build lineage
  // ----------------------------------------------------------

  const lineages =
    buildLineages(
      runsByThreshold
    );


  // ----------------------------------------------------------
  // Compare thresholds
  // ----------------------------------------------------------

  const comparisons = {};


  for (const threshold of THRESHOLDS) {

    if (
      Math.abs(
        threshold -
        BASELINE_THRESHOLD
      ) <= EPS
    ) {
      continue;
    }


    const comparison =
      compareThreshold(
        lineages,
        threshold
      );


    comparisons[
      `0.045_vs_${threshold.toFixed(3)}`
    ] =
      comparison;


    printComparison(
      comparison
    );
  }


  // ----------------------------------------------------------
  // Overall stability
  // ----------------------------------------------------------

  const overallStability =
    summarizeOverallStability(
      lineages
    );


  console.log('');

  console.log(
    '=== Overall Stability ==='
  );

  console.log(
    `Classification unstable : ${overallStability.classification.unstable_count}/${overallStability.baseline_mode_count}`
  );

  console.log(
    `Evidence unstable       : ${overallStability.evidence_tier.unstable_count}`
  );

  console.log(
    `Scope unstable          : ${overallStability.scope.unstable_count}`
  );

  console.log(
    `Coverage unstable       : ${overallStability.family_coverage.unstable_count}`
  );

  console.log(
    `Mass-weighted instability: ${(
      overallStability
        .classification
        .mass_weighted_instability_rate *
      100
    ).toFixed(1)}%`
  );


  // ----------------------------------------------------------
  // Clean threshold modes
  // ----------------------------------------------------------

  const thresholdRunsForOutput = {};


  for (const threshold of THRESHOLDS) {

    const key =
      thresholdKey(
        threshold
      );

    const run =
      runsByThreshold[key];


    thresholdRunsForOutput[key] = {

      threshold:
        run.threshold,

      mode_count:
        run.mode_count,

      classification_counts:
        run.classification_counts,

      modes:
        run.modes.map(
          cleanModeForOutput
        )
    };
  }


  // ----------------------------------------------------------
  // Final output
  // ----------------------------------------------------------

  const output = {

    metadata: {

      name:
        'YOYO B3 Threshold Sensitivity Experiment',

      step:
        'B3_Threshold_Sensitivity',

      classification_contract_status:
        'provisional_for_sensitivity_analysis',

      source_b1_file:
        path.basename(
          B1_PATH
        ),

      source_b2_file:
        path.basename(
          B2_PATH
        ),

      total_images:
        b1.items.length,

      raw_swatch_count:
        swatches.length,

      effective_global_weight:
        effectiveGlobalWeight,

      families,

      family_metadata:
        familyMetadata,

      thresholds:
        THRESHOLDS,

      baseline_threshold:
        BASELINE_THRESHOLD,

      chroma_weight:
        chromaWeight,

      clustering_method:
        'deterministic agglomerative centroid-linkage using exact B2 deltaE_OK-like distance',

      lineage_reference_unit:
        'baseline 0.045 physical mode',

      important_note:
        'A descendant at a wider threshold is a new cluster identity. Coverage changes describe lineage descendants, not mutation of the same physical mode.',

      classification_note:
        'Core/Secondary/Rare and Scope rules are provisional and are used only to test downstream robustness before locking the B3-A contract.',

      support_weight_note:
        'Support-weighted flip rates are mode-weighted statistics. The same image may support multiple different baseline modes.'
    },


    provisional_rules:
      PROVISIONAL_RULES,


    threshold_runs:
      thresholdRunsForOutput,


    baseline_lineages:
      lineages,


    comparisons,


    overall_stability:
      overallStability
  };


  const rounded =
    roundedClone(
      output,
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


  console.log('');

  console.log(
    'Sensitivity JSON written to:'
  );

  console.log(
    OUTPUT_PATH
  );

  console.log('');

  console.log(
    '✅ B3 Threshold Sensitivity Experiment completed.'
  );
}


// ============================================================
// Execute
// ============================================================

try {

  main();

} catch (error) {

  console.error('');

  console.error(
    '❌ B3 THRESHOLD SENSITIVITY FAILED'
  );

  console.error(
    error.stack ||
    error.message
  );

  process.exit(1);
}
