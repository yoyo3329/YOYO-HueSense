#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, 'human_priority_retest_queue_v0_3.json');
const OUTPUT = path.join(__dirname, 'human_priority_blind_retest_v0_4.html');

if (!fs.existsSync(INPUT)) {
  console.error(`❌ 找不到：${INPUT}`);
  process.exit(1);
}

const src = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
const cases = Array.isArray(src.cases) ? src.cases : [];

// Blind order independent from priority ordering.
const crypto = require('crypto');
const shuffled = [...cases].sort((a,b) => {
  const ha = crypto.createHash('sha256').update('YOYO_V0_4|' + a.case_id).digest('hex');
  const hb = crypto.createHash('sha256').update('YOYO_V0_4|' + b.case_id).digest('hex');
  return ha.localeCompare(hb);
});

const embedded = JSON.stringify(shuffled).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>YOYO Human Blind Retest v0.4</title>
<style>
:root{color-scheme:light}
body{margin:0;background:#efefef;color:#111;font-family:Arial,"Noto Sans TC",sans-serif}
.wrap{max-width:920px;margin:28px auto;padding:0 18px}
.card{background:#fff;border:1px solid #d8d8d8;border-radius:14px;padding:20px;margin-bottom:18px}
.header{display:flex;justify-content:space-between;gap:20px;align-items:start}
.notice{background:#fff6cf;border:1px solid #e4d271;border-radius:10px;padding:12px;line-height:1.55}
.swatches{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:28px 0}
.swatch-wrap{text-align:center}
.swatch{height:230px;border:1px solid #bbb;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.caption{margin-top:8px;font-weight:700}
.group{padding-top:16px;margin-top:16px;border-top:1px solid #eee}
.opt{display:inline-block;border:1px solid #bbb;border-radius:999px;padding:9px 12px;margin:6px 6px 0 0;cursor:pointer}
button{border:1px solid #aaa;background:#fff;border-radius:10px;padding:10px 14px;cursor:pointer}
.primary{background:#111;color:#fff;border-color:#111}
.progress{font-weight:700;white-space:nowrap}
.small{font-size:13px;color:#666;line-height:1.5}
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <div class="header">
      <div>
        <h1>YOYO Human Blind Retest v0.4</h1>
        <div class="notice">
          只看色塊判斷。這版刻意隱藏：第一次答案、AI 答案、演算法答案、L/C/H、HEX、Priority。
          請不要另外查數值。真的不確定就選 REVIEW / Low。
        </div>
      </div>
      <div class="progress" id="progress"></div>
    </div>
  </div>

  <div class="card" id="caseCard"></div>

  <div class="card">
    <button id="prev">上一題</button>
    <button id="next">下一題</button>
    <button class="primary" id="export">匯出 Human Blind Retest JSON</button>
    <div class="small" style="margin-top:10px">
      建議固定同一台螢幕、相近亮度與室內光線完成整輪，避免顯示環境改變造成額外雜訊。
    </div>
  </div>
</div>

<script>
const CASES = ${embedded};
const KEY = 'yoyo_human_blind_retest_v0_4';
let answers = JSON.parse(localStorage.getItem(KEY)||'{}');
let index = 0;

function opt(name,value,label,checked){
  return '<label class="opt"><input type="radio" name="'+name+'" value="'+value+'" '+(checked?'checked':'')+'> '+label+'</label>';
}

function render(){
  const c = CASES[index];
  const ans = answers[c.case_id]?.human_retest_label || {};
  document.getElementById('progress').textContent = (index+1)+' / '+CASES.length;
  document.getElementById('caseCard').innerHTML = \`
    <h2>Case \${index+1}</h2>
    <div class="swatches">
      <div class="swatch-wrap">
        <div class="swatch" style="background:\${c.a.hex}"></div>
        <div class="caption">A</div>
      </div>
      <div class="swatch-wrap">
        <div class="swatch" style="background:\${c.b.hex}"></div>
        <div class="caption">B</div>
      </div>
    </div>

    <div class="group"><b>① Hue 是否適合比較？</b><br>
      \${opt('ha','reliable','兩色都有可辨識 Hue',ans.hue_applicability==='reliable')}
      \${opt('ha','low_chroma','一色或兩色近中性／低彩度，Hue 不適合作主判斷',ans.hue_applicability==='low_chroma')}
      \${opt('ha','review','不確定',ans.hue_applicability==='review')}
    </div>

    <div class="group"><b>② Hue 關係</b><br>
      \${opt('hr','same_or_adjacent','同族／相鄰',ans.hue_relation==='same_or_adjacent')}
      \${opt('hr','different','不同族',ans.hue_relation==='different')}
      \${opt('hr','not_applicable','不適用',ans.hue_relation==='not_applicable')}
      \${opt('hr','review','REVIEW',ans.hue_relation==='review')}
    </div>

    <div class="group"><b>③ Tone 關係</b><br>
      \${opt('tr','similar','相似',ans.tone_relation==='similar')}
      \${opt('tr','similar_or_partial','部分相似',ans.tone_relation==='similar_or_partial')}
      \${opt('tr','different','不相似',ans.tone_relation==='different')}
      \${opt('tr','review','REVIEW',ans.tone_relation==='review')}
    </div>

    <div class="group"><b>④ 信心</b><br>
      \${opt('cf','high','High',ans.confidence==='high')}
      \${opt('cf','medium','Medium',ans.confidence==='medium')}
      \${opt('cf','low','Low',ans.confidence==='low')}
    </div>
  \`;
  document.querySelectorAll('input[type=radio]').forEach(el=>el.addEventListener('change',save));
}

function get(name){ return document.querySelector('input[name="'+name+'"]:checked')?.value || null; }

function save(){
  const c = CASES[index];
  answers[c.case_id] = {
    case_id:c.case_id,
    source_style:c.source_style,
    a:c.a,b:c.b,
    human_retest_label:{
      hue_applicability:get('ha'),
      hue_relation:get('hr'),
      tone_relation:get('tr'),
      confidence:get('cf'),
      rationale:'Human blind retest v0.4'
    }
  };
  localStorage.setItem(KEY,JSON.stringify(answers));
}

function go(n){
  save();
  index=Math.max(0,Math.min(CASES.length-1,n));
  render();
  window.scrollTo({top:0,behavior:'smooth'});
}

document.getElementById('prev').onclick=()=>go(index-1);
document.getElementById('next').onclick=()=>go(index+1);
document.getElementById('export').onclick=()=>{
  save();
  const rows=CASES.map(c=>answers[c.case_id]||{
    case_id:c.case_id,source_style:c.source_style,a:c.a,b:c.b,human_retest_label:null
  });
  const payload={
    metadata:{
      name:'YOYO Human Blind Retest v0.4 Export',
      version:'0.4.0',
      status:'independent_human_retest',
      case_count:rows.length,
      exported_at:new Date().toISOString(),
      blind_contract:{
        previous_human_label_hidden:true,
        ai_label_hidden:true,
        algorithm_prediction_hidden:true,
        numeric_color_features_hidden:true,
        priority_hidden:true
      }
    },
    cases:rows
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='human_blind_retest_v0_4.json';
  a.click();
  URL.revokeObjectURL(url);
};

render();
</script>
</body>
</html>`;

fs.writeFileSync(OUTPUT, html, 'utf8');
console.log('✅ Built:', OUTPUT);
console.log('Cases:', shuffled.length);
