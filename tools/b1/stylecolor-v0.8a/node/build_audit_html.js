'use strict';
const fs=require('fs');
const path=require('path');

function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function pct(x){return x==null?'—':(100*Number(x)).toFixed(1)+'%';}
function num(x,n=3){return x==null?'—':Number(x).toFixed(n);}
function swatch(c,label=''){return `<span class="sw"><i style="background:${esc(c)}"></i><b>${esc(c)}</b>${label?`<small>${esc(label)}</small>`:''}</span>`;}

function build(data,outPath){
 const summary=data.summary; const cards=data.images.map(img=>{
  const raw=(img.raw_b1_palette||[]).map(p=>swatch(p.hex,pct(p.ratio))).join('');
  const regions=img.regions.map(r=>{
    const pal=r.palette.map((p,ix)=>swatch(p.hex,`${pct(p.ratio_within_region)} · ${r.candidates?.[ix]?.provisional_role||''}`)).join('');
    const reasons=(r.low_reliability_reasons||[]).map(x=>`<span class="tag warn">${esc(x)}</span>`).join('');
    const clip=r.clip_style_similarity==null?'UNAVAILABLE':num(r.clip_style_similarity,4);
    return `<article class="region ${r.status==='LOW_RELIABILITY'?'low':''}">
      <img src="${esc(r.crop_asset)}" loading="lazy"><div class="regbody"><h4>Region ${esc(r.region_index)} <span>${pct(r.area_ratio)}</span></h4>
      <div class="tags"><span class="tag">saliency ${num(r.saliency_proxy)}</span><span class="tag">CLIP ${clip}</span><span class="tag">illum ${num(r.illumination_reliability)}</span><span class="tag">stable ${num(r.region_stability)}</span>${reasons}</div>
      <div class="palette">${pal}</div></div></article>`;
  }).join('');
  return `<section class="image-card" data-family="${esc(img.query_family)}">
   <header><h2>${esc(img.image_id)}</h2><div class="meta">${esc(img.query_family)} · ${esc(img.source_domain)} · source CLIP ${num(img.source_clip_score,4)}</div></header>
   <div class="compare"><div><h3>Original</h3><img class="hero" src="${esc(img.source_image_asset)}"></div><div><h3>Region Overlay</h3><img class="hero" src="${esc(img.region_preview_asset)}"></div></div>
   <h3>Raw B1 Palette</h3><div class="palette">${raw}</div>
   <h3>Region-aware observations</h3><div class="regions">${regions}</div>
  </section>`;
 }).join('\n');
 const html=`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YOYO StyleColor Extractor v0.8-A Audit</title><style>
 :root{font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d1d1f;background:#f5f5f7}body{margin:0}main{width:min(1400px,calc(100% - 28px));margin:24px auto 80px}.top,.image-card{background:#fff;border:1px solid #ddd;border-radius:16px;padding:18px;margin-bottom:16px}.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:10px}.stat{background:#f5f5f7;padding:12px;border-radius:10px}.stat b{font-size:22px;display:block}.compare{display:grid;grid-template-columns:1fr 1fr;gap:14px}.hero{width:100%;max-height:440px;object-fit:contain;background:#ddd}.palette{display:flex;gap:9px;flex-wrap:wrap}.sw{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;background:#f2f2f3;border-radius:8px;font-size:12px}.sw i{width:26px;height:26px;border:1px solid #aaa}.sw small{color:#666}.regions{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.region{display:grid;grid-template-columns:100px 1fr;border:1px solid #ddd;border-radius:10px;overflow:hidden}.region.low{border-style:dashed}.region>img{width:100px;height:100px;object-fit:contain;background:#777}.regbody{padding:8px}.regbody h4{margin:0 0 6px}.regbody h4 span{font-weight:400;color:#777}.tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}.tag{font-size:10px;padding:3px 5px;background:#e8eef4;border-radius:5px}.tag.warn{background:#f6e7cb}.meta{color:#666;font-size:13px}h1{margin-top:0}.note{line-height:1.6;border-left:4px solid #555;padding-left:10px}@media(max-width:900px){.stats{grid-template-columns:repeat(2,1fr)}.compare{grid-template-columns:1fr}.regions{grid-template-columns:1fr}}
 </style></head><body><main><section class="top"><h1>YOYO / HueSense — StyleColor Extractor v0.8-A</h1><p class="note">這是 <b>PoC Audit</b>，不是 Style Graph，也不是自動風格裁判。Region、saliency、CLIP、illumination 都是 evidence；沒有 hard STYLE / NOT_STYLE threshold。SLIC 是 region proposal baseline，沒有 semantic-segmentation claim。</p><div class="stats">
 <div class="stat"><b>${summary.images_total}</b><span>Images</span></div><div class="stat"><b>${summary.images_processed}</b><span>Processed</span></div><div class="stat"><b>${summary.regions_total}</b><span>Regions</span></div><div class="stat"><b>${summary.candidates_total}</b><span>Color candidates</span></div><div class="stat"><b>${summary.low_reliability_candidates}</b><span>Low reliability</span></div><div class="stat"><b>${summary.clip_regions_scored}/${summary.regions_total}</b><span>Region CLIP</span></div></div></section>${cards}</main></body></html>`;
 fs.writeFileSync(outPath,html);
}

if(require.main===module){const inp=process.argv[2],out=process.argv[3];if(!inp||!out)throw new Error('usage: node build_audit_html.js report.json audit.html');build(JSON.parse(fs.readFileSync(inp,'utf8')),out);console.log('Built',out);}module.exports={build};
