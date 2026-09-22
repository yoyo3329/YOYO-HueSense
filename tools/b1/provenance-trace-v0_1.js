#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const CONTRACT=Object.freeze({
  name:'YOYO Provenance Trace',version:'0.1.0',hash:'SHA-256',
  raw_user_input_stored:false,style_agnostic:true
});
function sha256Buffer(buf){return crypto.createHash('sha256').update(buf).digest('hex')}
function fingerprintText(text){return sha256Buffer(Buffer.from(String(text??'').normalize('NFKC').trim().toLowerCase(),'utf8'))}
function hashFile(file){const p=path.resolve(file);const buf=fs.readFileSync(p);return {file:path.basename(p),bytes:buf.length,sha256:sha256Buffer(buf)}}
function hashFiles(baseDir,files){return [...files].sort().map(f=>{const p=path.resolve(baseDir,f);if(!fs.existsSync(p))return {file:f,missing:true};const buf=fs.readFileSync(p);return {file:f.replace(/\\/g,'/'),bytes:buf.length,sha256:sha256Buffer(buf)}})}
function stableManifestFingerprint(rows){
  const canonical=rows.map(r=>({file:r.file,bytes:r.bytes??null,sha256:r.sha256??null,missing:!!r.missing})).sort((a,b)=>a.file.localeCompare(b.file));
  return sha256Buffer(Buffer.from(JSON.stringify(canonical),'utf8'));
}
function buildTrace(opts={}){
  const rows=hashFiles(opts.baseDir||process.cwd(),opts.files||[]);
  return {
    metadata:{name:CONTRACT.name,version:CONTRACT.version,created_at:opts.created_at||new Date().toISOString(),hash_algorithm:'SHA-256'},
    run:{run_id:opts.run_id||null,stage:opts.stage||null,concept_fingerprint:opts.concept_fingerprint||null,raw_user_input_stored:false,node_version:process.version,platform:process.platform,arch:process.arch},
    lineage:{pipeline_version:opts.pipeline_version||null,profile_contract_version:opts.profile_contract_version||null,validation_scope:opts.validation_scope||null,universality_status:opts.universality_status||'unvalidated'},
    files:rows,
    manifest_fingerprint:stableManifestFingerprint(rows)
  };
}
module.exports={CONTRACT,sha256Buffer,fingerprintText,hashFile,hashFiles,stableManifestFingerprint,buildTrace};
