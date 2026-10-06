(() => {
  "use strict";

  const SNAPSHOT = {
    schema: "YOYO_CONTROL_CENTER_UI_PROGRESS_SNAPSHOT_V1",
    generated_at: "2026-09-30T21:37:00+08:00",
    display_only: true,
    research_authority_mutated: false,
    phase: 1,
    phase_name: "DEV Engineering",
    passed: 5,
    total: 33,
    progress_percent: 15.2,
    current_stage_id: "P1_REBASE_DEV",
    current_stage_name: "Rebase DEV",
    next_allowed_stage_name: "Rebase DEV",
    dataset: {
      dataset_id: "REFERENCE_DATASET_Y2K_DEV_V2_CANDIDATE_20260927_45",
      reference_count: 45,
      manifest_sha256: "9a9f7933bddda397e4d0a67e264d49a5abbacb61ad10fb1b360b9d137d520811"
    },
    stages: {
      "Canonical Dataset": { status: "PASS", detail: "DEV45 authority" },
      "A1 Bridge": { status: "PASS", detail: "Current DEV45 lineage" },
      "A1": { status: "PASS", detail: "Atomic Regions preserved" },
      "Contract Hardening": { status: "PASS", detail: "Current DEV45 contract" },
      "A2.1 DEV": { status: "PASS", detail: "PASS_DEV45_A2_READY_FOR_REBASE" },
      "Rebase DEV": {
        status: "NOT EXECUTED",
        detail: "Corrected package exact-audit PASS; runtime old queue identity still requires direct read before Authority Map Migration."
      },
      "B1 DEV": { status: "WAIT", detail: "Wait for Current Rebase PASS." },
      "B2": { status: "HOLD", detail: "HOLD_COLOR_EVIDENCE_AUTHORITY (independent gate)" }
    },
    package: {
      package_id: "YOYO_P1_REBASE_DEV_DEV45_CURRENT_V2_0_1_CONTRACT_FIX",
      package_version: "2.0.1",
      zip_sha256: "20485fd419439afc7416e088875ffd3fd3f9f503a755c88aba672f9f56b56d3d",
      exact_audit: "PASS",
      enqueued: false,
      authority_migration_applied: false,
      blocker: "RUNTIME_OLD_QUEUE_RECORD_IDENTITY_NOT_DIRECTLY_READ"
    }
  };

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[m]));
  }

  function ensureBanner() {
    let box = document.getElementById("yoyo-current-progress-snapshot");
    if (box) return box;

    const main = document.querySelector("main");
    if (!main) return null;

    box = document.createElement("section");
    box.id = "yoyo-current-progress-snapshot";
    box.className = "card";
    box.style.border = "2px solid #6d8aa0";
    box.style.background = "#fbfcfd";
    box.style.marginBottom = "16px";

    main.insertBefore(box, main.firstChild);
    return box;
  }

  function renderBanner() {
    const box = ensureBanner();
    if (!box) return;

    box.innerHTML = `
      <div class="label">CURRENT VERIFIED PROJECT SNAPSHOT · DISPLAY ONLY</div>
      <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start;margin-top:8px">
        <div style="min-width:190px">
          <div class="muted">MAINLINE</div>
          <div style="font-size:28px;font-weight:900">${SNAPSHOT.passed} / ${SNAPSHOT.total}</div>
          <div><b>${SNAPSHOT.progress_percent}%</b> · Phase ${SNAPSHOT.phase} ${esc(SNAPSHOT.phase_name)}</div>
        </div>
        <div style="min-width:220px">
          <div class="muted">CURRENT STAGE</div>
          <div style="font-size:22px;font-weight:900">${esc(SNAPSHOT.current_stage_name)}</div>
          <div><b>NOT EXECUTED</b> · research Gate 未被偽造為 FAIL/PASS</div>
        </div>
        <div style="flex:1;min-width:300px">
          <div class="muted">CURRENT BLOCKER</div>
          <div><b>${esc(SNAPSHOT.package.blocker)}</b></div>
          <div class="small">Corrected Rebase package v${esc(SNAPSHOT.package.package_version)} exact-audit PASS；尚未 enqueue；Authority Map Migration 尚未 Apply。</div>
        </div>
      </div>
      <div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:#f2f5f7">
        <b>DEV45 Dataset</b> · ${esc(SNAPSHOT.dataset.dataset_id)} · ${SNAPSHOT.dataset.reference_count} refs
        <div class="small" style="overflow-wrap:anywhere">SHA256 ${esc(SNAPSHOT.dataset.manifest_sha256)}</div>
      </div>
      <div style="margin-top:10px" class="small">
        A2.1 DEV = <b>PASS</b> · Rebase DEV = <b>NOT EXECUTED</b> · B1 DEV = <b>WAIT</b> ·
        B2 = <b>HOLD_COLOR_EVIDENCE_AUTHORITY</b>
      </div>
      <div style="margin-top:8px;font-size:11px;color:#73818c">
        UI snapshot only：不修改 Dataset / A1 / A2 / queue / Gate / run history；下方 API-derived cards 仍保留作 runtime evidence。
      </div>`;
  }

  function updateHeaderCards() {
    const phase = document.querySelector("#phase");
    const stage = document.querySelector("#stage");
    const progress = document.querySelector("#progress");
    const count = document.querySelector("#count");
    const bar = document.querySelector("#progbar");
    const next = document.querySelector("#next");

    if (phase) phase.textContent = `PHASE ${SNAPSHOT.phase}`;
    if (stage) stage.textContent = SNAPSHOT.current_stage_name;
    if (progress) progress.textContent = `${SNAPSHOT.progress_percent}%`;
    if (count) count.textContent = `${SNAPSHOT.passed} / ${SNAPSHOT.total} Main Stages PASS`;
    if (bar) bar.style.width = `${SNAPSHOT.progress_percent}%`;
    if (next) next.textContent = SNAPSHOT.next_allowed_stage_name;
  }

  function annotateStageCard(name, status, detail) {
    const cards = [...document.querySelectorAll(".stage")];
    const card = cards.find(c => c.querySelector("b")?.textContent?.trim() === name);
    if (!card) return;

    let note = card.querySelector(".yoyo-current-override");
    if (!note) {
      note = document.createElement("div");
      note.className = "small yoyo-current-override";
      note.style.marginTop = "6px";
      note.style.padding = "6px 8px";
      note.style.borderRadius = "7px";
      note.style.background = "#eef3f6";
      note.style.fontWeight = "700";
      card.appendChild(note);
    }
    note.textContent = `CURRENT: ${status} · ${detail}`;

    if (status === "PASS") card.style.outline = "2px solid rgba(33,108,77,.28)";
    else if (status === "NOT EXECUTED") card.style.outline = "2px solid rgba(154,98,0,.35)";
  }

  function apply() {
    renderBanner();
    updateHeaderCards();
    Object.entries(SNAPSHOT.stages).forEach(([name, x]) => {
      annotateStageCard(name, x.status, x.detail);
    });
  }

  apply();
  setInterval(apply, 900);

  window.YOYO_CURRENT_PROGRESS_SNAPSHOT = SNAPSHOT;
})();
