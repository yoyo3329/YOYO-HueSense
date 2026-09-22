 'use strict';
const fs=require('fs');
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function pct(x){return x==null?'—':(100*Number(x)).toFixed(1)+'%';}
function num(x,n=3){return x==null?'—':Number(x).toFixed(n);}
function sw(c,l=''){return `<span class="sw"><i style="background:${esc(c)}"></i><b>${esc(c)}</b><small>${esc(l)}</small></span>`;}
function build(data,out){
 const cards=data.images.map(img=>{
  const regions=img.atomic_regions.map(r=>{
   const pal=(r.palette||[]).map(p=>sw(p.hex,pct(p.ratio_within_region))).join('');
   const flags=(r.diagnostics.flags||[]).map(x=>`<span class="tag warn">${esc(x)}</span>`).join('');
   const clipLabel=r.clip_status==='OK'?`SCORED ${num(r.clip_style_similarity,4)}`:
     r.clip_status==='NOT_SELECTED_FOR_CLIP_BUDGET'?'NOT SELECTED':
     r.clip_status==='UNAVAILABLE_SERVICE'?'MODEL UNAVAILABLE':
     r.clip_status||'—';
   return `<article class="region">
    <img src="${esc(r.crop_asset)}"><div><h4>Atomic ${esc(r.region_index)} · ${pct(r.area_ratio)}</h4>
    <div class="tags">
     <span class="tag">scale ${num(r.diagnostics.scale_stability_score)}</span>
     <span class="tag">perturb ${num(r.diagnostics.perturbation_stability_score)}</span>
     <span class="tag">homog ${num(r.diagnostics.color_homogeneity_score)}</span>
     <span class="tag">bimodal ${num(r.diagnostics.bimodal_color_score)}</span>
     <span class="tag">dilution ${num(r.diagnostics.foreground_dilution_score)}</span>
     <span class="tag">CLIP ${esc(clipLabel)}</span>${flags}
    </div><div class="palette">${pal}</div></div></article>`;
  }).join('');
  const edgeRows=(img.edges||[]).slice(0,18).map(e=>`<tr>
    <td>${esc(e.source_region_id.split(':').pop())}↔${esc(e.target_region_id.split(':').pop())}</td>
    <td>${num(e.evidence.oklab_delta)}</td><td>${num(e.evidence.boundary_strong_support_ratio)}</td>
    <td>${num(e.evidence.palette_impact_score)}</td><td>${esc(e.action)}</td>
    <td>${esc((e.contradictions||[]).join(', '))}</td></tr>`).join('');
  return `<section class="card"><h2>${esc(img.image_id)}</h2>
  <div class="compare"><div><h3>Original</h3><img class="hero" src="${esc(img.source_image_asset)}"></div>
  <div><h3>Immutable Atomic Regions</h3><img class="hero" src="${esc(img.region_preview_asset)}"></div></div>
  <h3>Atomic region diagnostics</h3><div class="regions">${regions}</div>
  <h3>Relationship graph sample</h3><table><thead><tr><th>Pair</th><th>ΔOKLab</th><th>Boundary support</th><th>Palette impact</th><th>Action</th><th>Contradictions</th></tr></thead><tbody>${edgeRows}</tbody></table>
  </section>`;
 }).join('');
 const s=data.summary,a=data.audit;
 const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
 <title>YOYO v0.8-A.1 Physical Audit</title><style>
 :root{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;background:#f5f5f7;color:#1d1d1f}body{margin:0}main{width:min(1500px,calc(100% - 26px));margin:22px auto 80px}
 .top,.card{background:#fff;border:1px solid #ddd;border-radius:15px;padding:18px;margin-bottom:16px}.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:9px}.stat{background:#f2f3f5;border-radius:10px;padding:11px}.stat b{font-size:21px;display:block}
 .compare{display:grid;grid-template-columns:1fr 1fr;gap:14px}.hero{width:100%;max-height:440px;object-fit:contain;background:#777}.regions{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.region{display:grid;grid-template-columns:95px 1fr;gap:8px;border:1px solid #ddd;padding:7px}.region>img{width:95px;height:95px;object-fit:contain;background:#777}
 .tags{display:flex;gap:4px;flex-wrap:wrap}.tag{font-size:10px;padding:3px 5px;background:#e8eef4;border-radius:4px}.tag.warn{background:#f6e1cb}.palette{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.sw{display:flex;align-items:center;gap:5px;font-size:10px;background:#f4f4f4;padding:4px}.sw i{width:20px;height:20px;border:1px solid #999}.sw small{color:#666}
 table{width:100%;border-collapse:collapse;font-size:12px}th,td{border-bottom:1px solid #eee;text-align:left;padding:6px}.note{border-left:4px solid #444;padding-left:10px;line-height:1.6}@media(max-width:900px){.stats{grid-template-columns:repeat(2,1fr)}.compare{grid-template-columns:1fr}.regions{grid-template-columns:1fr}}
 </style></head><body><main><section class="top"><h1>YOYO / HueSense — v0.8-A.1 Stable Atomic Regions + Relationship Diagnostics</h1>
 <p class="note"><b>這不是 object truth，也不是 Style Graph。</b> Atomic Region 永不被破壞性合併；Relationship Action 只是 heuristic 關係標記，不是機率。A.1 的目標是 Stable + Traceable + Uncertainty-aware + Style-useful representation。</p>
 <div class="stats"><div class="stat"><b>${s.images_processed}/${s.images_total}</b><span>Images</span></div>
 <div class="stat"><b>${s.atomic_regions_total}</b><span>Immutable atomic regions</span></div>
 <div class="stat"><b>${s.relationship_edges_total}</b><span>Region graph edges</span></div>
 <div class="stat"><b>0</b><span>Destructive merges</span></div>
 <div class="stat"><b>${a.counts.foreground_dilution_regions}</b><span>Dilution signals</span></div>
 <div class="stat"><b>${a.counts.high_palette_impact_relationships}</b><span>High-impact relations</span></div></div>
 </section>${cards}</main></body></html>`;
 fs.writeFileSync(out,html);
}
if(require.main===module){const data=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));build(data,process.argv[3]);}
module.exports={build};
