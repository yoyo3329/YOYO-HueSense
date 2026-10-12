import {AIError, requireThat, validateImage, validatePrompt} from './core.mjs';
// Serial inference, one-image cache. Request acceptance invalidates stale work immediately.
export class Pipeline {
  constructor(engineFactory, emit, hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('')) {
    this.factory=engineFactory;this.emit=emit;this.hash=hash;this.queue=Promise.resolve();this.epoch=0;this.latest=0;this.cache=null;this.engine=null;this.encodes=0;
  }
  accept(message) {
    const {id,epoch,type}=message??{};
    if(!Number.isSafeInteger(id)||id<=0||!Number.isSafeInteger(epoch)||epoch<0||!['init','image','predict','clear'].includes(type)) {this.emit({id,epoch,type:'error',code:'PROTOCOL',message:'Worker 訊息格式不合法。'});return this.queue;}
    if(epoch<this.epoch) {this.emit({id,epoch,type:'error',code:'STALE',message:'已淘汰舊圖片請求。'});return this.queue;}
    if(type==='image'||type==='clear')this.epoch=epoch;
    if(type==='predict')this.latest=id;
    this.queue=this.queue.then(()=>this.execute(message)).catch(error=>{this.emit({id,epoch,type:'error',code:error.code??'INFERENCE',message:error.message??String(error)});});
    return this.queue;
  }
  current(m) {return m.epoch===this.epoch && (m.type!=='predict'||m.id===this.latest);}
  check(m) {requireThat(this.current(m),'STALE','已淘汰舊圖片或舊提示的結果。');}
  clear() {if(this.cache)this.engine?.releaseEmbedding(this.cache.embedding);this.cache=null;}
  async execute(m) {
    this.check(m);const send=(type,data={})=>{if(this.current(m))this.emit({id:m.id,epoch:m.epoch,type,...data});};
    if(m.type==='init') {
      if(!this.engine)this.engine=await this.factory(progress=>send('progress',{progress}));
      send('result',{result:{ready:true}});return;
    }
    if(m.type==='clear') {this.clear();send('result',{result:{cleared:true}});return;}
    requireThat(this.engine,'NOT_READY','請先載入模型。');
    if(m.type==='image') {
      validateImage(m.image);
      const key=`${m.image.width}x${m.image.height}:${await this.hash(m.image.data)}`;this.check(m);
      if(this.cache?.key===key) {this.cache.epoch=m.epoch;send('result',{result:{cacheHit:true,encodes:this.encodes}});return;}
      this.clear();send('progress',{progress:{stage:'encode'}});
      const embedding=await this.engine.encode(m.image);this.encodes++;
      if(!this.current(m)) {this.engine.releaseEmbedding(embedding);throw new AIError('STALE','編碼完成，但圖片已切換。');}
      this.cache={key,embedding,width:m.image.width,height:m.image.height,epoch:m.epoch};
      send('result',{result:{cacheHit:false,encodes:this.encodes}});return;
    }
    validatePrompt(m.prompt);
    requireThat(this.cache?.epoch===m.epoch,'IMAGE_NOT_READY','請等待目前圖片完成編碼。');
    send('progress',{progress:{stage:'decode'}});
    const result=await this.engine.decode(this.cache.embedding,m.prompt,this.cache.width,this.cache.height);
    this.check(m);send('result',{result:{...result,encodes:this.encodes}});
  }
}
