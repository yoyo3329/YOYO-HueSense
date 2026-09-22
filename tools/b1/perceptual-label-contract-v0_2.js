(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.YOYOPerceptualLabelContract=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const CONTRACT=Object.freeze({
  name:'YOYO Perceptual Label Contract',
  version:'0.2.0',
  purpose:'CROSS_STYLE_CALIBRATION_LABEL_SCHEMA',
  auto_relabel_from_numeric_features:false,
  legacy_raw_mutation_allowed:false,
  required_fields:['hue_applicability','hue_relation','tone_relation','confidence'],
  hue_applicability:['reliable','low_chroma','review'],
  hue_relation:['same_or_adjacent','different','not_applicable','review'],
  tone_relation:['similar','similar_or_partial','different','review'],
  confidence:['high','medium','low']
});
function assert(c,m){if(!c)throw new Error(m)}
function getLabel(c){return c&&((c.human_label)||(c.human_retest_label)||(c.label))}
function validateLabel(y){
  assert(y&&typeof y==='object','label required');
  for(const f of CONTRACT.required_fields) assert(typeof y[f]==='string'&&y[f],`missing ${f}`);
  assert(CONTRACT.hue_applicability.includes(y.hue_applicability),'invalid hue_applicability');
  assert(CONTRACT.hue_relation.includes(y.hue_relation),'invalid hue_relation');
  assert(CONTRACT.tone_relation.includes(y.tone_relation),'invalid tone_relation');
  assert(CONTRACT.confidence.includes(y.confidence),'invalid confidence');
  if(y.hue_applicability==='low_chroma') assert(y.hue_relation==='not_applicable','low_chroma requires hue_relation=not_applicable');
  if(y.hue_applicability==='reliable') assert(y.hue_relation!=='not_applicable','reliable hue cannot use hue_relation=not_applicable');
  if(y.hue_applicability==='review') assert(y.hue_relation==='review','review applicability requires hue_relation=review');
  return true;
}
function validateCase(c){assert(c&&typeof c.case_id==='string'&&c.case_id,'case_id required');return validateLabel(getLabel(c));}
function validateDataset(d){assert(d&&Array.isArray(d.cases),'cases required');for(const c of d.cases)validateCase(c);return true;}
function isLegacyCase(c){const y=getLabel(c);return !!(y&&!Object.prototype.hasOwnProperty.call(y,'hue_applicability'));}
return {CONTRACT,getLabel,validateLabel,validateCase,validateDataset,isLegacyCase};
});
