'use strict';

const fs = require('fs');
const path = require('path');

const queuePath = process.argv[2] || path.join(__dirname, 'v0_8_stage_a_train_queue.json');
const outPath = process.argv[3] || path.join(__dirname, 'v0_8_stage_a_chroma_blind_lab.html');

const q = JSON.parse(fs.readFileSync(queuePath, 'utf8'));

const publicCases = q.cases.map((c, i) => ({
  case_id: c.case_id,
  display_index: i + 1,
  a_hex: c.a.hex,
  b_hex: c.b.hex
}));

const hiddenAudit = q.cases.map(c => ({
  case_id: c.case_id,
  pair_key: c.pair_key,
  a: { mode_id: c.a.mode_id, hex: c.a.hex },
  b: { mode_id: c.b.mode_id, hex: c.b.hex }
}));

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>YOYO v0.8 Stage A — Chroma Blind Train</title>
<style>
:root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{margin:0;background:#efefef;color:#1d1d1f}
main{width:min(900px,calc(100% - 24px));margin:24px auto 80px}
.card{background:#fff;border:1px solid #ddd;border-radius:16px;padding:20px;margin-bottom:16px}
h1{margin:0 0 10px;font-size:26px}h2{font-size:18px;margin:0 0 14px}
p{line-height:1.6}.notice{border-left:4px solid #444;padding-left:12px}
.swatches{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:18px 0}
.swatch{height:250px;border-radius:16px;border:1px solid rgba(0,0,0,.15);box-shadow:inset 0 0 0 1px rgba(255,255,255,.15)}
fieldset{border:0;padding:0;margin:18px 0}legend{font-weight:700;margin-bottom:10px}
.options{display:grid;gap:9px}.option{display:flex;align-items:center;gap:8px;padding:11px 12px;background:#f6f6f7;border-radius:10px}
button{border:0;border-radius:10px;padding:11px 15px;font-weight:700;cursor:pointer}
.primary{background:#1d1d1f;color:#fff}.secondary{background:#dedfe3}.nav{display:flex;justify-content:space-between;gap:10px;margin-top:18px}
.progress{height:10px;background:#ddd;border-radius:99px;overflow:hidden}.bar{height:100%;background:#1d1d1f}
small{color:#666}
@media(max-width:650px){.swatch{height:190px}.card{padding:15px}.swatches{gap:10px}}
</style>
</head>
<body>
<main>
<section class="card">
  <h1>YOYO v0.8 Stage A — Chroma Blind Train</h1>
  <p class="notice">
    這一輪只判斷「兩個顏色的彩度／鮮豔程度是否接近」。
    不需要判 Hue、Lightness 或整體 Tone。
    畫面不顯示模型輸出、L/C/H 數值、mode ID 或舊 validation 資訊。
  </p>
  <p><b>Chroma Relation：</b>
    Similar＝彩度接近；
    Similar or Partial＝有差，但仍有部分接近；
    Different＝彩度差異明顯。
  </p>
  <div class="progress"><div id="bar" class="bar"></div></div>
  <p id="progress-text"></p>
</section>

<section id="case-card" class="card">
  <h2 id="case-title"></h2>
  <div class="swatches">
    <div id="swatch-a" class="swatch"></div>
    <div id="swatch-b" class="swatch"></div>
  </div>

  <fieldset>
    <legend>Chroma Relation</legend>
    <div class="options">
      <label class="option"><input type="radio" name="chroma" value="similar"> Similar</label>
      <label class="option"><input type="radio" name="chroma" value="similar_or_partial"> Similar or Partial</label>
      <label class="option"><input type="radio" name="chroma" value="different"> Different</label>
    </div>
  </fieldset>

  <fieldset>
    <legend>Confidence</legend>
    <div class="options">
      <label class="option"><input type="radio" name="confidence" value="high"> High</label>
      <label class="option"><input type="radio" name="confidence" value="medium"> Medium</label>
      <label class="option"><input type="radio" name="confidence" value="low"> Low</label>
    </div>
  </fieldset>

  <div class="nav">
    <button id="prev" class="secondary">上一題</button>
    <button id="next" class="primary">下一題</button>
  </div>
</section>

<section class="card">
  <button id="export" class="primary">全部完成後下載 JSON</button>
  <p><small id="status"></small></p>
</section>
</main>

<script>
const CASES = ${JSON.stringify(publicCases)};
const HIDDEN_AUDIT = ${JSON.stringify(hiddenAudit)};
const QUEUE_SHA256 = ${JSON.stringify(q.metadata ? null : null)};
let index = 0;
const answers = {};

function current(){ return CASES[index]; }
function save(){
  const c = current();
  const chroma = document.querySelector('input[name="chroma"]:checked');
  const confidence = document.querySelector('input[name="confidence"]:checked');
  if (chroma || confidence) {
    answers[c.case_id] = {
      chroma_relation: chroma ? chroma.value : null,
      confidence: confidence ? confidence.value : null
    };
  }
}
function restore(){
  document.querySelectorAll('input[type="radio"]').forEach(x => x.checked=false);
  const a = answers[current().case_id];
  if (!a) return;
  if (a.chroma_relation) {
    const el=document.querySelector('input[name="chroma"][value="'+a.chroma_relation+'"]');
    if(el) el.checked=true;
  }
  if (a.confidence) {
    const el=document.querySelector('input[name="confidence"][value="'+a.confidence+'"]');
    if(el) el.checked=true;
  }
}
function render(){
  const c=current();
  document.getElementById('case-title').textContent='題目 '+(index+1)+' / '+CASES.length;
  document.getElementById('swatch-a').style.background=c.a_hex;
  document.getElementById('swatch-b').style.background=c.b_hex;
  document.getElementById('progress-text').textContent='進度 '+(index+1)+' / '+CASES.length;
  document.getElementById('bar').style.width=((index+1)/CASES.length*100)+'%';
  document.getElementById('prev').disabled=index===0;
  document.getElementById('next').textContent=index===CASES.length-1?'完成':'下一題';
  restore();
  updateStatus();
}
function updateStatus(){
  const complete = CASES.filter(c => answers[c.case_id]?.chroma_relation && answers[c.case_id]?.confidence).length;
  document.getElementById('status').textContent='已完整作答 '+complete+' / '+CASES.length;
}
document.getElementById('prev').onclick=()=>{save(); if(index>0) index--; render();};
document.getElementById('next').onclick=()=>{
  save();
  const a=answers[current().case_id];
  if(!a?.chroma_relation || !a?.confidence){
    alert('請先選 Chroma Relation 與 Confidence。');
    return;
  }
  if(index<CASES.length-1){index++;render();}
  else updateStatus();
};
document.querySelectorAll('input[type="radio"]').forEach(x=>x.addEventListener('change',()=>{save();updateStatus();}));
document.getElementById('export').onclick=()=>{
  save();
  const missing = CASES.filter(c => !answers[c.case_id]?.chroma_relation || !answers[c.case_id]?.confidence);
  if(missing.length){
    alert('還有 '+missing.length+' 題尚未完整作答。');
    return;
  }

  const auditMap=Object.fromEntries(HIDDEN_AUDIT.map(x=>[x.case_id,x]));
  const out={
    metadata:{
      name:'YOYO v0.8 Stage A Round 1 Chroma Human Labels',
      version:'0.8-stage-a-round1',
      role:'TRAIN_CALIBRATION',
      authority:'DIRECT_HUMAN_BLIND',
      ai_assistance:false,
      algorithm_outputs_hidden:true,
      physical_numeric_features_hidden:true,
      case_count:CASES.length,
      exported_at:new Date().toISOString()
    },
    cases:CASES.map(c=>{
      const audit=auditMap[c.case_id];
      return {
        case_id:c.case_id,
        pair_key:audit.pair_key,
        a:audit.a,
        b:audit.b,
        human_label:{
          chroma_relation:answers[c.case_id].chroma_relation,
          confidence:answers[c.case_id].confidence
        }
      };
    })
  };
  const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='v0_8_stage_a_train_human.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
render();
</script>
</body>
</html>`;

fs.writeFileSync(outPath, html);
console.log(`Built blind lab: ${outPath}`);
