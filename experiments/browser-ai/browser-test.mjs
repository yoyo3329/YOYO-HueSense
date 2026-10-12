import {BrowserAIProvider} from './provider.mjs';
import {MODEL} from './model-config.mjs';
import {decodeRLE,maskToLogits,requireThat} from './core.mjs';
const log=document.getElementById('testlog');let report;
const render=()=>{log.textContent=JSON.stringify(report,null,2);};
function fixture(width,height){const data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const inside=x>width*.25&&x<width*.75&&y>height*.25&&y<height*.75;data.set(inside?[210,45,60,255]:[220,225,230,255],(y*width+x)*4);}return{width,height,data};}
document.getElementById('start').onclick=async()=>{
  document.getElementById('start').disabled=true;report={kind:'REAL_BROWSER_WEBGPU',started:new Date().toISOString(),model:MODEL.id,revision:MODEL.revision,runtime:MODEL.runtime,userAgent:navigator.userAgent,checks:[],status:'RUNNING',qualityValidated:false};
  const provider=new BrowserAIProvider({onProgress:p=>{report.progress=p;render();}}),check=(name,ok)=>{requireThat(ok,'TEST',name);report.checks.push({name,status:'PASS'});render();};
  try {
    await provider.init();check('Worker + verified models + WebGPU session initialization',true);
    const image=fixture(384,192);const encoded=await provider.setImage(image);check('First image encoding',encoded.encodes===1&&!encoded.cacheHit);
    const a=await provider.predict({points:[{x:.5,y:.5,label:1}],box:null});check('Positive point; row-major RLE dimensions',decodeRLE(a.rle).length===384*192);
    const b=await provider.predict({points:[{x:.5,y:.5,label:1},{x:.1,y:.1,label:0}],box:[.2,.2,.8,.8],mask:a.lowRes});check('Negative point + box + low-res mask refinement without re-encode',b.encodes===1);
    await provider.predict({points:[{x:.5,y:.5,label:1}],mask:maskToLogits(b.rle)});check('Binary mask correction feedback',true);
    const same=await provider.setImage(image);check('Same pixels hit embedding cache',same.cacheHit&&same.encodes===1);
    const stale=provider.predict({points:[{x:.4,y:.4,label:1}]}).then(()=>false,e=>e.code==='STALE');
    const newer=provider.predict({points:[{x:.6,y:.5,label:1}]});check('Superseded prompt promise rejects STALE',await stale);await newer;
    const old=provider.predict({points:[{x:.5,y:.5,label:1}]}).then(()=>false,e=>e.code==='STALE');
    const next=await provider.setImage(fixture(192,384));check('Image switch rejects old prediction',await old);check('New portrait image re-encodes',next.encodes===2);
    const c=await provider.predict({points:[{x:.5,y:.5,label:1}]});check('Portrait mask coordinates and dimensions',c.rle.width===192&&c.rle.height===384);
    report.status='PASS';report.note='Real model execution on synthetic inputs only. Not a semantic accuracy or PyTorch parity result.';
  }catch(e){report.status='FAIL';report.error={code:e.code??'ERROR',message:e.message};}
  finally{provider.dispose();report.finished=new Date().toISOString();delete report.progress;render();document.getElementById('start').disabled=false;document.getElementById('download').disabled=false;}
};
document.getElementById('download').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='browser-ai-real-test.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
