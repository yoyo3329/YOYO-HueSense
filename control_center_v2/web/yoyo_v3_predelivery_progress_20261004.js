(() => {
  "use strict";
  const S={
  "schema": "YOYO_CONTROL_CENTER_V3_PREDELIVERY_REPORT_SNAPSHOT_V1",
  "generated_at": "2026-10-04T12:38:04.576386+08:00",
  "display_only": true,
  "research_authority_mutated": false,
  "source_report_schema": "YOYO_CONTROL_CENTER_V3_PREDELIVERY_REPORT_SYNC_V1_TEST",
  "source_report_generated_at": null,
  "decision": null,
  "summary": {
    "passed": 0,
    "failed": 0,
    "blocked": 0,
    "skipped": 0
  },
  "contract": {
    "schema": null,
    "sha256": null,
    "coverage_origin": null,
    "coverage_old_dev49_package_reused": null,
    "p2_packages_pin_contract_sha": null
  },
  "release_matrix": {},
  "red_blocker": {},
  "packages": {},
  "stage_annotations": {
    "P1_CANONICAL": {
      "status": "AUTHORITATIVE STATE PRESERVED",
      "detail": "This predelivery report does not overwrite the existing Control Center stage authority."
    },
    "P1_A1_BRIDGE": {
      "status": "AUTHORITATIVE STATE PRESERVED",
      "detail": "This predelivery report does not overwrite the existing Control Center stage authority."
    },
    "P1_A1": {
      "status": "AUTHORITATIVE STATE PRESERVED",
      "detail": "This predelivery report does not overwrite the existing Control Center stage authority."
    },
    "P1_CONTRACT": {
      "status": "AUTHORITATIVE STATE PRESERVED",
      "detail": "This predelivery report does not overwrite the existing Control Center stage authority."
    },
    "P1_A2_DEV": {
      "status": "AUTHORITATIVE STATE PRESERVED",
      "detail": "This predelivery report does not overwrite the existing Control Center stage authority."
    },
    "P1_REBASE_DEV": {
      "status": "PREDELIVERY PASS / FINAL BLOCKED",
      "detail": "Package + behavior regression PASS. Exact-current PackageManager chain remains BLOCKED."
    },
    "P1_B1_DEV": {
      "status": "PREDELIVERY PASS / FINAL BLOCKED",
      "detail": "Package + behavior regression PASS. Exact-current PackageManager chain remains BLOCKED."
    },
    "P2_COVERAGE": {
      "status": "PREDELIVERY PASS / OFFICIAL BLOCKED",
      "detail": "Contract SHA pinned; historical semantics adopted from package manifest; old DEV49 package NOT reused."
    },
    "P2_EXPANSION": {
      "status": "PREDELIVERY PASS / OFFICIAL BLOCKED",
      "detail": "New canonical acceptance contract; validates existing Frozen research; no expansion research rerun."
    },
    "P2_DUPLICATE": {
      "status": "PREDELIVERY PASS / OFFICIAL BLOCKED",
      "detail": "Acceptance validator PASS in isolation; no duplicate research rerun."
    },
    "P2_DIVERSITY": {
      "status": "PREDELIVERY PASS / OFFICIAL BLOCKED",
      "detail": "Acceptance validator PASS; technical debt preserved; no diversity rebalance."
    },
    "P2_SATURATION": {
      "status": "PREDELIVERY PASS / OFFICIAL BLOCKED",
      "detail": "Acceptance validator PASS; fast-track limitation preserved; no saturation research rerun."
    },
    "P2_FREEZE": {
      "status": "PREDELIVERY PASS / OFFICIAL BLOCKED",
      "detail": "Membership-equivalence fixture PASS; Contract SHA pinned; no global dataset authority switch."
    },
    "P3_A1_FORMAL": {
      "status": "NOT AUTHORIZED",
      "detail": "Phase3 execution remains outside this V3 predelivery sync."
    },
    "P3_A2_FORMAL": {
      "status": "NOT AUTHORIZED",
      "detail": "Phase3 execution remains outside this V3 predelivery sync."
    },
    "P3_REBASE_FORMAL": {
      "status": "NOT AUTHORIZED",
      "detail": "Phase3 execution remains outside this V3 predelivery sync."
    },
    "P3_B1_FORMAL": {
      "status": "NOT AUTHORIZED",
      "detail": "Phase3 execution remains outside this V3 predelivery sync."
    },
    "P3_B2": {
      "status": "HOLD",
      "detail": "HOLD_COLOR_EVIDENCE_AUTHORITY · Phase3 not authorized."
    },
    "P3_B3": {
      "status": "NOT AUTHORIZED",
      "detail": "Phase3 execution remains outside this V3 predelivery sync."
    },
    "P3_STYLE_EVIDENCE": {
      "status": "NOT AUTHORIZED",
      "detail": "Phase3 execution remains outside this V3 predelivery sync."
    },
    "P4_DATASET_REGISTRY": {
      "status": "UNCHANGED",
      "detail": "Outside this V3 predelivery report; authoritative state preserved."
    },
    "P4_EVIDENCE_ADAPTERS": {
      "status": "UNCHANGED",
      "detail": "Outside this V3 predelivery report; authoritative state preserved."
    },
    "P4_SEMANTIC_DB": {
      "status": "UNCHANGED",
      "detail": "Outside this V3 predelivery report; authoritative state preserved."
    },
    "P4_HUMAN_PROFILE": {
      "status": "UNCHANGED",
      "detail": "Outside this V3 predelivery report; authoritative state preserved."
    },
    "P4_B4": {
      "status": "UNCHANGED",
      "detail": "Outside this V3 predelivery report; authoritative state preserved."
    },
    "P4_PALETTE": {
      "status": "UNCHANGED",
      "detail": "Outside this V3 predelivery report; authoritative state preserved."
    },
    "P5_LOCKED_DATA": {
      "status": "UNCHANGED",
      "detail": "Outside this V3 predelivery report; authoritative state preserved."
    },
    "P5_DIRECTION": {
      "status": "UNCHANGED",
      "detail": "Outside this V3 predelivery report; authoritative state preserved."
    },
    "P5_DISTRIBUTION": {
      "status": "UNCHANGED",
      "detail": "Outside this V3 predelivery report; authoritative state preserved."
    },
    "P5_CROSS_DATASET": {
      "status": "UNCHANGED",
      "detail": "Outside this V3 predelivery report; authoritative state preserved."
    },
    "P5_CONTRADICTION": {
      "status": "UNCHANGED",
      "detail": "Outside this V3 predelivery report; authoritative state preserved."
    },
    "P5_GATE": {
      "status": "UNCHANGED",
      "detail": "Outside this V3 predelivery report; authoritative state preserved."
    },
    "P5_PUBLISH": {
      "status": "UNCHANGED",
      "detail": "Outside this V3 predelivery report; authoritative state preserved."
    }
  },
  "stage_names": {
    "P1_CANONICAL": "Canonical Dataset",
    "P1_A1_BRIDGE": "A1 Bridge",
    "P1_A1": "A1",
    "P1_CONTRACT": "Contract Hardening",
    "P1_A2_DEV": "A2.1 DEV",
    "P1_REBASE_DEV": "Rebase DEV",
    "P1_B1_DEV": "B1 DEV",
    "P2_COVERAGE": "Coverage Matrix",
    "P2_EXPANSION": "Targeted Expansion",
    "P2_DUPLICATE": "Duplicate Audit",
    "P2_DIVERSITY": "Diversity Audit",
    "P2_SATURATION": "Saturation",
    "P2_FREEZE": "Dataset Freeze",
    "P3_A1_FORMAL": "A1 Formal",
    "P3_A2_FORMAL": "A2.1 Formal",
    "P3_REBASE_FORMAL": "Rebase Formal",
    "P3_B1_FORMAL": "B1 Formal",
    "P3_B2": "B2",
    "P3_B3": "B3",
    "P3_STYLE_EVIDENCE": "Style Evidence",
    "P4_DATASET_REGISTRY": "Public Dataset Registry",
    "P4_EVIDENCE_ADAPTERS": "Evidence Adapters",
    "P4_SEMANTIC_DB": "Semantic Evidence DB",
    "P4_HUMAN_PROFILE": "Human Perception Profile",
    "P4_B4": "B4 Decision Engine",
    "P4_PALETTE": "Palette A/B/C",
    "P5_LOCKED_DATA": "Locked External Datasets / LODO",
    "P5_DIRECTION": "Semantic Direction",
    "P5_DISTRIBUTION": "Distribution Compatibility",
    "P5_CROSS_DATASET": "Cross-dataset Consistency",
    "P5_CONTRADICTION": "Contradiction Audit",
    "P5_GATE": "External Validation Gate",
    "P5_PUBLISH": "Immutable Publish"
  },
  "integrity": {
    "project_paths_changed": null,
    "frozen_candidate_changed": null,
    "queue_unauthorized_mutation": null,
    "final_repack_regression": null
  },
  "formal_v3_zip_release_allowed": null,
  "formal_v3_zip_created": null,
  "next_action": "EXACT_CURRENT FULL-HISTORY E2E REQUIRED: raw DEV45 bytes + complete historical/stale/invalidation run tree.",
  "b2_policy": "HOLD_COLOR_EVIDENCE_AUTHORITY"
};
  const esc=x=>String(x??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const statusColor=x=>String(x).includes("PASS")?"#1f6f4a":String(x).includes("BLOCK")||String(x).includes("HOLD")?"#a06200":String(x).includes("NOT AUTH")?"#8b4e83":"#52636f";
  function ensureBox(){
    let b=document.getElementById("yoyo-v3-predelivery-report"); if(b)return b;
    const main=document.querySelector("main"); if(!main)return null;
    b=document.createElement("section"); b.id="yoyo-v3-predelivery-report"; b.className="card";
    b.style.cssText="border:2px solid #7b5aa6;background:#fcfbff;margin-bottom:16px"; main.insertBefore(b,main.firstChild); return b;
  }
  function render(){
    const b=ensureBox(); if(!b)return; const r=S.release_matrix||{}, sm=S.summary||{}, c=S.contract||{}, i=S.integrity||{};
    b.innerHTML=`
      <div class="label">V3 PREDELIVERY REPORT SYNC · DISPLAY ONLY</div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px">
        <div style="min-width:210px"><div class="muted">RELEASE GATE</div><div style="font-size:24px;font-weight:900;color:#a06200">HOLD</div><div class="small">Formal V3 release = ${esc(S.formal_v3_zip_release_allowed)}</div></div>
        <div style="min-width:260px"><div class="muted">PREDELIVERY TESTS</div><div style="font-size:22px;font-weight:900">${sm.passed} PASS · ${sm.failed} FAIL · ${sm.blocked} BLOCKED</div><div class="small">SKIPPED=${sm.skipped}</div></div>
        <div style="flex:1;min-width:320px"><div class="muted">GENUINE RED BLOCKER</div><div><b>${esc((S.red_blocker||{}).id)}</b></div><div class="small">${esc((S.red_blocker||{}).why_red)}</div></div>
      </div>
      <div style="margin-top:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px">
        <div style="padding:10px;border-radius:9px;background:#eef6f2"><b>Contract V1</b><div class="small">${esc(c.schema)}</div><div class="small" style="overflow-wrap:anywhere">SHA ${esc(c.sha256)}</div><div class="small">P2 pin=${esc(c.p2_packages_pin_contract_sha)} · DEV49 reused=${esc(c.coverage_old_dev49_package_reused)}</div></div>
        <div style="padding:10px;border-radius:9px;background:#eef3f8"><b>Phase 1</b><div class="small">Rebase: ${esc(r.REBASE)}</div><div class="small">B1: ${esc(r.B1)}</div><div class="small">P1: ${esc(r.P1)} · stale=${esc(r.P1_STALE)}</div></div>
        <div style="padding:10px;border-radius:9px;background:#f5f0fa"><b>Phase 2 Acceptance</b><div class="small">Contracts: ${esc(r.P2_CONTRACTS)}</div><div class="small">Validators: ${esc(r.P2_VALIDATORS)}</div><div class="small">P2: ${esc(r.P2)} · stale=${esc(r.P2_STALE)}</div></div>
        <div style="padding:10px;border-radius:9px;background:#fff7e8"><b>Crash / Resume</b><div class="small">${esc(r.CRASH_RESUME)}</div><div class="small">Exact-current 9/9 remains blocked by full-history clone input.</div></div>
        <div style="padding:10px;border-radius:9px;background:#f3f5f7"><b>Integrity</b><div class="small">project_paths changed=${esc(i.project_paths_changed)}</div><div class="small">Frozen changed=${esc(i.frozen_candidate_changed)} · queue unauthorized=${esc(i.queue_unauthorized_mutation)}</div><div class="small">Repack=${esc(i.final_repack_regression)}</div></div>
        <div style="padding:10px;border-radius:9px;background:#f6f3fb"><b>B2 / Phase3</b><div class="small">${esc(S.b2_policy)}</div><div class="small">Phase3 remains NOT AUTHORIZED.</div></div>
      </div>
      <div style="margin-top:10px;padding:9px 11px;background:#f6f7f8;border-radius:9px"><b>NEXT:</b> ${esc(S.next_action)}</div>
      <div style="margin-top:8px;font-size:11px;color:#73818c">DISPLAY ONLY：只同步報告到 UI。不得視為 research authority mutation；不修改 Dataset / project_paths / PackageManager / state_engine / queue / run history / Frozen Candidate。</div>`;
  }
  function updateHeader(){
    const map={phase:"V3 PREDELIVERY",stage:"RED INTEGRITY BLOCKER",progress:`${S.summary.passed} PASS / ${S.summary.blocked} BLOCKED`,count:"FORMAL V3 RELEASE = HOLD",next:S.next_action};
    Object.entries(map).forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.textContent=v;});
    const bar=document.getElementById("progbar"); if(bar)bar.style.width="75%";
  }
  function annotate(name,status,detail){
    const cards=[...document.querySelectorAll(".stage")]; const card=cards.find(c=>c.querySelector("b")?.textContent?.trim()===name); if(!card)return;
    let n=card.querySelector(".yoyo-v3-predelivery-override");
    if(!n){n=document.createElement("div");n.className="small yoyo-v3-predelivery-override";n.style.cssText="margin-top:6px;padding:7px 8px;border-radius:7px;background:#eef2f5;font-weight:700";card.appendChild(n);}
    n.innerHTML=`<span style="color:${statusColor(status)}">REPORT: ${esc(status)}</span><br><span style="font-weight:500">${esc(detail)}</span>`;
  }
  function annotateAll(){const a=S.stage_annotations||{},names=S.stage_names||{};Object.entries(a).forEach(([id,v])=>annotate(names[id]||id,v.status,v.detail));}
  function apply(){render();updateHeader();annotateAll();}
  apply(); setInterval(apply,1000); window.YOYO_V3_PREDELIVERY_REPORT_SNAPSHOT=S;
})();