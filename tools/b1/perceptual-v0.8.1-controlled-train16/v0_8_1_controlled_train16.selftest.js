'use strict';

const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');

const root=process.argv[2]||__dirname;
const out=path.join(__dirname,'_selftest_output');
fs.rmSync(out,{recursive:true,force:true}); fs.mkdirSync(out,{recursive:true});

let p=spawnSync(process.execPath,[path.join(__dirname,'prepare_v0_8_1_controlled_train16.js'),root,out],{encoding:'utf8'});
process.stdout.write(p.stdout||''); process.stderr.write(p.stderr||'');
if(p.status!==0)process.exit(p.status||1);

p=spawnSync(process.execPath,[path.join(__dirname,'build_v0_8_1_controlled_blind_lab.js'),
 path.join(out,'v0_8_1_controlled_train_queue.json'),
 path.join(out,'v0_8_1_controlled_chroma_blind_lab.html')],{encoding:'utf8'});
process.stdout.write(p.stdout||''); process.stderr.write(p.stderr||'');
if(p.status!==0)process.exit(p.status||1);

p=spawnSync(process.execPath,[path.join(__dirname,'verify_generated_v0_8_1_controlled.js'),out],{encoding:'utf8'});
process.stdout.write(p.stdout||''); process.stderr.write(p.stderr||'');
if(p.status!==0)process.exit(p.status||1);

const html=fs.readFileSync(path.join(out,'v0_8_1_controlled_chroma_blind_lab.html'),'utf8');
let pass=0,total=0;
function ck(cond,msg){total++;console.log((cond?'PASS  ':'FAIL  ')+msg);if(cond)pass++;}

ck(html.includes('background:#777777')||html.includes('background:#777'), 'controlled UI uses neutral gray surround');
ck(!/box-shadow\s*:[^n]*[1-9]/i.test(html), 'stimulus has no visual shadow');
ck(html.includes("color-gamut: p3"), 'display gamut capability captured');
ck(html.includes('lightness_interference'), 'optional lightness-interference flag exported');
ck(html.includes('initial_adaptation_ms'), 'adaptation interval encoded');
ck(html.includes('inter_stimulus_ms'), 'inter-stimulus interval encoded');

console.log(`\n${pass}/${total} controlled UI static checks ${pass===total?'PASS':'FAIL'}.`);
process.exit(pass===total?0:1);
