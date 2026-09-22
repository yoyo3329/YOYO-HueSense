#!/usr/bin/env python3
import argparse, json, math
from pathlib import Path
import numpy as np
from PIL import Image


def read(p):
    return json.loads(Path(p).read_text(encoding='utf-8'))


def write(p, o):
    Path(p).write_text(json.dumps(o, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def finite(x):
    try:
        return x is not None and math.isfinite(float(x))
    except Exception:
        return False


def q(vals, p):
    vals = [float(x) for x in vals if finite(x)]
    return None if not vals else float(np.quantile(np.asarray(vals, float), p))


def stats(vals):
    vals = [float(x) for x in vals if finite(x)]
    if not vals:
        return {
            'n': 0, 'min': None, 'p05': None, 'p25': None, 'median': None,
            'p75': None, 'p95': None, 'max': None, 'mean': None, 'std': None,
            'positive_ratio': None, 'negative_ratio': None, 'zero_ratio': None
        }
    a = np.asarray(vals, float)
    return {
        'n': len(vals), 'min': float(a.min()), 'p05': q(vals, .05),
        'p25': q(vals, .25), 'median': q(vals, .5), 'p75': q(vals, .75),
        'p95': q(vals, .95), 'max': float(a.max()), 'mean': float(a.mean()),
        'std': float(a.std()), 'positive_ratio': float(np.mean(a > 0)),
        'negative_ratio': float(np.mean(a < 0)), 'zero_ratio': float(np.mean(a == 0))
    }


def cosine(a, b):
    a = np.asarray(a, float)
    b = np.asarray(b, float)
    d = float(np.linalg.norm(a) * np.linalg.norm(b))
    return None if d == 0 else float(np.dot(a, b) / d)


def softmax_entropy(vals):
    if not vals:
        return None
    a = np.asarray(vals, float)
    a = a - a.max()
    e = np.exp(a)
    p = e / e.sum()
    h = -float(np.sum(p * np.log(np.maximum(p, 1e-15))))
    return 0.0 if len(vals) <= 1 else h / math.log(len(vals))


def score_quality(axis):
    scores = (axis or {}).get('scores', {})
    vals = sorted([(float(v), k) for k, v in scores.items()], reverse=True)
    if not vals:
        return {
            'top1_label': None, 'top1_score': None, 'top2_label': None,
            'top2_score': None, 'margin': None, 'spread': None, 'std': None,
            'softmax_normalized_entropy_descriptive': None,
            'top_label_authority': 'NONE'
        }
    arr = np.asarray([v for v, _ in vals], float)
    top1 = vals[0]
    top2 = vals[1] if len(vals) > 1 else (None, None)
    return {
        'top1_label': top1[1], 'top1_score': top1[0],
        'top2_label': top2[1], 'top2_score': top2[0],
        'margin': None if top2[0] is None else top1[0] - top2[0],
        'spread': float(arr.max() - arr.min()), 'std': float(arr.std()),
        'softmax_normalized_entropy_descriptive': softmax_entropy(arr.tolist()),
        'entropy_semantics': 'DESCRIPTIVE_SOFTMAX_NORMALIZATION_NOT_CLASS_PROBABILITY',
        'top_label_authority': 'NONE'
    }


def mask_arr(p):
    return np.asarray(Image.open(p).convert('L')) > 0


def dist(details, role_index):
    keys = ['homogeneity_gain', 'bimodal_reduction', 'lightness_spread_reduction']
    out = {}
    for key in keys:
        vals = [d.get(key) for d in details if finite(d.get(key))]
        s = stats(vals)
        weighted, weights = [], []
        for d in details:
            v = d.get(key)
            r = role_index.get(d.get('mask_hypothesis_id'), {})
            w = r.get('unique_coverage_ratio')
            if finite(v) and finite(w) and float(w) > 0:
                weighted.append(float(v))
                weights.append(float(w))
        if weights:
            wa = np.asarray(weights, float)
            va = np.asarray(weighted, float)
            den = float(wa.sum())
            s['unique_coverage_weighted_mean'] = float(np.sum(wa * va) / den)
            s['unique_coverage_weighted_positive_gain'] = float(np.sum(wa * np.maximum(va, 0)) / den)
            s['unique_coverage_weight_sum'] = den
        else:
            s['unique_coverage_weighted_mean'] = None
            s['unique_coverage_weighted_positive_gain'] = None
            s['unique_coverage_weight_sum'] = 0.0
        s['descriptive_weight_semantics'] = 'UNIQUE_COVERAGE_DESCRIPTIVE_ONLY_NOT_DECISION_WEIGHT'
        out[key] = s
    return out


def authority_from_roles(role_names, matrix):
    names = list(role_names)
    rows = [matrix.get(n) for n in names if matrix.get(n)]
    if not rows:
        return {
            'scene_context_allowed': 'UNKNOWN', 'palette_context_allowed': 'UNKNOWN',
            'local_split_authority': False, 'local_group_authority': False,
            'local_recovery_authority': False,
            'basis': 'NO_RECOGNIZED_ROLE_EVIDENCE_DEFAULT_HOLD',
            'future_independent_evidence_may_reopen_authority': True
        }

    def any_true(key):
        return any(r.get(key) is True for r in rows)

    # Local authority is deliberately conservative at this evidence-preparation stage.
    # Any role evidence that denies local authority (GLOBAL/BACKGROUND/AMBIGUOUS) blocks it.
    local_split = any_true('local_split_authority') and all(r.get('local_split_authority') is True for r in rows)
    local_group = any_true('local_group_authority') and all(r.get('local_group_authority') is True for r in rows)
    local_recovery = any_true('local_recovery_authority') and all(r.get('local_recovery_authority') is True for r in rows)

    scene_vals = [r.get('scene_context_allowed') for r in rows]
    palette_vals = [r.get('palette_context_allowed') for r in rows]
    scene = True if True in scene_vals else ('AUXILIARY' if 'AUXILIARY' in scene_vals else False)
    palette = True if True in palette_vals else ('AUXILIARY' if 'AUXILIARY' in palette_vals else False)

    blockers = []
    for n, r in zip(names, [matrix.get(n) for n in names]):
        if r and r.get('local_recovery_authority') is False:
            blockers.append(n)
    return {
        'scene_context_allowed': scene,
        'palette_context_allowed': palette,
        'local_split_authority': local_split,
        'local_group_authority': local_group,
        'local_recovery_authority': local_recovery,
        'basis': 'CONSERVATIVE_OVERLAPPING_ROLE_EVIDENCE_AUTHORITY_MATRIX',
        'blocking_role_evidence': blockers,
        'role_is_truth': False,
        'future_independent_evidence_may_reopen_authority': True,
        'authority_override_executed': False
    }


def tail_impact(pairs, threshold):
    unstable = [x for x in pairs if x['iou'] < threshold]
    total_area_mass = sum(float(x.get('area_ratio') or 0.0) for x in pairs)
    unstable_area_mass = sum(float(x.get('area_ratio') or 0.0) for x in unstable)
    total_unique_area_mass = sum(float(x.get('area_ratio') or 0.0) * float(x.get('unique_coverage_ratio') or 0.0) for x in pairs)
    unstable_unique_area_mass = sum(float(x.get('area_ratio') or 0.0) * float(x.get('unique_coverage_ratio') or 0.0) for x in unstable)
    return {
        'threshold_iou_lt': threshold,
        'unstable_mask_count': len(unstable),
        'unstable_area_mass': unstable_area_mass,
        'total_mask_area_mass': total_area_mass,
        'unstable_area_fraction': None if total_area_mass <= 0 else unstable_area_mass / total_area_mass,
        'unstable_unique_area_mass': unstable_unique_area_mass,
        'total_unique_area_mass': total_unique_area_mass,
        'unstable_unique_coverage_fraction': None if total_unique_area_mass <= 0 else unstable_unique_area_mass / total_unique_area_mass,
        'fraction_semantics': 'DESCRIPTIVE_MASK_EVIDENCE_MASS_RATIO_NOT_NONOVERLAP_PIXEL_UNION',
        'largest_area_unstable_mask': max(unstable, key=lambda x: (x.get('area_ratio') or -1), default=None),
        'highest_unique_coverage_unstable_mask': max(unstable, key=lambda x: ((x.get('area_ratio') or 0) * (x.get('unique_coverage_ratio') or 0)), default=None)
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--a22-run', required=True)
    ap.add_argument('--a21-run')
    ap.add_argument('--out-dir', required=True)
    ap.add_argument('--config', required=True)
    ap.add_argument('--postprocess-env', required=True)
    a = ap.parse_args()

    a22 = Path(a.a22_run)
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    cfg = read(a.config)
    a22m = read(a22 / 'run_manifest.json')
    a21 = Path(a.a21_run or a22m.get('upstream_a21_run', ''))
    if not (a21 / 'run_manifest.json').exists():
        raise SystemExit('A2.1 upstream run not found: ' + str(a21))

    a21m = read(a21 / 'run_manifest.json')
    a21fp = read(a21 / 'run_fingerprint.json') if (a21 / 'run_fingerprint.json').exists() else a21m.get('run_fingerprint', {})
    a22roles = read(a22 / 'mask_role_hypotheses.json')
    a21fh = read(a21 / 'foundation_mask_hypotheses.json')
    a21map = read(a21 / 'atomic_foundation_overlap_raw.json')
    a21rec = read(a21 / 'a1_failure_recovery.json')
    a21graph = read(a21 / 'a2_relationship_multigraph.json')
    postenv = read(a.postprocess_env)

    matrix = cfg['role_authority_matrix']
    fh_by = {x['image_id']: x for x in a21fh['images']}
    map_by = {x['image_id']: x for x in a21map['images']}

    role_index = {}
    images = []
    role_hyp_counts = {}
    multi_role = 0
    scene_or_background_blocked = 0
    background_newly_blocked = 0
    ambiguous_blocked = 0

    for im in a22roles['images']:
        iid = im['image_id']
        fh = fh_by[iid]
        mask_meta = {m['mask_hypothesis_id']: m for m in fh['foundation_mask_hypotheses']}
        roles = []
        for r0 in im['roles']:
            r = dict(r0)
            names = [x['role'] for x in r.get('role_hypotheses', [])]
            nset = set(names)
            multi_role += int(len(nset) > 1)
            for n in names:
                role_hyp_counts[n] = role_hyp_counts.get(n, 0) + 1

            authority = authority_from_roles(names, matrix)
            old_allowed = bool(r0.get('local_recovery_route_allowed', True))
            new_allowed = bool(authority['local_recovery_authority'])
            if (('GLOBAL_CONTEXT_CANDIDATE' in nset) or ('BACKGROUND_PLANE_CANDIDATE' in nset)) and not new_allowed:
                scene_or_background_blocked += 1
            if 'BACKGROUND_PLANE_CANDIDATE' in nset and old_allowed and not new_allowed:
                background_newly_blocked += 1
            if 'AMBIGUOUS' in nset and old_allowed and not new_allowed:
                ambiguous_blocked += 1

            r['role_resolution'] = 'UNRESOLVED_OVERLAPPING_EVIDENCE'
            r['role_truth_claim'] = False
            r['routing_authority'] = authority
            r['local_split_authority'] = bool(authority['local_split_authority'])
            r['local_group_authority'] = bool(authority['local_group_authority'])
            r['local_recovery_route_allowed'] = new_allowed
            r['local_recovery_exclusion_reason'] = None if new_allowed else 'ROLE_AUTHORITY_MATRIX_HOLD'
            r['mask_role_evidence_vector'] = {
                'area_ratio': r.get('area_ratio'),
                'touch_sides': (r.get('border') or {}).get('touch_sides'),
                'border_coverage_fraction': (r.get('border') or {}).get('border_coverage_fraction'),
                'child_count': r.get('child_count'),
                'parent_count': r.get('parent_count'),
                'unique_coverage_ratio': r.get('unique_coverage_ratio'),
                'role_hypotheses': names,
                'semantics': 'ROLE_EVIDENCE_NOT_ROLE_TRUTH'
            }

            mid = r['mask_hypothesis_id']
            rawm = mask_meta.get(mid, {})
            sem = {}
            for axis_name, axis in (rawm.get('semantic_prior') or {}).get('axes', {}).items():
                sem[axis_name] = score_quality(axis)
            r['semantic_prompt_evidence_quality'] = sem
            r['semantic_top_label_authority'] = 'NONE'
            r['final_information_score'] = None
            r['authority'] = 'EVIDENCE_ONLY'
            role_index[mid] = r
            roles.append(r)

        masks = fh['foundation_mask_hypotheses']
        arrs = [mask_arr(a21 / m['mask_asset']) for m in masks]
        if arrs:
            raw_union = np.zeros_like(arrs[0], bool)
            local_union = np.zeros_like(arrs[0], bool)
            for m, mm in zip(masks, arrs):
                raw_union |= mm
                if role_index[m['mask_hypothesis_id']]['local_recovery_route_allowed']:
                    local_union |= mm
            covraw = float(raw_union.mean())
            covloc = float(local_union.mean())
        else:
            covraw = covloc = 0.0

        mapping = map_by[iid]
        raw_split = sum(1 for rr in mapping['atomic_regions'] if len(rr.get('overlaps', [])) > 1)
        local_split = 0
        for rr in mapping['atomic_regions']:
            ovs = [x for x in rr.get('overlaps', []) if role_index.get(x['mask_hypothesis_id'], {}).get('local_split_authority')]
            if len(ovs) > 1:
                local_split += 1
        raw_group = sum(1 for g in mapping['foundation_masks'] if len(g.get('atomic_memberships', [])) > 1)
        local_group = sum(
            1 for g in mapping['foundation_masks']
            if role_index.get(g['mask_hypothesis_id'], {}).get('local_group_authority')
            and len(g.get('atomic_memberships', [])) > 1
        )
        images.append({
            'image_id': iid,
            'mask_count': len(roles),
            'roles': roles,
            'coverage': {
                'foundation_union_coverage_raw': covraw,
                'foundation_union_coverage_local_authority_eligible': covloc,
                'coverage_removed_from_local_authority': covraw - covloc,
                'coverage_semantics': 'RAW_MASK_UNION_VS_ROLE_AUTHORITY_ELIGIBLE_LOCAL_MASK_UNION'
            },
            'hypothesis_capability': {
                'raw_foundation': {
                    'split_capable_atomic_count': raw_split,
                    'group_capable_mask_count': raw_group
                },
                'local_authority_eligible': {
                    'split_capable_atomic_count': local_split,
                    'group_capable_mask_count': local_group
                },
                'semantics': 'CAPABILITY_NOT_RECOVERY_SUCCESS'
            }
        })

    # Recovery distributions after authority routing.
    rec_cases = []
    for c in a21rec['cases']:
        rows, raw_all, local_all = [], [], []
        for rr in c.get('foreground_dilution_recovery_evidence', []):
            raw = rr.get('details', [])
            local = [d for d in raw if role_index.get(d.get('mask_hypothesis_id'), {}).get('local_recovery_route_allowed')]
            raw_all += raw
            local_all += local
            rows.append({
                'region_id': rr['region_id'],
                'raw_foundation': {'candidate_count': len(raw), 'distributions': dist(raw, role_index)},
                'local_authority_eligible': {'candidate_count': len(local), 'distributions': dist(local, role_index)}
            })
        io = next(x for x in images if x['image_id'] == c['image_id'])
        rec_cases.append({
            'case_name': c['case_name'],
            'image_id': c['image_id'],
            'a1_failure_modes': c.get('a1_failure_modes', []),
            'coverage': io['coverage'],
            'capability_counts': io['hypothesis_capability'],
            'foreground_dilution_recovery': {
                'per_atomic_region': rows,
                'raw_foundation_aggregate': {'candidate_count': len(raw_all), 'distributions': dist(raw_all, role_index)},
                'local_authority_eligible_aggregate': {'candidate_count': len(local_all), 'distributions': dist(local_all, role_index)}
            },
            'interpretation': 'DISTRIBUTIONAL_EVIDENCE_ONLY_NOT_RECOVERY_ACCURACY'
        })

    # Stability tail plus impact mass; still descriptive, never a validity score.
    stimgs = []
    meaningful_tail_found = False
    for iid, fh in fh_by.items():
        cs = fh.get('critical_case_mask_stability')
        if not cs:
            continue
        masks = fh['foundation_mask_hypotheses']
        out_probes = {}
        for probe_name, sv in cs.items():
            vals = sv.get('best_iou_per_base_mask', [])
            pairs = []
            for i, v in enumerate(vals):
                if i >= len(masks):
                    continue
                mid = masks[i]['mask_hypothesis_id']
                r = role_index.get(mid, {})
                pairs.append({
                    'mask_hypothesis_id': mid,
                    'iou': float(v),
                    'area_ratio': r.get('area_ratio'),
                    'unique_coverage_ratio': r.get('unique_coverage_ratio'),
                    'local_recovery_route_allowed': r.get('local_recovery_route_allowed')
                })
            s = stats([x['iou'] for x in pairs])
            impacts = {}
            for thr in cfg['stability_tail_thresholds']:
                impacts[str(thr)] = tail_impact(pairs, float(thr))
            unstable09 = [x for x in pairs if x['iou'] < .9]
            if any(x['iou'] < .5 and (x.get('area_ratio') or 0) >= .01 for x in pairs):
                meaningful_tail_found = True
            s.update({
                'below_0_90': sum(x['iou'] < .9 for x in pairs),
                'below_0_80': sum(x['iou'] < .8 for x in pairs),
                'below_0_50': sum(x['iou'] < .5 for x in pairs),
                'worst_masks': sorted(pairs, key=lambda x: x['iou'])[:8],
                'largest_area_unstable_mask': max(unstable09, key=lambda x: (x.get('area_ratio') or -1), default=None),
                'highest_unique_coverage_unstable_mask': max(unstable09, key=lambda x: ((x.get('area_ratio') or 0) * (x.get('unique_coverage_ratio') or 0)), default=None),
                'tail_impact_by_threshold': impacts,
                'central_tendency_status': 'VERY_STABLE_MEDIAN' if finite(s.get('median')) and s['median'] >= .95 else 'REVIEW',
                'tail_failure_status': 'TAIL_FAILURE_PRESENT' if unstable09 else 'NO_LT_0_90_TAIL_FAILURE'
            })
            out_probes[probe_name] = s
        stimgs.append({'image_id': iid, 'stability_tail_audit': out_probes})

    # Semantic prompt evidence vector discrimination diagnostic.
    axes = {}
    for im in a21fh['images']:
        for m in im['foundation_mask_hypotheses']:
            for axis_name, ax in (m.get('semantic_prior') or {}).get('axes', {}).items():
                axes.setdefault(axis_name, []).append(ax.get('scores', {}))
    semdisc = {}
    scfg = cfg['semantic_prompt_evidence_policy']
    for axis_name, records in axes.items():
        labels = sorted(set(k for recd in records for k in recd))
        vecs = [[float(recd.get(k, 0.0)) for k in labels] for recd in records]
        cosines = []
        for i in range(len(vecs)):
            for j in range(i + 1, len(vecs)):
                c = cosine(vecs[i], vecs[j])
                if c is not None:
                    cosines.append(c)
        ss = stats(cosines)
        warn = (
            finite(ss.get('median')) and finite(ss.get('p05'))
            and ss['median'] >= scfg['pairwise_cosine_warning_median']
            and ss['p05'] >= scfg['pairwise_cosine_warning_p05']
        )
        semdisc[axis_name] = {
            'labels': labels,
            'pairwise_score_vector_cosine_distribution': ss,
            'status': 'NON_DISCRIMINATIVE_FEATURE_WARNING' if warn else 'DESCRIPTIVE_ONLY',
            'authority': 'DIAGNOSTIC_ONLY'
        }

    # Visual embedding neighbors remain relation evidence only.
    embedding_edges = []
    for im in a21graph['images']:
        for e in im.get('edges', []):
            if e.get('edge_type') == 'VISUAL_EMBEDDING_NEIGHBOR':
                embedding_edges.append({
                    'image_id': im['image_id'],
                    'source_mask_id': e.get('source_mask_id'),
                    'target_mask_id': e.get('target_mask_id'),
                    'absolute_cosine': e.get('absolute_visual_embedding_cosine'),
                    'source_neighbor_margin': e.get('source_neighbor_margin'),
                    'target_neighbor_margin': e.get('target_neighbor_margin'),
                    'relation_type': 'VISUAL_EMBEDDING_NEIGHBOR',
                    'grouping_authority': 'NONE'
                })

    # Provenance: current postprocess cleanliness must never retroactively certify upstream inference.
    dep = a21fp.get('dependency_fingerprint', {}) or {}
    current_pkgs = postenv.get('packages', {}) or {}
    same_python = (
        str(a21fp.get('python_executable', '')).lower() == str(postenv.get('python_executable', '')).lower()
        if postenv.get('python_executable') else None
    )
    drift = []
    for k in ['torch', 'open-clip-torch', 'numpy', 'Pillow']:
        if dep.get(k) and current_pkgs.get(k) and str(dep[k]) != str(current_pkgs[k]):
            drift.append({'package': k, 'upstream_inference': dep[k], 'current_postprocess': current_pkgs[k]})

    upstream_env = {
        'source': 'A2.1_RUN_FINGERPRINT_RECORDED_AT_INFERENCE',
        'python_executable': a21fp.get('python_executable'),
        'dependencies_recorded': dep,
        'torchvision': 'NOT_RECORDED_AT_INFERENCE',
        'quickgelu_architecture': 'NOT_RECORDED_AT_INFERENCE',
        'completeness': 'INCOMPLETE_FOR_TORCHVISION_AND_QUICKGELU',
        'environment_drift_vs_current': drift,
        'same_python_path_as_current': same_python,
        'cleanly_certified': False,
        'status': 'WARNING_UPSTREAM_INFERENCE_ENVIRONMENT_NOT_CLEANLY_CERTIFIED',
        'semantic_embedding_evidence_authority': 'AUXILIARY_ONLY'
    }
    current_env = {
        'source': 'A2.2.1_POSTPROCESS_CURRENT_ENVIRONMENT',
        'audit': postenv,
        'status': 'CURRENT_POSTPROCESS_ONLY_DOES_NOT_CERTIFY_UPSTREAM_INFERENCE'
    }
    envprov = {
        'schema_version': '0.8a2.2.1',
        'postprocess_environment': current_env,
        'upstream_inference_environment': upstream_env,
        'evidence_environment_status': 'UPSTREAM_WARNING_PRESERVED',
        'retroactive_clean_claim_forbidden': True
    }

    foundation_model = a21m.get('foundation_model', {})
    visual_model = a21m.get('visual_embedding_model', {})
    evidence_provenance = {
        'schema_version': '0.8a2.2.1',
        'foundation_mask': {
            'source_run': str(a21),
            'source_artifact': 'foundation_mask_hypotheses.json',
            'model': foundation_model.get('repo_id'),
            'revision': foundation_model.get('resolved_revision'),
            'weight_files': foundation_model.get('weight_files', []),
            'inference_environment': upstream_env,
            'authority': 'FOUNDATION_GEOMETRY_HYPOTHESIS_ONLY'
        },
        'visual_embedding': {
            'source_run': str(a21),
            'source_artifact': 'foundation_mask_hypotheses.json / a2_relationship_multigraph.json',
            'model': visual_model.get('model'),
            'pretrained': visual_model.get('pretrained'),
            'weight_sha256': visual_model.get('weight_sha256'),
            'quickgelu_status': 'UNRESOLVED_NOT_RECORDED_AT_INFERENCE',
            'inference_environment': upstream_env,
            'authority': 'AUXILIARY_RELATION_EVIDENCE_ONLY'
        },
        'semantic_prompt_evidence': {
            'source_run': str(a21),
            'derived_from': 'OpenCLIP visual/text embedding similarities',
            'inference_environment': upstream_env,
            'top_label_authority': 'NONE',
            'authority': 'WEAK_AUXILIARY_PROMPT_EVIDENCE_ONLY'
        },
        'foundation_stability': {
            'source_run': str(a21),
            'derived_from': 'critical_case_mask_stability',
            'inference_environment': upstream_env,
            'authority': 'ROBUSTNESS_EVIDENCE_ONLY'
        },
        'recovery_metrics': {
            'source_run': str(a21),
            'quality_control_upstream_run': str(a22),
            'postprocessed_by_this_run': True,
            'postprocess_environment': current_env,
            'authority': 'DESCRIPTIVE_DIAGNOSTIC_ONLY'
        }
    }

    # Six-condition evidence-layer Go/No-Go, deliberately strict.
    case_by = {c['case_name']: c for c in rec_cases}
    y2k = case_by.get('Y2K_PACK')
    sticker = case_by.get('STICKER_COLLAGE')
    fashion = case_by.get('FASHION_COLLAGE')

    global_block_ok = bool(
        y2k
        and y2k['coverage']['foundation_union_coverage_local_authority_eligible']
            < y2k['coverage']['foundation_union_coverage_raw']
    )
    sticker_split_ok = bool(
        sticker
        and sticker['capability_counts']['local_authority_eligible']['split_capable_atomic_count'] > 0
        and sticker['foreground_dilution_recovery']['local_authority_eligible_aggregate']['candidate_count'] > 0
    )
    fashion_mixed = False
    if fashion:
        fd = fashion['foreground_dilution_recovery']['local_authority_eligible_aggregate']['distributions']
        for d in fd.values():
            if finite(d.get('positive_ratio')) and finite(d.get('negative_ratio')) and d['positive_ratio'] > 0 and d['negative_ratio'] > 0:
                fashion_mixed = True
                break
    semantic_no_truth = all(
        r.get('semantic_top_label_authority') == 'NONE'
        for im in images for r in im['roles']
    )
    env_clean = bool(upstream_env.get('cleanly_certified'))

    checks = {
        'GLOBAL_MASK_LOCAL_RECOVERY_BLOCKED': global_block_ok,
        'STICKER_SPLIT_RETAINED': sticker_split_ok,
        'FASHION_MIXED_UNKNOWN_RETAINED': fashion_mixed,
        'STABILITY_MEANINGFUL_TAIL_EXPOSED': meaningful_tail_found,
        'SEMANTIC_AMBIGUITY_NOT_CLASS_TRUTH': semantic_no_truth,
        'UPSTREAM_INFERENCE_ENVIRONMENT_CLEANLY_CERTIFIED': env_clean
    }
    all_go = all(checks.values())
    go_no_go = {
        'schema_version': '0.8a2.2.1',
        'checks': checks,
        'passed': sum(1 for v in checks.values() if v),
        'total': len(checks),
        'decision': 'A2_EVIDENCE_LAYER_VALIDATED' if all_go else 'HOLD_EVIDENCE_LAYER_VALIDATION',
        'hold_reasons': [k for k, v in checks.items() if not v],
        'perceptual_grouping_validated': False,
        'style_graph_ready': False,
        'production_authority': 'NONE'
    }

    summary = {
        'schema_version': '0.8a2.2.1',
        'name': 'Evidence Provenance & Authority Hotfix',
        'authority': 'NONE',
        'model_inference': 'NONE_POSTPROCESS_ONLY',
        'upstream_a22_run': str(a22),
        'upstream_a21_run': str(a21),
        'masks_preserved': sum(x['mask_count'] for x in images),
        'masks_deleted': 0,
        'unique_mask_count': len(role_index),
        'role_hypothesis_counts': role_hyp_counts,
        'multi_role_mask_count': multi_role,
        'scene_or_background_blocked_from_local_recovery': scene_or_background_blocked,
        'background_plane_newly_blocked_from_local_recovery': background_newly_blocked,
        'ambiguous_newly_blocked_from_local_recovery': ambiguous_blocked,
        'role_semantics': 'OVERLAPPING_ROLE_EVIDENCE_NOT_CLASS_TRUTH',
        'role_authority_matrix': matrix,
        'style_graph_built': False,
        'production_authority': 'NONE',
        'images': images,
        'critical_case_recovery': rec_cases,
        'semantic_vector_discrimination': semdisc,
        'embedding_neighbor_evidence_count': len(embedding_edges),
        'environment_provenance': envprov,
        'go_no_go': go_no_go
    }

    write(out / 'evidence_integrity_summary.json', summary)
    write(out / 'mask_role_authority.json', {
        'schema_version': '0.8a2.2.1',
        'unique_mask_count': len(role_index),
        'role_hypothesis_counts': role_hyp_counts,
        'multi_role_mask_count': multi_role,
        'roles_are_overlapping_evidence': True,
        'scalar_role_truth': False,
        'role_authority_matrix': matrix,
        'masks_deleted': 0,
        'images': [{'image_id': x['image_id'], 'roles': x['roles']} for x in images]
    })
    write(out / 'recovery_distribution_audit.json', {
        'schema_version': '0.8a2.2.1',
        'role': 'RAW_VS_LOCAL_AUTHORITY_ELIGIBLE_DISTRIBUTIONS',
        'descriptive_weight': 'UNIQUE_COVERAGE_ONLY_NOT_DECISION_WEIGHT',
        'cases': rec_cases
    })
    write(out / 'stability_tail_impact_audit.json', {
        'schema_version': '0.8a2.2.1',
        'semantics': 'CENTRAL_TENDENCY_PLUS_TAIL_IMPACT_DESCRIPTIVE_ONLY',
        'images': stimgs
    })
    semantic_payload = {
        'schema_version': '0.8a2.2.1',
        'name': 'Weak Semantic Prompt Evidence',
        'axis_discrimination': semdisc,
        'top_labels_are_truth': False,
        'top_label_authority': 'NONE',
        'authority': 'AUXILIARY_ONLY',
        'per_mask_axes': [
            {
                'image_id': x['image_id'],
                'masks': [
                    {
                        'mask_hypothesis_id': r['mask_hypothesis_id'],
                        'semantic_prompt_evidence_quality': r['semantic_prompt_evidence_quality']
                    }
                    for r in x['roles']
                ]
            }
            for x in images
        ]
    }
    write(out / 'semantic_prompt_evidence_quality.json', semantic_payload)
    # Compatibility alias; explicitly deprecated, to avoid accidental downstream breakage.
    write(out / 'semantic_evidence_quality_DEPRECATED_ALIAS.json', {
        'deprecated': True,
        'use_instead': 'semantic_prompt_evidence_quality.json',
        'payload': semantic_payload
    })
    write(out / 'embedding_neighbor_evidence.json', {
        'schema_version': '0.8a2.2.1',
        'edge_type': 'VISUAL_EMBEDDING_NEIGHBOR',
        'grouping_authority': 'NONE',
        'edges': embedding_edges
    })
    write(out / 'environment_provenance.json', envprov)
    write(out / 'evidence_generation_provenance.json', evidence_provenance)
    write(out / 'go_no_go.json', go_no_go)

    print(json.dumps({
        'images': len(images),
        'masks': len(role_index),
        'scene_or_background_blocked': scene_or_background_blocked,
        'background_newly_blocked': background_newly_blocked,
        'ambiguous_newly_blocked': ambiguous_blocked,
        'upstream_env_status': upstream_env['status'],
        'go_no_go': go_no_go['decision'],
        'checks_passed': go_no_go['passed'],
        'checks_total': go_no_go['total']
    }))


if __name__ == '__main__':
    main()
