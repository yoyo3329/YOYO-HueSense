'use strict';const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..'),cfg=JSON.parse(fs.readFileSync(path.join(root,'config','stylecolor_v0_8a2_1.config.json'))),run=fs.readFileSync(path.join(root,'node','run_stylecolor_v0_8a2_1.js'),'utf8'),asm=fs.readFileSync(path.join(root,'node','assemble_a2.js'),'utf8'),map=fs.readFileSync(path.join(root,'python','map_atomic_foundation.py'),'utf8');let n=0,p=0;function c(x,s){n++;console.log((x?'PASS  ':'FAIL  ')+s);if(x)p++}
c(cfg.policy.atomic_regions_immutable,'atomic observations immutable');
c(cfg.input_contract.a1_relationship_action_authority==='NONE','A1 actions have zero authority');
c(cfg.policy.foundation_mask_not_truth&&cfg.policy.sam_mask_not_final_stylecolor_region,'SAM mask not truth/final region');
c(cfg.hypothesis_contract.allowed_resolution_states.includes('SPLIT')&&cfg.hypothesis_contract.allowed_resolution_states.includes('GROUP')&&cfg.hypothesis_contract.allowed_resolution_states.includes('KEEP')&&cfg.hypothesis_contract.allowed_resolution_states.includes('UNKNOWN'),'SPLIT/GROUP/KEEP/UNKNOWN contract');
c(cfg.input_contract.derived_components_must_trace_to_atomic_or_pixels,'derived components require provenance');
c(cfg.schema_repairs.remove_primary_group_forced_ownership===true&&!map.includes('primary_group_id'),'forced ownership removed');
c(cfg.semantic_prior.axes.content_type&&cfg.semantic_prior.axes.visual_form&&cfg.semantic_prior.axes.material_appearance,'semantic prior is multi-axis');
c(cfg.relationship_graph.no_generic_grouping_edge===true,'generic overloaded grouping edge forbidden');
c(cfg.resume_guard.require_exact_fingerprint_match===true&&run.includes('RESUME_ENV_MISMATCH'),'resume environment mismatch guard');
c(run.includes('model_lock_sha256')&&run.includes('dependency_fingerprint_sha256'),'model/dependency fingerprint included');
c(cfg.gates.perceptual_recovery_is_not_implied_by_first_four===true,'perceptual recovery not implied by execution');
c(cfg.policy.no_style_graph&&cfg.policy.no_production_integration,'no Style Graph / no production integration');
console.log(`\n${p}/${n} A2.1 static contract ${p===n?'PASS':'FAIL'}`);process.exit(p===n?0:1)
