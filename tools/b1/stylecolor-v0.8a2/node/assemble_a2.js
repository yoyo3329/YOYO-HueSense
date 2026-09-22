 'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
function read(p){return JSON.parse(fs.readFileSync(p,'utf8'))}function write(p,x){fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n')}
function q(v,p){const a=[...v].sort((x,y)=>x-y);if(!a.length)return null;const k=(a.length-1)*p,i=Math.floor(k),f=k-i;return a[i+1]!==undefined?a[i]+f*(a[i+1]-a[i]):a[i]}
function cosine(a,b){let d=0,aa=0,bb=0;for(let i=0;i<a.length;i++){d+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i]}return d/Math.max(1e-12,Math.sqrt(aa*bb))}
function loadMask(p){const {execFileSync}=require('child_process');return null}// masks handled via Python mapper
function main(){
 const a1=path.resolve(process.argv[2]),run=path.resolve(process.argv[3]),mapping=read(path.join(run,'atomic_foundation_overlap_raw.json'));
 const obs=read(path.join(a1,'atomic_region_observations.json')),rel=read(path.join(a1,'region_relationship_graph.json')),fw=read(path.join(run,'foundation_worker_summary.json'));
 const fBy=new Map(fw.results.filter(x=>!x.error).map(x=>[x.image_id,x]));
 const mapBy=new Map(mapping.images.map(x=>[x.image_id,x]));
 const projected=[],groups=[],ggraphs=[];
 for(const img of obs.images){
  const f=fBy.get(img.image_id),mp=mapBy.get(img.image_id);if(!f||!mp)continue;
  const oldEdges=(rel.images.find(x=>x.image_id===img.image_id)||{edges:[]}).edges;
  projected.push({image_id:img.image_id,atomic_regions:img.atomic_regions.map(r=>({region_id:r.region_id,area_ratio:r.area_ratio,mean_lab:r.mean_lab,saliency_proxy:r.saliency_proxy,edge_density:r.edge_density,diagnostics:r.diagnostics,low_level_input_coherence_score:r.clip_input_coherence_score??null})),relationships:oldEdges.map(e=>({edge_id:e.edge_id,source_region_id:e.source_region_id,target_region_id:e.target_region_id,observations:{oklab_delta:e.evidence.oklab_delta,color_similarity_score:e.evidence.color_similarity_score,boundary_mean:e.evidence.boundary_mean,boundary_p90:e.evidence.boundary_p90,boundary_strong_support_ratio:e.evidence.boundary_strong_support_ratio,texture_similarity_score:e.evidence.texture_similarity_score,scale_stability_agreement_score:e.evidence.scale_stability_agreement_score,perturbation_stability_agreement_score:e.evidence.perturbation_stability_agreement_score},contradictions:(e.contradictions||[]).filter(x=>x!=='HIGH_PALETTE_IMPACT'),decision_risk:{palette_impact_score:e.evidence.palette_impact_score},a1_action_ignored:true}))});
  const primary=new Map(mp.atomic_regions.map(x=>[x.region_id,x.primary_group_id]));
  const gs=f.groups.map(g=>{const memberships=mp.groups.find(x=>x.group_id===g.group_id)?.atomic_memberships||[];return {...g,group_role:'PERCEPTUAL_GROUP_HYPOTHESIS_NOT_TRUTH',core_atomic_memberships:memberships.filter(x=>primary.get(x.region_id)===g.group_id),all_atomic_overlap_evidence:memberships,destructive_merge_executed:false}});
  groups.push({image_id:img.image_id,source_sha256:f.source_sha256,foundation_preview_asset:f.preview_asset,groups:gs});
  // Cross-group visual links: mutual nearest embedding, no merge.
  const nearest=new Map();
  for(let i=0;i<gs.length;i++){let best=null;for(let j=0;j<gs.length;j++){if(i===j)continue;const s=cosine(gs[i].visual_embedding,gs[j].visual_embedding);if(!best||s>best.sim)best={j,sim:s}}if(best)nearest.set(i,best)}
  const edges=[];
  for(let i=0;i<gs.length;i++){const b=nearest.get(i);if(!b)continue;const back=nearest.get(b.j);if(back&&back.j===i&&i<b.j)edges.push({source_group_id:gs[i].group_id,target_group_id:gs[b.j].group_id,relationship:'MUTUAL_NEAREST_VISUAL_EMBEDDING',visual_embedding_cosine:b.sim,semantic_top_label_match:gs[i].semantic_prior.top_label===gs[b.j].semantic_prior.top_label,destructive_merge_executed:false,authority:'HYPOTHESIS_ONLY'})}
  ggraphs.push({image_id:img.image_id,edges});
 }
 write(path.join(run,'a1_observations_projection.json'),{schema_version:'0.8a2.0',role:'A1_OBSERVATIONS_ONLY_ACTIONS_IGNORED',images:projected});
 write(path.join(run,'perceptual_group_hypotheses.json'),{schema_version:'0.8a2.0',authority:'NONE',foundation_masks_are_truth:false,images:groups});
 write(path.join(run,'group_relationship_graph.json'),{schema_version:'0.8a2.0',role:'GROUP_HYPOTHESIS_RELATIONSHIPS_NOT_STYLE_GRAPH',destructive_merges_executed:0,images:ggraphs});
 const all=groups.flatMap(x=>x.groups), cos=ggraphs.flatMap(x=>x.edges).map(x=>x.visual_embedding_cosine);
 const sem={};for(const g of all){const k=g.semantic_prior.top_label||'NONE';sem[k]=(sem[k]||0)+1}
 const diag={schema_version:'0.8a2.0',images_processed:groups.length,foundation_groups_total:all.length,mutual_visual_links:ggraphs.reduce((s,x)=>s+x.edges.length,0),semantic_prior_top_label_counts:sem,visual_link_cosine_distribution:cos.length?{n:cos.length,min:Math.min(...cos),p25:q(cos,.25),median:q(cos,.5),p75:q(cos,.75),max:Math.max(...cos)}:null,atomic_regions_with_primary_foundation_group:mapping.summary.atomic_with_primary,atomic_regions_without_foundation_group:mapping.summary.atomic_without_primary,foundation_group_truth_claim:false,style_graph_built:false,production_authority:'NONE'};
 write(path.join(run,'a2_diagnostics.json'),diag);console.log('A2 assembly complete');
}
main();
