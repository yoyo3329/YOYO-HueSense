export class AIError extends Error {
  constructor(code, message) { super(message); this.name = 'AIError'; this.code = code; }
}
export function requireThat(ok, code, message) { if (!ok) throw new AIError(code, message); }
export function dimensions(width, height) {
  requireThat(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= 16000 && height <= 16000 && width * height <= 16000000, 'IMAGE_SIZE', '圖片尺寸須為正整數，最多 16MP、單邊 16000px。');
}
export function validateImage(image) {
  requireThat(image && typeof image === 'object', 'IMAGE', '缺少圖片。');
  dimensions(image.width, image.height);
  requireThat((image.data instanceof Uint8ClampedArray || image.data instanceof Uint8Array) && image.data.length === image.width * image.height * 4, 'IMAGE_DATA', '圖片必須是完整的 RGBA 位元組。');
  return image;
}
const unit = n => Number.isFinite(n) && n >= 0 && n <= 1;
export function validatePrompt(prompt) {
  requireThat(prompt && Array.isArray(prompt.points) && prompt.points.length <= 128, 'PROMPT', '提示點須為陣列，最多 128 點。');
  for (const p of prompt.points) requireThat(p && unit(p.x) && unit(p.y) && (p.label === 0 || p.label === 1), 'POINT', '點座標須介於 0–1；標籤只能是 0 或 1。');
  if (prompt.box != null) {
    const b = prompt.box;
    requireThat(Array.isArray(b) && b.length === 4 && b.every(unit) && b[0] < b[2] && b[1] < b[3], 'BOX', '框選須為 [左,上,右,下]，介於 0–1 且面積大於零。');
  }
  requireThat(prompt.points.length > 0 || prompt.box != null, 'EMPTY_PROMPT', '請先加入提示點或框選。');
  if (prompt.mask != null) {
    const m = prompt.mask;
    requireThat(m instanceof Float32Array && m.length === 256 * 256 && m.every(v => Number.isFinite(v) && Math.abs(v) <= 32), 'MASK_INPUT', '修正遮罩必須是 256×256 float32 logits，數值介於 −32 至 32。');
  }
  return prompt;
}
export function promptArrays(prompt) {
  validatePrompt(prompt);
  const coords = [], labels = [];
  if (prompt.box) { coords.push(...prompt.box.map(n => n * 1024)); labels.push(2, 3); }
  for (const p of prompt.points) { coords.push(p.x * 1024, p.y * 1024); labels.push(p.label); }
  return {coords: new Float32Array(coords), labels: new Float32Array(labels)};
}
// Half-pixel bilinear interpolation, align_corners=false. No padded region.
export function resizeFloat(data, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh);
  for (let y = 0; y < dh; y++) {
    const sy = Math.max(0, Math.min(sh - 1, (y + .5) * sh / dh - .5)), y0 = Math.floor(sy), y1 = Math.min(y0 + 1, sh - 1), fy = sy - y0;
    for (let x = 0; x < dw; x++) {
      const sx = Math.max(0, Math.min(sw - 1, (x + .5) * sw / dw - .5)), x0 = Math.floor(sx), x1 = Math.min(x0 + 1, sw - 1), fx = sx - x0;
      out[y * dw + x] = (data[y0 * sw + x0] * (1 - fx) + data[y0 * sw + x1] * fx) * (1 - fy) + (data[y1 * sw + x0] * (1 - fx) + data[y1 * sw + x1] * fx) * fy;
    }
  }
  return out;
}
// Explicit separable antialiased bilinear RGB resize; deterministic in Worker/Node.
function weights(src, dst) {
  const scale = Math.max(1, src / dst);
  return Array.from({length: dst}, (_, i) => {
    const center = (i + .5) * src / dst - .5, pairs = []; let total = 0;
    for (let j = Math.max(0, Math.ceil(center - scale)); j <= Math.min(src - 1, Math.floor(center + scale)); j++) {
      const w = Math.max(0, 1 - Math.abs(j - center) / scale); if (w) { pairs.push([j, w]); total += w; }
    }
    return pairs.map(([j,w]) => [j,w/total]);
  });
}
export function preprocess(image, size = 1024) {
  validateImage(image);
  const {width: w, height: h, data} = image, wx = weights(w, size), wy = weights(h, size);
  const out = new Float32Array(3 * size * size), tmp = new Float32Array(size * h);
  const mean = [.485,.456,.406], std = [.229,.224,.225];
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < size; x++) {
      let value = 0;
      for (const [sx, weight] of wx[x]) { const k = (y*w+sx)*4, a = data[k+3]/255; value += (data[k+c]*a+255*(1-a))*weight; }
      tmp[y*size+x] = value;
    }
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let value = 0; for (const [sy, weight] of wy[y]) value += tmp[sy*size+x]*weight;
      out[c*size*size+y*size+x] = (value/255-mean[c])/std[c];
    }
  }
  return out;
}
export function encodeRLE(mask, width, height) {
  dimensions(width, height);
  requireThat(mask instanceof Uint8Array && mask.length === width*height && mask.every(v => v === 0 || v === 1), 'MASK', '二值遮罩大小或內容不合法。');
  let value = 0, count = 0; const counts = [];
  for (const v of mask) { if (v === value) count++; else { counts.push(count); count = 1; value = v; } }
  counts.push(count);
  return {format:'huesense-rle-v1', order:'row-major', width, height, counts};
}
export function decodeRLE(rle) {
  requireThat(rle && rle.format === 'huesense-rle-v1' && rle.order === 'row-major', 'RLE_FORMAT', '僅接受 HueSense row-major RLE v1，非 COCO RLE。');
  dimensions(rle.width,rle.height); const size=rle.width*rle.height;
  requireThat(Array.isArray(rle.counts) && rle.counts.length > 0 && rle.counts.length <= size+1, 'RLE_COUNTS', 'RLE run 數量不合法。');
  let sum = 0;
  for (let i=0;i<rle.counts.length;i++) { const n=rle.counts[i]; requireThat(Number.isSafeInteger(n) && n >= (i===0?0:1) && n <= size && sum+n <= size,'RLE_COUNTS','RLE run 越界或非正整數。'); sum += n; }
  requireThat(sum===size,'RLE_SIZE','RLE 長度與圖片尺寸不符。');
  const mask=new Uint8Array(size); let offset=0;
  rle.counts.forEach((n,i)=>{if(i%2)mask.fill(1,offset,offset+n);offset+=n;});return mask;
}
export function maskToLogits(rle) {
  const binary=decodeRLE(rle), logits=Float32Array.from(binary,v=>v?8:-8);
  return resizeFloat(logits,rle.width,rle.height,256,256);
}
export function selectMask(masks, scores, width, height) {
  dimensions(width,height);
  requireThat(masks?.type==='float32' && masks.dims.length===4 && masks.dims[0]===1 && masks.dims[2]===256 && masks.dims[3]===256 && masks.dims[1]===3 && masks.data.length===3*256*256, 'MODEL_OUTPUT','解碼器遮罩張量與固定模型契約不符。');
  requireThat(scores?.type==='float32' && scores.dims.join(',')==='1,3' && scores.data.length===3 && scores.data.every(Number.isFinite) && masks.data.every(Number.isFinite),'MODEL_OUTPUT','模型輸出含非有限值或形狀不符。');
  const values=Array.from(scores.data), index=values.indexOf(Math.max(...values));
  const lowRes=masks.data.slice(index*65536,(index+1)*65536);
  const resized=resizeFloat(lowRes,256,256,width,height);
  return {rle:encodeRLE(Uint8Array.from(resized,v=>v>0?1:0),width,height),lowRes,scores:values,selected:index};
}
