#!/usr/bin/env node
'use strict';

/**
 * YOYO / HueSense
 * B3-A Hierarchy Builder
 *
 * INPUT
 * ------------------------------------------------------------
 * y2k_color_mvp_b2_aggregation.json
 * b3_threshold_sensitivity.json
 *
 * OUTPUT
 * ------------------------------------------------------------
 * y2k_color_mvp_b3_hierarchy.json
 *
 *
 * Architecture
 * ------------------------------------------------------------
 *
 * B2 @ 0.045
 * 53 Conservative Physical Modes
 *        ↓
 * Baseline Evidence Classification
 *        ↓
 * Evidence Tier
 *   Core / Secondary / Rare
 *
 * Scope
 *   Global / Cross-family / Family-specific
 *
 * Role Candidates
 *   Accent / Neutral / Dark / Light
 *
 *        +
 *
 * Sensitivity descendants @ 0.055 / 0.065
 *        ↓
 * Stability Grade
 *   A / B / C
 *
 *
 * IMPORTANT POLICY
 * ------------------------------------------------------------
 *
 * 1. 0.045 baseline 是唯一正式 physical identity。
 *
 * 2. 0.055 / 0.065 descendants
 *    只能用來評估 robustness，
 *    絕對不能替 baseline mode 升級 Evidence Tier。
 *
 * 3. 不使用 CoreScore。
 *
 * 4. 不使用 absolute 1.70 family support threshold。
 *
 * 5. 不做 semantic naming：
 *    不產生 Warm Brown / Tech Silver / Cyber Blue 等名稱。
 *
 * 6. 不刪除 Rare modes。
 */


const fs = require('fs');
const path = require('path');


// ============================================================
// Paths
// ============================================================

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const B2_PATH = path.resolve(argValue('--b2', path.join(__dirname,'b2_aggregation.json')));
const SENSITIVITY_PATH = path.resolve(argValue('--sensitivity', path.join(__dirname,'b3_threshold_sensitivity.json')));
const OUTPUT_PATH = path.resolve(argValue('--output', path.join(__dirname,'b3_hierarchy.json')));


// ============================================================
// Contract
// ============================================================

const CONTRACT_VERSION = '1.0.1';

const BASELINE_THRESHOLD = 0.045;

const DIAGNOSTIC_THRESHOLDS = [
  0.055,
  0.065
];

const EPS = 1e-12;


/**
 * B3-A candidate contract
 *
 * 這版已移除 absolute 1.70。
 */
const B3_RULES = {

  evidence: {

    core: {

      min_family_coverage:
        0.75,

      min_weighted_image_support_ratio:
        0.20,

      min_mass_percentile:
        0.70
    },


    cross_family_secondary: {

      min_family_coverage:
        0.50,

      min_weighted_image_support_ratio:
        0.10
    },


    /**
     * Scale-free family-specific evidence
     *
     * 一個 mode 只要在「任何一個 family」同時：
     *
     * distinct image support >= 2
     * AND
     * within-family image support ratio >= 25%
     * AND
     * family-relative mass percentile >= 70%
     *
     * 就可形成 Family-specific Secondary evidence。
     */
    family_specific_secondary: {

      // 至少兩張獨立圖片提供證據。
      // 這是 independent-observation floor，
      // 不是依 24 張 Evaluation Set 調出的權重門檻。
      min_distinct_image_support:
        2,

      min_within_family_support_ratio:
        0.25,

      min_within_family_mass_percentile:
        0.70
    }

  },

  scope: {

    global: {

      min_family_coverage:
        0.75,

      min_family_entropy:
        0.65
    },

    cross_family: {

      min_family_coverage:
        0.50
    }
  },


  roles: {

    accent_candidate: {

      min_chroma_percentile:
        0.75,

      max_mass_percentile:
        0.60
    },

    neutral_candidate: {

      max_chroma_percentile:
        0.25
    },

    dark_candidate: {

      max_lightness_percentile:
        0.25
    },

    light_candidate: {

      min_lightness_percentile:
        0.75
    }
  }
};


// ============================================================
// Helpers
// ============================================================

function assert(
  condition,
  message
) {

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


function thresholdKey(value) {

  return Number(value)
    .toFixed(3);
}


function round(
  value,
  digits = 8
) {

  if (!isFiniteNumber(value)) {
    return value;
  }

  const factor =
    10 ** digits;

  return Math.round(
    (
      value +
      Number.EPSILON
    ) *
    factor
  ) / factor;
}


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


function uniqueSorted(values) {

  return [
    ...new Set(values)
  ].sort();
}


// ============================================================
// Normalized Shannon Entropy
//
// p = 0 → contribution = 0
// 不允許 log(0)
// ============================================================

function normalizedEntropy(values) {

  assert(
    Array.isArray(values) &&
    values.length > 0,
    'normalizedEntropy requires values[]'
  );


  const total =
    values.reduce(
      (sum, value) =>
        sum +
        value,
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

    if (
      !isFiniteNumber(value) ||
      value <= 0
    ) {
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
// Tie-aware percentile ranks
//
// Lowest = 0
// Highest = 1
// ============================================================

function assignPercentileRanks(
  items,
  valueGetter,
  outputKey
) {

  const ranked =
    items
      .map(
        (
          item,
          index
        ) => ({

          index,

          value:
            valueGetter(item)
        })
      )
      .sort(
        (a, b) =>
          a.value -
          b.value
      );


  const n =
    ranked.length;


  if (n === 0) {
    return;
  }


  if (n === 1) {

    items[
      ranked[0].index
    ][outputKey] = 1;

    return;
  }


  let start = 0;


  while (
    start < n
  ) {

    let end =
      start;


    while (
      end + 1 < n &&

      Math.abs(
        ranked[end + 1].value -
        ranked[start].value
      ) <= EPS
    ) {

      end++;
    }


    const midRank =
      (
        start +
        end
      ) /
      2;


    const percentile =
      midRank /
      (
        n -
        1
      );


    for (
      let index = start;
      index <= end;
      index++
    ) {

      items[
        ranked[index].index
      ][outputKey] =
        percentile;
    }


    start =
      end + 1;
  }
}


// ============================================================
// Validation
// ============================================================

function validateInputs(
  b2,
  sensitivity
) {

  assert(
    b2?.metadata?.step ===
      'B2_Aggregation',
    'B2 metadata.step mismatch'
  );


  assert(
    Array.isArray(
      b2.color_modes
    ),
    'B2 missing color_modes[]'
  );


  assert(
    b2
      ?.metadata
      ?.b2_contract
      ?.palette_clustering
      ?.merge_distance ===
      BASELINE_THRESHOLD,

    'B2 merge_distance must be 0.045'
  );


  assert(
    sensitivity
      ?.metadata
      ?.step ===
      'B3_Threshold_Sensitivity',

    'Sensitivity metadata.step mismatch'
  );


  assert(
    sensitivity
      ?.metadata
      ?.baseline_threshold ===
      BASELINE_THRESHOLD,

    'Sensitivity baseline must be 0.045'
  );


  assert(
    sensitivity
      ?.threshold_runs &&
    sensitivity
      .threshold_runs[
        thresholdKey(
          BASELINE_THRESHOLD
        )
      ],

    'Sensitivity missing threshold 0.045'
  );


  for (
    const threshold
    of DIAGNOSTIC_THRESHOLDS
  ) {

    assert(
      sensitivity
        .threshold_runs[
          thresholdKey(
            threshold
          )
        ],

      `Sensitivity missing threshold ${threshold}`
    );
  }


  assert(
    Array.isArray(
      sensitivity.baseline_lineages
    ),

    'Sensitivity missing baseline_lineages[]'
  );


  assert(
    b2.color_modes.length ===
      sensitivity
        .threshold_runs[
          thresholdKey(
            BASELINE_THRESHOLD
        )
        ].mode_count,

    'B2 mode count != sensitivity baseline mode count'
  );


  assert(
    b2.color_modes.length ===
      sensitivity
        .baseline_lineages
        .length,

    'B2 mode count != baseline lineage count'
  );
}


// ============================================================
// Build family metadata
// ============================================================

function getFamilies(
  b2,
  sensitivity
) {

  const fromB2 =
    b2
      ?.metadata
      ?.families;

  const fromSensitivity =
    sensitivity
      ?.metadata
      ?.families;


  assert(
    Array.isArray(
      fromB2
    ) &&
    fromB2.length > 0,

    'B2 missing families'
  );


  assert(
    Array.isArray(
      fromSensitivity
    ),

    'Sensitivity missing families'
  );


  assert(
    JSON.stringify(
      [...fromB2].sort()
    ) ===
    JSON.stringify(
      [...fromSensitivity].sort()
    ),

    'B2 families != sensitivity families'
  );


  return [
    ...fromB2
  ].sort();
}


// ============================================================
// Normalize threshold mode
// ============================================================

function normalizeThresholdMode(
  rawMode,
  families,
  familyMetadata
) {

  const mode =
    JSON.parse(
      JSON.stringify(
        rawMode
      )
    );


  // ----------------------------------------------------------
  // Ensure every family exists
  // ----------------------------------------------------------

  const normalizedFamilyBreakdown = {};


  for (
    const family
    of families
  ) {

    const raw =
      rawMode
        ?.family_breakdown
        ?.[family]
      ||
      {};


    const weightedMass =
      isFiniteNumber(
        raw.weighted_mass
      )
        ?
        raw.weighted_mass
        :
        0;


    const imageSupport =
      isFiniteNumber(
        raw.image_support
      )
        ?
        raw.image_support
        :
        0;


    const weightedImageSupport =
      isFiniteNumber(
        raw.weighted_image_support
      )
        ?
        raw.weighted_image_support
        :
        0;


    const familyEffectiveWeight =
      familyMetadata
        ?.[family]
        ?.effective_weight
      ||
      0;


    const withinFamilySupportRatio =
      familyEffectiveWeight > 0
        ?
        weightedImageSupport /
        familyEffectiveWeight
        :
        0;


    normalizedFamilyBreakdown[
      family
    ] = {

      weighted_mass:
        weightedMass,

      image_support:
        imageSupport,

      weighted_image_support:
        weightedImageSupport,

      within_family_support_ratio:
        withinFamilySupportRatio,

      within_family_mass_percentile:
        0
    };
  }


  mode.family_breakdown =
    normalizedFamilyBreakdown;


  // ----------------------------------------------------------
  // Recompute family support / coverage
  // ----------------------------------------------------------

  mode.family_support =
    families.filter(
      family =>
        normalizedFamilyBreakdown[
          family
        ].weighted_mass >
        EPS
    );


  mode.family_support_count =
    mode.family_support.length;


  mode.family_coverage =
    families.length > 0
      ?
      mode.family_support_count /
      families.length
      :
      0;


  // ----------------------------------------------------------
  // Recompute entropy
  // ----------------------------------------------------------

  mode.family_entropy =
    normalizedEntropy(
      families.map(
        family =>
          normalizedFamilyBreakdown[
            family
          ].weighted_mass
      )
    );


  return mode;
}


// ============================================================
// Family-relative mass percentile
//
// IMPORTANT:
//
// 只在「該 family 中有實際 mass > 0」的 modes
// 之間排名。
//
// 不把一堆 absent = 0 modes 塞進 percentile，
// 否則只要有出現就可能被虛高排名。
// ============================================================

function assignWithinFamilyMassPercentiles(
  modes,
  families
) {

  for (
    const family
    of families
  ) {

    const presentModes =
      modes.filter(
        mode =>
          mode
            .family_breakdown[
              family
            ]
            .weighted_mass >
          EPS
      );


    if (
      presentModes.length === 0
    ) {
      continue;
    }


    const temporary =
      presentModes.map(
        mode => ({

          mode,

          value:
            mode
              .family_breakdown[
                family
              ]
              .weighted_mass,

          percentile:
            0
        })
      );


    const ranked =
      temporary
        .map(
          (
            item,
            index
          ) => ({

            index,

            value:
              item.value
          })
        )
        .sort(
          (a, b) =>
            a.value -
            b.value
        );


    const n =
      ranked.length;


    if (
      n === 1
    ) {

      temporary[
        ranked[0].index
      ].percentile = 1;

    } else {

      let start = 0;


      while (
        start < n
      ) {

        let end =
          start;


        while (
          end + 1 < n &&

          Math.abs(
            ranked[end + 1].value -
            ranked[start].value
          ) <= EPS
        ) {

          end++;
        }


        const midRank =
          (
            start +
            end
          ) /
          2;


        const percentile =
          midRank /
          (
            n -
            1
          );


        for (
          let index = start;
          index <= end;
          index++
        ) {

          temporary[
            ranked[index].index
          ].percentile =
            percentile;
        }


        start =
          end + 1;
      }
    }


    for (
      const item
      of temporary
    ) {

      item
        .mode
        .family_breakdown[
          family
        ]
        .within_family_mass_percentile =
          item.percentile;
    }
  }
}


// ============================================================
// Global percentiles per threshold
// ============================================================

function assignGlobalPercentiles(
  modes
) {

  assignPercentileRanks(
    modes,
    mode =>
      mode.weighted_mass,
    'mass_percentile'
  );


  assignPercentileRanks(
    modes,
    mode =>
      mode
        .centroid_lch
        .C,
    'chroma_percentile'
  );


  assignPercentileRanks(
    modes,
    mode =>
      mode
        .centroid_lch
        .L,
    'lightness_percentile'
  );
}


// ============================================================
// Family-specific evidence
// ============================================================

function getFamilySpecificEvidence(
  mode,
  families
) {

  const qualifyingFamilies = [];


  for (
    const family
    of families
  ) {

    const evidence =
      mode
        .family_breakdown[
          family
        ];


    const qualifies =

  evidence.image_support >=
  B3_RULES
    .evidence
    .family_specific_secondary
    .min_distinct_image_support

  &&

  evidence
    .within_family_support_ratio >=
  B3_RULES
    .evidence
    .family_specific_secondary
    .min_within_family_support_ratio

  &&

  evidence
    .within_family_mass_percentile >=
  B3_RULES
    .evidence
    .family_specific_secondary
    .min_within_family_mass_percentile;


    if (qualifies) {

      qualifyingFamilies.push({
  family,

  image_support:
    evidence.image_support,

  weighted_mass:
    evidence.weighted_mass,

  weighted_image_support:
    evidence.weighted_image_support,

  within_family_support_ratio:
    evidence
      .within_family_support_ratio,

  within_family_mass_percentile:
    evidence
      .within_family_mass_percentile
});
    }
  }


  qualifyingFamilies.sort(
    (a, b) => {

      if (
        b.within_family_support_ratio !==
        a.within_family_support_ratio
      ) {

        return (
          b.within_family_support_ratio -
          a.within_family_support_ratio
        );
      }


      return (
        b.within_family_mass_percentile -
        a.within_family_mass_percentile
      );
    }
  );


  return qualifyingFamilies;
}


// ============================================================
// Classify one mode
// ============================================================

function classifyMode(
  mode,
  families
) {

  // ----------------------------------------------------------
  // Family-specific evidence
  // ----------------------------------------------------------

  const familySpecificEvidence =
    getFamilySpecificEvidence(
      mode,
      families
    );


  // ----------------------------------------------------------
  // Evidence Tier
  // ----------------------------------------------------------

  const qualifiesCore =

    mode.family_coverage >=
      B3_RULES
        .evidence
        .core
        .min_family_coverage

    &&

    mode.weighted_image_support_ratio >=
      B3_RULES
        .evidence
        .core
        .min_weighted_image_support_ratio

    &&

    mode.mass_percentile >=
      B3_RULES
        .evidence
        .core
        .min_mass_percentile;


  const qualifiesCrossFamilySecondary =

    mode.family_coverage >=
      B3_RULES
        .evidence
        .cross_family_secondary
        .min_family_coverage

    &&

    mode.weighted_image_support_ratio >=
      B3_RULES
        .evidence
        .cross_family_secondary
        .min_weighted_image_support_ratio;


  const qualifiesFamilySpecificSecondary =
    familySpecificEvidence.length >
    0;


  let evidenceTier =
    'rare';


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


  const qualifiesGlobal =

    mode.family_coverage >=
      B3_RULES
        .scope
        .global
        .min_family_coverage

    &&

    mode.family_entropy >=
      B3_RULES
        .scope
        .global
        .min_family_entropy;


  if (qualifiesGlobal) {

    scope =
      'global';

  } else if (

    mode.family_coverage >=
      B3_RULES
        .scope
        .cross_family
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
      B3_RULES
        .roles
        .accent_candidate
        .min_chroma_percentile

    &&

    mode.mass_percentile <=
      B3_RULES
        .roles
        .accent_candidate
        .max_mass_percentile;


  const neutralCandidate =

    mode.chroma_percentile <=
      B3_RULES
        .roles
        .neutral_candidate
        .max_chroma_percentile;


  const darkCandidate =

    mode.lightness_percentile <=
      B3_RULES
        .roles
        .dark_candidate
        .max_lightness_percentile;


  const lightCandidate =

    mode.lightness_percentile >=
      B3_RULES
        .roles
        .light_candidate
        .min_lightness_percentile;


  return {

    evidence_tier:
      evidenceTier,

    evidence_basis: {

      qualifies_core:
        qualifiesCore,

      qualifies_cross_family_secondary:
        qualifiesCrossFamilySecondary,

      qualifies_family_specific_secondary:
        qualifiesFamilySpecificSecondary,

      family_specific_qualifying_families:
        familySpecificEvidence
    },


    scope,


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
// Enrich one threshold run
// ============================================================

function enrichThresholdRun(
  rawRun,
  families,
  familyMetadata
) {

  const modes =
    rawRun.modes.map(
      mode =>
        normalizeThresholdMode(
          mode,
          families,
          familyMetadata
        )
    );


  assignGlobalPercentiles(
    modes
  );


  assignWithinFamilyMassPercentiles(
    modes,
    families
  );


  for (
    const mode
    of modes
  ) {

    mode.b3_classification =
      classifyMode(
        mode,
        families
      );
  }


  return {

    threshold:
      rawRun.threshold,

    mode_count:
      modes.length,

    modes
  };
}


// ============================================================
// Mode map
// ============================================================

function modeMap(run) {

  return new Map(
    run.modes.map(
      mode => [
        mode.mode_id,
        mode
      ]
    )
  );
}


// ============================================================
// Evidence tier ordering
// ============================================================

function tierValue(tier) {

  return {
    rare: 0,
    secondary: 1,
    core: 2
  }[tier];
}


// ============================================================
// Classification comparison
// ============================================================

function sameClassification(
  a,
  b
) {

  return (
    a.evidence_tier ===
      b.evidence_tier

    &&

    a.scope ===
      b.scope
  );
}


function sameRoles(
  a,
  b
) {

  const ar =
    a.role_candidates;

  const br =
    b.role_candidates;


  return (
    ar.accent_candidate ===
      br.accent_candidate

    &&

    ar.neutral_candidate ===
      br.neutral_candidate

    &&

    ar.dark_candidate ===
      br.dark_candidate

    &&

    ar.light_candidate ===
      br.light_candidate
  );
}


// ============================================================
// Stability Grade
// ============================================================
// Percentile-pool sensitivity audit
//
// 用來辨認：
// cluster 自己沒有 merge，raw evidence 也沒有新增，
// 但因其他 clusters 合併造成 ranking pool 改變，
// percentile 改變並進一步導致 classification / role flip。
// ============================================================

function collectPercentilePoolChanges(
  baselineMode,
  descendant,
  families
) {

  const globalPercentiles = {};

  const familyMassPercentiles = [];

  let changed = false;


  // ----------------------------------------------------------
  // Global percentile changes
  // ----------------------------------------------------------

  const globalKeys = [
    'mass_percentile',
    'chroma_percentile',
    'lightness_percentile'
  ];


  for (const key of globalKeys) {

    const before =
      baselineMode[key];

    const after =
      descendant[key];


    const delta =
      (
        isFiniteNumber(before) &&
        isFiniteNumber(after)
      )
        ?
        after - before
        :
        null;


    const valueChanged =
      isFiniteNumber(delta) &&
      Math.abs(delta) >
      EPS;


    globalPercentiles[key] = {

      before,

      after,

      delta,

      changed:
        valueChanged
    };


    if (valueChanged) {
      changed = true;
    }
  }


  // ----------------------------------------------------------
  // Within-family mass percentile changes
  // ----------------------------------------------------------

  for (const family of families) {

    const before =
      baselineMode
        ?.family_breakdown
        ?.[family]
        ?.within_family_mass_percentile
      ?? 0;


    const after =
      descendant
        ?.family_breakdown
        ?.[family]
        ?.within_family_mass_percentile
      ?? 0;


    const delta =
      after - before;


    if (
      Math.abs(delta) >
      EPS
    ) {

      changed = true;


      familyMassPercentiles.push({

        family,

        before,

        after,

        delta
      });
    }
  }


  return {

    changed,

    global_percentiles:
      globalPercentiles,

    within_family_mass_percentile_changes:
      familyMassPercentiles
  };
}
//
// A:
// 0.055 與 0.065 Evidence + Scope 都不變
//
// B:
// 0.055 穩定，直到 0.065 才翻
//
// C:
// 0.055 就已翻盤
// ============================================================

function buildRobustness(
  baselineMode,
  lineage,
  thresholdRuns,
  families
) {

  const baselineClassification =
    baselineMode.b3_classification;


  const descendants = {};


  let firstClassificationFlip =
    null;

  let firstEvidenceFlip =
    null;

  let firstScopeFlip =
    null;

  let firstRoleFlip =
    null;


  let mergeInducedPromotion =
  false;

let mergeSensitiveObserved =
  false;

let percentilePoolSensitiveObserved =
  false;

const promotionEvents = [];

  for (
    const threshold
    of DIAGNOSTIC_THRESHOLDS
  ) {

    const key =
      thresholdKey(
        threshold
      );


    const lineageEntry =
      lineage
        ?.lineage
        ?.[key];


    assert(
      lineageEntry,
      `${baselineMode.mode_id}: missing lineage ${key}`
    );


    const targetRun =
      thresholdRuns[
        key
      ];


    const targetMap =
      modeMap(
        targetRun
      );


    const descendant =
      targetMap.get(
        lineageEntry
          .descendant_mode_id
      );


    assert(
      descendant,
      `${baselineMode.mode_id}: descendant ${lineageEntry.descendant_mode_id} not found at ${key}`
    );


    const targetClassification =
      descendant
        .b3_classification;


    const evidenceFlip =

      baselineClassification
        .evidence_tier !==

      targetClassification
        .evidence_tier;


    const scopeFlip =

      baselineClassification.scope !==
      targetClassification.scope;


    const classificationFlip =
      evidenceFlip ||
      scopeFlip;


    const roleFlip =
      !sameRoles(
        baselineClassification,
        targetClassification
      );


    const coverageFlip =

      Math.abs(
        baselineMode.family_coverage -
        descendant.family_coverage
      ) >
      EPS;
      // ----------------------------------------------------------
// Sensitivity cause attribution
// ----------------------------------------------------------

const mergedAtThreshold =

  Array.isArray(
    lineageEntry
      .source_baseline_modes
  )

  &&

  lineageEntry
    .source_baseline_modes
    .length >
  1;


const percentilePoolAudit =
  collectPercentilePoolChanges(
    baselineMode,
    descendant,
    families
  );


/**
 * merge_sensitive
 *
 * baseline mode 真正被併入其他 baseline modes，
 * 且下游 classification / role / coverage 有改變。
 */
const mergeSensitive =

  mergedAtThreshold

  &&

  (
    classificationFlip ||
    roleFlip ||
    coverageFlip
  );


/**
 * percentile_pool_sensitive
 *
 * 這個 baseline mode 自己沒有被 merge，
 * 但 percentile ranking pool 改變，
 * 且因此發生 classification 或 role flip。
 *
 * 這就是 mode_19 / mode_26 類型的問題。
 */
const percentilePoolSensitive =

  !mergedAtThreshold

  &&

  percentilePoolAudit.changed

  &&

  (
    classificationFlip ||
    roleFlip
  );


if (mergeSensitive) {

  mergeSensitiveObserved =
    true;
}


if (percentilePoolSensitive) {

  percentilePoolSensitiveObserved =
    true;
}

    if (
      classificationFlip &&
      firstClassificationFlip == null
    ) {

      firstClassificationFlip =
        threshold;
    }


    if (
      evidenceFlip &&
      firstEvidenceFlip == null
    ) {

      firstEvidenceFlip =
        threshold;
    }


    if (
      scopeFlip &&
      firstScopeFlip == null
    ) {

      firstScopeFlip =
        threshold;
    }


    if (
      roleFlip &&
      firstRoleFlip == null
    ) {

      firstRoleFlip =
        threshold;
    }


    const promoted =

      tierValue(
        targetClassification
          .evidence_tier
      ) >

      tierValue(
        baselineClassification
          .evidence_tier
      );


    const mergeInduced =
  mergedAtThreshold;


    if (
      promoted &&
      mergeInduced
    ) {

      mergeInducedPromotion =
        true;


      promotionEvents.push({

        threshold,

        from:
          baselineClassification
            .evidence_tier,

        to:
          targetClassification
            .evidence_tier,

        descendant_mode_id:
          descendant.mode_id,

        source_baseline_modes:
          lineageEntry
            .source_baseline_modes
      });
    }


    descendants[key] = {

      descendant_mode_id:
        descendant.mode_id,

      source_baseline_modes:
        lineageEntry
          .source_baseline_modes,

      family_coverage:
        descendant.family_coverage,

      family_entropy:
        descendant.family_entropy,

      weighted_image_support_ratio:
        descendant
          .weighted_image_support_ratio,

      mass_percentile:
        descendant.mass_percentile,

      classification:
        targetClassification,

      comparison_to_baseline: {

  evidence_tier_flipped:
    evidenceFlip,

  scope_flipped:
    scopeFlip,

  classification_flipped:
    classificationFlip,

  role_candidates_flipped:
    roleFlip,

  family_coverage_changed:
    coverageFlip,

  family_coverage_delta:
    descendant.family_coverage -
    baselineMode.family_coverage,


  // ----------------------------------------------
  // Cause attribution
  // ----------------------------------------------

  merged_at_threshold:
    mergedAtThreshold,

  merge_sensitive:
    mergeSensitive,

  percentile_pool_sensitive:
    percentilePoolSensitive,

  percentile_pool_change_detected:
    percentilePoolAudit.changed,

  percentile_pool_changes:
    percentilePoolAudit
}
    };
  }


  const at055 =
    descendants['0.055'];


  const at065 =
    descendants['0.065'];
  const coverageSensitive =

  at055
    .comparison_to_baseline
    .family_coverage_changed

  ||

  at065
    .comparison_to_baseline
    .family_coverage_changed;

  let stabilityGrade;


  if (
    at055
      .comparison_to_baseline
      .classification_flipped
  ) {

    stabilityGrade =
      'C';

  } else if (
    at065
      .comparison_to_baseline
      .classification_flipped
  ) {

    stabilityGrade =
      'B';

  } else {

    stabilityGrade =
      'A';
  }


  return {

    stability_grade:
      stabilityGrade,

    grade_definition: {

      A:
        'Evidence Tier and Scope remain unchanged at 0.055 and 0.065.',

      B:
        'Stable at 0.055; Evidence Tier or Scope changes by 0.065.',

      C:
        'Evidence Tier or Scope changes already at 0.055.'
    },


    first_classification_flip_threshold:
      firstClassificationFlip,

    first_evidence_flip_threshold:
      firstEvidenceFlip,

    first_scope_flip_threshold:
      firstScopeFlip,

    first_role_flip_threshold:
      firstRoleFlip,


    classification_stable_at_0_055:
      !at055
        .comparison_to_baseline
        .classification_flipped,

    classification_stable_at_0_065:
      !at065
        .comparison_to_baseline
        .classification_flipped,


    evidence_tier_stable_at_0_055:
      !at055
        .comparison_to_baseline
        .evidence_tier_flipped,

    evidence_tier_stable_at_0_065:
      !at065
        .comparison_to_baseline
        .evidence_tier_flipped,


    scope_stable_at_0_055:
      !at055
        .comparison_to_baseline
        .scope_flipped,

    scope_stable_at_0_065:
      !at065
        .comparison_to_baseline
        .scope_flipped,


    role_candidates_stable_at_0_055:
      !at055
        .comparison_to_baseline
        .role_candidates_flipped,

    role_candidates_stable_at_0_065:
      !at065
        .comparison_to_baseline
        .role_candidates_flipped,


   coverage_sensitive:
  coverageSensitive,

sensitivity_causes: {

  merge_sensitive:
    mergeSensitiveObserved,

  percentile_pool_sensitive:
    percentilePoolSensitiveObserved,

  coverage_sensitive:
    coverageSensitive
},


    merge_induced_promotion_observed:
      mergeInducedPromotion,


    merge_induced_promotion_events:
      promotionEvents,


    descendants,


    policy:
      'Diagnostic descendants never override the official baseline Evidence Tier or Scope.'
  };
}


// ============================================================
// Validate B2 mode against 0.045 sensitivity mode
// ============================================================

function validateBaselineModePair(
  b2Mode,
  sensitivityMode
) {

  assert(
    b2Mode.mode_id ===
      sensitivityMode.mode_id,

    `Mode ID mismatch: ${b2Mode.mode_id} vs ${sensitivityMode.mode_id}`
  );


  assert(
    Math.abs(
      b2Mode.weighted_mass -
      sensitivityMode.weighted_mass
    ) <=
    1e-7,

    `${b2Mode.mode_id}: weighted_mass mismatch`
  );


  assert(
    b2Mode
      .representative_medoid
      .hex ===
      sensitivityMode
        .representative_medoid
        .hex,

    `${b2Mode.mode_id}: medoid mismatch`
  );


  assert(
    Math.abs(
      b2Mode.centroid_lab.L -
      sensitivityMode.centroid_lab.L
    ) <=
    1e-7,

    `${b2Mode.mode_id}: centroid L mismatch`
  );
}


// ============================================================
// Summary
// ============================================================


function buildSummary(modes) {

  const summary = {

    total_modes:
      modes.length,

    evidence_tier: {
      core: 0,
      secondary: 0,
      rare: 0
    },

    scope: {
      global: 0,
      cross_family: 0,
      family_specific: 0
    },

    stability_grade: {
      A: 0,
      B: 0,
      C: 0
    },

    role_candidates: {
      accent: 0,
      neutral: 0,
      dark: 0,
      light: 0
    },

    coverage_sensitive_count:
      0,

    merge_induced_promotion_count:
      0,

    sensitivity_causes: {

      merge_sensitive:
        0,

      percentile_pool_sensitive:
        0,

      coverage_sensitive:
        0
    }
  };


  for (
    const mode
    of modes
  ) {

    const classification =
      mode.classification;


    summary
      .evidence_tier[
        classification
          .evidence_tier
      ]++;


    summary
      .scope[
        classification.scope
      ]++;


    summary
      .stability_grade[
        mode
          .robustness
          .stability_grade
      ]++;


    if (
      classification
        .role_candidates
        .accent_candidate
    ) {

      summary
        .role_candidates
        .accent++;
    }


    if (
      classification
        .role_candidates
        .neutral_candidate
    ) {

      summary
        .role_candidates
        .neutral++;
    }


    if (
      classification
        .role_candidates
        .dark_candidate
    ) {

      summary
        .role_candidates
        .dark++;
    }


    if (
      classification
        .role_candidates
        .light_candidate
    ) {

      summary
        .role_candidates
        .light++;
    }


    if (
      mode
        .robustness
        .coverage_sensitive
    ) {

      summary
        .coverage_sensitive_count++;
    }


    if (
      mode
        .robustness
        .merge_induced_promotion_observed
    ) {

      summary
        .merge_induced_promotion_count++;
    }


    if (
      mode
        .robustness
        .sensitivity_causes
        .merge_sensitive
    ) {

      summary
        .sensitivity_causes
        .merge_sensitive++;
    }


    if (
      mode
        .robustness
        .sensitivity_causes
        .percentile_pool_sensitive
    ) {

      summary
        .sensitivity_causes
        .percentile_pool_sensitive++;
    }


    if (
      mode
        .robustness
        .sensitivity_causes
        .coverage_sensitive
    ) {

      summary
        .sensitivity_causes
        .coverage_sensitive++;
    }
  }


  return summary;
}

// ============================================================
// MAIN
// ============================================================

function main() {

  console.log(
    '=== YOYO B3-A Hierarchy Builder ==='
  );


  // ----------------------------------------------------------
  // Read sources
  // ----------------------------------------------------------

  const b2 =
    readJSON(
      B2_PATH
    );


  const sensitivity =
    readJSON(
      SENSITIVITY_PATH
    );


  validateInputs(
    b2,
    sensitivity
  );


  const families =
    getFamilies(
      b2,
      sensitivity
    );


  const familyMetadata =
    sensitivity
      .metadata
      .family_metadata;


  console.log(
    `B2 modes         : ${b2.color_modes.length}`
  );

  console.log(
    `Baseline         : ${BASELINE_THRESHOLD}`
  );

  console.log(
    `Families         : ${families.join(', ')}`
  );


  // ----------------------------------------------------------
  // Reclassify ALL threshold runs using the NEW B3-A rules
  // ----------------------------------------------------------

  const thresholdRuns = {};


  const allThresholds = [
    BASELINE_THRESHOLD,
    ...DIAGNOSTIC_THRESHOLDS
  ];


  for (
    const threshold
    of allThresholds
  ) {

    const key =
      thresholdKey(
        threshold
      );


    const rawRun =
      sensitivity
        .threshold_runs[
          key
        ];


    assert(
      rawRun,
      `Missing threshold run ${key}`
    );


    thresholdRuns[key] =
      enrichThresholdRun(
        rawRun,
        families,
        familyMetadata
      );


    console.log(
      `Threshold ${key}  : ${thresholdRuns[key].mode_count} modes`
    );
  }


  // ----------------------------------------------------------
  // Baseline
  // ----------------------------------------------------------

  const baselineRun =
    thresholdRuns['0.045'];


  const baselineMap =
    modeMap(
      baselineRun
    );


  const lineageMap =
    new Map(
      sensitivity
        .baseline_lineages
        .map(
          lineage => [
            lineage.baseline_mode_id,
            lineage
          ]
        )
    );


  // ----------------------------------------------------------
  // Create final B3 mode records
  // ----------------------------------------------------------

  const finalModes = [];


  for (
    const b2Mode
    of b2.color_modes
  ) {

    const baselineMode =
      baselineMap.get(
        b2Mode.mode_id
      );


    assert(
      baselineMode,
      `Missing baseline mode: ${b2Mode.mode_id}`
    );


    validateBaselineModePair(
      b2Mode,
      baselineMode
    );


    const lineage =
      lineageMap.get(
        b2Mode.mode_id
      );


    assert(
      lineage,
      `Missing lineage: ${b2Mode.mode_id}`
    );


    const robustness =
  buildRobustness(
    baselineMode,
    lineage,
    thresholdRuns,
    families
  );



    finalModes.push({

      mode_id:
        b2Mode.mode_id,

      mode_rank:
        b2Mode.mode_rank,


      // ------------------------------------------------------
      // Physical truth from B2
      // ------------------------------------------------------

      physical: {

        baseline_threshold:
          BASELINE_THRESHOLD,

        centroid_hex:
          b2Mode.centroid_hex,

        centroid_lab:
          b2Mode.centroid_lab,

        centroid_lch:
          b2Mode.centroid_lch,

        representative_medoid:
          b2Mode
            .representative_medoid,

        weighted_mass:
          b2Mode.weighted_mass,

        normalized_mass:
          b2Mode.normalized_mass,

        member_count:
          b2Mode.member_count,

        image_support:
          b2Mode.image_support,

        weighted_image_support:
          b2Mode
            .weighted_image_support,

        weighted_image_support_ratio:
          b2Mode
            .weighted_image_support_ratio,

        family_support:
          b2Mode.family_support,

        family_support_count:
          b2Mode
            .family_support_count
      },


      // ------------------------------------------------------
      // Baseline evidence only
      // ------------------------------------------------------

      evidence_metrics: {

        mass_percentile:
          baselineMode
            .mass_percentile,

        chroma_percentile:
          baselineMode
            .chroma_percentile,

        lightness_percentile:
          baselineMode
            .lightness_percentile,

        family_coverage:
          baselineMode
            .family_coverage,

        family_entropy:
          baselineMode
            .family_entropy,

        family_breakdown:
          baselineMode
            .family_breakdown
      },


      // ------------------------------------------------------
      // OFFICIAL B3-A classification
      // ------------------------------------------------------

      classification:
        baselineMode
          .b3_classification,


      // ------------------------------------------------------
      // Threshold robustness sidecar
      // ------------------------------------------------------

      robustness
    });
  }


  // ----------------------------------------------------------
  // Summary
  // ----------------------------------------------------------

  const summary =
    buildSummary(
      finalModes
    );


  // ----------------------------------------------------------
  // Output
  // ----------------------------------------------------------

  const output = {

    metadata: {

      name:
        'YOYO B3-A Evidence Hierarchy',

      step:
        'B3A_Hierarchy',

      version:
        CONTRACT_VERSION,

      contract_status:
        'candidate_for_validation',

      source_b2_file:
        path.basename(
          B2_PATH
        ),

      source_sensitivity_file:
        path.basename(
          SENSITIVITY_PATH
        ),

      source_set:
        b2
          ?.metadata
          ?.source_set
        ||
        null,

      total_images:
        b2
          ?.metadata
          ?.total_images
        ||
        null,

      effective_global_weight:
        b2
          ?.metadata
          ?.effective_global_weight
        ||
        null,

      total_physical_modes:
        finalModes.length,

      baseline_threshold:
        BASELINE_THRESHOLD,

      diagnostic_thresholds:
        DIAGNOSTIC_THRESHOLDS,

      families,


      fundamental_policy: {

        official_identity:
          'Only B2 physical modes at threshold 0.045 are official B3-A classification entities.',

        robustness_policy:
          '0.055 and 0.065 descendants are diagnostic-only and cannot promote or replace baseline evidence.',

        evidence_policy:
          'Evidence Tier is determined exclusively from baseline 0.045 evidence.',

        no_semantic_naming:
          true,

        no_mode_deletion:
          true,

        no_core_score:
          true,

        no_absolute_weighted_family_support_threshold:
          true,

        minimum_distinct_image_support_floor:
          2
      },


      methodological_note:
        'Family coverage is informative but threshold-sensitive. Wider-threshold descendants are therefore used only to assess robustness, not to manufacture stronger baseline evidence.'
    },


    rules:
      B3_RULES,


    summary,


    modes:
      finalModes
  };


  const rounded =
    roundedClone(
      output,
      8
    );


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
  // Console report
  // ----------------------------------------------------------

  console.log('');

  console.log(
    '=== B3-A Result ==='
  );


  console.log(
    `Total Modes   : ${summary.total_modes}`
  );


  console.log(
    `Core          : ${summary.evidence_tier.core}`
  );

  console.log(
    `Secondary     : ${summary.evidence_tier.secondary}`
  );

  console.log(
    `Rare          : ${summary.evidence_tier.rare}`
  );


  console.log('');

  console.log(
    `Global        : ${summary.scope.global}`
  );

  console.log(
    `Cross-family  : ${summary.scope.cross_family}`
  );

  console.log(
    `Family-specific: ${summary.scope.family_specific}`
  );


  console.log('');

  console.log(
    `Stability A   : ${summary.stability_grade.A}`
  );

  console.log(
    `Stability B   : ${summary.stability_grade.B}`
  );

  console.log(
    `Stability C   : ${summary.stability_grade.C}`
  );


  console.log('');

  console.log(
    `Accent candidates : ${summary.role_candidates.accent}`
  );

  console.log(
    `Neutral candidates: ${summary.role_candidates.neutral}`
  );

  console.log(
    `Dark candidates   : ${summary.role_candidates.dark}`
  );

  console.log(
    `Light candidates  : ${summary.role_candidates.light}`
  );


  console.log('');

  console.log(
    `Coverage-sensitive modes       : ${summary.coverage_sensitive_count}`
  );

  console.log(
  `Merge-induced promotion signals: ${summary.merge_induced_promotion_count}`
);


console.log('');

console.log(
  `Merge-sensitive modes          : ${summary.sensitivity_causes.merge_sensitive}`
);

console.log(
  `Percentile-pool-sensitive modes: ${summary.sensitivity_causes.percentile_pool_sensitive}`
);

console.log(
  `Coverage-sensitive modes       : ${summary.sensitivity_causes.coverage_sensitive}`
);


  console.log('');

  console.log(
    'Output written to:'
  );

  console.log(
    OUTPUT_PATH
  );


  console.log('');

  console.log(
    '✅ B3-A Hierarchy completed.'
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
    '❌ B3-A HIERARCHY FAILED'
  );

  console.error(
    error.stack ||
    error.message
  );

  process.exit(1);
}