import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {BrowserAIProvider} from '../provider.mjs';
import {decodeRLE} from '../core.mjs';
test('MOCK integration: actual Node Worker thread, transferred RGBA, protocol and cache',async()=>{
  const provider=new BrowserAIProvider({workerFactory:()=>{
    const thread=new Worker(new URL('./mock-worker.mjs',import.meta.url)),shim={postMessage:(m,t)=>thread.postMessage(m,t),terminate:()=>thread.terminate()};
    thread.on('message',data=>shim.onmessage({data}));thread.on('error',error=>shim.onerror(error));return shim;
  }});
  try{
    await provider.init();const image={width:13,height:7,data:new Uint8ClampedArray(13*7*4).fill(123)};
    await provider.setImage(image);assert.equal(image.data.byteLength,13*7*4);
    const a=await provider.predict({points:[{x:.5,y:.5,label:1}]});assert.equal(decodeRLE(a.rle).length,91);
    const b=await provider.predict({points:[{x:.5,y:.5,label:1},{x:.2,y:.2,label:0}],box:[0,0,1,1],mask:a.lowRes});assert.equal(b.encodes,1);
    const same=await provider.setImage(image);assert.equal(same.cacheHit,true);
    await provider.clearImage();await assert.rejects(provider.predict({points:[{x:.5,y:.5,label:1}]}),{code:'IMAGE_NOT_READY'});
  }finally{provider.dispose();}
});
