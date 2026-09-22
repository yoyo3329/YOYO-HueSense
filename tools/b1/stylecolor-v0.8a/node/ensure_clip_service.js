'use strict';
const fs=require('fs'),path=require('path');
const {spawn}=require('child_process');
const {health}=require('./clip_bridge');

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 const current=await health(); if(current.available){console.log(`CLIP_READY model=${current.model||'?'} device=${current.device||'?'}`);return;}
 if(process.platform!=='win32'){console.log('CLIP_NOT_RUNNING_NONWINDOWS_SKIP_AUTOSTART');return;}
 const roots=[process.env.YOYO_CLIP_SERVICE_DIR,'C:\\clip-service','C:\\xampp\\htdocs\\color-search-test\\tools\\clip-service'].filter(Boolean);
 let service=null;
 for(const r of roots){const p=path.join(r,'clip_service.py');if(fs.existsSync(p)){service={root:r,script:p};break;}}
 if(!service){console.log('CLIP_SERVICE_NOT_FOUND_DEGRADED_MODE');return;}
 const pyCandidates=[process.env.YOYO_CLIP_PYTHON,path.join(service.root,'venv','Scripts','python.exe'),path.join(service.root,'.venv','Scripts','python.exe'),'python'].filter(Boolean);
 let py=pyCandidates.find(x=>x==='python'||fs.existsSync(x)); if(!py){console.log('CLIP_PYTHON_NOT_FOUND_DEGRADED_MODE');return;}
 const log=fs.openSync(path.join(service.root,'yoyo_stylecolor_clip_autostart.log'),'a');
 try{
   const child=spawn(py,[service.script],{cwd:service.root,detached:true,stdio:['ignore',log,log],windowsHide:true});child.unref();
   console.log(`CLIP_AUTOSTART pid=${child.pid} python=${py}`);
 }catch(e){console.log('CLIP_AUTOSTART_FAILED '+e.message);return;}
 for(let i=0;i<45;i++){await sleep(2000);const h=await health();if(h.available){console.log(`CLIP_READY_AFTER_AUTOSTART model=${h.model||'?'} device=${h.device||'?'}`);return;}}
 console.log('CLIP_AUTOSTART_TIMEOUT_DEGRADED_MODE');
}
main().catch(e=>{console.error(e);process.exit(0)});
