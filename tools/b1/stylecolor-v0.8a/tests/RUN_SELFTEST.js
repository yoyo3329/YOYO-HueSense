'use strict';
const {spawnSync}=require('child_process'),path=require('path');
const root=path.resolve(__dirname,'..'); const py=process.argv[2]||(process.platform==='win32'?'python':'python3');
const tasks=[
 ['node',[path.join(__dirname,'static_contract.test.js')]],
 [py,[path.join(__dirname,'python_synthetic_test.py')]],
 ['node',[path.join(__dirname,'test_clip_bridge_mock.js')]]
];
let ok=true;for(const [exe,args] of tasks){const cp=spawnSync(exe,args,{stdio:'inherit',timeout:90000});if(cp.status!==0){ok=false;break;}}
console.log(ok?'\nPASS: v0.8-A self-tests complete.':'\nFAIL: v0.8-A self-test failed.');process.exit(ok?0:1);
