(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.YOYODynamicProfileContract=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';

const CONTRACT=Object.freeze({
  name:'YOYO Dynamic Profile Packet Contract',
  version:'0.1.0',
  architecture:'ATOMIC_COLOR_NODES_PLUS_RELATION_GRAPH',
  style_agnostic:true,
  runtime_mode:'SHADOW_ONLY',
  b3d_views_status:'RESERVED_NOT_BUILT',
  semantic_merge_required:false,
  candidate_semantics_allowed:false
});

function copy(x){return x==null?x:JSON.parse(JSON.stringify(x));}
function nodeId(n){return n?.id||n?.mode_id;}
function nodeHex(n){return n?.hex||n?.centroid_hex||null;}
function nodeLch(n){return n?.lch||n?.centroid_lch||null;}
function pairKey(a,b){return [a,b].sort().join('||');}

function validateRelationGraph(graph){
  if(!graph||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)) throw new Error('Invalid relation graph');
  const ids=graph.nodes.map(nodeId);
  const idSet=new Set(ids);
  if(ids.some(x=>!x)||idSet.size!==ids.length) throw new Error('Invalid or duplicate node IDs');
  const expected=ids.length*(ids.length-1)/2;
  if(graph.edges.length!==expected) throw new Error(`Relation graph must be complete: expected ${expected}, got ${graph.edges.length}`);
  const pairs=new Set();
  for(const e of graph.edges){
    const a=e?.a?.id,b=e?.b?.id;
    if(!idSet.has(a)||!idSet.has(b)||a===b) throw new Error('Invalid edge endpoint');
    const k=pairKey(a,b);
    if(pairs.has(k)) throw new Error('Duplicate relation pair');
    pairs.add(k);
    if(!e.physical_relations||typeof e.physical_relations!=='object') throw new Error('Missing physical_relations');
  }
  return true;
}

function buildPacket(graph,opts={}){
  validateRelationGraph(graph);
  const styleKey=opts.style_key||opts.styleKey||graph?.metadata?.source_style||null;
  const atomicNodes=graph.nodes.map(n=>({
    id:nodeId(n),
    hex:nodeHex(n),
    lch:copy(nodeLch(n)),
    evidence:copy(n.evidence||null)
  }));
  const relations=graph.edges.map(e=>({
    pair_key:e.pair_key||pairKey(e.a.id,e.b.id),
    a:e.a.id,
    b:e.b.id,
    physical_relations:copy(e.physical_relations)
  }));
  return {
    metadata:{
      name:'YOYO Dynamic Color Profile Packet',
      contract:CONTRACT.name,
      contract_version:CONTRACT.version,
      profile_version:opts.profile_version||'0.6B-STRUCTURAL',
      profile_id:opts.profile_id||null,
      style_key:styleKey,
      concept_fingerprint:opts.concept_fingerprint||null,
      validation_scope:opts.validation_scope||graph?.metadata?.validation_scope||'UNVALIDATED',
      universality_status:'unvalidated',
      generated_at:opts.generated_at||new Date().toISOString(),
      generated_by:opts.generated_by||'dynamic-profile-contract-v0_1.js',
      architecture:CONTRACT.architecture
    },
    source:{
      source_kind:opts.source_kind||'dynamic_reference_set',
      relation_graph_contract_version:graph?.metadata?.contract_version||null,
      source_graph_fingerprint:opts.source_graph_fingerprint||null,
      source_profile_version:graph?.metadata?.source_profile_version||null,
      node_count:atomicNodes.length,
      relation_count:relations.length,
      lineage:copy(opts.lineage||{})
    },
    atomic_nodes:atomicNodes,
    relation_graph:{
      complete_undirected:true,
      node_count:atomicNodes.length,
      edge_count:relations.length,
      relations
    },
    views:{
      status:'RESERVED_B3D_NOT_BUILT',
      contract_note:'Hue/Tone/Role/Query-family views are downstream views, not irreversible semantic truth.',
      items:[]
    },
    authority:{
      runtime_mode:'SHADOW_ONLY',
      production_decision_authority:false,
      can_block_search:false,
      can_change_palette:false,
      can_promote_candidate_semantics:false
    }
  };
}

function validatePacket(packet){
  if(!packet||packet?.metadata?.contract_version!==CONTRACT.version) throw new Error('Dynamic profile contract version mismatch');
  if(packet?.authority?.runtime_mode!=='SHADOW_ONLY') throw new Error('Profile packet is not shadow-only');
  if(packet?.authority?.production_decision_authority!==false) throw new Error('Profile packet has production authority');
  if(!Array.isArray(packet.atomic_nodes)||!Array.isArray(packet?.relation_graph?.relations)) throw new Error('Missing atomic nodes or relations');
  const ids=new Set(packet.atomic_nodes.map(n=>n.id));
  if(ids.size!==packet.atomic_nodes.length||ids.has(undefined)) throw new Error('Invalid atomic node IDs');
  const rels=packet.relation_graph.relations;
  const expected=ids.size*(ids.size-1)/2;
  if(packet.relation_graph.complete_undirected!==true||rels.length!==expected) throw new Error('Dynamic profile relation graph is incomplete');
  const pairs=new Set();
  for(const r of rels){
    if(!ids.has(r.a)||!ids.has(r.b)||r.a===r.b) throw new Error('Invalid relation endpoint');
    const k=pairKey(r.a,r.b);
    if(pairs.has(k)) throw new Error('Duplicate dynamic profile relation');
    pairs.add(k);
    if(!r.physical_relations) throw new Error('Missing objective physical relation');
    for(const forbidden of ['perceptual_relations_candidate_v0_5','perceptual_relations_provisional','semantic_family','superfamily']){
      if(Object.prototype.hasOwnProperty.call(r,forbidden)) throw new Error(`Forbidden relation semantic field: ${forbidden}`);
    }
  }
  return true;
}

return {CONTRACT,validateRelationGraph,buildPacket,validatePacket};
});
