'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const {startAssetServer,scoreRegions}=require('../node/clip_bridge');
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'yoyo-clip-mock-'));fs.mkdirSync(path.join(tmp,'crops'));
 // 1x1 PNG
 fs.writeFileSync(path.join(tmp,'crops','a.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0mQAAAAASUVORK5CYII=','base64'));
 const mock=http.createServer((req,res)=>{if(req.url==='/score'&&req.method==='POST'){let b='';req.on('data',c=>b+=c);req.on('end',()=>{const p=JSON.parse(b);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({results:p.images.map(x=>({id:x.id,score:0.321}))}));});return;}res.writeHead(404);res.end();});
 await new Promise(r=>mock.listen(8766,'127.0.0.1',r)); const asset=await startAssetServer(tmp,8792);
 const out=await scoreRegions({regions:[{region_id:'r1',crop_asset:'crops/a.png'}],concept:'Y2K aesthetic',clipBase:'http://127.0.0.1:8766',assetBase:asset.baseUrl,batchSize:1,timeoutMs:5000});
 if(out.scores.get('r1')!==0.321) throw new Error('mock CLIP score mismatch');
 await new Promise(r=>asset.server.close(r)); await new Promise(r=>mock.close(r));
 console.log('PASS  CLIP bridge can score local region crop via localhost asset server');
})().catch(e=>{console.error('FAIL ',e);process.exit(1)});
