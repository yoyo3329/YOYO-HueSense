import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
export function resolvePublicPath(path) {
  const file=resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+sep))return null;
  const rel=file.slice(root.length).split(/[\\/]/);
  if(rel.some(p=>p.startsWith('.')||p==='node_modules'||p==='models'))return null;
  return file;
}
export function makeServer() {
  return createServer(async(req,res)=>{
    try {
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
      const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      const file=resolvePublicPath(path);
      if(!file){res.writeHead(403).end();return;}
      const size=(await stat(file)).size;
      const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.json':'application/json'};
      res.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Content-Length':size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end(req.method==='HEAD'?undefined:await readFile(file));
    }catch {res.writeHead(404).end('Not found');}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.HUESENSE_PORT??8788),server=makeServer();
  server.on('error',error=>{console.error(`Server failed: ${error.message}. No other server was stopped.`);process.exitCode=1;});
  server.listen(port,'127.0.0.1',()=>console.log(`HueSense experiment: http://localhost:${port}/ (Ctrl+C to stop this server only)`));
}
