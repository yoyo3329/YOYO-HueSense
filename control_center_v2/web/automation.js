const $=s=>document.querySelector(s),esc=x=>String(x??"—").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
async function j(u,o){let r=await fetch(u,o);return await r.json()}
async function setSetting(k,v){await j("/api/automation/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({[k]:v})});await refreshNow()}
async function confirmFormal(key){await j("/api/automation/confirm-formal",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({package_key:key})});await refreshNow()}
async function runReady(key){await j("/api/automation/run-ready",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({package_key:key})});await refreshNow()}

let __yoyoLoading=false;
let __yoyoShowAllQueue=false;
let __yoyoTimer=null;
const __YOYO_POLL_MS=5000;
const __YOYO_QUEUE_LIMIT=50;

function ensureOverviewButton(){
  if(document.getElementById("yoyo-v34-home")) return;
  const a=document.createElement("a");
  a.id="yoyo-v34-home";
  a.href="/";
  a.textContent="← 回到總覽";
  a.title="只切回總覽，不會執行任何 package";
  a.style.cssText="position:fixed;right:18px;bottom:18px;z-index:99999;padding:10px 14px;border-radius:10px;background:#fff;border:1px solid #bcc9d2;color:#203746;text-decoration:none;font-weight:800;box-shadow:0 4px 18px rgba(0,0,0,.12)";
  document.body.appendChild(a);
}

function renderQueue(q){
  const host=$("#queue");
  if(!host) return;
  if(!q.length){
    host.innerHTML='<div class="muted">Inbox 尚無 package。</div>';
    return;
  }
  const shown=__yoyoShowAllQueue?q:q.slice(0,__YOYO_QUEUE_LIMIT);
  const more=q.length>shown.length
    ? `<div style="margin:10px 0"><button id="yoyo-show-all-queue">顯示全部 ${q.length} 筆</button><span class="small" style="margin-left:8px">目前先顯示最新 ${shown.length} 筆，避免長 Queue 造成卡頓。</span></div>`
    : (__yoyoShowAllQueue && q.length>__YOYO_QUEUE_LIMIT
      ? `<div style="margin:10px 0"><button id="yoyo-collapse-queue">只顯示最新 ${__YOYO_QUEUE_LIMIT} 筆</button></div>`
      : "");
  host.innerHTML=more+shown.map(x=>{
    const manual=x.status==="WAITING_FORMAL_CONFIRMATION"?`<button class="warn" onclick="confirmFormal('${esc(x.package_key)}')">確認正式執行</button>`:"";
    const ready=x.status==="READY"?`<button class="primary" onclick="runReady('${esc(x.package_key)}')">執行</button>`:"";
    return `<div class="queueitem ${x.status==="RUNNING"?"active":""}" style="content-visibility:auto;contain-intrinsic-size:auto 145px"><div class="queuegrid"><div><b>${esc(x.package_id||x.zip_name)}</b><div class="small">${esc(x.zip_name)} · ${esc(x.stage)} · ${esc(x.mode)}</div></div><div class="status ${esc(x.status)}">${esc(x.status)}</div><div>${manual}${ready}</div></div><div class="small">${esc((x.events||[]).slice(-1)[0]?.message||"")}</div>${x.mainline_progressed?'<div class="PASS"><b>✓ Mainline progressed</b></div>':""}</div>`;
  }).join("");

  const show=document.getElementById("yoyo-show-all-queue");
  if(show) show.onclick=()=>{__yoyoShowAllQueue=true;renderQueue(q)};
  const collapse=document.getElementById("yoyo-collapse-queue");
  if(collapse) collapse.onclick=()=>{__yoyoShowAllQueue=false;renderQueue(q)};
}

async function load(){
  if(__yoyoLoading) return;
  __yoyoLoading=true;
  try{
    const a=await j("/api/automation"),s=a.settings||{};

    $("#watch").textContent=s.watch_enabled?"● Watching":"○ Paused";
    $("#path").textContent=a.watching||"—";

    const toggles=[["watch_enabled","Package Watcher"],["auto_run_dev_packages","Auto-run DEV packages"],["auto_run_formal_packages","Auto-run FORMAL packages"],["auto_open_results","Auto-open results"],["auto_archive_completed_zip","Auto-archive completed ZIP"]];
    $("#settings").innerHTML=toggles.map(([k,n])=>`<label class="toggle"><span>${n}</span><input type="checkbox" data-setting="${k}" ${s[k]?"checked":""} ${k==="auto_run_formal_packages"?"disabled title='Formal auto-run remains OFF by policy'":""}></label>`).join("");
    document.querySelectorAll("[data-setting]").forEach(x=>x.onchange=()=>setSetting(x.dataset.setting,x.checked));

    const active=Boolean(a.active_package_id);
    $("#active").textContent=active?`● 正在執行：${a.active_package_id}${a.active_run_id?` · ${a.active_run_id}`:""}`:"○ 目前沒有執行";

    const p=active?(a.progress||{}):{};
    const pct=p.total?Math.round(100*(p.current||0)/p.total):0;
    $("#livebar").style.width=pct+"%";
    $("#currentItem").textContent=p.total?`${p.current||0} / ${p.total} · ${p.current_item||""}`:"";
    $("#livelog").textContent=active?((a.live_log_tail||[]).join("\n")||"Waiting for package..."):"Waiting for package...";

    renderQueue(a.queue||[]);
  }finally{
    __yoyoLoading=false;
  }
}

async function refreshNow(){
  if(document.hidden) return;
  await load().catch(e=>console.warn("YOYO Automation refresh failed",e));
}

function startPolling(){
  if(__yoyoTimer) clearInterval(__yoyoTimer);
  __yoyoTimer=setInterval(()=>{ if(!document.hidden) refreshNow(); },__YOYO_POLL_MS);
}

ensureOverviewButton();
refreshNow();
startPolling();
document.addEventListener("visibilitychange",()=>{ if(!document.hidden) refreshNow(); });
