
/**
 * YOYO Physical / Perceptual Audit Engine
 * Contract: YOYO_PERCEPTUAL_RELATION_V1
 *
 * Important:
 * - This is a deterministic, explainable perception heuristic.
 * - It simulates human-like perceptual relations using OKLab/OKLCH-derived features.
 * - It is not a trained human-vision model and must not be treated as ground truth.
 */

export const ENGINE_VERSION = 'YOYO_PERCEPTUAL_RELATION_V1.0.0';

const clamp = (x, a=0, b=1) => Math.max(a, Math.min(b, x));

export function normalizeHex(hex) {
  let s = String(hex || '').trim().replace('#', '').toUpperCase();
  if (s.length === 3) s = s.split('').map(x => x + x).join('');
  if (!/^[0-9A-F]{6}$/.test(s)) throw new Error(`Invalid HEX: ${hex}`);
  return '#' + s;
}

export function hexToRgb(hex) {
  const h = normalizeHex(hex).slice(1);
  return {
    r: parseInt(h.slice(0,2), 16) / 255,
    g: parseInt(h.slice(2,4), 16) / 255,
    b: parseInt(h.slice(4,6), 16) / 255
  };
}

function srgbToLinear(v) {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function rgbToOKLab({r,g,b}) {
  r = srgbToLinear(r);
  g = srgbToLinear(g);
  b = srgbToLinear(b);

  const l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b;
  const m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b;
  const s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_,
    a: 1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_,
    b: 0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_
  };
}

export function oklabToOKLCH({L,a,b}) {
  const C = Math.sqrt(a*a + b*b);
  let h = Math.atan2(b, a) * 180 / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

export function featuresFromHex(hex) {
  const rgb = hexToRgb(hex);
  const lab = rgbToOKLab(rgb);
  const lch = oklabToOKLCH(lab);
  const tone = toneClass(lch.L, lch.C);
  const hue = hueFamily(lch.h, lch.C);
  return {
    hex: normalizeHex(hex),
    ...lab,
    ...lch,
    hue_family: hue,
    tone_family: tone,
    chroma_band: chromaBand(lch.C),
    lightness_band: lightnessBand(lch.L),
    temperature: temperatureFamily(lch.h, lch.C),
    neutrality: neutralityClass(lch.C)
  };
}

export function circularHueDistance(a, b) {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

function lightnessBand(L) {
  if (L < 0.25) return 'near_black';
  if (L < 0.42) return 'dark';
  if (L < 0.62) return 'mid';
  if (L < 0.78) return 'light';
  return 'very_light';
}

function chromaBand(C) {
  if (C < 0.02) return 'achromatic';
  if (C < 0.05) return 'muted';
  if (C < 0.10) return 'soft';
  if (C < 0.17) return 'chromatic';
  return 'vivid';
}

function neutralityClass(C) {
  if (C < 0.02) return 'achromatic';
  if (C < 0.045) return 'near_neutral';
  if (C < 0.08) return 'weak_chromatic';
  return 'chromatic';
}

function toneClass(L, C) {
  return `${lightnessBand(L)}_${chromaBand(C)}`;
}

function hueFamily(h, C) {
  if (C < 0.025) return 'neutral';
  // Perceptual-ish broad prototype regions; intentionally coarse.
  if (h >= 345 || h < 20) return 'red';
  if (h < 55) return 'orange_brown';
  if (h < 90) return 'yellow';
  if (h < 150) return 'green';
  if (h < 205) return 'cyan';
  if (h < 255) return 'blue';
  if (h < 300) return 'purple';
  return 'magenta';
}

function temperatureFamily(h, C) {
  if (C < 0.025) return 'neutral';
  // warm: red/orange/yellow and magenta-red region
  if (h >= 320 || h < 100) return 'warm';
  if (h >= 180 && h < 300) return 'cool';
  return 'mixed';
}

function gaussianSimilarity(d, sigma) {
  return Math.exp(-0.5 * Math.pow(d / sigma, 2));
}

function hueReliability(C) {
  // Hue becomes progressively unreliable in low chroma regions.
  return clamp((C - 0.015) / 0.065);
}

export function pairRelation(A, B) {
  const a = A.hex ? A : featuresFromHex(A);
  const b = B.hex ? B : featuresFromHex(B);

  const dL = Math.abs(a.L - b.L);
  const dC = Math.abs(a.C - b.C);
  const dH = circularHueDistance(a.h, b.h);
  const deltaE = Math.sqrt(
    Math.pow(a.L-b.L, 2) +
    Math.pow(a.a-b.a, 2) +
    Math.pow(a.b-b.b, 2)
  );

  const relHue = Math.min(hueReliability(a.C), hueReliability(b.C));
  const lightnessSimilarity = gaussianSimilarity(dL, 0.16);
  const chromaSimilarity = gaussianSimilarity(dC, 0.075);
  const hueSimilarityRaw = gaussianSimilarity(dH, 38);
  const hueSimilarity = relHue * hueSimilarityRaw + (1-relHue) * 0.5;

  const toneSimilarity = clamp(
    0.68 * lightnessSimilarity +
    0.32 * chromaSimilarity
  );

  // Generic "human-like" affinity:
  // never lets one scalar erase the dimension-specific diagnostics.
  const overallSimilarity = clamp(
    0.44 * toneSimilarity +
    0.40 * hueSimilarity +
    0.16 * gaussianSimilarity(deltaE, 0.14)
  );

  const bothNearNeutral = a.C < 0.045 && b.C < 0.045;
  const eitherNearNeutral = a.C < 0.045 || b.C < 0.045;

  let hueRelation = 'different';
  if (bothNearNeutral) {
    hueRelation = 'hue_weak_neutral';
  } else if (relHue < 0.30) {
    hueRelation = 'hue_uncertain_low_chroma';
  } else if (dH <= 25) {
    hueRelation = 'same_or_very_close';
  } else if (dH <= 60) {
    hueRelation = 'adjacent';
  } else {
    hueRelation = 'different';
  }

  let toneRelation =
    toneSimilarity >= 0.82 ? 'same_or_very_close' :
    toneSimilarity >= 0.64 ? 'related' :
    'different';

  let verdict = 'REVIEW';
  let confidence = 0.55;
  const reasons = [];

  if (bothNearNeutral) {
    reasons.push('Both colors are low-chroma, so hue is weak evidence.');
    if (toneSimilarity >= 0.84) {
      verdict = 'SAME';
      confidence = 0.82;
      reasons.push('Lightness/chroma pattern is strongly aligned.');
    } else if (toneSimilarity >= 0.64) {
      verdict = 'RELATED';
      confidence = 0.76;
      reasons.push('Low-chroma colors share a related tone pattern.');
    } else {
      verdict = 'DIFFERENT';
      confidence = 0.78;
      reasons.push('Their tone structure is too different despite low chroma.');
    }
  } else {
    if (dH <= 25 && toneSimilarity >= 0.76) {
      verdict = 'SAME';
      confidence = clamp(0.74 + 0.22 * overallSimilarity);
      reasons.push('Hue direction and tone are both strongly aligned.');
    } else if (dH <= 60 && toneSimilarity >= 0.62) {
      verdict = 'RELATED';
      confidence = clamp(0.70 + 0.18 * overallSimilarity);
      reasons.push('Hue regions are adjacent and tone remains compatible.');
    } else if (dH > 60 && toneSimilarity >= 0.72) {
      verdict = 'RELATED';
      confidence = 0.78;
      reasons.push('Tone is similar, but hue identity is different. Do not collapse to one hue family.');
    } else if (dH > 85 && toneSimilarity < 0.72) {
      verdict = 'DIFFERENT';
      confidence = 0.86;
      reasons.push('Both hue identity and tone structure are separated.');
    } else if (eitherNearNeutral && toneSimilarity >= 0.70) {
      verdict = 'RELATED';
      confidence = 0.68;
      reasons.push('One color is near-neutral; tone is more reliable than hue here.');
    } else {
      verdict = 'REVIEW';
      confidence = 0.58;
      reasons.push('Mixed evidence: no single perceptual dimension is decisive.');
    }
  }

  const semanticWarnings = [];
  if (dH > 60 && toneSimilarity >= 0.72 && relHue >= 0.35) {
    semanticWarnings.push('TONE_SIMILAR_HUE_CONFLICT');
  }
  if (relHue < 0.30) {
    semanticWarnings.push('LOW_CHROMA_HUE_UNCERTAIN');
  }
  if (Math.abs(a.L - b.L) < 0.08 && dH > 75 && relHue >= 0.35) {
    semanticWarnings.push('SIMILAR_LIGHTNESS_DIFFERENT_HUE');
  }

  return {
    a: a.hex,
    b: b.hex,
    metrics: {
      deltaE_oklab: +deltaE.toFixed(4),
      deltaL: +dL.toFixed(4),
      deltaC: +dC.toFixed(4),
      deltaH_deg: +dH.toFixed(2),
      hue_reliability: +relHue.toFixed(3),
      lightness_similarity: +lightnessSimilarity.toFixed(3),
      chroma_similarity: +chromaSimilarity.toFixed(3),
      hue_similarity: +hueSimilarity.toFixed(3),
      tone_similarity: +toneSimilarity.toFixed(3),
      overall_similarity: +overallSimilarity.toFixed(3)
    },
    classification: {
      hue_relation: hueRelation,
      tone_relation: toneRelation,
      same_hue_family: hueRelation === 'same_or_very_close' || hueRelation === 'hue_weak_neutral',
      same_tone_family: toneRelation === 'same_or_very_close',
      verdict,
      confidence: +confidence.toFixed(3)
    },
    semantic_warnings: semanticWarnings,
    reasons
  };
}

export function centroidForColors(colors) {
  if (!colors.length) throw new Error('Empty color group');
  const fs = colors.map(c => featuresFromHex(c.hex || c));
  const avg = key => fs.reduce((s,x) => s + x[key], 0) / fs.length;
  // Average in OKLab then derive C/h.
  const lab = { L: avg('L'), a: avg('a'), b: avg('b') };
  const lch = oklabToOKLCH(lab);
  return {
    ...lab, ...lch,
    hex: null,
    hue_family: hueFamily(lch.h, lch.C),
    tone_family: toneClass(lch.L, lch.C),
    chroma_band: chromaBand(lch.C),
    lightness_band: lightnessBand(lch.L),
    temperature: temperatureFamily(lch.h, lch.C),
    neutrality: neutralityClass(lch.C)
  };
}

export function auditGroup(group) {
  const members = group.members.map(m => ({
    ...m,
    hex: normalizeHex(m.hex),
    features: featuresFromHex(m.hex)
  }));

  const pairs = [];
  for (let i=0; i<members.length; i++) {
    for (let j=i+1; j<members.length; j++) {
      pairs.push({
        ids: [members[i].id, members[j].id],
        relation: pairRelation(members[i].features, members[j].features)
      });
    }
  }

  let cohesion = 1;
  let warningCount = 0;
  if (pairs.length) {
    cohesion = pairs.reduce((s,p) => s + p.relation.metrics.overall_similarity, 0) / pairs.length;
    warningCount = pairs.reduce((s,p) => s + p.relation.semantic_warnings.length, 0);
  }

  const centroid = centroidForColors(members);

  let status = 'STABLE';
  if (members.length > 1) {
    const diff = pairs.filter(p => p.relation.classification.verdict === 'DIFFERENT').length;
    const review = pairs.filter(p => p.relation.classification.verdict === 'REVIEW').length;
    const hueConflict = pairs.filter(p => p.relation.semantic_warnings.includes('TONE_SIMILAR_HUE_CONFLICT')).length;
    if (diff > 0 || hueConflict > 0) status = 'REVIEW';
    if (diff >= Math.ceil(pairs.length / 2)) status = 'UNSTABLE';
    if (review > 0 && status === 'STABLE') status = 'REVIEW';
  }

  return {
    id: group.id,
    label: group.label || group.id,
    members,
    centroid,
    cohesion: +cohesion.toFixed(3),
    status,
    pair_count: pairs.length,
    warning_count: warningCount,
    pairs
  };
}

function centroidAsFeature(c) {
  return {
    ...c,
    hex: c.hex || `CENTROID(${c.L.toFixed(3)},${c.a.toFixed(3)},${c.b.toFixed(3)})`
  };
}

export function auditProfile(profile) {
  const groups = profile.groups.map(auditGroup);
  const cross = [];
  for (let i=0; i<groups.length; i++) {
    for (let j=i+1; j<groups.length; j++) {
      const ca = centroidAsFeature(groups[i].centroid);
      const cb = centroidAsFeature(groups[j].centroid);
      const rel = pairRelation(ca, cb);
      cross.push({
        groups: [groups[i].id, groups[j].id],
        relation: rel
      });
    }
  }

  const dangerPairs = cross
    .filter(x => x.relation.semantic_warnings.includes('TONE_SIMILAR_HUE_CONFLICT'))
    .sort((a,b) => b.relation.metrics.tone_similarity - a.relation.metrics.tone_similarity);

  const nearestPairs = [...cross]
    .sort((a,b) => b.relation.metrics.overall_similarity - a.relation.metrics.overall_similarity)
    .slice(0, 12);

  const unstable = groups.filter(g => g.status !== 'STABLE');

  return {
    contract: 'YOYO_PHYSICAL_AUDIT_V1',
    engine_version: ENGINE_VERSION,
    profile_name: profile.profile_name || 'Untitled',
    generated_at: new Date().toISOString(),
    groups,
    cross_group_relations: cross,
    danger_pairs: dangerPairs,
    nearest_pairs: nearestPairs,
    summary: {
      group_count: groups.length,
      color_count: groups.reduce((s,g) => s + g.members.length, 0),
      stable_groups: groups.filter(g => g.status === 'STABLE').length,
      review_groups: groups.filter(g => g.status === 'REVIEW').length,
      unstable_groups: groups.filter(g => g.status === 'UNSTABLE').length,
      danger_pair_count: dangerPairs.length
    }
  };
}
