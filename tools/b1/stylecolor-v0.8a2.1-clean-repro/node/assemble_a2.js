'use strict';
const fs=require('fs'),path=require('path');
function read(p){return JSON.parse(fs.readFileSync(p,'utf8'))}function write(p,x){fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n')}
function q(v,p){const a=[...v].filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const k=(a.length-1)*p,i=Math.floor(k),f=k-i;return a[i+1]!==undefined?a[i]+f*(a[i+1]-a[i]):a[i]}
function dist(v){const a=v.filter(Number.isFinite);if(!a.length)return null;const mean=a.reduce((s,x)=>s+x,0)/a.length;return{n:a.length,min:Math.min(...a),p05:q(a,.05),p25:q(a,.25),median:q(a,.5),p75:q(a,.75),p95:q(a,.95),max:Math.max(...a),mean,std:Math.sqrt(a.reduce((s,x)=>s+(x-mean)**2,0)/a.length)}}
function cosine(a,b){let d=0,aa=0,bb=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i]}return d/Math.max(1e-12,Math.sqrt(aa*bb))}
function countFlags(regs){const o={};for(const r of regs)for(const f of r.diagnostics?.flags||[])o[f]=(o[f]||0)+1;return o}
function axisVector(g,axis){const s=g.semantic_prior?.axes?.[axis]?.scores||{};return Object.keys(s).sort().map(k=>s[k])}
function main(){
 const a1=path.resolve(process.argv[2]),run=path.resolve(process.argv[3]),cfg=read(process.argv[4]);
 const obs=read(path.join(a1,'atomic_region_observations.json')),rel=read(path.join(a1,'region_relationship_graph.json')),fw=read(path.join(run,'foundation_worker_summary.json')),mapping=read(path.join(run,'atomic_foundation_overlap_raw.json'));
 const fBy=new Map(fw.results.filter(x=>!x.error).map(x=>[x.image_id,x])),mapBy=new Map(mapping.images.map(x=>[x.image_id,x]));
 const projected=[],maskDocs=[],hypDocs=[],edgeDocs=[],recovery=[];
 const critical=new Map((cfg.critical_case_registry||[]).map(x=>[x.image_id,x]));
 for(const img of obs.images){
   const f=fBy.get(img.image_id),mp=mapBy.get(img.image_id);if(!f||!mp)continue;
   const oldEdges=(rel.images.find(x=>x.image_id===img.image_id)||{edges:[]}).edges;
   projected.push({image_id:img.image_id,atomic_regions:img.atomic_regions.map(r=>({region_id:r.region_id,area_ratio:r.area_ratio,mean_lab:r.mean_lab,saliency_proxy:r.saliency_proxy,edge_density:r.edge_density,diagnostics:r.diagnostics,low_level_input_coherence_score:r.clip_input_coherence_score??null})),relationships:oldEdges.map(e=>({edge_id:e.edge_id,edge_type:'SPATIAL_ADJACENCY',source_region_id:e.source_region_id,target_region_id:e.target_region_id,observations:{oklab_delta:e.evidence.oklab_delta,color_similarity_score:e.evidence.color_similarity_score,boundary_mean:e.evidence.boundary_mean,boundary_p90:e.evidence.boundary_p90,boundary_strong_support_ratio:e.evidence.boundary_strong_support_ratio,texture_similarity_score:e.evidence.texture_similarity_score,scale_stability_agreement_score:e.evidence.scale_stability_agreement_score,perturbation_stability_agreement_score:e.evidence.perturbation_stability_agreement_score},support:[],contradictions:(e.contradictions||[]).filter(x=>x!=='HIGH_PALETTE_IMPACT'),decision_risk:{palette_impact_score:e.evidence.palette_impact_score},a1_action_ignored:true,a1_relationship_authority:'NONE'}))});
   maskDocs.push({image_id:img.image_id,source_sha256:f.source_sha256,source_asset:f.source_asset,foundation_preview_asset:f.preview_asset,mask_candidate_control:f.mask_candidate_control,critical_case_mask_stability:f.critical_case_mask_stability,foundation_mask_hypotheses:f.foundation_mask_hypotheses,mask_containment_relations:f.mask_containment_relations});
   const split=mp.atomic_regions.map(a=>({region_id:a.region_id,coverage_rank_metrics:a.coverage_rank_metrics,overlaps:a.overlaps,candidate_actions:a.candidate_actions,resolution_state:'UNKNOWN',authority:'HYPOTHESIS_ONLY'}));
   const group=mp.foundation_masks.map(m=>({mask_hypothesis_id:m.mask_hypothesis_id,atomic_memberships:m.atomic_memberships,candidate_actions:m.candidate_actions,resolution_state:'UNKNOWN',authority:'HYPOTHESIS_ONLY'}));
   hypDocs.push({image_id:img.image_id,atomic_split_keep_unknown_hypotheses:split,mask_group_keep_unknown_hypotheses:group});
   const gs=f.foundation_mask_hypotheses;
   const nearest=new Map();
   for(let i=0;i<gs.length;i++){
     const vals=[];for(let j=0;j<gs.length;j++)if(i!==j)vals.push({j,sim:cosine(gs[i].visual_embedding,gs[j].visual_embedding)});
     vals.sort((a,b)=>b.sim-a.sim);if(vals.length)nearest.set(i,{top1:vals[0],top2:vals[1]||null,margin:vals[1]?vals[0].sim-vals[1].sim:null});
   }
   const edges=[];
   for(const c of f.mask_containment_relations||[])edges.push({...c,authority:'OBSERVATION_ONLY',destructive_merge_executed:false});
   for(let i=0;i<gs.length;i++){
     const n=nearest.get(i);if(!n)continue;const back=nearest.get(n.top1.j);const mutual=!!(back&&back.top1.j===i);if(mutual&&i<n.top1.j){
       const j=n.top1.j,b=nearest.get(j);const sem={};for(const axis of Object.keys(cfg.semantic_prior.axes||{})){const va=axisVector(gs[i],axis),vb=axisVector(gs[j],axis);sem[axis]={score_vector_cosine:(va.length&&vb.length)?cosine(va,vb):null,top_label_match:gs[i].semantic_prior.axes[axis].top_label===gs[j].semantic_prior.axes[axis].top_label};}
       edges.push({edge_type:'VISUAL_EMBEDDING_NEIGHBOR',source_mask_id:gs[i].mask_hypothesis_id,target_mask_id:gs[j].mask_hypothesis_id,mutual_nearest:true,absolute_visual_embedding_cosine:n.top1.sim,source_neighbor_margin:n.margin,target_neighbor_margin:b?.margin??null,semantic_axis_similarity:sem,style_similarity:{source:gs[i].semantic_prior.style_similarity,target:gs[j].semantic_prior.style_similarity,absolute_difference:Math.abs((gs[i].semantic_prior.style_similarity??0)-(gs[j].semantic_prior.style_similarity??0))},authority:'HYPOTHESIS_ONLY',resolution_state:'UNKNOWN',destructive_merge_executed:false});
     }
   }
   edgeDocs.push({image_id:img.image_id,edges});
   if(critical.has(img.image_id)){
     const reg=critical.get(img.image_id),flags=countFlags(img.atomic_regions);const byId=new Map(img.atomic_regions.map(r=>[r.region_id,r]));const maskBy=new Map(gs.map(g=>[g.mask_hypothesis_id,g]));
     const dilutionRegs=img.atomic_regions.filter(r=>(r.diagnostics?.flags||[]).includes('REGION_BACKGROUND_DOMINATED_HIGH_CONTRAST_MIXTURE'));
     const dilution=[];
     for(const r of dilutionRegs){const mapRow=mp.atomic_regions.find(x=>x.region_id===r.region_id);const candidates=(mapRow?.overlaps||[]).map(x=>maskBy.get(x.mask_hypothesis_id)).filter(Boolean);const gains=candidates.map(g=>({mask_hypothesis_id:g.mask_hypothesis_id,homogeneity_gain:(g.metrics?.color_homogeneity_score??0)-(r.diagnostics?.color_homogeneity_score??0),bimodal_reduction:(r.diagnostics?.bimodal_color_score??0)-(g.metrics?.bimodal_color_score??0),lightness_spread_reduction:(r.lightness_spread_p10_p90??0)-(g.metrics?.lightness_spread_p10_p90??0)}));dilution.push({region_id:r.region_id,candidate_mask_count:candidates.length,best_homogeneity_gain:gains.length?Math.max(...gains.map(x=>x.homogeneity_gain)):null,best_bimodal_reduction:gains.length?Math.max(...gains.map(x=>x.bimodal_reduction)):null,best_lightness_spread_reduction:gains.length?Math.max(...gains.map(x=>x.lightness_spread_reduction)):null,details:gains});}
     const groupMasks=mp.foundation_masks.filter(x=>x.atomic_memberships.length>1);const splitAtoms=mp.atomic_regions.filter(x=>x.overlaps.length>1);
     recovery.push({case_name:reg.case_name,image_id:img.image_id,a1_failure_modes:reg.a1_failure_modes,a1:{atomic_region_count:img.atomic_regions.length,flag_counts:flags},a2:{foundation_mask_count:gs.length,split_hypothesis_atomic_count:splitAtoms.length,group_hypothesis_mask_count:groupMasks.length,max_atomic_members_per_mask:Math.max(0,...groupMasks.map(x=>x.atomic_memberships.length)),mask_candidate_control:f.mask_candidate_control,critical_case_mask_stability:f.critical_case_mask_stability},foreground_dilution_recovery_evidence:dilution,interpretation:'RECOVERY_EVIDENCE_NOT_ACCURACY_CLAIM'});
   }
 }
 write(path.join(run,'a1_observations_projection.json'),{schema_version:'0.8a2.1',role:'A1_OBSERVATIONS_ONLY_ACTIONS_IGNORED',images:projected});
 write(path.join(run,'foundation_mask_hypotheses.json'),{schema_version:'0.8a2.1',authority:'NONE',foundation_masks_are_truth:false,foundation_mask_equals_perceptual_component:false,images:maskDocs});
 write(path.join(run,'perceptual_inference_hypotheses.json'),{schema_version:'0.8a2.1',resolution_states:['SPLIT','GROUP','KEEP','UNKNOWN','AMBIGUOUS_BUT_HIGH_IMPACT'],default_resolution_state:'UNKNOWN',destructive_resolution_executed:0,images:hypDocs});
 write(path.join(run,'a2_relationship_multigraph.json'),{schema_version:'0.8a2.1',edge_types:cfg.relationship_graph.edge_types,no_generic_grouping_edge:true,destructive_merges_executed:0,images:edgeDocs});
 write(path.join(run,'a1_failure_recovery.json'),{schema_version:'0.8a2.1',role:'A1_FAILURE_RECOVERY_EVIDENCE_NOT_ACCURACY_CLAIM',cases:recovery});
 const allMasks=maskDocs.flatMap(x=>x.foundation_mask_hypotheses), controls=maskDocs.map(x=>x.mask_candidate_control), allEdges=edgeDocs.flatMap(x=>x.edges), visual=allEdges.filter(x=>x.edge_type==='VISUAL_EMBEDDING_NEIGHBOR');
 const diag={schema_version:'0.8a2.1',images_processed:maskDocs.length,foundation_masks_total:allMasks.length,mask_control:{raw_total:controls.reduce((s,x)=>s+x.raw_mask_count,0),after_duplicate_total:controls.reduce((s,x)=>s+x.after_duplicate_hygiene,0),final_total:controls.reduce((s,x)=>s+x.final_mask_hypotheses,0),near_duplicate_pairs:controls.reduce((s,x)=>s+x.near_duplicate_pairs_detected,0),max_nesting_depth:Math.max(0,...controls.map(x=>x.max_nesting_depth)),overlap_multiplicity_p95_distribution:dist(controls.map(x=>x.overlap_multiplicity.p95)),overlap_multiplicity_max_distribution:dist(controls.map(x=>x.overlap_multiplicity.max))},overlap_mapping_summary:mapping.summary,visual_embedding_neighbor_edges:visual.length,visual_embedding_absolute_similarity_distribution:dist(visual.map(x=>x.absolute_visual_embedding_cosine)),visual_embedding_neighbor_margin_distribution:dist(visual.flatMap(x=>[x.source_neighbor_margin,x.target_neighbor_margin])),critical_case_recovery_count:recovery.length,foundation_group_truth_claim:false,style_graph_built:false,production_authority:'NONE',gate_5_perceptual_recovery:'REQUIRES_AUDIT_EVALUATION_NOT_IMPLIED_BY_EXECUTION'};
 write(path.join(run,'a2_diagnostics.json'),diag);console.log('A2.1 assembly complete');
}
main();
