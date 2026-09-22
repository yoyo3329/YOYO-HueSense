#!/usr/bin/env node
'use strict'; const fs=require('fs'),path=require('path'); const B=require('./runtime-profile-bridge-v0_1.js');
const graph=JSON.parse(fs.readFileSync(path.join(__dirname,'y2k_color_relation_graph.json'),'utf8'));
let pass=0,total=0; function t(name,fn){total++;try{if(!fn())throw new Error('false');pass++;console.log('PASS ',name)}catch(e){console.log('FAIL ',name,'—',e.message)}}
t('bridge is shadow-only',()=>B.CONTRACT.mode==='SHADOW_ONLY');
t('bridge has no production decision authority',()=>B.CONTRACT.productionDecisionAuthority===false);
t('base graph validates',()=>B.validateGraph(graph)===true);
const out=B.buildShadowProfile(graph,{style:'Y2K'});
t('preserves 53 nodes',()=>out.nodes.length===53);
t('preserves 1378 relations',()=>out.relations.length===1378);
t('candidate semantics excluded',()=>out.shadow.candidate_relations_included===false);
t('cannot block search',()=>out.shadow.can_block_search===false);
t('cannot change palette',()=>out.shadow.can_change_palette===false);
console.log(`\n${pass}/${total} Runtime Profile Bridge tests PASS.`); if(pass!==total)process.exit(1);
