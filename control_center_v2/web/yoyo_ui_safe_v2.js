(() => {
  "use strict";
  const ACTIVE = new Set(["INSPECTING","INSTALLING","RUNNING","IMPORTING"]);
  function addSafeQueueLink(){
    if(document.getElementById("yoyo-safe-queue-link-v2")) return;
    const candidates=[...document.querySelectorAll("a,button")];
    const auto=candidates.find(el => /自動執行|Automation/i.test((el.textContent||"").trim()));
    if(!auto) return;
    const a=document.createElement("a");
    a.id="yoyo-safe-queue-link-v2";
    a.href="/automation.html#queue";
    a.textContent="查看自動化列表";
    a.title="只查看 Automation Queue，不會觸發執行";
    a.style.cssText="display:inline-flex;align-items:center;justify-content:center;margin-left:8px;padding:9px 13px;border-radius:9px;text-decoration:none;background:#eef3f6;color:#213547;font-weight:800;border:1px solid #cbd6dd";
    auto.insertAdjacentElement("afterend",a);
  }
  function queueSectionAnchor(){
    const q=document.getElementById("queue");
    if(!q) return;
    const sec=q.closest("section")||q;
    if(!sec.id) sec.id="queue";
    if(location.hash==="#queue" && !window.__yoyoQueueScrolled){
      window.__yoyoQueueScrolled=true;
      setTimeout(()=>sec.scrollIntoView({behavior:"smooth",block:"start"}),120);
    }
  }
  function fixLiveLabelFromRenderedQueue(){
    const activeEl=document.getElementById("active");
    if(!activeEl) return;
    const rows=[...document.querySelectorAll(".queueitem")];
    let activeRow=null, status="";
    for(const row of rows){
      const st=(row.querySelector(".status")?.textContent||"").trim().toUpperCase();
      if(ACTIVE.has(st)){ activeRow=row; status=st; break; }
    }
    if(activeRow){
      const name=(activeRow.querySelector("b")?.textContent||"Package").trim();
      activeEl.textContent=`● 正在執行：${name} · ${status}`;
      return;
    }
    const current=(activeEl.textContent||"").trim();
    if(/目前沒有執行|Idle|沒有執行/.test(current)){
      const bar=document.getElementById("livebar");
      const item=document.getElementById("currentItem");
      if(bar) bar.style.width="0%";
      if(item && /\/|Current:/i.test(item.textContent||"")) item.textContent="等待下一個 package";
    }
  }
  function tick(){ addSafeQueueLink(); queueSectionAnchor(); fixLiveLabelFromRenderedQueue(); }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",tick,{once:true}); else tick();
  setInterval(tick,1500);
})();
