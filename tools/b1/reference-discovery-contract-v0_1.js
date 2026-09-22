(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.YOYOReferenceDiscoveryContract=factory();})(typeof self!=='undefined'?self:this,function(){
'use strict';
const CONTRACT=Object.freeze({name:'YOYO Reference Discovery Output Contract',version:'0.1.0',pool_role:'REFERENCE_ONLY',style_agnostic:true});
function assert(c,m){if(!c)throw new Error(m)}
function forbidden(x){const s=JSON.stringify(x);for(const k of ['human_label','gold_label','ai_label','perceptual_ground_truth','tone_relation','hue_relation'])assert(!s.includes('"'+k+'"'),`subjective/calibration field forbidden in Reference Discovery: ${k}`)}
function urlish(v){return typeof v==='string'&&/^https?:\/\//i.test(v)}
function distributions(refs,key){const o={};for(const r of refs){let v;if(key==='source_domain')v=r.source_domain||r.source_name||'unknown';else v=r[key]||'unknown';v=String(v);o[v]=(o[v]||0)+1}return o}
function sameDist(a,b){const ak=Object.keys(a||{}).sort(),bk=Object.keys(b||{}).sort();return JSON.stringify(ak)===JSON.stringify(bk)&&ak.every(k=>a[k]===b[k])}
function validate(d,{allowLegacyImport=false}={}){
 assert(d&&typeof d==='object','payload must be object');assert(d.ok===true,'ok must be true');assert(d.pool_role==='REFERENCE_ONLY','pool_role must be REFERENCE_ONLY');assert(d.affects_display_search===false,'Reference Discovery cannot affect display search');
 const allowed=d.mode==='reference_discovery_debug'||(allowLegacyImport&&d.mode==='legacy_fixed_evaluation_import');assert(allowed,'unsupported discovery mode');
 assert(typeof d.input==='string'&&d.input.trim(),'input concept required');assert(Array.isArray(d.references)&&d.references.length>0,'references required');assert(d.reference_count===d.references.length,'reference_count mismatch');
 const ids=[];for(const r of d.references){assert(r&&typeof r==='object','reference must be object');assert(typeof r.id==='string'&&r.id,'reference id required');ids.push(r.id);assert(typeof r.provider==='string'&&r.provider,'provider required');assert(typeof r.query_family==='string'&&r.query_family,'query_family required');assert(urlish(r.image_regular||r.image_url),'image URL required');assert(typeof (r.source_domain||'')==='string','source_domain must be string')}
 assert(new Set(ids).size===ids.length,'duplicate reference ids');forbidden(d.references);
 if(d.source_distribution)assert(sameDist(d.source_distribution,distributions(d.references,'source_domain')),'source_distribution mismatch');if(d.query_family_distribution)assert(sameDist(d.query_family_distribution,distributions(d.references,'query_family')),'query_family_distribution mismatch');
 if(d.mode==='reference_discovery_debug'){assert(d.filters_applied&&Object.values(d.filters_applied).every(v=>v===false),'raw discovery filters must all remain false')}
 return true;
}
return {CONTRACT,validate,distributions};
});