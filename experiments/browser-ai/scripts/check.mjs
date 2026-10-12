import {readdir,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);let count=0;
async function walk(url) {for(const e of await readdir(url,{withFileTypes:true})) {
  if(['node_modules','vendor','.git','models'].includes(e.name))continue;
  const child=new URL(e.name+(e.isDirectory()?'/':''),url);
  if(e.isDirectory())await walk(child);
  else if(e.name.endsWith('.mjs')) {
    const r=spawnSync(process.execPath,['--check',fileURLToPath(child)],{encoding:'utf8'});
    if(r.status!==0)throw new Error(r.stderr);count++;
    const text=await readFile(child,'utf8');
    for(const match of text.matchAll(/(?:from\s*|import\s*\()(['"])(\.[^'"]+)\1/g)) {
      if(match[2].includes('/vendor/'))continue;
      await readFile(new URL(match[2],child));
    }
  }
}}
await walk(root);console.log(`CHECK PASS: ${count} JavaScript modules; relative imports resolve.`);
