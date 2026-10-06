
(function(){
  const ID='yoyo-phase2-work-progress-card';
  function esc(x){return String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  async function render(){
    try{
      const r=await fetch('/yoyo_phase2_work_progress.json?ts='+Date.now(),{cache:'no-store'});
      if(!r.ok)return;
      const d=await r.json();
      let el=document.getElementById(ID);
      if(!el){
        el=document.createElement('section');
        el.id=ID;
        el.style.cssText='margin:18px 0;padding:16px;border:1px solid #bbb;border-radius:12px;background:rgba(255,255,255,.04)';
        const target=document.querySelector('main')||document.body;
        target.prepend(el);
      }
      const stages=(d.stages||[]).map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.work_status)}</td><td>${esc(s.mainline_status)}</td></tr>`).join('');
      el.innerHTML=`<h2 style="margin-top:0">PHASE 2 WORK — ${esc(d.completed)}/${esc(d.total)} ${esc(d.overall_work_status)}</h2>
      <div><b>OFFICIAL MAINLINE STATUS:</b> ${esc(d.official_mainline_status)}</div>
      <div><b>OFFICIAL MAINLINE PASS:</b> ${esc(d.official_mainline_pass)}</div>
      <table style="width:100%;margin-top:10px"><thead><tr><th>Stage</th><th>Work</th><th>Mainline</th></tr></thead><tbody>${stages}</tbody></table>
      <small>Display-only shadow work. Does not modify formal stage state.</small>`;
    }catch(e){}
  }
  render(); setInterval(render,5000);
})();
