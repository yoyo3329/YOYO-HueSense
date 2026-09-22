#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');

const CONTRACT=Object.freeze({
  name:'YOYO Runtime Audit Log',
  version:'0.1.0',
  write_mode:'ASYNC_BUFFERED_NDJSON',
  privacy:Object.freeze({
    raw_user_input_stored:false,
    image_bytes_stored:false,
    image_urls_stored:false,
    palette_payload_stored:false,
    allowlisted_fields_only:true
  })
});

const ALLOWED=new Set([
  'event_version','timestamp','audit_id','run_id','stage','status','reason_code',
  'elapsed_ms','sampled','shadow_mode','queue_depth','source_profile_id',
  'source_profile_version','concept_fingerprint','diagnostics'
]);

function scalar(v){
  return v===null||typeof v==='string'||typeof v==='number'||typeof v==='boolean';
}
function cleanDiagnostics(obj){
  if(!obj||typeof obj!=='object'||Array.isArray(obj)) return null;
  const out={}; let count=0;
  for(const [k,v] of Object.entries(obj)){
    if(count>=12) break;
    if(!/^[a-zA-Z0-9_.-]{1,64}$/.test(k)) continue;
    if(scalar(v)) { out[k]=typeof v==='string'?v.slice(0,160):v; count++; }
  }
  return out;
}
function sanitizeEvent(event={}){
  const out={event_version:CONTRACT.version,timestamp:new Date().toISOString()};
  for(const [k,v] of Object.entries(event)){
    if(!ALLOWED.has(k)) continue;
    if(k==='diagnostics') { const d=cleanDiagnostics(v); if(d) out.diagnostics=d; continue; }
    if(scalar(v)) out[k]=typeof v==='string'?v.slice(0,240):v;
  }
  return out;
}

function createRuntimeAuditLogger(options={}){
  const dir=path.resolve(options.dir||path.join(process.cwd(),'runtime_audit'));
  const prefix=String(options.prefix||'shadow-audit').replace(/[^a-zA-Z0-9_-]/g,'_');
  const flushIntervalMs=Math.max(10,Number(options.flushIntervalMs||500));
  const batchSize=Math.max(1,Number(options.batchSize||20));
  const maxQueue=Math.max(batchSize,Number(options.maxQueue||1000));
  const maxFileBytes=Math.max(1024,Number(options.maxFileBytes||2*1024*1024));
  const maxFiles=Math.max(1,Number(options.maxFiles||5));
  let queue=[]; let timer=null; let writing=Promise.resolve(); let closed=false; let dropped=0; let written=0; let seq=0;
  fs.mkdirSync(dir,{recursive:true});

  function dateKey(){return new Date().toISOString().slice(0,10);}
  function filename(){return path.join(dir,`${prefix}-${dateKey()}-${String(seq).padStart(3,'0')}.ndjson`);}
  function chooseFile(addBytes){
    let file=filename();
    let size=0; try{size=fs.statSync(file).size}catch(_){}
    if(size+addBytes>maxFileBytes){seq++;file=filename();}
    return file;
  }
  function prune(){
    const files=fs.readdirSync(dir).filter(x=>x.startsWith(prefix+'-')&&x.endsWith('.ndjson')).sort();
    const remove=files.slice(0,Math.max(0,files.length-maxFiles));
    for(const f of remove){try{fs.unlinkSync(path.join(dir,f))}catch(_){} }
  }
  function schedule(){
    if(timer||closed) return;
    timer=setTimeout(()=>{timer=null;flush().catch(()=>{});},flushIntervalMs);
    if(typeof timer.unref==='function') timer.unref();
  }
  function enqueue(event){
    if(closed) return false;
    if(queue.length>=maxQueue){dropped++;return false;}
    queue.push(sanitizeEvent(event));
    if(queue.length>=batchSize) setImmediate(()=>flush().catch(()=>{})); else schedule();
    return true;
  }
  async function flush(){
    if(timer){clearTimeout(timer);timer=null;}
    if(!queue.length) return;
    const batch=queue.splice(0,batchSize);
    const text=batch.map(x=>JSON.stringify(x)).join('\n')+'\n';
    writing=writing.then(async()=>{
      const file=chooseFile(Buffer.byteLength(text));
      await fs.promises.appendFile(file,text,'utf8');
      written+=batch.length; prune();
    }).catch(()=>{dropped+=batch.length;});
    await writing;
    if(queue.length) setImmediate(()=>flush().catch(()=>{}));
  }
  async function close(){
    closed=true;
    if(timer){clearTimeout(timer);timer=null;}
    while(queue.length) await flush();
    await writing;
  }
  function stats(){return {queued:queue.length,written,dropped,closed,dir,prefix};}
  return {contract:CONTRACT,enqueue,flush,close,stats,sanitizeEvent};
}

module.exports={CONTRACT,sanitizeEvent,createRuntimeAuditLogger};
