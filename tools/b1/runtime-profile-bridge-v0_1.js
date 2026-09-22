(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.YOYORuntimeProfileBridge=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
const CONTRACT={name:'YOYO Runtime Profile Bridge',version:'0.1.1',mode:'SHADOW_ONLY',productionDecisionAuthority:false,semanticCalibrationAuthority:false};
function deepCopy(x){return JSON.parse(JSON.stringify(x));}
function nodeId(n){return n.id||n.mode_id;}
function nodeHex(n){return n.hex||n.centroid_hex||null;}
function nodeLch(n){return n.lch||n.centroid_lch||null;}
function validateGraph(graph){
 if(!graph||!Array.isArray(graph.nodes)||!Array.isArray(graph.edges)) throw new Error('Invalid graph');
 const n=graph.nodes.length; if(graph.edges.length!==n*(n-1)/2) throw new Error('Graph is not a complete undirected pair graph');
 const ids=new Set(graph.nodes.map(nodeId)); if(ids.size!==n||ids.has(undefined)) throw new Error('Node IDs invalid or duplicated');
 for(const e of graph.edges){if(!ids.has(e.a?.id)||!ids.has(e.b?.id)) throw new Error('Edge references unknown node');}
 return true;
}
function buildShadowProfile(graph,opts={}){
 validateGraph(graph);
 return {
  contract:deepCopy(CONTRACT),
  source:{style:opts.style||graph.metadata?.source_style||null,graph_version:graph.metadata?.version||null,node_count:graph.nodes.length,edge_count:graph.edges.length},
  nodes:graph.nodes.map(n=>({id:nodeId(n),hex:nodeHex(n),lch:deepCopy(nodeLch(n)),evidence_tier:n.evidence?.evidence_tier??n.evidence_tier??null,scope:n.evidence?.scope??n.scope??null,stability:n.evidence?.stability_grade??n.stability??null})),
  relations:graph.edges.map(e=>({pair_key:e.pair_key,a:e.a.id,b:e.b.id,physical_relations:deepCopy(e.physical_relations)})),
  shadow:{candidate_relations_included:false,can_block_search:false,can_change_palette:false}
 };
}
return {CONTRACT,validateGraph,buildShadowProfile};
});
