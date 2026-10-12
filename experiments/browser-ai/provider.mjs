import {AIError,validateImage,validatePrompt} from './core.mjs';
export class BrowserAIProvider {
  constructor({workerFactory=()=>new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'}),onProgress=()=>{},timeout=300000}={}) {
    this.workerFactory=workerFactory;this.onProgress=onProgress;this.timeout=timeout;this.epoch=0;this.id=0;this.pending=new Map();this.ready=false;this.closed=false;
  }
  ensureWorker() {
    if(this.closed)throw new AIError('DISPOSED','Provider 已關閉。');
    if(this.worker)return;
    this.worker=this.workerFactory();
    this.worker.onmessage=({data:m})=>{
      const p=this.pending.get(m.id);if(!p||m.epoch!==p.epoch||m.epoch!==this.epoch)return;
      if(m.type==='progress') {this.onProgress(m.progress);return;}
      this.pending.delete(m.id);clearTimeout(p.timer);
      if(m.type==='error')p.reject(new AIError(m.code,m.message));else p.resolve(m.result);
    };
    this.worker.onerror=()=>this.reset(new AIError('WORKER','Worker 無法執行；請檢查模組路徑、CSP、GPU 或重新載入模型。'));
    this.worker.onmessageerror=()=>this.reset(new AIError('WORKER_MESSAGE','Worker 資料傳送失敗。'));
  }
  invalidate(type=null) {
    for(const [id,p] of this.pending)if(!type||p.type===type) {clearTimeout(p.timer);p.reject(new AIError('STALE','此請求已被更新的圖片或提示取代。'));this.pending.delete(id);}
  }
  request(type,payload={},transfer=[]) {
    this.ensureWorker();const id=++this.id,epoch=this.epoch;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>this.reset(new AIError('TIMEOUT','模型作業逾時；Worker 已停止。請重新載入模型並重選圖片。')),this.timeout);
      this.pending.set(id,{resolve,reject,timer,epoch,type});
      try {this.worker.postMessage({id,epoch,type,...payload},transfer);}catch(e){this.reset(new AIError('WORKER_SEND',String(e)));}
    });
  }
  async init() {try {const r=await this.request('init');this.ready=true;return r;}catch(e){this.ready=false;throw e;}}
  setImage(image) {
    validateImage(image);
    if(!this.ready)return Promise.reject(new AIError('NOT_READY','請先載入模型。'));
    this.epoch++;this.invalidate();
    // Copy before transfer: caller's Canvas buffer remains intact.
    const copy=new Uint8ClampedArray(image.data);
    return this.request('image',{image:{width:image.width,height:image.height,data:copy}},[copy.buffer]);
  }
  predict(prompt) {validatePrompt(prompt);this.invalidate('predict');return this.request('predict',{prompt});}
  clearImage() {this.epoch++;this.invalidate();return this.request('clear');}
  reset(error=new AIError('RESET','模型已重設。')) {
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();
    this.worker?.terminate();this.worker=null;this.ready=false;this.epoch++;
  }
  dispose() {this.reset(new AIError('DISPOSED','Provider 已關閉。'));this.closed=true;}
}
