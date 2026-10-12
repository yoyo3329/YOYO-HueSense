import test from 'node:test';
import assert from 'node:assert/strict';
import {Pipeline} from '../pipeline.mjs';
import {BrowserAIProvider} from '../provider.mjs';
const image=n=>({width:2,height:1,data:new Uint8ClampedArray(8).fill(n)}),prompt={points:[{x:.5,y:.5,label:1}]};
const deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve};};
function setup(overrides={}){const events=[],released=[];let calls=0;const engine={encode:async()=>({number:++calls}),decode:async()=>({mask:'MOCK'}),releaseEmbedding:e=>released.push(e),...overrides};const p=new Pipeline(async()=>engine,m=>events.push(m),async d=>[...d].join(','));return{p,events,released};}
test('MOCK: embeddings reused across prompts and identical pixels; changed image releases cache',async()=>{
  const {p,events,released}=setup();await p.accept({id:1,epoch:0,type:'init'});await p.accept({id:2,epoch:1,type:'image',image:image(1)});
  await p.accept({id:3,epoch:1,type:'predict',prompt});await p.accept({id:4,epoch:1,type:'predict',prompt});assert.equal(p.encodes,1);
  await p.accept({id:5,epoch:2,type:'image',image:image(1)});assert.equal(events.at(-1).result.cacheHit,true);
  await p.accept({id:6,epoch:3,type:'image',image:image(2)});assert.equal(p.encodes,2);assert.equal(released.length,1);
  await p.accept({id:7,epoch:4,type:'clear'});assert.equal(p.cache,null);assert.equal(released.length,2);
});
test('MOCK: switching image during encoding discards and releases old features',async()=>{
  const gate=deferred(),started=deferred();const {p,events,released}=setup({encode:async()=>{started.resolve();await gate.promise;return{feature:true};}});
  await p.accept({id:1,epoch:0,type:'init'});const old=p.accept({id:2,epoch:1,type:'image',image:image(1)});await started.promise;
  const clear=p.accept({id:3,epoch:2,type:'clear'});gate.resolve();await old;await clear;
  assert.equal(p.cache,null);assert.equal(released.length,1);assert.equal(events.find(e=>e.id===2&&e.type==='result'),undefined);assert.equal(events.find(e=>e.id===2&&e.type==='error').code,'STALE');
});
test('MOCK: latest prompt wins even if decoder already running; errors do not poison queue',async()=>{
  const gate=deferred(),started=deferred();let calls=0;const {p,events}=setup({decode:async()=>{if(++calls===1){started.resolve();await gate.promise;}return{mask:'MOCK'};}});
  await p.accept({id:1,epoch:0,type:'init'});await p.accept({id:2,epoch:1,type:'image',image:image(1)});
  const a=p.accept({id:3,epoch:1,type:'predict',prompt});await started.promise;const b=p.accept({id:4,epoch:1,type:'predict',prompt});gate.resolve();await a;await b;
  assert.equal(events.find(e=>e.id===3&&e.type==='result'),undefined);assert.ok(events.find(e=>e.id===4&&e.type==='result'));
  await p.accept({id:5,epoch:1,type:'predict',prompt:{points:[]}});await p.accept({id:6,epoch:1,type:'predict',prompt});assert.ok(events.find(e=>e.id===6&&e.type==='result'));
});
test('MOCK: decoder cannot reuse features from another epoch or predict before init',async()=>{
  const {p,events}=setup();await p.accept({id:1,epoch:0,type:'predict',prompt});assert.equal(events.at(-1).code,'NOT_READY');await p.accept({id:2,epoch:0,type:'init'});await p.accept({id:3,epoch:1,type:'image',image:image(1)});await p.accept({id:4,epoch:0,type:'predict',prompt});assert.equal(events.at(-1).code,'STALE');
});
test('MOCK integration: Provider → message transport → serial pipeline; copy, isolation, release',async()=>{
  let terminated=false;let worker;const {p}=setup();
  const provider=new BrowserAIProvider({workerFactory:()=>{worker={postMessage:m=>p.accept(structuredClone(m)),terminate:()=>terminated=true};p.emit=m=>queueMicrotask(()=>worker.onmessage({data:m}));return worker;}});
  await provider.init();const input=image(1);await provider.setImage(input);assert.equal(input.data.length,8);
  const a=provider.predict(prompt).then(()=>false,e=>e.code==='STALE');const b=provider.predict(prompt);assert.equal(await a,true);assert.equal((await b).encodes,1);
  await provider.clearImage();await assert.rejects(provider.predict(prompt),{code:'IMAGE_NOT_READY'});provider.dispose();assert.equal(terminated,true);
});
test('MOCK: timeout kills worker and rejects all promises; explicit init can recover',async()=>{
  let terminated=0;const provider=new BrowserAIProvider({workerFactory:()=>({postMessage(){},terminate(){terminated++;}}),timeout:10});
  await assert.rejects(provider.init(),{code:'TIMEOUT'});assert.equal(terminated,1);assert.equal(provider.ready,false);assert.equal(provider.pending.size,0);
  provider.workerFactory=()=>{const worker={postMessage:m=>queueMicrotask(()=>worker.onmessage({data:{...m,type:'result',result:{ready:true}}})),terminate(){}};return worker;};
  await provider.init();assert.equal(provider.ready,true);provider.dispose();
});
test('MOCK: arbitrary late/out-of-order Worker messages cannot resolve another image request',async()=>{
  const sent=[];let worker;const provider=new BrowserAIProvider({workerFactory:()=>{worker={postMessage:m=>sent.push(m),terminate(){}};return worker;}});
  const init=provider.init();worker.onmessage({data:{id:sent[0].id,epoch:0,type:'result',result:{ready:true}}});await init;
  const first=provider.setImage(image(1)).then(()=>false,e=>e.code==='STALE');const old=sent.at(-1);const second=provider.setImage(image(2));const now=sent.at(-1);assert.equal(await first,true);
  worker.onmessage({data:{id:old.id,epoch:old.epoch,type:'result',result:{cacheHit:true}}});assert.equal(provider.pending.size,1);
  worker.onmessage({data:{id:now.id,epoch:old.epoch,type:'result',result:{cacheHit:true}}});assert.equal(provider.pending.size,1);
  worker.onmessage({data:{id:now.id,epoch:now.epoch,type:'result',result:{cacheHit:false}}});assert.equal((await second).cacheHit,false);provider.dispose();
});
