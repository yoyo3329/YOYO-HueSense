'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

function requestJson(method, url, body=null, timeoutMs=5000){
  return new Promise((resolve,reject)=>{
    const u=new URL(url); const data=body==null?null:Buffer.from(JSON.stringify(body));
    const req=http.request({hostname:u.hostname,port:u.port||80,path:u.pathname+u.search,method,headers:data?{'content-type':'application/json','content-length':data.length}:{}},res=>{
      const chunks=[]; res.on('data',c=>chunks.push(c)); res.on('end',()=>{
        const txt=Buffer.concat(chunks).toString('utf8');
        if(res.statusCode<200||res.statusCode>=300) return reject(new Error(`HTTP ${res.statusCode}: ${txt.slice(0,500)}`));
        try{resolve(JSON.parse(txt))}catch(e){reject(new Error('Invalid JSON: '+txt.slice(0,500)))}
      });
    });
    req.setTimeout(timeoutMs,()=>req.destroy(new Error('timeout'))); req.on('error',reject); if(data)req.write(data); req.end();
  });
}

async function health(base='http://127.0.0.1:8765'){
  try{ const x=await requestJson('GET',base+'/health',null,2500); return {available:!!x.ok, ...x}; }
  catch(e){ return {available:false,error:String(e.message||e)}; }
}

function startAssetServer(rootDir, port=8791){
  const root=path.resolve(rootDir);
  const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.json':'application/json'};
  const server=http.createServer((req,res)=>{
    try{
      const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '');
      const p=path.resolve(root,rel);
      if(!p.startsWith(root+path.sep) && p!==root){res.writeHead(403);return res.end('forbidden');}
      if(!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);return res.end('not found');}
      res.writeHead(200,{'content-type':mime[path.extname(p).toLowerCase()]||'application/octet-stream','cache-control':'no-store'});
      fs.createReadStream(p).pipe(res);
    }catch(e){res.writeHead(500);res.end(String(e));}
  });
  return new Promise((resolve,reject)=>{
    server.once('error',reject); server.listen(port,'127.0.0.1',()=>resolve({server,baseUrl:`http://127.0.0.1:${port}`}));
  });
}

async function scoreRegions({regions, concept, clipBase='http://127.0.0.1:8765', assetBase, batchSize=8, timeoutMs=120000}){
  const scored=new Map(); const errors=new Map();
  const items=regions.map(r=>({id:r.region_id,image_url:`${assetBase}/${(r.clip_asset||r.crop_asset).replace(/\\/g,'/')}`}));
  async function send(chunk){
    try{
      const payload=await requestJson('POST',clipBase+'/score',{text:concept,images:chunk},timeoutMs);
      for(const x of payload.results||[]){
        if(x.score!=null && Number.isFinite(Number(x.score))) scored.set(String(x.id),Number(x.score));
        else errors.set(String(x.id),String(x.error||'clip_no_score'));
      }
    }catch(e){
      if(chunk.length<=1){errors.set(String(chunk[0]?.id),`clip_request_failed:${e.message}`);return;}
      const mid=Math.floor(chunk.length/2); await send(chunk.slice(0,mid)); await send(chunk.slice(mid));
    }
  }
  for(let i=0;i<items.length;i+=batchSize) await send(items.slice(i,i+batchSize));
  return {scores:scored,errors};
}

module.exports={requestJson,health,startAssetServer,scoreRegions};
