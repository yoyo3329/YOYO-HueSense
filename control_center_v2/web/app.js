const $=s=>document.querySelector(s);
const esc=x=>String(x??"—").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
async function j(u,o){let r=await fetch(u,o);return await r.json()}
let state,runs,auto,reports,timeline,selectedRun=null,currentSummaryText="";

function statusClass(s){s=String(s||"");return ["PASS","READY","HOLD","FAIL","STALE","RUNNING"].includes(s)?s:""}
function fmtRun(m){
 if(!m)return '<div class="muted">尚無資料</div>';
 return `<div class="resultline"><span class="status ${statusClass(m.status)}">${esc(m.status)}</span><span>${esc(m.stage)}</span></div>
 <div class="factgrid"><div><b>Mode</b><span>${esc(m.run_mode)}</span></div><div><b>Input</b><span>${esc(m.input_count)}</span></div>
 <div><b>Output</b><span>${esc(m.output_count)}</span></div><div><b>Formal</b><span>${m.formal_claim_allowed?"true":"false"}</span></div></div>`;
}
function copyText(t){navigator.clipboard?.writeText(t||"")}
function plainProgressText(){
 const current=state.stages.find(x=>x.id===state.current_stage)||{};
 return `目前已完成 ${state.overall.passed} / ${state.overall.total} 個主線 Stage。

現在位於：${current.name||state.current_stage_name||"—"}

這一步的目的：
${current.purpose||"—"}

下一個允許處理的是：${current.name||"—"}。
先讓這個 Stage 的 Gate 通過，才會解鎖下一步。

目前為 DEV，formal_claim_allowed = false。`;
}
async function load(){
 [state,runs,auto,reports,timeline]=await Promise.all([j("/api/state"),j("/api/runs"),j("/api/automation"),j("/api/reports"),j("/api/timeline")]);
 $("#phase").textContent=`PHASE ${state.current_phase}`;
 $("#stage").textContent=state.current_stage_name||"—";
 $("#progress").textContent=state.overall.progress_percent+"%";
 $("#count").textContent=`${state.overall.passed} / ${state.overall.total} Main Stages PASS`;
 $("#progbar").style.width=state.overall.progress_percent+"%";
 $("#next").textContent=(state.stages.find(x=>x.id===state.next_allowed_stage)||{}).name||"—";
 $("#autoStatus").textContent=auto.settings?.watch_enabled?"● 自動監看中":"○ 已暫停";
 const cloud=auto.cloud_inbox||{};
 $("#cloudSync").innerHTML=cloud.available?'<span class="PASS">✓ Google Drive 同步 Inbox 已找到</span>':'<span class="HOLD">⚠ Google Drive 同步 Inbox 尚未找到</span>';

 const plain=plainProgressText(); $("#plainProgress").textContent=plain; $("#copyProgress").onclick=()=>copyText(plain);

 const latest=state.latest_research_run,prev=state.previous_research_run;
 $("#latestTitle").textContent=latest?latest.run_id:"—"; $("#latestResult").innerHTML=fmtRun(latest);
 $("#previousTitle").textContent=prev?prev.run_id:"—"; $("#previousResult").innerHTML=fmtRun(prev);
 $("#latestBtn").disabled=!latest; $("#latestBtn").onclick=()=>latest&&showRun(latest.run_id);

 $("#timeline").innerHTML=(timeline||[]).length?timeline.map((x,i)=>`<div class="tlrow"><div class="tldot ${i===timeline.length-1?"currentDot":""}"></div><div class="tldate">${esc(x.date||"")}</div><div class="tlbody"><b>${esc(x.stage_name)}</b><span class="status PASS">PASS</span><p>${esc(x.headline)}</p></div></div>`).join("")+`<div class="tlrow nextrow"><div class="tldot nextDot"></div><div class="tldate">Next</div><div class="tlbody"><b>${esc(state.current_stage_name)}</b><span class="status READY">READY</span></div></div>`:'<div class="muted">尚無主線 PASS 時間軸。</div>';

 const names={1:"DEV Engineering",2:"Reference Dataset V2",3:"Formal Image Evidence",4:"Human Perception + Decision Engine",5:"External Validation + Publish"};
 $("#phases").innerHTML=[1,2,3,4,5].map(pid=>{
   const rows=state.stages.filter(x=>x.phase===pid),p=rows.filter(x=>x.status==="PASS").length;
   return `<div class="phase"><div class="phasehead"><span>PHASE ${pid} — ${names[pid]}</span><span>${p}/${rows.length}</span></div>
   <div class="stages">${rows.map(x=>`<div class="stage ${statusClass(x.status)} ${x.id===state.current_stage?"current":""}">
   <div class="stageTop"><b>${esc(x.name)}</b><span class="stageStatus">${esc(x.status)}</span></div>
   <div class="small">${esc(x.dev_formal)}</div><div class="stagePurpose">${esc(x.purpose)}</div></div>`).join("")}</div></div>`
 }).join("");

 $("#reports").innerHTML=(reports||[]).length?reports.map(r=>`<div class="reportRow"><div><b>${esc(r.stage||r.run_id)}</b><div class="small">${esc(r.run_id)} · ${esc(r.created_at||"")}</div></div>
 <div class="reportButtons"><a class="buttonLink primary" target="_blank" href="/reports/${encodeURIComponent(r.run_id)}/html">HTML（網頁）</a>
 ${r.pdf_path?`<a class="buttonLink secondary" target="_blank" href="/reports/${encodeURIComponent(r.run_id)}/pdf">PDF（報告）</a>`:`<span class="pill">PDF 未產生</span>`}
 <button class="secondary" onclick="openFolder('${esc(r.run_id)}')">開啟資料夾</button></div></div>`).join(""):'<div class="muted">下一筆真實 Run 完成後會自動出現在這裡。舊 Run 可在 Run Summary 裡按「補產生報告」。</div>';
 $("#openReportFolder").onclick=()=>openFolder(null);

 $("#history").innerHTML=runs.slice(0,20).map(r=>`<div class="history ${r.manifest.run_id===selectedRun?"selected":""}" data-id="${esc(r.manifest.run_id)}">
 <div class="historyTop"><b>${esc(r.manifest.stage)}</b><span class="status ${statusClass(r.manifest.status)}">${esc(r.manifest.status)}</span></div>
 <div><span class="pill">${esc(r.manifest.run_mode)}</span></div><div class="small">${esc(r.manifest.finished_at||r.manifest.started_at||"")}</div></div>`).join("")||'<div class="muted">尚無 Run</div>';
 document.querySelectorAll(".history").forEach(x=>x.onclick=()=>showRun(x.dataset.id));
 if(!selectedRun&&latest)showRun(latest.run_id,false);
}

function arrHtml(a){return `<ul>${(a||[]).map(x=>`<li>${esc(x)}</li>`).join("")||"<li>—</li>"}</ul>`}
async function showRun(id,scroll=true){
 selectedRun=id; const r=await j("/api/run?id="+encodeURIComponent(id)),s=r.summary||{},m=r.manifest||{},ng=s.next_goal||{};
 $("#runTitle").textContent=id;
 currentSummaryText=`Purpose（目的）
${s.purpose||"—"}

Process（過程）
${(s.process||[]).map(x=>"• "+x).join("\n")}

Action（執行內容）
${(s.actions||[]).map(x=>"• "+x).join("\n")}

Result（結果）
${s.result_summary||m.status||"—"}

Improvement（改進）
${(s.improvements||[]).map(x=>"• "+x).join("\n")}

Next Goal（下一步目標）
${ng.stage||"—"}
${ng.objective||""}
${(ng.pass_conditions||[]).map(x=>"• "+x).join("\n")}`;
 $("#copySummary").disabled=false; $("#copySummary").onclick=()=>copyText(currentSummaryText);

 $("#runDetail").innerHTML=`
 <div class="outcome ${m.status==="PASS"?"good":"warn"}"><div><span class="status ${statusClass(m.status)}">${esc(m.status)}</span>
 <b>${m.affects_stage_state?"✓ Mainline 有前進":"此 Run 沒有改變 Mainline Gate"}</b></div><div>${esc(s.result_summary||m.gate_name||"")}</div></div>
 <div class="journal">
 <div class="journalBlock"><b>Purpose（目的）</b><p>${esc(s.purpose)}</p></div>
 <div class="journalBlock"><b>Process（過程）</b>${arrHtml(s.process)}</div>
 <div class="journalBlock"><b>Action（執行內容）</b>${arrHtml(s.actions)}</div>
 <div class="journalBlock"><b>Result（結果）</b><p>${esc(s.result_summary||m.status)}</p></div>
 <div class="journalBlock"><b>Improvement（改進）</b>${arrHtml(s.improvements)}</div>
 <div class="journalBlock nextGoal"><b>Next Goal（下一步目標）</b><h3>${esc(ng.stage)}</h3><p>${esc(ng.objective)}</p><div><b>通過條件：</b>${arrHtml(ng.pass_conditions)}</div></div>
 </div>
 <div class="runActions"><button class="secondary" onclick="generateReport('${esc(id)}')">Generate Report（補產生 HTML / PDF）</button></div>
 <h3>Gate Explanation（Gate 白話說明）</h3>${gateHtml(r)}
 <h3>Before / After（前後差異）</h3>${diffHtml(r.important_diff)}
 <details class="technical"><summary>Technical Details（技術細節）</summary><pre>${esc(JSON.stringify({manifest:m,gate:r.gate,diff:r.diff},null,2))}</pre></details>`;
 if(scroll)$("#runTitle").scrollIntoView({behavior:"smooth",block:"start"});
}
function gateHtml(r){
 const c=(r.gate_checks||[]).filter(x=>x.key&&!x.key.toLowerCase().includes("schema")).slice(0,36);
 return c.length?`<div class="checkgrid">${c.map(x=>`<div class="check ${x.status==="PASS"?"ok":"bad"}"><span>${x.status==="PASS"?"✓":"✕"}</span><div><b>${esc(x.key)}</b><div>${esc(x.status)}</div></div></div>`).join("")}</div>`:'<div class="muted">沒有可展開 Gate checks。</div>';
}
function diffHtml(items){
 return items?.length?`<div class="diffList">${items.map(x=>`<div class="diffrow ${esc(x.type)}"><b>${esc(x.type)}</b><span>${esc(x.field)}</span><span>${esc(JSON.stringify(x.from??x.value??"—"))}</span><span>→</span><span>${esc(JSON.stringify(x.to??"—"))}</span></div>`).join("")}</div>`:'<div class="muted">沒有重要差異。</div>';
}
async function generateReport(id){
 const r=await j("/api/reports/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({run_id:id})});
 if(!r.ok){alert("報告產生失敗："+(r.error||"unknown"));return}
 await load(); alert("HTML / PDF 報告已補產生。");
}
async function openFolder(id){
 await j("/api/reports/open-folder",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({run_id:id})});
}
load().catch(console.error);setInterval(()=>load().catch(()=>{}),5000);
