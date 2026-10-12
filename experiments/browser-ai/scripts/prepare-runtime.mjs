import {cp,mkdir,readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {MODEL} from '../model-config.mjs';
const root=new URL('../',import.meta.url), source=new URL('node_modules/onnxruntime-web/',root);
const pkg=JSON.parse(await readFile(new URL('package.json',source),'utf8'));
if(pkg.version!==MODEL.runtime)throw new Error(`Runtime version mismatch: ${pkg.version}`);
await mkdir(new URL('vendor/',root),{recursive:true});
for(const file of await readdir(new URL('dist/',source))) {
  if(file==='ort.webgpu.min.mjs'||file.startsWith('ort-wasm-simd-threaded.jsep.'))await cp(new URL('dist/'+file,source),new URL('vendor/'+file,root));
}
await cp(new URL('node_modules/onnxruntime-web/README.md',root),new URL('vendor/ORT-README.md',root));
await cp(new URL('licenses/ONNX-RUNTIME-MIT.txt',root),new URL('vendor/ORT-LICENSE.txt',root));
console.log(`Prepared same-origin ONNX Runtime ${pkg.version}: ${fileURLToPath(new URL('vendor/',root))}`);
