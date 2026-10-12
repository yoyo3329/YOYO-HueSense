import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {detectWebGPU,verifiedDownload,OrtEngine} from '../runtime.mjs';
test('MOCK: WebGPU checks secure context, missing adapter, and reports isolation separately',async()=>{
  await assert.rejects(detectWebGPU({}),{code:'SECURE_CONTEXT'});
  await assert.rejects(detectWebGPU({isSecureContext:true}),{code:'WEBGPU_UNAVAILABLE'});
  await assert.rejects(detectWebGPU({isSecureContext:true,navigator:{gpu:{requestAdapter:async()=>null}}}),{code:'WEBGPU_ADAPTER'});
  const r=await detectWebGPU({isSecureContext:true,WebAssembly:{},navigator:{gpu:{requestAdapter:async()=>({features:new Set(),limits:{maxBufferSize:1e9}})}}});assert.equal(r.adapterAvailable,true);assert.equal(r.crossOriginIsolated,false);
});
test('MOCK: stream reports progress and enforces exact bytes + SHA256',async()=>{
  const bytes=new Uint8Array([1,2,3,4]),spec={file:'test',bytes:4,sha256:createHash('sha256').update(bytes).digest('hex')},events=[];
  const fetcher=async()=>new Response(new ReadableStream({start(c){c.enqueue(bytes.slice(0,2));c.enqueue(bytes.slice(2));c.close();}}));
  const r=await verifiedDownload(spec,p=>events.push(p),{fetcher});assert.deepEqual(r,bytes);assert.deepEqual(events.map(p=>p.loaded),[0,2,4,4]);
  await assert.rejects(verifiedDownload({...spec,bytes:3},()=>{},{fetcher}),{code:'MODEL_SIZE'});
  await assert.rejects(verifiedDownload({...spec,bytes:5},()=>{},{fetcher}),{code:'MODEL_SIZE'});
  await assert.rejects(verifiedDownload({...spec,sha256:'0'.repeat(64)},()=>{},{fetcher}),{code:'MODEL_HASH'});
  await assert.rejects(verifiedDownload(spec,()=>{},{fetcher:async()=>new Response('',{status:403})}),{code:'MODEL_HTTP'});
});
test('MOCK: ORT adapter feeds float32 prompts, mask flag and releases temporary tensors',async()=>{
  const tensors=[];class Tensor{constructor(type,data,dims){Object.assign(this,{type,data,dims});tensors.push(this);}dispose(){this.disposed=true;}}
  let feeds;
  const decoder={run:async f=>{feeds=f;return{masks:new Tensor('float32',new Float32Array(3*65536),[1,3,256,256]),iou_predictions:new Tensor('float32',new Float32Array([.1,.2,.3]),[1,3])};}};
  const engine=new OrtEngine({Tensor},null,decoder),embedding={image_embed:{persistent:true}};
  const result=await engine.decode(embedding,{points:[{x:.5,y:.25,label:0}],mask:new Float32Array(65536).fill(2)},5,3);
  assert.deepEqual(feeds.point_coords.dims,[1,1,2]);assert.deepEqual([...feeds.point_coords.data],[512,256]);assert.equal(feeds.point_labels.type,'float32');assert.equal(feeds.has_mask_input.data[0],1);assert.equal(feeds.mask_input.data[0],2);assert.equal(feeds.image_embed,embedding.image_embed);assert.ok(tensors.every(t=>t.disposed));assert.equal(result.rle.width,5);
});
