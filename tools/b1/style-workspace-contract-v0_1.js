(function(root,factory){
 if(typeof module==='object'&&module.exports)module.exports=factory();else root.YOYOStyleWorkspaceContract=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';
const CONTRACT=Object.freeze({name:'YOYO Generic Style Workspace Contract',version:'0.1.0',style_agnostic:true,runtime_authority:'OFFLINE_RND_ONLY'});
function assert(c,m){if(!c)throw new Error(m)}
function safeId(s){return typeof s==='string'&&/^[a-z0-9][a-z0-9_-]{1,63}$/.test(s)}
function validate(w,{allowDataPending=false}={}){
 assert(w&&typeof w==='object','workspace must be object');
 assert(w?.contract?.name===CONTRACT.name&&w?.contract?.version===CONTRACT.version,'workspace contract mismatch');
 assert(safeId(w?.style?.id),'invalid style.id');
 assert(typeof w?.style?.display_name==='string'&&w.style.display_name.trim(),'missing style.display_name');
 assert(w?.authority?.mode==='OFFLINE_RND_ONLY','workspace must be OFFLINE_RND_ONLY');
 assert(w?.authority?.can_modify_live_runtime===false,'workspace cannot modify live runtime');
 assert(w?.authority?.can_promote_candidate_semantics===false,'workspace cannot promote candidate semantics');
 assert(typeof w?.paths?.artifact_dir==='string'&&w.paths.artifact_dir,'missing artifact_dir');
 const pending=w?.data_status==='DATA_PENDING';
 if(!(allowDataPending&&pending)){
   assert(typeof w?.paths?.evaluation_set==='string'&&w.paths.evaluation_set,'missing evaluation_set');
   assert(typeof w?.paths?.cache_dir==='string'&&w.paths.cache_dir,'missing cache_dir');
 }
 return true;
}
return {CONTRACT,validate};
});
