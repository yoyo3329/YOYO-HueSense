import test from 'node:test';
import assert from 'node:assert/strict';
import {validateImage,validatePrompt,promptArrays,preprocess,resizeFloat,encodeRLE,decodeRLE,maskToLogits,selectMask} from '../core.mjs';
const image=(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4).fill(255)});
test('image validation rejects malformed buffers, overflow and invalid dimensions',()=>{
  for(const x of [null,image(0,1),{width:16001,height:1,data:[]},{width:10000,height:10000,data:[]},{width:2,height:2,data:new Uint8Array(15)}])assert.throws(()=>validateImage(x));
  assert.equal(validateImage(image(4,2)).width,4);
});
test('prompt validation rejects NaN, out-of-range coordinates, inverted boxes and oversized masks',()=>{
  for(const p of [{points:[]},{points:[{x:NaN,y:.5,label:1}]},{points:[{x:1.1,y:.5,label:1}]},{points:[{x:.5,y:.5,label:2}]},{points:[],box:[.8,0,.2,1]},{points:[],box:[0,0,1,1],mask:new Float32Array(2)},{points:[],box:[0,0,1,1],mask:new Float32Array(65536).fill(Infinity)}])assert.throws(()=>validatePrompt(p));
  assert.throws(()=>validatePrompt({points:Array(129).fill({x:0,y:0,label:1})}));
});
test('non-square normalized coordinates stretch independently; box labels precede points',()=>{
  const r=promptArrays({points:[{x:.5,y:.25,label:1},{x:1,y:1,label:0}],box:[0,0,.75,.5]});
  assert.deepEqual([...r.coords],[0,0,768,512,512,256,1024,1024]);assert.deepEqual([...r.labels],[2,3,1,0]);
});
test('RGB CHW normalization and transparent white compositing',()=>{
  const rgba={width:2,height:1,data:new Uint8ClampedArray([255,0,0,255,0,0,0,0])};const out=preprocess(rgba,2);
  assert.ok(Math.abs(out[0]-(1-.485)/.229)<1e-5);assert.ok(Math.abs(out[4]-(0-.456)/.224)<1e-5);assert.ok(Math.abs(out[5]-(1-.456)/.224)<1e-5);assert.equal(out[0],out[2]);
});
test('antialiased downsampling preserves constant inputs and averages high frequencies',()=>{
  assert.ok(preprocess(image(9,3),2).every(Number.isFinite));const data=new Uint8ClampedArray([0,0,0,255,255,255,255,255]);const v=preprocess({width:2,height:1,data},1);assert.ok(Math.abs(v[0]-(.5-.485)/.229)<1e-5);
});
test('half pixel interpolation has correct edges and midpoint',()=>{assert.deepEqual([...resizeFloat(new Float32Array([0,10]),2,1,3,1)],[0,5,10]);});
test('RLE exact row-major golden and foreground-first zero run',()=>{
  const mask=new Uint8Array([1,1,0,0,1,0]);const r=encodeRLE(mask,3,2);assert.deepEqual(r.counts,[0,2,2,1,1]);assert.deepEqual(decodeRLE(r),mask);
});
test('RLE roundtrip exhaustive small masks and empty/full boundaries',()=>{
  for(let n=0;n<256;n++){const m=Uint8Array.from({length:8},(_,i)=>(n>>i)&1);assert.deepEqual(decodeRLE(encodeRLE(m,4,2)),m);}
});
test('RLE rejects COCO, overflow, fractional/negative runs, zero interior and truncated data',()=>{
  const r=encodeRLE(new Uint8Array(4),2,2);
  for(const counts of [[],[5],[3],[1,-1,4],[1,.5,2.5],[1,0,3],[Number.MAX_SAFE_INTEGER]])assert.throws(()=>decodeRLE({...r,counts}));
  assert.throws(()=>decodeRLE({...r,order:'column-major'}));assert.throws(()=>encodeRLE(new Uint8Array([2]),1,1));
});
test('binary brush mask becomes bounded feedback logits',()=>{const l=maskToLogits(encodeRLE(new Uint8Array([0,1]),2,1));assert.equal(l.length,65536);assert.equal(l[0],-8);assert.equal(l[255],8);});
test('best candidate mask follows scores, keeps logits, thresholds only after resize',()=>{
  const data=new Float32Array(3*65536);data.fill(-1);data.fill(3,65536,131072);
  const result=selectMask({type:'float32',dims:[1,3,256,256],data},{type:'float32',dims:[1,3],data:new Float32Array([.1,.9,.2])},3,7);
  assert.equal(result.selected,1);assert.equal(result.lowRes[0],3);assert.ok(decodeRLE(result.rle).every(v=>v===1));
  data[0]=NaN;assert.throws(()=>selectMask({type:'float32',dims:[1,3,256,256],data},{type:'float32',dims:[1,3],data:new Float32Array([1,2,3])},1,1));
});
