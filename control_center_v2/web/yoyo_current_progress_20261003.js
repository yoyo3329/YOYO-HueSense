(() => {
  "use strict";
  const SNAPSHOT = {
  "schema": "YOYO_CONTROL_CENTER_UI_PROGRESS_SNAPSHOT_V2",
  "generated_at": "2026-10-03T18:45:02.685814+08:00",
  "display_only": true,
  "research_authority_mutated": false,
  "phase": 1,
  "phase_name": "DEV Engineering",
  "mainline_passed": 5,
  "mainline_total": 33,
  "mainline_progress_percent": 15.2,
  "current_stage_id": "P1_REBASE_DEV",
  "current_stage_name": "Rebase DEV",
  "scheduler_authority_verifier": "HOLD",
  "scheduler_status": "HOLD",
  "current_blocker": "SCHEDULER_P0_AUTHORITY_VERIFIER / AUTHORITY_HARDENING_PRECONDITION_PASS · RUNTIME_AUTHORITY_GUARD_MISSING",
  "detail": "At least one authority guard fails behavior-based targeted regression. This is a real runtime blocker, not a source-text matcher issue.",
  "next_action": "FIX_RUNTIME_AUTHORITY_GUARD_IN_SEPARATE_EXPLICITLY_AUTHORIZED_STEP",
  "final_status": "HOLD_PHASE1_REBASE_DEV_PRECONDITION",
  "report_path": "D:\\YOYO_DATA\\phase1_scheduler_authority_verifier_repair_v1\\20261003_184500\\SCHEDULER_P0_AUTHORITY_VERIFIER_FALSE_NEGATIVE_REPAIR_V1.json",
  "dataset": {
    "dataset_id": "REFERENCE_DATASET_Y2K_DEV_V2_CANDIDATE_20260927_45",
    "reference_count": 45,
    "manifest_sha256": "9a9f7933bddda397e4d0a67e264d49a5abbacb61ad10fb1b360b9d137d520811"
  },
  "a2": {
    "stage": "P1_A2_DEV",
    "status": "PASS",
    "gate": "PASS_DEV45_A2_READY_FOR_REBASE"
  },
  "rebase": {
    "status": "NOT EXECUTED",
    "corrected_package_sha256": "20485fd419439afc7416e088875ffd3fd3f9f503a755c88aba672f9f56b56d3d",
    "enqueued": false,
    "success_gate": "PASS_DEV_REBASE_READY_FOR_B1"
  },
  "b1": {
    "status": "WAIT"
  },
  "b2": {
    "status": "HOLD",
    "policy": "HOLD_COLOR_EVIDENCE_AUTHORITY"
  },
  "phase2": {
    "status": "CLOSED",
    "candidate_status": "FROZEN_CANDIDATE",
    "work_progress": "6/6",
    "official_mainline_pass": false,
    "current_active": false,
    "formal_claim_allowed": false,
    "technical_debt_count": 10,
    "candidate_id": "REFERENCE_DATASET_Y2K_PHASE2_FASTTRACK_CANDIDATE_20261003_142742_45",
    "candidate_membership_sha": "6748da25a8f29788834b12a617d4a1fc77cd4415f5443aef8e68d10561d5fddf",
    "candidate_manifest_sha": "9c108146e4d9f50934109cea54a6a7cf36033729ee79fd99234ec3117d383d36"
  },
  "phase3": {
    "status": "NOT AUTHORIZED"
  }
};

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[m]));
  }

  function colorFor(status) {
    if (status === "PASS" || status === "READY" || status === "CLOSED") return "#1f6f4a";
    if (status === "RUNNING") return "#246b9b";
    if (status === "HOLD") return "#a06200";
    return "#66747f";
  }

  function ensureBanner() {
    let box=document.getElementById("yoyo-current-progress-snapshot");
    if (box) return box;
    const main=document.querySelector("main");
    if (!main) return null;
    box=document.createElement("section");
    box.id="yoyo-current-progress-snapshot";
    box.className="card";
    box.style.border="2px solid #6d8aa0";
    box.style.background="#fbfcfd";
    box.style.marginBottom="16px";
    main.insertBefore(box,main.firstChild);
    return box;
  }

  function render() {
    const box=ensureBanner();
    if (!box) return;
    const c=colorFor(SNAPSHOT.scheduler_status);
    box.innerHTML=`
      <div class="label">CURRENT VERIFIED PROJECT SNAPSHOT · DISPLAY ONLY</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px">
        <div style="min-width:180px">
          <div class="muted">PHASE 1 MAINLINE</div>
          <div style="font-size:26px;font-weight:900">${SNAPSHOT.mainline_passed} / ${SNAPSHOT.mainline_total}</div>
          <div>${SNAPSHOT.mainline_progress_percent}% · ${esc(SNAPSHOT.current_stage_name)}</div>
        </div>
        <div style="min-width:240px">
          <div class="muted">SCHEDULER P0 VERIFIER</div>
          <div style="font-size:23px;font-weight:900;color:${c}">${esc(SNAPSHOT.scheduler_authority_verifier)}</div>
          <div class="small">${esc(SNAPSHOT.detail)}</div>
        </div>
        <div style="flex:1;min-width:320px">
          <div class="muted">CURRENT BLOCKER / NEXT</div>
          <div><b>${esc(SNAPSHOT.current_blocker)}</b></div>
          <div class="small" style="margin-top:5px">${esc(SNAPSHOT.next_action)}</div>
        </div>
      </div>

      <div style="margin-top:12px;padding:10px 12px;border-radius:10px;background:#f2f5f7">
        <b>Phase 1</b> · A2.1 DEV = <b>PASS</b> · Rebase DEV = <b>NOT EXECUTED</b> · B1 DEV = <b>WAIT</b> · B2 = <b>${esc(SNAPSHOT.b2.policy)}</b>
        <div class="small" style="overflow-wrap:anywhere;margin-top:4px">
          DEV45 SHA256 ${esc(SNAPSHOT.dataset.manifest_sha256)}
        </div>
      </div>

      <div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:#f6f3fb">
        <b>Phase 2 Fast-Track</b> · <b>CLOSED / FROZEN</b> · 6/6
        <div class="small">
          Candidate = ${esc(SNAPSHOT.phase2.candidate_id)} · Active=False · Formal=False · Official Mainline=False · Technical Debt=${SNAPSHOT.phase2.technical_debt_count}
        </div>
        <div class="small" style="overflow-wrap:anywhere">
          Membership SHA ${esc(SNAPSHOT.phase2.candidate_membership_sha)}
        </div>
      </div>

      <div style="margin-top:9px;font-size:11px;color:#73818c">
        DISPLAY ONLY：此 overlay 不修改 Dataset / project_paths / queue / Gate / run history / Phase2 frozen Candidate。
        瀏覽器查看不會觸發 Rebase；請勿在目前 CMD 執行期間按任何 enqueue / run / restart 類操作。
      </div>`;
  }

  function updateHeader() {
    const phase=document.querySelector("#phase");
    const stage=document.querySelector("#stage");
    const progress=document.querySelector("#progress");
    const count=document.querySelector("#count");
    const bar=document.querySelector("#progbar");
    const next=document.querySelector("#next");
    if (phase) phase.textContent="PHASE 1";
    if (stage) stage.textContent=SNAPSHOT.current_stage_name;
    if (progress) progress.textContent=`${SNAPSHOT.mainline_progress_percent}%`;
    if (count) count.textContent=`${SNAPSHOT.mainline_passed} / ${SNAPSHOT.mainline_total} Main Stages PASS`;
    if (bar) bar.style.width=`${SNAPSHOT.mainline_progress_percent}%`;
    if (next) next.textContent=SNAPSHOT.next_action;
  }

  function annotate(name,status,detail) {
    const cards=[...document.querySelectorAll(".stage")];
    const card=cards.find(c => c.querySelector("b")?.textContent?.trim()===name);
    if (!card) return;
    let note=card.querySelector(".yoyo-current-override");
    if (!note) {
      note=document.createElement("div");
      note.className="small yoyo-current-override";
      note.style.marginTop="6px";
      note.style.padding="6px 8px";
      note.style.borderRadius="7px";
      note.style.background="#eef3f6";
      note.style.fontWeight="700";
      card.appendChild(note);
    }
    note.textContent=`CURRENT: ${status} · ${detail}`;
  }

  function apply() {
    render(); updateHeader();
    annotate("A2.1 DEV","PASS","PASS_DEV45_A2_READY_FOR_REBASE");
    annotate("Rebase DEV","NOT EXECUTED",SNAPSHOT.scheduler_status==="READY" ? "Precondition READY; enqueue remains separate." : "Waiting for Scheduler P0 verifier.");
    annotate("B1 DEV","WAIT","Wait for Current Rebase PASS.");
    annotate("B2","HOLD",SNAPSHOT.b2.policy);
  }

  apply();
  setInterval(apply,900);
  window.YOYO_CURRENT_PROGRESS_SNAPSHOT=SNAPSHOT;
})();