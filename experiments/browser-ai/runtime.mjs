import {AIError, requireThat, preprocess, promptArrays, selectMask} from './core.mjs';
import {MODEL, modelURL} from './model-config.mjs';

export async function detectWebGPU(scope = globalThis) {
  const report = {secureContext:scope.isSecureContext===true, webgpu:!!scope.navigator?.gpu, crossOriginIsolated:scope.crossOriginIsolated===true, wasm:typeof scope.WebAssembly==='object'};
  requireThat(report.secureContext, 'SECURE_CONTEXT', '請以 HTTPS 或 http://localhost 開啟，不支援 file://。');
  requireThat(report.webgpu, 'WEBGPU_UNAVAILABLE', '此環境沒有 WebGPU；請使用啟用硬體加速的新版 Chrome／Edge。手動工作台不受影響。');
  const adapter = await scope.navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  requireThat(adapter, 'WEBGPU_ADAPTER', '找不到可用 GPU adapter；請檢查瀏覽器硬體加速與顯示卡驅動。');
  return {...report, adapterAvailable:true, shaderF16:adapter.features.has('shader-f16'), maxBufferSize:adapter.limits.maxBufferSize};
}
export async function verifiedDownload(spec, onProgress, {fetcher=fetch, digest=bytes=>crypto.subtle.digest('SHA-256',bytes), signal}={}) {
  const response=await fetcher(modelURL(spec), {mode:'cors', credentials:'omit', signal});
  requireThat(response.ok, 'MODEL_HTTP', `模型下載失敗：HTTP ${response.status}。請檢查網路與模型來源。`);
  requireThat(response.body?.getReader, 'MODEL_STREAM', '瀏覽器不支援串流下載。');
  const reader=response.body.getReader(), bytes=new Uint8Array(spec.bytes);let offset=0;
  onProgress({stage:'download',file:spec.file,loaded:0,total:spec.bytes});
  try {
    while(true) { const {done,value}=await reader.read();if(done)break;
      requireThat(offset+value.byteLength<=spec.bytes,'MODEL_SIZE','模型大小超過鎖定版本；已停止下載。');
      bytes.set(value,offset);offset+=value.byteLength;onProgress({stage:'download',file:spec.file,loaded:offset,total:spec.bytes});
    }
  } catch(error) { await reader.cancel().catch(()=>{});throw error; }
  requireThat(offset===spec.bytes,'MODEL_SIZE','模型下載不完整，請重新載入模型。');
  onProgress({stage:'verify',file:spec.file,loaded:offset,total:spec.bytes});
  const hash=Array.from(new Uint8Array(await digest(bytes)),v=>v.toString(16).padStart(2,'0')).join('');
  requireThat(hash===spec.sha256,'MODEL_HASH','模型 SHA-256 不符，已拒絕執行。');return bytes;
}
const featureShapes={image_embed:[1,256,64,64],high_res_feats_0:[1,32,256,256],high_res_feats_1:[1,64,128,128]};
function releaseTensors(values) { for(const tensor of Object.values(values??{})) tensor.dispose?.(); }
function checkNames(session, inputs, outputs) {
  requireThat(session.inputNames.length===inputs.length && inputs.every(n=>session.inputNames.includes(n)) && session.outputNames.length===outputs.length && outputs.every(n=>session.outputNames.includes(n)), 'MODEL_CONTRACT','模型輸入／輸出名稱與鎖定版本不符。');
}
export class OrtEngine {
  constructor(ort, encoder, decoder) {this.ort=ort;this.encoder=encoder;this.decoder=decoder;}
  async encode(image) {
    const input=new this.ort.Tensor('float32',preprocess(image),[1,3,1024,1024]);let result;
    try {
      result=await this.encoder.run({image:input});
      for(const [name,shape] of Object.entries(featureShapes)) {
        const t=result[name];requireThat(t?.type==='float32' && t.dims.join(',')===shape.join(',') && t.data.length===shape.reduce((a,b)=>a*b,1) && t.data.every(Number.isFinite),'ENCODER_OUTPUT','編碼器圖片特徵形狀或數值不合法。');
      }
      return result;
    } catch(e) {releaseTensors(result);throw e;} finally {input.dispose();}
  }
  async decode(embedding,prompt,width,height) {
    const {coords,labels}=promptArrays(prompt), T=this.ort.Tensor;
    const inputs={point_coords:new T('float32',coords,[1,labels.length,2]), point_labels:new T('float32',labels,[1,labels.length]), mask_input:new T('float32',prompt.mask??new Float32Array(65536),[1,1,256,256]), has_mask_input:new T('float32',new Float32Array([prompt.mask?1:0]),[1])};
    let outputs;
    try {outputs=await this.decoder.run({...embedding,...inputs});return selectMask(outputs.masks,outputs.iou_predictions,width,height);}
    finally {releaseTensors(inputs);releaseTensors(outputs);}
  }
  releaseEmbedding(e) {releaseTensors(e);}
  async dispose() {await this.encoder.release();await this.decoder.release();}
}
export async function createEngine(onProgress) {
  const capabilities=await detectWebGPU();onProgress({stage:'capabilities',capabilities});
  let ort;
  try {ort=await import('./vendor/ort.webgpu.min.mjs');} catch {throw new AIError('RUNTIME_MISSING','找不到 ONNX Runtime；請先執行 npm ci 及 npm run prepare:runtime，或檢查 CSP。');}
  ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
  ort.env.wasm.wasmPaths=new URL('./vendor/',import.meta.url).href;
  const options={executionProviders:['webgpu'], preferredOutputLocation:'cpu'};
  let encoder, decoder;
  try {
    let bytes=await verifiedDownload(MODEL.encoder,onProgress);
    onProgress({stage:'session',file:MODEL.encoder.file});
    encoder=await ort.InferenceSession.create(bytes,{...options,graphOptimizationLevel:'disabled'});bytes=null;
    checkNames(encoder,['image'],Object.keys(featureShapes));
    bytes=await verifiedDownload(MODEL.decoder,onProgress);
    onProgress({stage:'session',file:MODEL.decoder.file});
    decoder=await ort.InferenceSession.create(bytes,options);bytes=null;
    checkNames(decoder,[...Object.keys(featureShapes),'point_coords','point_labels','mask_input','has_mask_input'],['masks','iou_predictions']);
    return new OrtEngine(ort,encoder,decoder);
  } catch(error) {
    await encoder?.release();await decoder?.release();
    if(error instanceof AIError)throw error;
    throw new AIError('MODEL_INIT',`模型初始化失敗（可能為 WebGPU 算子、CSP、記憶體或下載問題）：${error.message??error}`);
  }
}
