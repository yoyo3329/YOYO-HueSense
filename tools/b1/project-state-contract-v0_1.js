(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.YOYOProjectStateContract=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
const CONTRACT=Object.freeze({
  name:'YOYO Project State Manifest Contract',
  version:'0.1.0',
  required_project:'YOYO/HueSense',
  status_values:['PASS','READY','PAUSED','PENDING','BLOCKED','REJECTED','OFF','UNVALIDATED']
});
function assert(c,m){if(!c)throw new Error(m);}
function validate(m){
  assert(m&&typeof m==='object','manifest must be an object');
  assert(m?.contract?.name===CONTRACT.name,'contract name mismatch');
  assert(m?.contract?.version===CONTRACT.version,'contract version mismatch');
  assert(m?.project==='YOYO/HueSense','project mismatch');
  assert(typeof m.current_phase==='string'&&m.current_phase,'missing current_phase');
  assert(m?.safety?.live_runtime_integration===false,'live runtime integration must remain OFF');
  assert(m?.safety?.candidate_v0_5_production_eligible===false,'v0.5 Candidate must remain production-ineligible');
  assert(m?.safety?.holdout_auto_retuning===false,'holdout auto-retuning must remain disabled');
  assert(m?.calibration?.human_calibration_status==='PAUSED','human calibration status must be explicit');
  assert(Array.isArray(m.components),'components must be an array');
  const ids=m.components.map(x=>x.id); assert(new Set(ids).size===ids.length,'duplicate component ids');
  return true;
}
return {CONTRACT,validate};
});
