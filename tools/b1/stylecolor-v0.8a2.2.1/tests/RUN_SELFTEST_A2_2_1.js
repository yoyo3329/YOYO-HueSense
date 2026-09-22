'use strict';
const {spawnSync}=require('child_process'),path=require('path');
const r=spawnSync(process.execPath,[path.join(__dirname,'static_contract_a221.test.js')],{stdio:'inherit'});
if(r.status!==0)process.exit(r.status||1);
console.log('\nPASS - v0.8-A.2.2.1 evidence provenance + authority self-tests.');
