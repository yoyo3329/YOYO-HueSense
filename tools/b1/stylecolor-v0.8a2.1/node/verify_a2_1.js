'use strict';
const fs=require('fs'),path=require('path');const r=path.resolve(process.argv[2]);
const m=JSON.parse(fs.readFileSync(path.join(r,'run_manifest.json'))),d=JSON.parse(fs.readFileSync(path.join(r,'a2_diagnostics.json'))),f=JSON.parse(fs.readFileSync(path.join(r,'foundation_mask_hypotheses.json'))),h=JSON.parse(fs.readFileSync(path.join(r,'perceptual_inference_hypotheses.json'))),p=JSON.parse(fs.readFileSync(path.join(r,'a1_observations_projection.json'))),g=JSON.parse(fs.readFileSync(path.join(r,'a2_relationship_multigraph.json')));
let n=0,ok=0;function c(x,s){n++;console.log((x?'PASS  ':'FAIL  ')+s);if(x)ok++}
const masks=f.images.flatMap(x=>x.foundation_mask_hypotheses),atoms=h.images.flatMap(x=>x.atomic_split_keep_unknown_hypotheses),groups=h.images.flatMap(x=>x.mask_group_keep_unknown_hypotheses),edges=g.images.flatMap(x=>x.edges),visual=edges.filter(x=>x.edge_type==='VISUAL_EMBEDDING_NEIGHBOR');
c(m.atomic_regions_immutable===true,'atomic provenance retained');
c(m.destructive_merges_executed===0&&h.destructive_resolution_executed===0,'zero destructive resolution');
c(m.a1_relationship_action_authority==='NONE','A1 actions have zero authority');
c(p.images.every(i=>i.relationships.every(e=>e.a1_action_ignored===true&&!('action' in e))),'A1 action absent from A2 projection');
c(m.foundation_mask_authority==='HYPOTHESIS_ONLY'&&m.foundation_mask_equals_perceptual_component===false,'foundation mask not truth / not perceptual component truth');
c(!atoms.some(x=>'primary_group_id' in x)&&atoms.every(x=>x.forced_primary_group!==true),'forced primary ownership removed');
c(atoms.every(x=>x.resolution_state==='UNKNOWN'&&x.candidate_actions.includes('KEEP')&&x.candidate_actions.includes('UNKNOWN')),'atomic hypotheses preserve KEEP + UNKNOWN');
c(groups.every(x=>x.resolution_state==='UNKNOWN'&&x.candidate_actions.includes('KEEP')&&x.candidate_actions.includes('UNKNOWN')),'mask hypotheses preserve GROUP/KEEP/UNKNOWN space');
c(masks.every(x=>x.semantic_prior?.score_semantics==='CLIP_COSINE_NOT_PROBABILITY'&&x.semantic_prior?.axes?.content_type&&x.semantic_prior?.axes?.visual_form&&x.semantic_prior?.axes?.material_appearance),'multi-axis semantic prior present and non-probabilistic');
c(f.images.every(x=>x.mask_candidate_control?.overlap_multiplicity&&Number.isFinite(x.mask_candidate_control.overlap_multiplicity.max)),'mask carpet multiplicity diagnostics present');
c(f.images.every(x=>Number.isFinite(x.mask_candidate_control?.max_nesting_depth)),'mask nesting diagnostics present');
c(visual.every(e=>Number.isFinite(e.absolute_visual_embedding_cosine)&&('source_neighbor_margin' in e)&&('target_neighbor_margin' in e)&&e.authority==='HYPOTHESIS_ONLY'),'visual-neighbor edges store absolute similarity + margins');
c(g.no_generic_grouping_edge===true,'no generic overloaded grouping edge');
c(m.foundation_model?.resolved_revision&&Array.isArray(m.foundation_model?.weight_files)&&m.foundation_model.weight_files.every(x=>x.sha256),'SAM model revision and weight hashes pinned');
c(m.run_fingerprint?.fingerprint_sha256&&m.run_fingerprint?.dependency_fingerprint_sha256,'resume/environment fingerprint recorded');
c(m.input_fallback_count===0,'byte-identical A1 original inputs used');
c(d.gate_5_perceptual_recovery==='REQUIRES_AUDIT_EVALUATION_NOT_IMPLIED_BY_EXECUTION','perceptual recovery not auto-claimed');
c(m.style_graph_built===false&&m.production_authority==='NONE','no Style Graph / no production authority');
c(fs.existsSync(path.join(r,'a1_failure_recovery.json'))&&fs.existsSync(path.join(r,'audit.html')),'failure-recovery report and audit exist');
console.log(`\n${ok}/${n} A2.1 output gates ${ok===n?'PASS':'FAIL'}`);process.exit(ok===n?0:1)
