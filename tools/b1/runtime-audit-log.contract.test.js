#!/usr/bin/env node
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const L=require('./runtime-audit-log-v0_1.js');
(async()=>{
 let pass=0; const tests=[];
 function test(name,fn){tests.push([name,fn])}
 test('privacy contract forbids raw payload storage',()=>{assert.equal(L.CONTRACT.privacy.raw_user_input_stored,false);assert.equal(L.CONTRACT.privacy.image_urls_stored,false)});
 test('sanitizer removes raw query/image/palette fields',()=>{const s=L.sanitizeEvent({audit_id:'a',raw_user_input:'secret',image_url:'http://x',palette:['#fff'],diagnostics:{nodes:53}});assert.equal(s.audit_id,'a');assert.equal('raw_user_input' in s,false);assert.equal('image_url' in s,false);assert.equal('palette' in s,false);assert.equal(s.diagnostics.nodes,53)});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yoyo-audit-'));
 const log=L.createRuntimeAuditLogger({dir,batchSize:2,flushIntervalMs:20,maxFileBytes:4096,maxFiles:3});
 test('enqueue is bounded and returns without synchronous disk requirement',()=>{assert.equal(log.enqueue({audit_id:'1',stage:'shadow',status:'OK'}),true);assert.equal(log.enqueue({audit_id:'2',stage:'shadow',status:'OK'}),true)});
 test('close flushes NDJSON',async()=>{await log.close();const files=fs.readdirSync(dir).filter(f=>f.endsWith('.ndjson'));assert(files.length>=1);const rows=fs.readFileSync(path.join(dir,files[0]),'utf8').trim().split(/\n/).map(JSON.parse);assert.equal(rows.length,2);assert.equal(rows[0].audit_id,'1')});
 test('written event contains no raw payload',()=>{const file=path.join(dir,fs.readdirSync(dir).find(f=>f.endsWith('.ndjson')));const t=fs.readFileSync(file,'utf8');assert(!t.includes('secret'));assert(!t.includes('http://x'))});
 for(const [n,f] of tests){try{await f();pass++;console.log('PASS ',n)}catch(e){console.error('FAIL ',n);throw e}}
 fs.rmSync(dir,{recursive:true,force:true});
 console.log(`\n${pass}/${tests.length} RuntimeAuditLog contract tests PASS.`);
})().catch(e=>{console.error(e.stack||e);process.exit(1)});
