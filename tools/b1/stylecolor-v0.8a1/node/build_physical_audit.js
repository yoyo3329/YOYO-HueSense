 'use strict';
const fs=require('fs'),path=require('path');
const run=path.resolve(process.argv[2]||'.');
const obs=JSON.parse(fs.readFileSync(path.join(run,'atomic_region_observations.json'),'utf8'));
const graph=JSON.parse(fs.readFileSync(path.join(run,'region_relationship_graph.json'),'utf8'));
const regs=obs.images.flatMap(x=>x.atomic_regions);
const edges=graph.images.flatMap(x=>x.edges);

const flagCounts={};
for(const r of regs) for(const f of r.diagnostics.flags||[]) flagCounts[f]=(flagCounts[f]||0)+1;
const clipCounts={};
for(const r of regs) clipCounts[r.clip_status]=(clipCounts[r.clip_status]||0)+1;

const stZeroLike=regs.filter(r=>r.diagnostics.scale_stability_score<.1||r.diagnostics.perturbation_stability_score<.1).length;
const highDilution=regs.filter(r=>r.diagnostics.foreground_dilution_score>.35).length;
const highBimodal=regs.filter(r=>r.diagnostics.bimodal_color_score>.55).length;
const lowCoherenceClip=regs.filter(r=>r.clip_status==='OK'&&r.clip_input_coherence_score<.45).length;
const highImpact=edges.filter(e=>e.evidence.palette_impact_score>.20).length;
const contradictionEdges=edges.filter(e=>(e.contradictions||[]).length>0).length;

const perImage=obs.images.map(x=>({
 image_id:x.image_id,
 atomic_regions:x.atomic_regions.length,
 relationship_edges:(graph.images.find(g=>g.image_id===x.image_id)?.edges||[]).length,
 scale_sensitive:x.atomic_regions.filter(r=>r.diagnostics.scale_stability_score<.45).length,
 perturbation_sensitive:x.atomic_regions.filter(r=>r.diagnostics.perturbation_stability_score<.45).length,
 bimodal:x.atomic_regions.filter(r=>r.diagnostics.bimodal_color_score>.55).length,
 foreground_dilution:x.atomic_regions.filter(r=>r.diagnostics.foreground_dilution_score>.35).length,
 clip_scored:x.atomic_regions.filter(r=>r.clip_status==='OK').length,
 clip_not_selected:x.atomic_regions.filter(r=>r.clip_status==='NOT_SELECTED_FOR_CLIP_BUDGET').length
}));

const out={
 schema_version:'0.8a1.0',
 role:'PHYSICAL_AUDIT_DIAGNOSTIC_NOT_ACCURACY_CLAIM',
 objective:'STABLE_TRACEABLE_UNCERTAINTY_AWARE_STYLE_USEFUL_REGION_REPRESENTATION',
 atomic_regions_total:regs.length,
 destructive_merges_executed:0,
 relationship_edges_total:edges.length,
 flags:flagCounts,
 clip_status_counts:clipCounts,
 counts:{
   stability_extreme_low:stZeroLike,
   high_bimodal_regions:highBimodal,
   foreground_dilution_regions:highDilution,
   clip_scored_low_input_coherence:lowCoherenceClip,
   relationship_edges_with_contradictions:contradictionEdges,
   high_palette_impact_relationships:highImpact
 },
 per_image:perImage,
 interpretation_limits:[
   'Does not prove real-world object identity.',
   'Atomic regions are immutable observations, not semantic/style entities.',
   'All 0-1 evidence scores are heuristic scores, not calibrated probabilities.',
   'No destructive region merge is executed.',
   'No Style Graph is built in v0.8-A.1.',
   'Semantic-mask and embedding agreement are deferred to v0.8-A.2.'
 ]
};
fs.writeFileSync(path.join(run,'physical_audit.json'),JSON.stringify(out,null,2)+'\n');
console.log('Built physical_audit.json');
