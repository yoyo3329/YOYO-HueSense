(() => {
  "use strict";

  // Install BEFORE automation.js so aggressive polling is throttled globally on this page.
  const nativeSetInterval = window.setInterval.bind(window);
  window.setInterval = function(fn, delay, ...args) {
    const ms = Number(delay || 0);
    if (ms > 0 && ms < 5000 && typeof fn === "function") {
      const wrapped = (...cbArgs) => {
        if (document.hidden) return;
        return fn(...cbArgs);
      };
      return nativeSetInterval(wrapped, 5000, ...args);
    }
    return nativeSetInterval(fn, delay, ...args);
  };

  function installUi() {
    if (!document.getElementById("yoyo-v32-home")) {
      const a = document.createElement("a");
      a.id = "yoyo-v32-home";
      a.href = "/";
      a.textContent = "← 回到總覽";
      a.title = "只切回總覽，不會執行任何 package";
      a.style.cssText =
        "position:fixed;right:18px;bottom:18px;z-index:99999;" +
        "padding:10px 14px;border-radius:10px;background:#fff;" +
        "border:1px solid #bcc9d2;color:#203746;text-decoration:none;" +
        "font-weight:800;box-shadow:0 4px 18px rgba(0,0,0,.12)";
      document.body.appendChild(a);
    }

    if (!document.getElementById("yoyo-v32-style")) {
      const s = document.createElement("style");
      s.id = "yoyo-v32-style";
      s.textContent =
        "#queue .queueitem{content-visibility:auto;contain-intrinsic-size:auto 145px;}";
      document.head.appendChild(s);
    }
  }

  function correctLiveLabel() {
    const active = document.getElementById("active");
    if (!active) return;

    const rows = document.querySelectorAll(".queueitem");
    for (const row of rows) {
      const status = (row.querySelector(".status")?.textContent || "").trim().toUpperCase();
      if (["INSPECTING","INSTALLING","RUNNING","IMPORTING"].includes(status)) {
        const name = (row.querySelector("b")?.textContent || "Package").trim();
        active.textContent = `● 正在執行：${name} · ${status}`;
        return;
      }
    }
  }

  function afterRenderTick() {
    installUi();
    correctLiveLabel();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", afterRenderTick, { once: true });
  } else {
    afterRenderTick();
  }

  // Lightweight DOM-only correction. Uses native timer so it is exactly 5s.
  nativeSetInterval(afterRenderTick, 5000);
})();