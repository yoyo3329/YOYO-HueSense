// Test double only. Never imported by the browser application.
import {parentPort} from 'node:worker_threads';
import {Pipeline} from '../pipeline.mjs';
import {encodeRLE} from '../core.mjs';
const engine={encode:async()=>({mock:true}),releaseEmbedding(){},decode:async(_,p,w,h)=>({rle:encodeRLE(new Uint8Array(w*h).fill(1),w,h),lowRes:new Float32Array(65536),scores:[0,0,0],selected:0})};
const pipeline=new Pipeline(async()=>engine,m=>parentPort.postMessage(m));
parentPort.on('message',m=>pipeline.accept(m));
