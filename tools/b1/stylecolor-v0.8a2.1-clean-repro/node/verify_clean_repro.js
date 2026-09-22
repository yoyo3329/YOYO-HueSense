'use strict';
const fs=require('fs'),path=require('path');const r=path.resolve(process.argv[2]);const m=JSON.parse(fs.readFileSync(path.join(r,'run_manifest.json'))),d=JSON.parse(fs.readFileSync(path.join(r,'a2_diagnostics.json'))),f=JSON.parse(fs.readFileSync(path.join(r,'foundation_mask_hypotheses.json'))),p=JSON.parse(fs.readFileSync(path.join(r,'a1_observations_projection.json')));
let n=0,ok=0;function c(x,s){n++;console.log((x?'PASS  ':'FAIL  ')+s);if(x)ok++}
c(m.version==='0.8a2.1-CLEAN-REPRO','clean reproduction version');
c(m.certification?.clean_environment_pre===true,'pre-inference environment certified');
c(m.certification?.sam_model_lock===true,'exact SAM lock certified');
c(m.certification?.openclip_architecture_lock===true&&m.certification?.quickgelu_actual===true,'OpenCLIP QuickGELU architecture certified');
c(m.foundation_model?.resolved_revision==='de431c4043854a71d8101e17995dfe596bf101a5','SAM revision exact');
c(m.foundation_model?.weight_files?.[0]?.sha256==='48c14467e5cf9e51870511feb72c89688e82dd74523142c0538b663e193ac2a7','SAM weight SHA exact');
c(m.visual_embedding_model?.weight_sha256?.length===1&&m.visual_embedding_model.weight_sha256[0]==='a3ce3c4a2245ed2a572d2eb864a62f0a4ca62b3123b83f8a52a523c3b1dd32a4','OpenCLIP state-dict SHA exact');
c(m.input_fallback_count===0,'24 inputs use byte-identical A1 originals');
c(m.atomic_regions_immutable===true&&m.destructive_merges_executed===0,'atomic provenance / destructive safety');
c(m.a1_relationship_action_authority==='NONE','A1 actions have zero authority');
c(p.images.every(i=>i.relationships.every(e=>e.a1_action_ignored===true&&!('action' in e))),'A1 action absent from clean projection');
c(d.images_processed===24,'24 images processed');
c(m.style_graph_built===false&&m.production_authority==='NONE','no Style Graph / production authority');
c(m.certification?.algorithm_tuning===false,'no algorithm tuning claim');
console.log(`\n${ok}/${n} clean reproduction output gates ${ok===n?'PASS':'FAIL'}`);process.exit(ok===n?0:1);
