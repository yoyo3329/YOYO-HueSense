/* DISPLAY-ONLY product roadmap: no calls to Gate/Queue/Authority APIs. */
(function () {
"use strict";
var remote="https://raw.githubusercontent.com/yoyo3329/YOYO-HueSense/feature/huesense-browser-ai-rnd/docs/huesense-program/CURRENT_STATUS.json";
var local="/huesense_program_status.json";
function el(t,cls,content){var x=document.createElement(t);if(cls)x.className=cls;if(content!==undefined)x.textContent=String(content);return x;}
function link(box,url,name){try{var u=new URL(url);if(u.protocol!=="https:"||!["drive.google.com","docs.google.com","github.com"].includes(u.hostname))return;var a=el("a","",name);a.href=url;a.target="_blank";a.rel="noopener noreferrer";a.style.marginRight="18px";box.appendChild(a);}catch(e){}}
function host(){var x=document.getElementById("hs-product-program");if(x)return x;var main=document.querySelector("main");if(!main)return null;x=el("section","card");x.id="hs-product-program";x.style.cssText="margin:16px 0;border:1px solid #95a4b3;background:#fbfcff;padding:18px;";main.insertBefore(x,main.firstChild);return x;}
function render(data,isFallback){var box=host();if(!box)return;box.replaceChildren();if(!data||data.schema!=="HUESENSE_PROGRAM_STATUS_V1"||data.display_only!==true){box.textContent="產品進度格式無效";return;}
box.appendChild(el("div","label","HUESENSE · PRODUCT ROADMAP · DISPLAY ONLY"));
box.appendChild(el("h2","","產品 × 研究 × 網站｜整合進度藍圖"));
box.appendChild(el("p","muted","語意色票決策是核心；SAM2 換色屬設計溝通。研究 Gate 不受此面板影響。"));
box.appendChild(el("p","",String(isFallback?"STALE (本地備份)":"GitHub 已同步")+" · 快照 "+data.updated_at+" · 非 Live Gate"));
box.appendChild(el("p","","目前焦點："+data.current_focus));
box.appendChild(el("p","muted","研究保護："+data.research_gate_message));
var grid=el("div");grid.style.cssText="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:9px;";
(data.milestones||[]).slice(0,14).forEach(function(item){var card=el("article");card.style.cssText="padding:12px;border:1px solid #dce3ed;border-radius:9px;background:#fff";card.appendChild(el("b","",item.id+" · "+item.title));card.appendChild(el("div","",item.status));card.appendChild(el("div","muted",item.detail));grid.appendChild(card);});box.appendChild(grid);
var details=el("details");details.style.marginTop="12px";details.appendChild(el("summary","","產品進度事件（非研究 Run）"));(data.recent_events||[]).slice(0,5).forEach(function(event){details.appendChild(el("p","",event.date+" · "+event.title+" · "+event.status+" · "+event.evidence));});box.appendChild(details);
var links=el("div");links.style.marginTop="12px";link(links,data.drive_folder,"Drive 資料夾");link(links,data.drive_blueprint,"總藍圖");link(links,data.drive_progress,"目前進度");link(links,"https://github.com/yoyo3329/YOYO-HueSense/tree/feature/huesense-browser-ai-rnd/docs/huesense-program","GitHub 版控");box.appendChild(links);
box.appendChild(el("p","muted","產品進度與研究 Gate 不混算。GitHub JSON 每 60 秒檢查一次；Drive 文件須另外更新。"));
}
async function read(url,ms){var ctl=new AbortController(),timer=setTimeout(function(){ctl.abort();},ms);try{var r=await fetch(url+"?t="+Date.now(),{cache:"no-store",signal:ctl.signal});if(!r.ok)throw Error("HTTP "+r.status);return await r.json();}finally{clearTimeout(timer);}}
async function refresh(){try{render(await read(remote,7000),false);}catch(e){try{render(await read(local,3000),true);}catch(err){var box=host();if(box)box.textContent="產品進度暫時無法載入（STALE）；既有研究 Gate 不受影響。";}}}
refresh();setInterval(refresh,60000);
})();