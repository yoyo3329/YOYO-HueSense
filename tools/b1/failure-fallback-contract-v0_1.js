(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.YOYOFailureFallback=factory();
})(typeof self!=='undefined'?self:this,function(){
'use strict';

const CONTRACT=Object.freeze({
  name:'YOYO Failure + Fallback Contract',
  version:'0.1.0',
  mode:'FAIL_OPEN_SHADOW_ONLY',
  production_authority:false,
  invariants:Object.freeze({
    can_block_search:false,
    can_mutate_search_results:false,
    can_change_palette:false,
    can_promote_candidate:false,
    can_tune_from_holdout:false,
    shadow_failure_must_be_contained:true,
    logging_failure_must_be_contained:true
  })
});

const CATEGORIES=Object.freeze({
  TIMEOUT:'TIMEOUT',
  INVALID_INPUT:'INVALID_INPUT',
  QUEUE_FULL:'QUEUE_FULL',
  SHADOW_ENGINE_FAILURE:'SHADOW_ENGINE_FAILURE',
  LOG_SINK_FAILURE:'LOG_SINK_FAILURE',
  UNKNOWN:'UNKNOWN'
});

function textOf(error){
  if(!error) return '';
  if(typeof error==='string') return error;
  return [error.code,error.name,error.message,String(error)].filter(Boolean).join(' ');
}

function classifyError(error,context={}){
  if(context.reason==='queue_full') return CATEGORIES.QUEUE_FULL;
  if(context.stage==='audit_log') return CATEGORIES.LOG_SINK_FAILURE;
  const t=textOf(error).toLowerCase();
  if(t.includes('timeout')||t.includes('timed out')||t.includes('abort')) return CATEGORIES.TIMEOUT;
  if(t.includes('invalid')||t.includes('schema')||t.includes('contract')) return CATEGORIES.INVALID_INPUT;
  if(context.stage==='shadow' || t.includes('shadow')) return CATEGORIES.SHADOW_ENGINE_FAILURE;
  return CATEGORIES.UNKNOWN;
}

function fallbackFor(category){
  switch(category){
    case CATEGORIES.QUEUE_FULL:
      return {shadow_action:'DROP_SHADOW_TASK',audit_action:'BEST_EFFORT_DIAGNOSTIC'};
    case CATEGORIES.TIMEOUT:
      return {shadow_action:'ABORT_OR_IGNORE_SHADOW_RESULT',audit_action:'BEST_EFFORT_DIAGNOSTIC'};
    case CATEGORIES.INVALID_INPUT:
      return {shadow_action:'SKIP_INVALID_SHADOW_INPUT',audit_action:'BEST_EFFORT_DIAGNOSTIC'};
    case CATEGORIES.LOG_SINK_FAILURE:
      return {shadow_action:'CONTINUE_WITHOUT_PERSISTED_LOG',audit_action:'DROP_LOG_EVENT'};
    case CATEGORIES.SHADOW_ENGINE_FAILURE:
      return {shadow_action:'SKIP_FAILED_SHADOW_RESULT',audit_action:'BEST_EFFORT_DIAGNOSTIC'};
    default:
      return {shadow_action:'SKIP_UNKNOWN_SHADOW_FAILURE',audit_action:'BEST_EFFORT_DIAGNOSTIC'};
  }
}

function resolveFailure(error,context={}){
  const category=classifyError(error,context);
  const fb=fallbackFor(category);
  return {
    contract_version:CONTRACT.version,
    category,
    production_action:'CONTINUE_UNCHANGED',
    can_block_search:false,
    can_change_palette:false,
    can_promote_candidate:false,
    can_tune_from_holdout:false,
    ...fb,
    reason_code:context.reason||null,
    stage:context.stage||null
  };
}

function protectProduction(productionValue,error,context={},diagnosticSink){
  const decision=resolveFailure(error,context);
  try{
    if(typeof diagnosticSink==='function') diagnosticSink(decision);
  }catch(_){ /* diagnostics must never escape into production */ }
  return productionValue;
}

function assertSafeDecision(decision){
  if(!decision||decision.production_action!=='CONTINUE_UNCHANGED') throw new Error('Unsafe production fallback action');
  if(decision.can_block_search!==false) throw new Error('Fallback may not block search');
  if(decision.can_change_palette!==false) throw new Error('Fallback may not change palette');
  if(decision.can_promote_candidate!==false) throw new Error('Fallback may not promote candidate');
  if(decision.can_tune_from_holdout!==false) throw new Error('Fallback may not tune from holdout');
  return true;
}

return {CONTRACT,CATEGORIES,classifyError,resolveFailure,protectProduction,assertSafeDecision};
});
