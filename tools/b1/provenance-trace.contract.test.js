#!/usr/bin/env node
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const P=require('./provenance-trace-v0_1.js');
let pass=0;function test(n,f){try{f();pass++;console.log('PASS ',n)}catch(e){console.error('FAIL ',n);throw e}}
const d=fs.mkdtempSync(path.join(os.tmpdir(),'yoyo-prov-'));fs.writeFileSync(path.join(d,'a.txt'),'abc');fs.writeFileSync(path.join(d,'b.txt'),'xyz');
test('fingerprintText is deterministic',()=>assert.equal(P.fingerprintText(' Y2K '),P.fingerprintText('y2k')));
test('hashFile uses SHA-256',()=>assert.equal(P.hashFile(path.join(d,'a.txt')).sha256.length,64));
test('manifest fingerprint is order-independent',()=>{const a=P.hashFiles(d,['a.txt','b.txt']);const b=P.hashFiles(d,['b.txt','a.txt']);assert.equal(P.stableManifestFingerprint(a),P.stableManifestFingerprint(b))});
test('trace records no raw user input',()=>{const t=P.buildTrace({baseDir:d,files:['a.txt'],concept_fingerprint:P.fingerprintText('Y2K')});assert.equal(t.run.raw_user_input_stored,false);assert.equal('raw_user_input' in t.run,false)});
test('missing files are explicit, not silently ignored',()=>{const t=P.buildTrace({baseDir:d,files:['missing.txt']});assert.equal(t.files[0].missing,true)});
fs.rmSync(d,{recursive:true,force:true});console.log(`\n${pass}/5 ProvenanceTrace contract tests PASS.`);
