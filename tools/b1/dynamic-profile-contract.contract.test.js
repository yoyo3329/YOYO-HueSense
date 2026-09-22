#!/usr/bin/env node
'use strict';
const assert=require('assert');
const C=require('./dynamic-profile-contract-v0_1.js');
const graph={metadata:{contract_version:'0.1.0',validation_scope:'TEST_ONLY'},nodes:[
 {mode_id:'a',centroid_hex:'#111111',centroid_lch:{L:.1,C:.01,H:20}},
 {mode_id:'b',centroid_hex:'#777777',centroid_lch:{L:.5,C:.02,H:50}},
 {mode_id:'c',centroid_hex:'#eeeeee',centroid_lch:{L:.9,C:.03,H:80}}
],edges:[]};
function edge(a,b){return {pair_key:[a,b].sort().join('||'),a:{id:a},b:{id:b},physical_relations:{delta_L:.2,delta_C:.01,hue_chord:.01,min_chroma:.01,max_chroma:.02}}}
graph.edges=[edge('a','b'),edge('a','c'),edge('b','c')];
let pass=0; function test(n,f){try{f();pass++;console.log('PASS ',n)}catch(e){console.error('FAIL ',n);throw e}}

test('contract is style agnostic',()=>{assert.equal(C.CONTRACT.style_agnostic,true);assert.equal(C.CONTRACT.semantic_merge_required,false)});
test('valid complete graph accepted',()=>assert.equal(C.validateRelationGraph(graph),true));
test('packet keeps atomic nodes',()=>{const p=C.buildPacket(graph,{style_key:'ANY_STYLE'});assert.equal(p.atomic_nodes.length,3);assert.equal(p.relation_graph.edge_count,3)});
test('packet is shadow-only',()=>{const p=C.buildPacket(graph);assert.equal(p.authority.runtime_mode,'SHADOW_ONLY');assert.equal(p.authority.can_block_search,false);assert.equal(p.authority.can_change_palette,false)});
test('candidate semantic fields are excluded',()=>{const g=JSON.parse(JSON.stringify(graph));g.edges[0].perceptual_relations_candidate_v0_5={tone_relation:'similar'};const p=C.buildPacket(g);assert.equal('perceptual_relations_candidate_v0_5' in p.relation_graph.relations[0],false)});
test('B3-D views are reserved not invented',()=>{const p=C.buildPacket(graph);assert.equal(p.views.status,'RESERVED_B3D_NOT_BUILT');assert.deepStrictEqual(p.views.items,[])});
test('packet validates',()=>assert.equal(C.validatePacket(C.buildPacket(graph)),true));
test('incomplete graph is rejected',()=>{assert.throws(()=>C.validateRelationGraph({...graph,edges:graph.edges.slice(0,2)}),/complete/)});
console.log(`\n${pass}/8 DynamicProfile contract tests PASS.`);
