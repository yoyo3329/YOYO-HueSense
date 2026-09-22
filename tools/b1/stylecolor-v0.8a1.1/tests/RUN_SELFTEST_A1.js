 'use strict';
const {spawnSync}=require('child_process');const path=require('path');
const root=path.resolve(__dirname,'..');
function run(cmd,args){const x=spawnSync(cmd,args,{encoding:'utf8',stdio:'inherit'});if(x.status!==0)process.exit(x.status||1);}
run(process.execPath,[path.join(root,'tests','static_contract_a1.test.js')]);
const py=process.argv[2]||'python';
run(py,[path.join(root,'tests','python_synthetic_a1.py')]);
console.log('\nPASS - v0.8-A.1 self-tests.');
