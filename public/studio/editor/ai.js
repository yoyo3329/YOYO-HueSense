'use strict';
(() => {
  const local = ['127.0.0.1', 'localhost'].includes(location.hostname) && location.protocol === 'http:';
  let token = '', connected = false, seq = 0, controller = null, busy = false, boxStart = null;
  const promptNodes = [...document.querySelectorAll('[data-tool^="sam-"]')];
  const status = text => { $('aiPromptStatus').textContent = text; };
  function invalidate() { seq++; controller?.abort(); controller = null; busy = false; update(); }
  function imageChanged() { invalidate(); $('clipResults').replaceChildren(); }
  function update() {
    promptNodes.forEach(b => b.disabled = !connected || !img || !current() || view !== 'edit' || busy);
    $('aiSegment').disabled = !connected || !img || !current() || view !== 'edit' || busy;
    $('clipScore').disabled = !connected || !img || busy;
    $('aiCancel').disabled = !busy;if(current()?.aiDirty)$('confirm').disabled=true;
  }
  async function request(path, payload, timeout=180000) {
    controller = new AbortController();
    const ownController = controller;
    const timer = setTimeout(() => ownController.abort(), timeout);
    try {
      const res = await fetch('/api/' + path, {method: payload ? 'POST' : 'GET',
        headers: {Authorization:'Bearer ' + token, ...(payload ? {'Content-Type':'application/json'} : {})},
        ...(payload ? {body:JSON.stringify(payload)} : {}), signal:ownController.signal, cache:'no-store'});
      const data = await res.json();
      if (!res.ok) throw Error(data.error || '本機模型服務回應失敗');
      return data;
    } finally { clearTimeout(timer); if (controller === ownController) controller = null; }
  }
  async function connect() {
    if (!local) { $('aiDialog').showModal(); return; }
    invalidate();token=$('bridgeToken').value.trim();
    if (!token) { $('connectionMessage').textContent='請使用啟動程式開啟的網址，或輸入本次連線碼。'; return; }
    $('connectLocal').disabled=true;const ticket=seq;
    $('connectionMessage').textContent='正在檢查模型服務…';
    try { const data=await request('health',null,15000);
      if(ticket!==seq)return;
      if(data.protocol!=='huesense-studio-v1'||!data.sam2?.ready||!data.openclip?.ready||!data.model_identity_verified)throw Error('此服務尚未通過模型身分檢查');
      connected=true;$('aiState').textContent='SAM2.1 ＋ OpenCLIP 已連線';$('aiDetail').textContent='沿用本機 CPU 模型。AI 選區需經你確認；文字相似度僅供參考。';$('connectionMessage').textContent='已連接本機模型。';$('aiDialog').close();notify('已連接本機 SAM2.1 與 OpenCLIP');
    } catch(e) { connected=false;$('connectionMessage').textContent=e.name==='AbortError'?'連線已取消或逾時，請確認啟動程式保持開啟。':e.message; }
    finally { $('connectLocal').disabled=false;update(); }
  }
  function disconnect(){invalidate();connected=false;token='';$('bridgeToken').value='';$('aiState').textContent='本機 AI 尚未連線';$('aiDetail').textContent='可連接既有 SAM2.1 與 OpenCLIP；未連線時仍可手動選區。';if(tool.startsWith('sam-'))document.querySelector('[data-tool="rect"]').click();update();}
  function drawPrompts(ctx){const l=current();if(!l||!tool.startsWith('sam-'))return;for(const p of l.aiPoints||[]){const x=p.x*previewW,y=p.y*previewH,r=Math.max(7,previewW/100);ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=p.label?'#25a879':'#f17a6b';ctx.fill();ctx.strokeStyle='white';ctx.lineWidth=2;ctx.stroke();ctx.beginPath();ctx.moveTo(x-r/2,y);ctx.lineTo(x+r/2,y);if(p.label){ctx.moveTo(x,y-r/2);ctx.lineTo(x,y+r/2)}ctx.stroke()}if(l.aiBox){const b=l.aiBox;ctx.strokeStyle='#7558dc';ctx.lineWidth=3;ctx.setLineDash([8,4]);ctx.strokeRect(b[0]*previewW,b[1]*previewH,(b[2]-b[0])*previewW,(b[3]-b[1])*previewH);ctx.setLineDash([])}}
  canvas.addEventListener('pointerdown',e=>{if(!tool.startsWith('sam-'))return;e.stopImmediatePropagation();if(!connected||!img||!current()||view!=='edit'||busy||e.button!==0)return;e.preventDefault();const p=point(e),l=current();remember();l.confirmed=false;l.aiDirty=true;l.aiPoints=l.aiPoints||[];if(tool==='sam-box'){boxStart=p;canvas.setPointerCapture(e.pointerId);l.aiBox=[...p,...p]}else {if(l.aiPoints.length>=64){notify('最多 64 個提示點');return}l.aiPoints.push({x:p[0],y:p[1],label:tool==='sam-positive'?1:0})}status('提示已更新，按「產生 AI 選區」重新推論。');refresh();},true);
  canvas.addEventListener('pointermove',e=>{if(!tool.startsWith('sam-'))return;e.stopImmediatePropagation();if(!boxStart||!current())return;const p=point(e);current().aiBox=[Math.min(p[0],boxStart[0]),Math.min(p[1],boxStart[1]),Math.max(p[0],boxStart[0]),Math.max(p[1],boxStart[1])];display()},true);
  function stopBox(e){if(!tool.startsWith('sam-'))return;e.stopImmediatePropagation();boxStart=null;refresh()}
  canvas.addEventListener('pointerup',stopBox,true);canvas.addEventListener('pointercancel',stopBox,true);
  async function segment(){const l=current();if(!connected||busy||!img||!l)return;const points=l.aiPoints||[],box=l.aiBox||null;if(!box&&!points.some(p=>p.label===1)){notify('請先加入正向點或使用 AI 框選');return}
    invalidate();const ticket=seq,id=crypto.randomUUID(),layerId=l.id,imageAtStart=img;
    busy=true;update();status('SAM2 推論中…本機 CPU 可能需要一些時間。');
    try {const data=await request('segment',{request_id:id,image:compose([],previewW,previewH,true).toDataURL(),points,box});
      if(ticket!==seq||img!==imageAtStart||current()?.id!==layerId)return;
      if(data.request_id!==id||data.source!=='SAM2_REAL_INFERENCE'||data.mask?.width!==previewW||data.mask?.height!==previewH)throw Error('模型回傳格式或圖片尺寸不一致');
      validateLayers([{...l,shapes:[data.mask]}]);remember();l.shapes=[data.mask];l.confirmed=false;l.aiDirty=false;l.maskSource='SAM2_REAL_INFERENCE';refresh();
      status('AI 選區已產生。檢查紫色範圍，可補點、筆刷修正，再按「確認此區域」。');notify('AI 選區已產生，請確認範圍');
    }catch(e){if(ticket!==seq)return;status(e.name==='AbortError'?'推論已逾時或取消；原圖與既有選區已保留。':e.message);notify(e.name==='AbortError'?'推論逾時，請重試。':e.message)}finally{if(ticket===seq){busy=false;update()}}}
  async function score(){if(!connected||!img||busy)return;const texts=$('clipTexts').value.split('\n').map(t=>t.trim()).filter(Boolean);if(texts.length<1||texts.length>8||texts.some(t=>t.length>160)){notify('請輸入 1 至 8 組描述，每組最多 160 字元');return}invalidate();const ticket=seq,id=crypto.randomUUID(),imageAtStart=img;busy=true;update();status('OpenCLIP 正在比較原圖與文字…');
    try{const data=await request('score',{request_id:id,image:compose([],previewW,previewH,true).toDataURL(),texts});if(ticket!==seq||img!==imageAtStart)return;if(data.request_id!==id||data.score_semantics!=='CLIP_COSINE_NOT_PROBABILITY'||!Array.isArray(data.results)||data.results.some(r=>typeof r.text!=='string'||!Number.isFinite(r.cosine_similarity)))throw Error('OpenCLIP 回傳格式錯誤');$('clipResults').replaceChildren();for(const r of data.results.sort((a,b)=>b.cosine_similarity-a.cosine_similarity)){const row=document.createElement('div');row.className='clip-result';const label=document.createElement('span'),value=document.createElement('b');label.textContent=r.text;value.textContent=r.cosine_similarity.toFixed(3);row.append(label,value);$('clipResults').append(row)}status('文字相似度已更新，分數不是辨識機率或配色評分。')}
    catch(e){if(ticket===seq){status(e.name==='AbortError'?'OpenCLIP 請求已逾時或取消。':e.message);notify('文字比較未完成，請重試。')}}finally{if(ticket===seq){busy=false;update()}}}
  const reset=$('resetMask').onclick;$('resetMask').onclick=()=>{reset();if(current()){delete current().aiPoints;delete current().aiBox;current().aiDirty=false}display();status('已清除提示點及選區。')};
  $('aiConnect').onclick=()=>$('aiDialog').showModal();$('aiClose').onclick=()=>$('aiDialog').close();$('connectLocal').onclick=connect;$('disconnectLocal').onclick=disconnect;$('aiSegment').onclick=segment;$('clipScore').onclick=score;$('aiCancel').onclick=()=>{invalidate();status('已取消等待；模型可能仍在完成本次運算。')};$('localConnection').hidden=!local;
  promptNodes.forEach(b=>b.addEventListener('click',()=>{if(img)display()}));
  window.hueAi={invalidate,imageChanged,update,drawPrompts,get connected(){return connected}};
  if(local){const params=new URLSearchParams(location.hash.slice(1));const value=params.get('bridge_token');if(value){$('bridgeToken').value=value;window.history.replaceState(null,'',location.pathname+location.search);connect()}}
  update();
})();
