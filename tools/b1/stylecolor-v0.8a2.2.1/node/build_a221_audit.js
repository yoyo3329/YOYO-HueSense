'use strict';
const fs=require('fs'),path=require('path');
function r(p){return JSON.parse(fs.readFileSync(p,'utf8'))}
function e(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function pct(x){return x==null?'—':(100*x).toFixed(1)+'%'}
function f(x,n=4){return x==null?'—':Number(x).toFixed(n)}
const run=path.resolve(process.argv[2]);
const s=r(path.join(run,'evidence_integrity_summary.json'));
const env=r(path.join(run,'environment_provenance.json'));
const g=r(path.join(run,'go_no_go.json'));
const st=r(path.join(run,'stability_tail_impact_audit.json'));
const cases=s.critical_case_recovery.map(c=>{
  const d=c.foreground_dilution_recovery.local_authority_eligible_aggregate.distributions.homogeneity_gain;
  return `<tr><td>${e(c.case_name)}</td><td>${pct(c.coverage.foundation_union_coverage_raw)}</td><td>${pct(c.coverage.foundation_union_coverage_local_authority_eligible)}</td><td>${c.capability_counts.raw_foundation.split_capable_atomic_count}/${c.capability_counts.local_authority_eligible.split_capable_atomic_count}</td><td>${c.foreground_dilution_recovery.raw_foundation_aggregate.candidate_count}/${c.foreground_dilution_recovery.local_authority_eligible_aggregate.candidate_count}</td><td>${f(d.median)}</td><td>${pct(d.positive_ratio)}</td><td>${pct(d.negative_ratio)}</td><td>${f(d.unique_coverage_weighted_mean)}</td></tr>`;
}).join('');
const sem=Object.entries(s.semantic_vector_discrimination).map(([k,v])=>`<tr><td>${e(k)}</td><td>${f(v.pairwise_score_vector_cosine_distribution.p05)}</td><td>${f(v.pairwise_score_vector_cosine_distribution.median)}</td><td>${e(v.status)}</td></tr>`).join('');
const checks=Object.entries(g.checks).map(([k,v])=>`<tr><td>${e(k)}</td><td>${v?'PASS':'HOLD'}</td></tr>`).join('');
const tails=[];
for(const im of st.images){for(const [probe,v] of Object.entries(im.stability_tail_audit||{})){const z=(v.tail_impact_by_threshold||{})['0.5']||{};tails.push(`<tr><td>${e(im.image_id)}</td><td>${e(probe)}</td><td>${f(v.median)}</td><td>${f(v.min)}</td><td>${v.below_0_50}</td><td>${pct(z.unstable_area_fraction)}</td><td>${pct(z.unstable_unique_coverage_fraction)}</td></tr>`);}}
const h=`<!doctype html><meta charset="utf-8"><title>YOYO v0.8-A.2.2.1</title><style>body{font-family:Arial,"Microsoft JhengHei",sans-serif;max-width:1500px;margin:28px auto;padding:0 20px;color:#222}table{border-collapse:collapse;width:100%;font-size:13px;margin:12px 0 28px}th,td{border:1px solid #ddd;padding:7px;text-align:left}th{background:#f3f3f3}.cards{display:flex;gap:12px;flex-wrap:wrap}.card{border:1px solid #ddd;border-radius:8px;padding:12px;min-width:200px}.warn{background:#fff4e5;padding:10px;border-left:4px solid #c77b00}.ok{background:#edf8ef;padding:10px;border-left:4px solid #2b7}.hold{background:#fff0f0;padding:10px;border-left:4px solid #b44}pre{background:#f5f5f5;padding:10px;overflow:auto}</style>
<h1>YOYO / HueSense — v0.8-A.2.2.1</h1>
<p><b>Evidence Provenance & Authority Hotfix.</b> Post-process only. Role hypotheses are overlapping evidence, never class truth. No SAM/OpenCLIP rerun, no Perceptual Grouping, no Style Graph.</p>
<div class="cards"><div class="card"><b>Unique masks</b><br>${s.unique_mask_count}</div><div class="card"><b>Multi-role masks</b><br>${s.multi_role_mask_count}</div><div class="card"><b>Scene/background blocked</b><br>${s.scene_or_background_blocked_from_local_recovery}</div><div class="card"><b>Ambiguous newly blocked</b><br>${s.ambiguous_newly_blocked_from_local_recovery}</div><div class="card"><b>Go/No-Go</b><br>${e(g.decision)}</div></div>
<p class="warn"><b>Upstream inference environment:</b> ${e(env.upstream_inference_environment.status)}. Current post-process cleanliness does not retroactively certify SAM/OpenCLIP evidence.</p>
<p class="${g.decision==='A2_EVIDENCE_LAYER_VALIDATED'?'ok':'hold'}"><b>Evidence layer validation:</b> ${e(g.decision)} — ${g.passed}/${g.total} required checks passed. This is still NOT Perceptual Grouping validation.</p>
<h2>Six-condition Go / No-Go</h2><table><tr><th>Condition</th><th>Status</th></tr>${checks}</table>
<h2>Critical recovery — RAW vs local-authority eligible</h2><table><tr><th>Case</th><th>Raw coverage</th><th>Local coverage</th><th>Split raw/local</th><th>Candidates raw/local</th><th>Local median homogeneity</th><th>Positive</th><th>Negative</th><th>Unique-coverage weighted mean</th></tr>${cases}</table>
<h2>Stability tail impact (IoU &lt; 0.5)</h2><table><tr><th>Image</th><th>Probe</th><th>Median IoU</th><th>Min IoU</th><th>Count &lt;.5</th><th>Unstable area mass fraction</th><th>Unstable unique-coverage mass fraction</th></tr>${tails.join('')}</table>
<h2>Weak Semantic Prompt Evidence — discrimination diagnostic</h2><table><tr><th>Axis</th><th>Pairwise cosine p05</th><th>Median</th><th>Status</th></tr>${sem}</table>
<h2>Role hypothesis counts</h2><pre>${e(JSON.stringify(s.role_hypothesis_counts,null,2))}</pre>
<h2>Role authority matrix</h2><pre>${e(JSON.stringify(s.role_authority_matrix,null,2))}</pre>
<h2>Environment provenance</h2><pre>${e(JSON.stringify(env,null,2))}</pre>
<p>Status: evidence provenance + authority hotfix only; not Perceptual Grouping validation.</p>`;
fs.writeFileSync(path.join(run,'audit.html'),h);
console.log('audit.html built');
