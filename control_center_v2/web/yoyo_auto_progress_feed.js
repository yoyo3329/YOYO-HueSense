(() => {
  "use strict";
  const FEED = "/yoyo_auto_progress_feed.json";
  const $all = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));

  function byHeading(texts) {
    const wanted = texts.map(x => x.toLowerCase());
    const nodes = $all("h1,h2,h3,.label,.eyebrow");
    return nodes.find(n => wanted.some(t => (n.textContent || "").toLowerCase().includes(t)));
  }

  function hostForHeading(h) {
    if (!h) return null;
    return h.closest("section,.card") || h.parentElement;
  }

  function ensure(host, id, afterHeading) {
    if (!host) return null;
    let x = document.getElementById(id);
    if (x) return x;
    x = document.createElement("div");
    x.id = id;
    x.style.marginTop = "10px";
    if (afterHeading && afterHeading.parentNode === host) {
      afterHeading.insertAdjacentElement("afterend", x);
    } else {
      host.prepend(x);
    }
    return x;
  }

  function badge(status) {
    const s = String(status || "").toUpperCase();
    const bg = s === "PASS" ? "#e8f5ee" :
               (s.includes("HOLD") || s.includes("WAIT") || s.includes("NOT EXECUTED")) ? "#fff4df" :
               s.includes("FAIL") ? "#fdeaea" : "#eef3f6";
    const fg = s === "PASS" ? "#216c4d" :
               (s.includes("HOLD") || s.includes("WAIT") || s.includes("NOT EXECUTED")) ? "#8d5a00" :
               s.includes("FAIL") ? "#a52a2a" : "#52616b";
    return `<span style="display:inline-block;padding:3px 8px;border-radius:999px;background:${bg};color:${fg};font-weight:800;font-size:11px">${esc(status)}</span>`;
  }

  function renderTop(feed) {
    const current = byHeading(["我現在到底做到哪", "current verified project snapshot"]);
    const host = hostForHeading(current) || document.querySelector("main");
    const box = ensure(host, "yoyo-auto-current-state", current);
    if (!box) return;

    box.innerHTML = `
      <div style="border-left:4px solid #2f8f6b;padding:12px 14px;background:#f7fbf9;border-radius:10px">
        <div style="font-size:12px;letter-spacing:.08em;font-weight:900;color:#687780">AUTO-SYNCED CURRENT STATE</div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:7px">
          <div><b>Mainline</b><br><span style="font-size:21px;font-weight:900">${esc(feed.research_state?.passed ?? 5)} / ${esc(feed.research_state?.total ?? 33)}</span></div>
          <div><b>Current Stage</b><br><span style="font-size:21px;font-weight:900">${esc(feed.research_state?.current_stage_name || "Rebase DEV")}</span></div>
          <div><b>Rebase</b><br>${badge(feed.research_state?.rebase_status || "NOT EXECUTED")}</div>
          <div><b>B1</b><br>${badge(feed.research_state?.b1_status || "WAIT")}</div>
          <div><b>B2</b><br>${badge(feed.research_state?.b2_status || "HOLD_COLOR_EVIDENCE_AUTHORITY")}</div>
        </div>
        <div style="margin-top:8px;font-size:12px;color:#5d6c75">
          Next action: <b>${esc(feed.next_action || "READ-ONLY runtime queue identity audit")}</b>
        </div>
        <div style="font-size:11px;color:#7a8891;margin-top:4px">Updated ${esc(feed.updated_at || "")} · display/progress journal only; research Gate is not mutated by this feed.</div>
      </div>`;
  }

  function renderTimeline(feed) {
    const h = byHeading(["專案每天真的前進了什麼", "progress timeline"]);
    const host = hostForHeading(h);
    const box = ensure(host, "yoyo-auto-timeline", h);
    if (!box) return;

    const events = (feed.events || []).slice(0, 12);
    box.innerHTML = events.map(e => `
      <div style="display:grid;grid-template-columns:92px 1fr;gap:12px;padding:9px 0;border-bottom:1px solid #e8edf0">
        <div style="font-size:11px;color:#73818c">${esc((e.time || "").replace("T"," ").slice(0,16))}</div>
        <div>
          <div><b>${esc(e.title)}</b> ${badge(e.status)}</div>
          <div style="font-size:12px;color:#57656e;margin-top:3px">${esc(e.detail || "")}</div>
        </div>
      </div>`).join("") || '<div style="font-size:12px;color:#73818c">尚無工程進度事件。</div>';
  }

  function renderRecent(feed) {
    const h = byHeading(["最近執行", "run history"]);
    const host = hostForHeading(h);
    const box = ensure(host, "yoyo-auto-recent", h);
    if (!box) return;

    const events = (feed.events || []).slice(0, 6);
    box.innerHTML = `
      <div style="font-size:11px;font-weight:900;color:#687780;margin-bottom:6px">CURRENT ENGINEERING ACTIVITY（非研究 Run）</div>
      ${events.map(e => `
        <div style="padding:8px 10px;border:1px solid #e3e9ec;border-radius:9px;margin:6px 0;background:#fff">
          <div style="display:flex;justify-content:space-between;gap:10px"><b>${esc(e.title)}</b>${badge(e.status)}</div>
          <div style="font-size:11px;color:#71808a">${esc(e.time || "")}</div>
          <div style="font-size:12px;margin-top:3px">${esc(e.detail || "")}</div>
        </div>`).join("")}`;
  }

  function renderReports(feed) {
    const h = byHeading(["html / pdf", "result reports"]);
    const host = hostForHeading(h);
    const box = ensure(host, "yoyo-auto-reports", h);
    if (!box) return;

    const reports = (feed.reports || []).slice(0, 8);
    box.innerHTML = `
      <div style="font-size:11px;font-weight:900;color:#687780;margin:8px 0">CURRENT ENGINEERING / AUDIT REPORTS</div>
      ${reports.map(r => `
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid #e8edf0">
          <div>
            <b>${esc(r.title)}</b>
            <div style="font-size:11px;color:#72808a">${esc(r.path || "")}</div>
          </div>
          ${badge(r.status || "REPORT")}
        </div>`).join("") || '<div style="font-size:12px;color:#73818c">尚無新的工程 Audit report。</div>'}`;
  }

  async function loadFeed() {
    try {
      const r = await fetch(FEED + "?t=" + Date.now(), {cache:"no-store"});
      if (!r.ok) return;
      const feed = await r.json();
      renderTop(feed);
      renderTimeline(feed);
      renderRecent(feed);
      renderReports(feed);
      window.YOYO_AUTO_PROGRESS_FEED = feed;
    } catch (_) {}
  }

  loadFeed();
  setInterval(loadFeed, 2500);
  new MutationObserver(() => loadFeed()).observe(document.documentElement, {subtree:true,childList:true});
})();
