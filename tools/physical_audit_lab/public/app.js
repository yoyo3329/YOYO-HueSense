
import {
  ENGINE_VERSION,
  featuresFromHex,
  pairRelation,
  auditProfile,
  normalizeHex
} from './engine.js';

const $ = sel => document.querySelector(sel);

const y2k = {
  profile_name: 'Y2K — 9 Backbone Physical Audit',
  groups: [
    { id:'G1', label:'Group 1', members:[
      {id:'mode_01', hex:'#E1DCDA', role:'Core / Stab A'},
      {id:'mode_04', hex:'#C4C8C9', role:'Core / Stab A'},
      {id:'mode_12', hex:'#DFC2BB', role:'Secondary / Stab C'}
    ]},
    { id:'G2', label:'Group 2', members:[
      {id:'mode_06', hex:'#886D60', role:'Core / Stab A'},
      {id:'mode_11', hex:'#817D80', role:'Secondary / Stab B'},
      {id:'mode_15', hex:'#716B6D', role:'Secondary / Stab C'}
    ]},
    { id:'G3', label:'Group 3', members:[
      {id:'mode_07', hex:'#594841', role:'Core / Stab A'},
      {id:'mode_17', hex:'#714D40', role:'Secondary / Stab C'},
      {id:'mode_18', hex:'#615A5B', role:'Secondary / Stab B'}
    ]},
    { id:'G4', label:'Group 4', members:[
      {id:'mode_02', hex:'#362B2C', role:'Core / Stab A'},
      {id:'mode_20', hex:'#2D1E1B', role:'Secondary / Stab C'}
    ]},
    { id:'G5', label:'Group 5', members:[
      {id:'mode_03', hex:'#BA9A93', role:'Core / Stab A'},
      {id:'mode_08', hex:'#A29181', role:'Core / Stab A'}
    ]},
    { id:'G6', label:'Group 6', members:[
      {id:'mode_05', hex:'#130E11', role:'Core / Stab A'}
    ]},
    { id:'G7', label:'Group 7', members:[
      {id:'mode_14', hex:'#7495D7', role:'Secondary / Stab A'}
    ]},
    { id:'G8', label:'Group 8', members:[
      {id:'mode_22', hex:'#4B3F64', role:'Secondary / Stab B'}
    ]},
    { id:'G9', label:'Group 9', members:[
      {id:'mode_26', hex:'#B67CDB', role:'Secondary / Stab C'}
    ]}
  ]
};

let currentProfile = structuredClone(y2k);
let lastAnalysis = null;
let autosave = true;
let editMode = false;

function textColor(hex) {
  const {L} = featuresFromHex(hex);
  return L < 0.62 ? '#fff' : '#111';
}

function verdictClass(v) {
  return ({
    SAME: 'ok',
    RELATED: 'related',
    REVIEW: 'review',
    DIFFERENT: 'bad'
  })[v] || 'review';
}

function groupStatusClass(v) {
  return ({STABLE:'ok', REVIEW:'review', UNSTABLE:'bad'})[v] || 'review';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[x]));
}

function renderEditor() {
  const ta = $('#jsonEditor');
  ta.value = JSON.stringify(currentProfile, null, 2);
}

function showToast(msg, type='ok') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(() => el.classList.remove('show'), 2600);
}

function renderEmpty() {
  $('#summaryCards').innerHTML = '';
  $('#groups').innerHTML = `<div class="empty">按「執行 Physical Audit」開始分析。</div>`;
  $('#dangerPairs').innerHTML = '';
  $('#pairMatrix').innerHTML = '';
}

function fmt(x, n=3) {
  return typeof x === 'number' ? x.toFixed(n) : x;
}

function renderSummary(result) {
  const s = result.summary;
  $('#summaryCards').innerHTML = [
    ['Backbone Groups', s.group_count],
    ['Supported Colors', s.color_count],
    ['Stable', s.stable_groups],
    ['Review', s.review_groups],
    ['Danger Pairs', s.danger_pair_count]
  ].map(([k,v]) => `<div class="metric"><div class="metric-k">${k}</div><div class="metric-v">${v}</div></div>`).join('');
}

function renderGroups(result) {
  $('#groups').innerHTML = result.groups.map(g => {
    const swatches = g.members.map(m => `
      <div class="swatch" style="background:${m.hex};color:${textColor(m.hex)}">
        <div class="swatch-id">${esc(m.id)}</div>
        <div class="swatch-hex">${m.hex}</div>
        <div class="swatch-meta">
          L ${fmt(m.features.L)} · C ${fmt(m.features.C)}<br>
          ${esc(m.features.hue_family)} / ${esc(m.features.tone_family)}
        </div>
      </div>`).join('');

    const pairLines = g.pairs.map(p => {
      const r = p.relation;
      return `<div class="pair-line">
        <span>${esc(p.ids.join(' ↔ '))}</span>
        <span class="badge ${verdictClass(r.classification.verdict)}">${r.classification.verdict}</span>
        <span class="small">Tone ${fmt(r.metrics.tone_similarity)} · ΔH ${fmt(r.metrics.deltaH_deg,1)}°</span>
      </div>`;
    }).join('');

    return `<section class="group-card">
      <div class="group-head">
        <div>
          <div class="group-title">${esc(g.label)} <span class="muted">(${esc(g.id)})</span></div>
          <div class="small">
            cohesion ${fmt(g.cohesion)} · centroid hue ${fmt(g.centroid.h,1)}° ·
            ${esc(g.centroid.hue_family)} / ${esc(g.centroid.tone_family)}
          </div>
        </div>
        <span class="badge ${groupStatusClass(g.status)}">${g.status}</span>
      </div>
      <div class="swatch-row">${swatches}</div>
      ${g.pairs.length ? `<details><summary>群內 Pair Audit (${g.pairs.length})</summary>${pairLines}</details>` : ''}
    </section>`;
  }).join('');
}

function renderDanger(result) {
  const rows = result.danger_pairs.slice(0, 20);
  if (!rows.length) {
    $('#dangerPairs').innerHTML = `<div class="empty small">目前沒有偵測到「Tone 高度相似但 Hue 衝突」的危險 pair。</div>`;
    return;
  }
  $('#dangerPairs').innerHTML = rows.map(x => {
    const r = x.relation;
    return `<div class="danger-row">
      <div>
        <strong>${x.groups[0]} ↔ ${x.groups[1]}</strong>
        <div class="small">${esc(r.semantic_warnings.join(', '))}</div>
      </div>
      <div class="danger-metrics">
        Tone ${fmt(r.metrics.tone_similarity)} · Hue ${fmt(r.metrics.hue_similarity)} · ΔH ${fmt(r.metrics.deltaH_deg,1)}°
      </div>
      <span class="badge ${verdictClass(r.classification.verdict)}">${r.classification.verdict}</span>
    </div>`;
  }).join('');
}

function renderMatrix(result) {
  const ids = result.groups.map(g => g.id);
  const map = new Map();
  result.cross_group_relations.forEach(x => map.set(x.groups.join('|'), x.relation));
  let html = `<table class="matrix"><thead><tr><th></th>${ids.map(id=>`<th>${id}</th>`).join('')}</tr></thead><tbody>`;
  ids.forEach((row, i) => {
    html += `<tr><th>${row}</th>`;
    ids.forEach((col, j) => {
      if (i === j) {
        html += `<td class="diag">—</td>`;
      } else if (j < i) {
        html += `<td class="lower"></td>`;
      } else {
        const r = map.get(`${row}|${col}`);
        const v = r.classification.verdict;
        html += `<td class="${verdictClass(v)} matrix-cell"
          title="${row} ↔ ${col}
${v}
Tone ${r.metrics.tone_similarity}
Hue ${r.metrics.hue_similarity}
ΔH ${r.metrics.deltaH_deg}°">${v[0]}</td>`;
      }
    });
    html += `</tr>`;
  });
  html += '</tbody></table>';
  $('#pairMatrix').innerHTML = html;
}

async function saveResult(result) {
  const payload = {
    analysis_id: result.analysis_id,
    profile_name: result.profile_name,
    engine_version: result.engine_version,
    source: 'YOYO Physical Audit Lab',
    profile_input: currentProfile,
    summary: result.summary,
    analysis: result
  };
  const res = await fetch('/api/save-analysis', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Save failed: ${res.status}`);
  return res.json();
}

async function runAudit() {
  try {
    const parsed = JSON.parse($('#jsonEditor').value);
    currentProfile = parsed;
    const result = auditProfile(currentProfile);
    result.analysis_id = `${Date.now()}_${Math.random().toString(16).slice(2,8)}`;
    lastAnalysis = result;

    $('#engineVersion').textContent = ENGINE_VERSION;
    $('#profileName').textContent = result.profile_name;
    $('#generatedAt').textContent = new Date(result.generated_at).toLocaleString();

    renderSummary(result);
    renderGroups(result);
    renderDanger(result);
    renderMatrix(result);

    // Special teaching/example panel: find G3/G8 when available.
    const g3g8 = result.cross_group_relations.find(x =>
      (x.groups[0] === 'G3' && x.groups[1] === 'G8') ||
      (x.groups[0] === 'G8' && x.groups[1] === 'G3'));
    if (g3g8) {
      const r = g3g8.relation;
      $('#spotlight').innerHTML = `
        <div class="spot-title">G3 ↔ G8 檢核</div>
        <div class="spot-grid">
          <div><span>Verdict</span><strong>${r.classification.verdict}</strong></div>
          <div><span>Tone similarity</span><strong>${fmt(r.metrics.tone_similarity)}</strong></div>
          <div><span>Hue similarity</span><strong>${fmt(r.metrics.hue_similarity)}</strong></div>
          <div><span>ΔH</span><strong>${fmt(r.metrics.deltaH_deg,1)}°</strong></div>
        </div>
        <div class="small">${esc(r.reasons.join(' '))}</div>`;
    } else {
      $('#spotlight').innerHTML = `<div class="empty small">目前 Profile 沒有 G3/G8。</div>`;
    }

    if (autosave) {
      $('#saveState').textContent = '正在自動儲存…';
      const saved = await saveResult(result);
      $('#saveState').textContent = `已自動儲存 ${new Date(saved.saved_at).toLocaleTimeString()} · ${saved.filename}`;
      showToast('分析完成，結果已自動儲存。');
      loadHistory();
    } else {
      $('#saveState').textContent = 'Auto-save 已關閉';
      showToast('分析完成（未自動儲存）。', 'review');
    }
  } catch (err) {
    console.error(err);
    $('#saveState').textContent = '分析失敗';
    showToast(err.message, 'bad');
  }
}

function downloadObject(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function loadSample() {
  currentProfile = structuredClone(y2k);
  renderEditor();
  showToast('已載入 Y2K 9-Backbone 範例。');
}

function addGroup() {
  const n = currentProfile.groups.length + 1;
  currentProfile.groups.push({
    id: `G${n}`,
    label: `Group ${n}`,
    members: [{id:`mode_${String(n).padStart(2,'0')}`, hex:'#808080', role:'Custom'}]
  });
  renderEditor();
}

async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    const rows = data.rows || [];
    $('#history').innerHTML = rows.length ? rows.map(r => `
      <div class="history-row">
        <div>
          <strong>${esc(r.profile_name || 'Untitled')}</strong>
          <div class="small">${new Date(r.saved_at).toLocaleString()} · ${esc(r.save_id || '')}</div>
        </div>
        <div class="small">${r.summary ? `${r.summary.group_count} groups / ${r.summary.color_count} colors` : ''}</div>
      </div>
    `).join('') : `<div class="empty small">目前還沒有儲存紀錄。</div>`;
  } catch {
    $('#history').innerHTML = `<div class="empty small">無法讀取歷史紀錄。</div>`;
  }
}

$('#runBtn').addEventListener('click', runAudit);
$('#sampleBtn').addEventListener('click', loadSample);
$('#addGroupBtn').addEventListener('click', addGroup);
$('#downloadBtn').addEventListener('click', () => {
  if (!lastAnalysis) return showToast('請先執行分析。', 'review');
  downloadObject(lastAnalysis, `yoyo_physical_audit_${Date.now()}.json`);
});
$('#saveBtn').addEventListener('click', async () => {
  if (!lastAnalysis) return showToast('請先執行分析。', 'review');
  try {
    const saved = await saveResult(lastAnalysis);
    $('#saveState').textContent = `手動儲存完成 · ${saved.filename}`;
    showToast('已儲存。');
    loadHistory();
  } catch (err) {
    showToast(err.message, 'bad');
  }
});
$('#autoSave').addEventListener('change', e => {
  autosave = e.target.checked;
  $('#saveState').textContent = autosave ? 'Auto-save 已開啟' : 'Auto-save 已關閉';
});
$('#formatBtn').addEventListener('click', () => {
  try {
    const p = JSON.parse($('#jsonEditor').value);
    $('#jsonEditor').value = JSON.stringify(p, null, 2);
  } catch (err) {
    showToast(err.message, 'bad');
  }
});

renderEditor();
renderEmpty();
loadHistory();
$('#engineVersion').textContent = ENGINE_VERSION;
