#!/usr/bin/env node
'use strict';
const assert = require('assert');
const R = require('./reproduction-policy-v0_6b_1.js');
let pass=0;
function t(name,fn){try{fn();pass++;console.log('PASS ',name)}catch(e){console.error('FAIL ',name,'—',e.message);process.exitCode=1}}
const base={metadata:{name:'B1'},items:[{id:'x',palette:[{hex:'#112233',ratio:.5,lch:{L:.4,C:.1,H:20}}],observed_features:{meanLightness:.4},derived_quality_features:{visualWeight:.8},analysis_provenance:{analysis_source:'primary_image_url',feature_reliability:1,image_fetch_mode:'download',primary_error:null,cache_file:'a.img'},observation_error:null}]};
t('transport-only download/cache change is ignored',()=>{const b=JSON.parse(JSON.stringify(base));b.items[0].analysis_provenance.image_fetch_mode='cache';assert.equal(R.b1PhysicalHash(base),R.b1PhysicalHash(b))});
t('transport-only primary error text change is ignored',()=>{const b=JSON.parse(JSON.stringify(base));b.items[0].analysis_provenance.primary_error='OFFLINE_CACHE_MISS';assert.equal(R.b1PhysicalHash(base),R.b1PhysicalHash(b))});
t('palette numeric change is NOT ignored',()=>{const b=JSON.parse(JSON.stringify(base));b.items[0].palette[0].lch.L=.4001;assert.notEqual(R.b1PhysicalHash(base),R.b1PhysicalHash(b))});
t('observed feature change is NOT ignored',()=>{const b=JSON.parse(JSON.stringify(base));b.items[0].observed_features.meanLightness=.401;assert.notEqual(R.b1PhysicalHash(base),R.b1PhysicalHash(b))});
t('analysis source/reliability change is NOT ignored',()=>{const b=JSON.parse(JSON.stringify(base));b.items[0].analysis_provenance.feature_reliability=.85;assert.notEqual(R.b1PhysicalHash(base),R.b1PhysicalHash(b))});
if(!process.exitCode)console.log(`\n${pass}/5 ReproductionPolicy contract tests PASS.`);
