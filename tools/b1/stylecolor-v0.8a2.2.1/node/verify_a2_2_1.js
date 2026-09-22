'use strict';
const fs=require('fs'),path=require('path');
const run=path.resolve(process.argv[2]);
function r(n){return JSON.parse(fs.readFileSync(path.join(run,n),'utf8'))}
let p=0,f=0;function t(x,s){console.log((x?'PASS  ':'FAIL  ')+s);x?p++:f++}
const s=r('evidence_integrity_summary.json'),mr=r('mask_role_authority.json'),rec=r('recovery_distribution_audit.json'),st=r('stability_tail_impact_audit.json'),sem=r('semantic_prompt_evidence_quality.json'),emb=r('embedding_neighbor_evidence.json'),env=r('environment_provenance.json'),prov=r('evidence_generation_provenance.json'),g=r('go_no_go.json'),man=r('run_manifest.json');
t(man.model_inference==='NONE_POSTPROCESS_ONLY','no model rerun');
t(s.masks_deleted===0&&mr.masks_deleted===0,'zero destructive mask deletion');
t(mr.roles_are_overlapping_evidence===true&&mr.scalar_role_truth===false,'roles are overlapping evidence not class truth');
t(s.images.every(i=>i.roles.every(x=>{
  const rs=(x.role_hypotheses||[]).map(h=>h.role);
  const blocked=rs.some(z=>['GLOBAL_CONTEXT_CANDIDATE','BACKGROUND_PLANE_CANDIDATE','AMBIGUOUS'].includes(z));
  return !blocked || (x.local_recovery_route_allowed===false&&x.local_split_authority===false&&x.local_group_authority===false);
})),'GLOBAL/BACKGROUND/AMBIGUOUS role evidence has no local authority');
t(s.images.every(i=>i.coverage.foundation_union_coverage_raw!=null&&i.coverage.foundation_union_coverage_local_authority_eligible!=null),'raw and local-authority coverage both present');
t(rec.cases.every(c=>c.foreground_dilution_recovery.raw_foundation_aggregate&&c.foreground_dilution_recovery.local_authority_eligible_aggregate),'RAW and local recovery distributions present');
t(rec.cases.every(c=>Object.values(c.foreground_dilution_recovery.local_authority_eligible_aggregate.distributions).every(d=>'positive_ratio'in d&&'negative_ratio'in d&&'p25'in d&&'p75'in d&&'unique_coverage_weighted_mean'in d)),'recovery distribution + descriptive unique-coverage weighting present');
t(st.images.every(x=>Object.values(x.stability_tail_audit||{}).every(v=>['min','p05','p25','median','below_0_90','below_0_80','below_0_50','largest_area_unstable_mask','highest_unique_coverage_unstable_mask','tail_impact_by_threshold'].every(k=>k in v))),'stability tail + impact exposed');
t(st.images.every(x=>Object.values(x.stability_tail_audit||{}).every(v=>Object.values(v.tail_impact_by_threshold||{}).every(z=>'unstable_area_fraction'in z&&'unstable_unique_coverage_fraction'in z))),'stability tail impact fractions present');
t(Object.values(sem.axis_discrimination).every(x=>x.authority==='DIAGNOSTIC_ONLY'),'semantic prompt discrimination gate diagnostic only');
t(sem.top_labels_are_truth===false&&sem.top_label_authority==='NONE','semantic prompt top label has zero truth authority');
t(emb.grouping_authority==='NONE'&&emb.edges.every(x=>x.grouping_authority==='NONE'),'embedding neighbors have zero grouping authority');
t(env.postprocess_environment&&env.upstream_inference_environment,'postprocess and upstream inference environments separated');
t(env.retroactive_clean_claim_forbidden===true&&env.evidence_environment_status!=='CLEAN','upstream evidence cannot be retroactively washed CLEAN');
t(prov.foundation_mask&&prov.visual_embedding&&prov.semantic_prompt_evidence&&prov.recovery_metrics,'evidence-level provenance present');
t(Object.prototype.hasOwnProperty.call(mr,'role_hypothesis_counts')&&mr.unique_mask_count===s.unique_mask_count,'role hypothesis counts separated from unique mask count');
t(s.images.every(i=>i.roles.every(x=>x.final_information_score===null&&x.authority==='EVIDENCE_ONLY')),'no final information score / evidence only');
t(man.style_graph_built===false&&man.production_authority==='NONE','no Style Graph / production authority');
const yp=rec.cases.find(c=>c.case_name==='Y2K_PACK'),sticker=rec.cases.find(c=>c.case_name==='STICKER_COLLAGE'),fashion=rec.cases.find(c=>c.case_name==='FASHION_COLLAGE');
t(!yp||yp.coverage.foundation_union_coverage_local_authority_eligible<yp.coverage.foundation_union_coverage_raw,'Y2K PACK false-positive global coverage regression blocked');
t(!sticker||sticker.capability_counts.local_authority_eligible.split_capable_atomic_count>0,'Sticker local split positive regression retained');
t(!fashion||g.checks.FASHION_MIXED_UNKNOWN_RETAINED===true,'Fashion remains mixed/inconclusive, not forced recovered');
t(g.checks.STABILITY_MEANINGFUL_TAIL_EXPOSED===true,'meaningful stability tail failure exposed');
t(g.checks.UPSTREAM_INFERENCE_ENVIRONMENT_CLEANLY_CERTIFIED===false&&g.decision==='HOLD_EVIDENCE_LAYER_VALIDATION','uncertified upstream inference keeps evidence-layer validation on HOLD');
console.log(`\n${p}/${p+f} v0.8-A.2.2.1 output gates ${f?'FAIL':'PASS'}`);process.exit(f?1:0);
