import {Pipeline} from './pipeline.mjs';
import {createEngine} from './runtime.mjs';
const pipeline=new Pipeline(createEngine, message=>self.postMessage(message));
self.onmessage=({data})=>{pipeline.accept(data);};
