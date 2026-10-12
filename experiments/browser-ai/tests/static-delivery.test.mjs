import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {resolvePublicPath} from '../scripts/serve.mjs';
test('static delivery resolves index/Worker/runtime and rejects traversal/private paths without launching a server',async()=>{
  for(const p of ['/','/worker.mjs','/runtime.mjs','/browser-test.html'])assert.ok((await stat(resolvePublicPath(p))).isFile());
  for(const p of ['/../../etc/passwd','/.env','/node_modules/x','/models/weights.onnx'])assert.equal(resolvePublicPath(p),null);
  const html=await readFile(resolvePublicPath('/'),'utf8');assert.ok(html.includes('src="app.mjs"'));
});
