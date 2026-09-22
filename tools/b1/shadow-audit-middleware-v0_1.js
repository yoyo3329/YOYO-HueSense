(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.YOYOShadowAuditMiddleware=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';

const CONTRACT=Object.freeze({
  name:'YOYO Shadow Audit Middleware',
  version:'0.1.0',
  mode:'SHADOW_ONLY_NON_BLOCKING',
  production_decision_authority:false,
  invariants:Object.freeze({
    scheduling_is_deferred:true,
    queue_is_bounded:true,
    shadow_timeout_is_bounded:true,
    sink_failure_is_contained:true,
    can_block_search:false,
    can_mutate_search_results:false,
    can_change_palette:false
  })
});

function defaultNow(){
  if(typeof performance!=='undefined'&&typeof performance.now==='function') return performance.now();
  return Date.now();
}
function defaultScheduler(fn){setTimeout(fn,0);}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function withTimeout(promise,ms){
  let t;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=>{t=setTimeout(()=>reject(Object.assign(new Error('SHADOW_TIMEOUT'),{code:'SHADOW_TIMEOUT'})),ms);})
  ]).finally(()=>clearTimeout(t));
}
function limitedDiagnostics(result){
  const src=result&&typeof result==='object'&&result.audit_summary&&typeof result.audit_summary==='object'?result.audit_summary:null;
  if(!src) return null;
  const out={};let n=0;
  for(const [k,v] of Object.entries(src)){
    if(n>=10) break;
    if(!/^[a-zA-Z0-9_.-]{1,64}$/.test(k)) continue;
    if(v===null||['string','number','boolean'].includes(typeof v)){out[k]=typeof v==='string'?v.slice(0,120):v;n++;}
  }
  return out;
}

function createShadowAuditMiddleware(options={}){
  const sampleRate=Math.max(0,Math.min(1,Number(options.sampleRate??0.10)));
  const queueLimit=Math.max(1,Number(options.queueLimit??64));
  const concurrency=Math.max(1,Number(options.concurrency??2));
  const taskTimeoutMs=Math.max(1,Number(options.taskTimeoutMs??1200));
  const scheduler=typeof options.scheduler==='function'?options.scheduler:defaultScheduler;
  const random=typeof options.random==='function'?options.random:Math.random;
  const now=typeof options.now==='function'?options.now:defaultNow;
  const sink=options.sink||null;
  const queue=[];
  let active=0,scheduled=false,seq=0,closed=false;
  const s={observed:0,sampled:0,not_sampled:0,accepted:0,dropped_queue_full:0,completed:0,failed:0,timed_out:0,log_failures:0,max_queue_depth:0};

  function emit(event){
    try{
      if(!sink) return true;
      if(typeof sink==='function'){const r=sink(event);if(r&&typeof r.catch==='function')r.catch(()=>{s.log_failures++;});return true;}
      if(typeof sink.enqueue==='function'){const accepted=sink.enqueue(event);if(accepted===false)s.log_failures++;return accepted!==false;}
    }catch(_){s.log_failures++;return false;}
    return true;
  }

  function eventBase(job,status,extra={}){
    return {
      audit_id:job.audit_id,
      run_id:job.context.run_id||null,
      stage:job.context.stage||'shadow_relation_audit',
      status,
      sampled:true,
      shadow_mode:'SHADOW_ONLY',
      queue_depth:queue.length,
      source_profile_id:job.context.source_profile_id||null,
      source_profile_version:job.context.source_profile_version||null,
      concept_fingerprint:job.context.concept_fingerprint||null,
      ...extra
    };
  }

  async function runJob(job){
    active++;
    const started=now();
    try{
      const result=await withTimeout(Promise.resolve().then(()=>job.shadowTask(job.context)),taskTimeoutMs);
      s.completed++;
      emit(eventBase(job,'SHADOW_OK',{elapsed_ms:Math.max(0,now()-started),diagnostics:limitedDiagnostics(result)}));
    }catch(error){
      const timed=String(error?.code||error?.message||'').includes('SHADOW_TIMEOUT');
      if(timed)s.timed_out++;else s.failed++;
      emit(eventBase(job,timed?'SHADOW_TIMEOUT':'SHADOW_FAILURE',{
        elapsed_ms:Math.max(0,now()-started),
        reason_code:timed?'TIMEOUT':'SHADOW_ENGINE_FAILURE',
        diagnostics:{error_name:String(error?.name||'Error').slice(0,80)}
      }));
    }finally{
      active--;
      schedulePump();
    }
  }

  function pump(){
    scheduled=false;
    if(closed&&queue.length===0) return;
    while(active<concurrency&&queue.length){const job=queue.shift();runJob(job);}
    if(queue.length&&active<concurrency)schedulePump();
  }
  function schedulePump(){
    if(scheduled||!queue.length) return;
    scheduled=true;
    scheduler(pump);
  }

  function observe(context={},shadowTask){
    s.observed++;
    const audit_id=context.audit_id||`shadow_${Date.now().toString(36)}_${(++seq).toString(36)}`;
    if(closed) return {accepted:false,sampled:false,audit_id,reason:'closed',mode:'SHADOW_ONLY'};
    const sampled=sampleRate>=1||random()<sampleRate;
    if(!sampled){s.not_sampled++;return {accepted:false,sampled:false,audit_id,reason:'not_sampled',mode:'SHADOW_ONLY'};}
    s.sampled++;
    if(typeof shadowTask!=='function'){
      emit({audit_id,stage:context.stage||'shadow_relation_audit',status:'SHADOW_SKIPPED_INVALID_TASK',sampled:true,shadow_mode:'SHADOW_ONLY',reason_code:'INVALID_INPUT'});
      return {accepted:false,sampled:true,audit_id,reason:'invalid_task',mode:'SHADOW_ONLY'};
    }
    if(queue.length+active>=queueLimit){
      s.dropped_queue_full++;
      emit({audit_id,stage:context.stage||'shadow_relation_audit',status:'SHADOW_DROPPED_QUEUE_FULL',sampled:true,shadow_mode:'SHADOW_ONLY',reason_code:'QUEUE_FULL',queue_depth:queue.length});
      return {accepted:false,sampled:true,audit_id,reason:'queue_full',mode:'SHADOW_ONLY'};
    }
    queue.push({audit_id,context:{...context,audit_id},shadowTask});
    s.accepted++; s.max_queue_depth=Math.max(s.max_queue_depth,queue.length+active);
    schedulePump();
    return {accepted:true,sampled:true,audit_id,reason:null,mode:'SHADOW_ONLY'};
  }

  async function drain(timeoutMs=10000){
    const start=Date.now();
    while(queue.length||active||scheduled){
      if(Date.now()-start>timeoutMs) throw new Error('Shadow middleware drain timeout');
      await sleep(5);
    }
    if(sink&&typeof sink.flush==='function'){try{await sink.flush();}catch(_){s.log_failures++;}}
    return stats();
  }
  async function close(){closed=true;await drain();if(sink&&typeof sink.close==='function'){try{await sink.close();}catch(_){s.log_failures++;}}return stats();}
  function stats(){return {...s,queue_depth:queue.length,active,closed,config:{sampleRate,queueLimit,concurrency,taskTimeoutMs}};}

  return {contract:CONTRACT,observe,drain,close,stats};
}

return {CONTRACT,createShadowAuditMiddleware};
});
