(() => {
  "use strict";

  const EXEC = new Set(["INSPECTING","INSTALLING","RUNNING","IMPORTING"]);
  const WAIT = new Set(["NEW","STAGED","VALIDATED","READY","WAITING_UPSTREAM_GATE","WAITING_FORMAL_CONFIRMATION"]);
  let snapshot = null;
  let applying = false;

  const get = id => document.getElementById(id);

  function addStyles() {
    if (document.getElementById("yoyo-ui-hotfix-style")) return;
    const s = document.createElement("style");
    s.id = "yoyo-ui-hotfix-style";
    s.textContent = `
      #active.yoyo-running { color:#08783e; }
      #active.yoyo-waiting { color:#9a6500; }
      #active.yoyo-idle { color:inherit; }
      .yoyo-safe-nav { display:inline-flex;align-items:center;justify-content:center;text-decoration:none;border:1px solid #b9c7d2;border-radius:9px;padding:8px 12px;font-weight:800;background:#fff;color:#24445a;margin-left:8px; }
      .yoyo-safe-nav:hover { background:#f3f7fa; }
    `;
    document.head.appendChild(s);
  }

  function queueActive(a) {
    const q = Array.isArray(a?.queue) ? a.queue : [];
    if (a?.active_package_id) {
      return q.find(x => x.package_id === a.active_package_id || x.run_id === a.active_run_id) ||
             {package_id:a.active_package_id, run_id:a.active_run_id, status:"RUNNING"};
    }
    return q.find(x => EXEC.has(String(x.status || "").toUpperCase())) || null;
  }

  function queueWaiting(a) {
    const q = Array.isArray(a?.queue) ? a.queue : [];
    return q.find(x => WAIT.has(String(x.status || "").toUpperCase())) || null;
  }

  function render(a) {
    if (!a || applying) return;
    applying = true;
    try {
      addStyles();

      const activeEl = get("active");
      const bar = get("livebar");
      const item = get("currentItem");
      const log = get("livelog");
      const active = queueActive(a);
      const waiting = !active ? queueWaiting(a) : null;
      const p = a.progress || {};

      if (active) {
        if (activeEl) {
          activeEl.textContent = `● 正在執行：${active.package_id || active.zip_name || a.active_package_id || "Package"}`;
          activeEl.classList.remove("yoyo-idle","yoyo-waiting");
          activeEl.classList.add("yoyo-running");
        }
        const total = Number(p.total || 0), current = Number(p.current || 0);
        const pct = total > 0 ? Math.max(0, Math.min(100, Math.round(100 * current / total))) : 0;
        if (bar) bar.style.width = `${pct}%`;
        if (item) {
          const stage = active.stage ? ` · ${active.stage}` : "";
          const cur = p.current_item ? ` · Current: ${p.current_item}` : "";
          item.textContent = total > 0 ? `${current} / ${total} · ${pct}%${stage}${cur}` : `執行中${stage}${cur}`;
        }
        if (log && Array.isArray(a.live_log_tail) && a.live_log_tail.length) {
          log.textContent = a.live_log_tail.join("\n");
        }
      } else if (waiting) {
        if (activeEl) {
          activeEl.textContent = `◐ 等待執行：${waiting.package_id || waiting.zip_name || "Package"} · ${waiting.status}`;
          activeEl.classList.remove("yoyo-idle","yoyo-running");
          activeEl.classList.add("yoyo-waiting");
        }
        if (bar) bar.style.width = "0%";
        if (item) item.textContent = waiting.stage ? `Stage: ${waiting.stage}` : "等待 Automation Agent";
        if (log) log.textContent = (waiting.events || []).slice(-1)[0]?.message || a.last_event || "等待執行。";
      } else {
        if (activeEl) {
          activeEl.textContent = "○ 目前沒有執行";
          activeEl.classList.remove("yoyo-running","yoyo-waiting");
          activeEl.classList.add("yoyo-idle");
        }
        if (bar) bar.style.width = "0%";
        if (item) item.textContent = "等待下一個 package";
        if (log) log.textContent = a.last_event ? `最近事件：${a.last_event}` : "Waiting for package...";
      }

      const q = get("queue");
      if (q && !q.dataset.yoyoAnchor) {
        q.dataset.yoyoAnchor = "1";
        const section = q.closest("section");
        if (section) section.id = "queue-list";
      }

      if ((location.hash === "#queue" || location.hash === "#queue-list") && q && !window.__yoyoScrolledQueue) {
        window.__yoyoScrolledQueue = true;
        const target = document.getElementById("queue-list") || q;
        setTimeout(() => target.scrollIntoView({behavior:"smooth", block:"start"}), 150);
      }
    } finally {
      applying = false;
    }
  }

  async function refresh() {
    try {
      const r = await fetch("/api/automation", {cache:"no-store"});
      snapshot = await r.json();
      render(snapshot);
    } catch (_) {}
  }

  const observer = new MutationObserver(() => {
    if (snapshot) queueMicrotask(() => render(snapshot));
  });
  observer.observe(document.documentElement, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:["style","class"]});

  refresh();
  setInterval(refresh, 650);
})();
