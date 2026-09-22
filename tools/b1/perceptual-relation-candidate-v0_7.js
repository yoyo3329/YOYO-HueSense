'use strict';
function cls3(x,p){if(x<=p.similarMax)return 'similar';if(x>=p.differentMin)return 'different';return 'similar_or_partial'}
function toneRule(l,c,rule){
  if(rule==='CONSENSUS_AXES'){if(l==='similar'&&c==='similar')return 'similar';if(l==='different'&&c==='different')return 'different';return 'similar_or_partial'}
  if(rule==='CONSERVATIVE_DIFFERENT'){if(l==='different'||c==='different')return 'different';if(l==='similar'&&c==='similar')return 'similar';return 'similar_or_partial'}
  if(rule==='LIGHTNESS_DOMINANT'){if(l==='different')return 'different';if(l==='similar'&&c==='similar')return 'similar';return 'similar_or_partial'}
  if(rule==='CHROMA_DOMINANT'){if(c==='different')return 'different';if(l==='similar'&&c==='similar')return 'similar';return 'similar_or_partial'}
  throw new Error('unknown tone rule');
}
function predict(physical,config){
  const l=cls3(physical.delta_L,config.lightness),c=cls3(physical.delta_C,config.chroma);
  const ha=physical.min_chroma<config.hue.minChromaReliable?'low_chroma':'reliable';
  const hr=ha==='reliable'?(physical.circular_delta_H_degrees<=config.hue.sameOrAdjacentMaxDeltaH?'same_or_adjacent':'different'):'not_applicable';
  return {lightness_relation:l,chroma_relation:c,hue_applicability:ha,hue_relation:hr,tone_relation:toneRule(l,c,config.tone.rule),candidate_authority:'FROZEN_UNVALIDATED',production_authority:false};
}
module.exports={predict,toneRule,cls3};
