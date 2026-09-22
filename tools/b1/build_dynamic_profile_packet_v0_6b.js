#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const C=require('./dynamic-profile-contract-v0_1.js');
const P=require('./provenance-trace-v0_1.js');
const B=__dirname;
const GRAPH=path.join(B,'y2k_color_relation_graph.json');
const OUT=path.join(B,'y2k_dynamic_profile_packet_v0_6b.json');
function read(p){return JSON.parse(fs.readFileSync(p,'utf8'))}
function hashFile(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
const graph=read(GRAPH);
const graphHash=hashFile(GRAPH);
const packet=C.buildPacket(graph,{
  style_key:'Y2K',
  concept_fingerprint:P.fingerprintText('Y2K'),
  profile_version:'0.6B-STRUCTURAL',
  profile_id:`y2k-structural-${graphHash.slice(0,12)}`,
  validation_scope:'Y2K_ONLY_CURRENT_DATASET',
  source_kind:'fixed_evaluation_set_rnd',
  source_graph_fingerprint:graphHash,
  lineage:{
    b1:'y2k_color_mvp_b1_observations.json',
    b2:'y2k_color_mvp_b2_aggregation.json',
    b3a:'y2k_color_mvp_b3_hierarchy.json',
    relation_graph:'y2k_color_relation_graph.json'
  },
  generated_by:'build_dynamic_profile_packet_v0_6b.js'
});
C.validatePacket(packet);
fs.writeFileSync(OUT,JSON.stringify(packet,null,2)+'\n','utf8');
console.log('=== YOYO Dynamic Profile Packet v0.6B ===');
console.log(`Atomic nodes : ${packet.atomic_nodes.length}`);
console.log(`Relations    : ${packet.relation_graph.edge_count}`);
console.log(`Authority    : ${packet.authority.runtime_mode}`);
console.log(`Views        : ${packet.views.status}`);
console.log(`Output       : ${OUT}`);
