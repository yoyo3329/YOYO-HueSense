import {BrowserAIProvider} from './provider.mjs';
import {MODEL} from './model-config.mjs';
import {dimensions,decodeRLE,encodeRLE,maskToLogits,requireThat} from './core.mjs';
const $=id=>document.getElementById(id), canvas=$('canvas'),ctx=canvas.getContext('2d');
let image=null,points=[],box=null,mask=null,lowRes=null,drag=null,revision=0,imageSerial=0,encoded=false;
const provider=new BrowserAIProvider({onProgress:p=>{
  if(p.capabilities)$('capabilities').textContent=JSON.stringify(p.capabilities,null,2);
  if(p.total){$('progress').value=p.loaded/p.total;$('status').textContent=`${p.stage==='verify'?'校驗':'下載'} ${p.file}：${(p.loaded/1e6).toFixed(1)} / ${(p.total/1e6).toFixed(1)} MB`;}
  else $('status').textContent=({session:'建立模型 session…',encode:'編碼圖片特徵…',decode:'解碼遮罩…',capabilities:'WebGPU adapter 已找到；尚待模型載入。'})[p.stage]??p.stage;
}});
$('identity').textContent=JSON.stringify({model:MODEL.id,revision:MODEL.revision,precision:MODEL.precision,runtime:MODEL.runtime,license:MODEL.license},null,2);
function error(e){if(e.code==='STALE')return;$('status').textContent=`${e.code??'ERROR'}：${e.message}`;if(!provider.ready){encoded=false;$('file').disabled=true;$('load').disabled=false;buttons();}}
function buttons(){$('run').disabled=!encoded;$('clear').disabled=!image;$('export').disabled=!mask;}
function changed(){revision++;provider.invalidate('predict');}
function resetPrompts(){points=[];box=null;mask=null;lowRes=null;drag=null;changed();buttons();draw();}
function draw(){if(!image)return;ctx.putImageData(image,0,0);
  if(mask){const overlay=ctx.createImageData(image.width,image.height);for(let i=0;i<mask.length;i++)if(mask[i])overlay.data.set([139,100,220,105],i*4);const c=document.createElement('canvas');c.width=image.width;c.height=image.height;c.getContext('2d').putImageData(overlay,0,0);ctx.drawImage(c,0,0);}
  const scale=Math.max(1,image.width/700);ctx.lineWidth=2*scale;
  for(const p of points){ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,5*scale,0,Math.PI*2);ctx.fillStyle=p.label?'#bce94e':'#f46d72';ctx.fill();ctx.strokeStyle='#232521';ctx.stroke();}
  if(box){ctx.strokeStyle='#d9ef81';ctx.strokeRect(box[0]*canvas.width,box[1]*canvas.height,(box[2]-box[0])*canvas.width,(box[3]-box[1])*canvas.height);}
}
$('load').onclick=async()=>{try{$('load').disabled=true;$('status').textContent='偵測 Worker WebGPU…';await provider.init();$('status').textContent='模型已載入。請選擇圖片。';$('file').disabled=false;}catch(e){error(e);$('load').disabled=false;}};
$('stop').onclick=()=>{imageSerial++;provider.reset();encoded=false;image=null;resetPrompts();canvas.hidden=true;$('empty').hidden=false;$('file').value='';$('file').disabled=true;$('load').disabled=false;$('progress').value=0;$('status').textContent='模型與圖片特徵已釋放。';};
$('file').onchange=async()=>{
  const ticket=++imageSerial,file=$('file').files[0];encoded=false;image=null;resetPrompts();canvas.hidden=true;$('empty').hidden=false;
  try{
    await provider.clearImage();if(!file||ticket!==imageSerial)return;
    requireThat(['image/jpeg','image/png'].includes(file.type)&&file.size<=20*1024*1024,'IMAGE_FILE','僅接受最多 20 MB 的 JPG／PNG。');
    const bitmap=await createImageBitmap(file);
    if(ticket!==imageSerial){bitmap.close();return;}
    try{dimensions(bitmap.width,bitmap.height);const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);image=ctx.getImageData(0,0,canvas.width,canvas.height);}finally{bitmap.close();}
    canvas.hidden=false;$('empty').hidden=true;draw();const result=await provider.setImage(image);if(ticket!==imageSerial)return;
    encoded=true;buttons();$('metrics').textContent=`圖片編碼次數：${result.encodes} · ${image.width} × ${image.height}`;$('status').textContent='特徵已快取。請加點或框選。';
  }catch(e){if(ticket===imageSerial)error(e);}
};
function position(e){const r=canvas.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};}
function brush(p){if(!mask)return;const radius=Number($('brush').value),cx=p.x*image.width,cy=p.y*image.height,value=$('mode').value==='brush-add'?1:0;
  for(let y=Math.max(0,Math.floor(cy-radius));y<Math.min(image.height,cy+radius);y++)for(let x=Math.max(0,Math.floor(cx-radius));x<Math.min(image.width,cx+radius);x++)if((x-cx)**2+(y-cy)**2<=radius**2)mask[y*image.width+x]=value;
  lowRes=null;changed();draw();
}
canvas.onpointerdown=e=>{if(!encoded)return;const p=position(e),mode=$('mode').value;canvas.setPointerCapture(e.pointerId);drag=p;
  if(mode.startsWith('brush')){brush(p);return;}changed();
  if(mode!=='box'){if(points.length>=128){$('status').textContent='最多 128 個提示點。';return;}points.push({...p,label:mode==='positive'?1:0});}draw();};
canvas.onpointermove=e=>{if(!drag)return;const p=position(e),mode=$('mode').value;if(mode.startsWith('brush'))brush(p);else if(mode==='box'){box=[Math.min(drag.x,p.x),Math.min(drag.y,p.y),Math.max(drag.x,p.x),Math.max(drag.y,p.y)];changed();draw();}};
canvas.onpointerup=()=>{drag=null;};canvas.onpointercancel=()=>{drag=null;};
$('clear').onclick=resetPrompts;
$('run').onclick=async()=>{const ticket=revision;try{
  const prior=$('refine').checked&&mask?(lowRes??maskToLogits(encodeRLE(mask,image.width,image.height))):null;
  const result=await provider.predict({points:points.map(p=>({...p})),box:box?.slice(),mask:prior});if(ticket!==revision)return;
  mask=decodeRLE(result.rle);lowRes=result.lowRes;buttons();draw();$('metrics').textContent=`圖片編碼次數：${result.encodes} · 候選 ${result.selected+1} · IoU 預測分數 ${result.scores[result.selected].toFixed(3)}（非正確率）`;$('status').textContent='遮罩已產生。可增加排除點或用筆刷修正。';
}catch(e){error(e);}};
$('export').onclick=()=>{if(!mask)return;const payload={kind:'huesense-browser-ai-experiment',model:MODEL.id,revision:MODEL.revision,confirmed:false,rle:encodeRLE(mask,image.width,image.height)};const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='huesense-experimental-mask.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
window.addEventListener('pagehide',()=>provider.dispose());
