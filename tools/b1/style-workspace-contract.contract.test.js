#!/usr/bin/env node
'use strict';const C=require('./style-workspace-contract-v0_1.js');let p=0,t=0;
function test(n,f){t++;try{f();console.log('PASS ',n);p++;}catch(e){console.error('FAIL ',n,'—',e.message);process.exitCode=1}}
const w={contract:{name:C.CONTRACT.name,version:C.CONTRACT.version},style:{id:'quiet-luxury',display_name:'Quiet Luxury'},data_status:'READY',paths:{evaluation_set:'evaluation_set.json',cache_dir:'b1_cache',artifact_dir:'artifacts'},authority:{mode:'OFFLINE_RND_ONLY',can_modify_live_runtime:false,can_promote_candidate_semantics:false}};
test('workspace is style-agnostic',()=>{if(!C.CONTRACT.style_agnostic)throw Error('not style agnostic')});
test('valid arbitrary style workspace accepted',()=>C.validate(w));
test('DATA_PENDING skeleton is allowed only explicitly',()=>{const x=JSON.parse(JSON.stringify(w));x.data_status='DATA_PENDING';x.paths.evaluation_set=null;x.paths.cache_dir=null;C.validate(x,{allowDataPending:true})});
test('live runtime authority is rejected',()=>{const x=JSON.parse(JSON.stringify(w));x.authority.can_modify_live_runtime=true;let ok=false;try{C.validate(x)}catch(_){ok=true}if(!ok)throw Error('unsafe workspace accepted')});
console.log(`\n${p}/${t} StyleWorkspace contract tests PASS.`);if(p!==t)process.exit(1);
