'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const B=__dirname;
function read(f){return JSON.parse(fs.readFileSync(path.isAbsolute(f)?f:path.join(B,f),'utf8'))}
function write(f,x){const p=path.isAbsolute(f)?f:path.join(B,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+'\n')}
function sha(x){return crypto.createHash('sha256').update(Buffer.isBuffer(x)?x:String(x)).digest('hex')}
function fileSha(f){return sha(fs.readFileSync(path.isAbsolute(f)?f:path.join(B,f)))}
function pairKey(a,b){return [a,b].sort().join('||')}
function getPairFromCase(c){return pairKey(c.a?.mode_id||c.a?.id,c.b?.mode_id||c.b?.id)}
function edgeMap(graph){return new Map((graph.edges||[]).map(e=>[e.pair_key,e]))}
function priorPairUniverse(){
  const out=new Set();
  const files=['calibration_set_v0_human.json','gold_train_candidate_v0_4.json','gold_holdout_queue_v0_5.json','gold_holdout_human_v0_5_2.json'];
  for(const f of files){
    const p=path.join(B,f); if(!fs.existsSync(p))continue;
    const d=read(f); for(const c of d.cases||[]){try{out.add(getPairFromCase(c))}catch{}}
  }
  return out;
}
function normStats(edges,keys){const s={};for(const k of keys){const a=edges.map(e=>Number(e.coverage_features?.[k]??e.physical_relations?.[k])).filter(Number.isFinite);s[k]={min:Math.min(...a),max:Math.max(...a)}}return s}
function vec(e,s,keys){return keys.map(k=>{const v=Number(e.coverage_features?.[k]??e.physical_relations?.[k]);const q=s[k];return q.max===q.min?0:(v-q.min)/(q.max-q.min)})}
function dist(a,b){let z=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];z+=d*d}return Math.sqrt(z)}
function hashScore(s){return parseInt(sha(s).slice(0,12),16)/0xffffffffffff}
function spaceFillSelect(candidates,count,seed,maxModeAppear=3,anchorVectors=[]){
  const keys=['delta_L','delta_C','hue_chord','min_chroma','max_chroma'];
  const stats=normStats(candidates,keys);
  const rows=candidates.map(e=>({e,v:vec(e,stats,keys),h:hashScore(seed+'|'+e.pair_key)}));
  rows.sort((a,b)=>a.h-b.h);
  const selected=[],used=new Map();
  function ok(r){return [r.e.a.id,r.e.b.id].every(id=>(used.get(id)||0)<maxModeAppear)}
  while(selected.length<count){
    let best=null,bestScore=-1;
    for(const r of rows){
      if(r.pick||!ok(r))continue;
      const against=[...anchorVectors,...selected.map(x=>x.v)];
      const minD=against.length?Math.min(...against.map(v=>dist(r.v,v))):1;
      const score=minD + r.h*1e-9;
      if(score>bestScore){bestScore=score;best=r}
    }
    if(!best)break;
    best.pick=true;selected.push(best);for(const id of [best.e.a.id,best.e.b.id])used.set(id,(used.get(id)||0)+1);
  }
  return {selected,stats,keys};
}
function publicCase(caseId,e){return {case_id:caseId,source_style:'Y2K',a:{mode_id:e.a.id,hex:e.a.hex},b:{mode_id:e.b.id,hex:e.b.hex},pair_key:e.pair_key}}
function median(a){if(!a.length)return null;const b=[...a].sort((x,y)=>x-y),m=Math.floor(b.length/2);return b.length%2?b[m]:(b[m-1]+b[m])/2}
module.exports={B,read,write,sha,fileSha,pairKey,getPairFromCase,edgeMap,priorPairUniverse,spaceFillSelect,publicCase,median};
