(() => {
  "use strict";

  function addStyles() {
    if (document.getElementById("yoyo-mainline-hotfix-style")) return;
    const s = document.createElement("style");
    s.id = "yoyo-mainline-hotfix-style";
    s.textContent = `
      .yoyo-automation-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}
      .yoyo-safe-view-btn{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;border:1px solid #9eb3c1;border-radius:9px;padding:8px 12px;font-weight:800;background:#fff;color:#24445a}
      .yoyo-safe-view-btn:hover{background:#f3f7fa}
      .yoyo-safe-note{font-size:12px;color:#70808c;margin-top:6px}
    `;
    document.head.appendChild(s);
  }

  function makeButton() {
    const a = document.createElement("a");
    a.href = "/automation.html#queue";
    a.className = "yoyo-safe-view-btn";
    a.id = "yoyo-safe-view-automation";
    a.textContent = "查看自動化列表";
    a.title = "只進入 Automation Queue 頁面，不會觸發任何 package 執行";
    return a;
  }

  function install() {
    if (document.getElementById("yoyo-safe-view-automation")) return;
    addStyles();

    const all = [...document.querySelectorAll("a,button")];
    const autoRun = all.find(el => /自動執行/.test((el.textContent || "").trim()) && !/查看/.test(el.textContent || ""));
    if (autoRun) {
      let row = autoRun.parentElement;
      if (!row.classList.contains("yoyo-automation-actions")) {
        const wrap = document.createElement("span");
        wrap.className = "yoyo-automation-actions";
        autoRun.parentNode.insertBefore(wrap, autoRun);
        wrap.appendChild(autoRun);
        row = wrap;
      }
      row.appendChild(makeButton());
      return;
    }

    const autoCard = document.getElementById("autoStatus")?.closest(".card");
    if (autoCard) {
      const row = document.createElement("div");
      row.className = "yoyo-automation-actions";
      row.appendChild(makeButton());
      const note = document.createElement("div");
      note.className = "yoyo-safe-note";
      note.textContent = "此按鈕只查看列表，不會觸發執行。";
      autoCard.appendChild(row);
      autoCard.appendChild(note);
      return;
    }

    const nav = document.querySelector("nav");
    if (nav) nav.appendChild(makeButton());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, {once:true});
  } else {
    install();
  }
  setTimeout(install, 800);
})();
