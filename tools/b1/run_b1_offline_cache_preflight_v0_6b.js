#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const B=__dirname,CACHE=path.join(B,'b1_cache');
const INPUT=path.join(B,'y2k_color_mvp_evaluation_set_v1.json');
const FALLBACK={
 'serpapi_google_images_5b5216b7f4ef04ba27a3':{url:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQC02dipEUCVRywtyu2ZsdUOCMOJV-LImpfefUD78C-pg&s=10',skipPrimary:false},
 'serpapi_google_images_af6e192e74a947847f38':{url:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTMUFOLm7LAeM27vT4oHLgHEtLfZOEexfvzazoiPRz-QQ&s=10',skipPrimary:true}
};
function safe(v){return String(v||'item').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,140)}
function h(v){return crypto.createHash('sha1').update(String(v)).digest('hex').slice(0,12)}
function cachePath(id,url,label){return path.join(CACHE,`${safe(id)}_${safe(label)}_${h(url)}.img`)}
const payload=JSON.parse(fs.readFileSync(INPUT,'utf8'));const items=Array.isArray(payload)?payload:(payload.selected||payload.items||[]);
const rows=[];let missing=0;
for(const item of items){const id=String(item.id);const fb=FALLBACK[id];let p=null,source=null;
 if(!(fb&&fb.skipPrimary)){const pp=cachePath(id,item.image_url,'primary');if(fs.existsSync(pp)&&fs.statSync(pp).size>0){p=pp;source='primary_cache';}}
 if(!p&&fb){const fp=cachePath(id,fb.url,'google-fallback');if(fs.existsSync(fp)&&fs.statSync(fp).size>0){p=fp;source='fallback_cache';}}
 if(!p)missing++;
 rows.push({id,cache_ready:!!p,source,file:p?path.basename(p):null});
}
const out={metadata:{name:'YOYO B1 Offline Cache Preflight',version:'0.6B',status:missing?'FAIL':'PASS',network_required:false},summary:{items:items.length,ready:items.length-missing,missing},rows};
fs.writeFileSync(path.join(B,'b1_offline_cache_preflight_v0_6b.json'),JSON.stringify(out,null,2)+'\n');
console.log('=== YOYO B1 Offline Cache Preflight v0.6B ===');console.log(`Ready: ${items.length-missing}/${items.length}`);console.log(`Missing: ${missing}`);if(missing){for(const r of rows.filter(x=>!x.cache_ready))console.log(`MISS ${r.id}`);process.exit(1)}
console.log('✅ All fixed B1 evaluation images are available from the exact cache paths used by the cache-only B1 runner.');
