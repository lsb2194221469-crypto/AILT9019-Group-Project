import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POST } from './lib/generate.mjs';
import { serviceConfig } from './lib/quiz.mjs';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
export function createApp(env=process.env) {
  return http.createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Cache-Control','no-store');
    const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try {
      const origin=env.RENDER_EXTERNAL_URL || `http://127.0.0.1:${res.socket.localPort}`;
      const url=new URL(req.url,origin);
      if(url.pathname==='/healthz' && req.method==='GET') return json(200,{status:'ok'});
      if(url.pathname==='/api/config' && req.method==='GET') {
        const configured=Boolean(serviceConfig(env));
        return json(200,{configured,label:configured?'在线 AI 出题服务':'待管理员配置模型服务'});
      }
      if(url.pathname==='/api/generate' && req.method==='POST') {
        const request=new Request(new URL('/api/generate',origin),{method:'POST',headers:req.headers,body:Readable.toWeb(req),duplex:'half'});
        const response=await POST(request,env);
        res.writeHead(response.status,Object.fromEntries(response.headers));
        return res.end(Buffer.from(await response.arrayBuffer()));
      }
      if(!['GET','HEAD'].includes(req.method))return json(405,{error:'Method not allowed'});
      if(url.pathname.startsWith('/api/'))return json(404,{error:'Not found'});
      const name=decodeURIComponent(url.pathname==='/'?'/workspace.html':url.pathname);
      const path=resolve(publicDir,'.'+name);
      if(!path.startsWith(resolve(publicDir)+sep))return json(404,{error:'Not found'});
      if(!(await stat(path)).isFile())return json(404,{error:'Not found'});
      const extension=path.slice(path.lastIndexOf('.'));
      if(!mime[extension])return json(404,{error:'Not found'});
      res.writeHead(200,{'Content-Type':mime[extension]});
      res.end(req.method==='HEAD'?undefined:await readFile(path));
    } catch(error) {
      if(res.headersSent)return res.end();
      json(['ENOENT','ENOTDIR','URIError'].includes(error.code||error.name)?404:500,{error:'请求无法完成。'});
    }
  });
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=createApp();
  server.requestTimeout=130000;
  server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Lecture Lab listening on port '+server.address().port));
  const stop=()=>server.close(()=>process.exit(0));
  process.on('SIGTERM',stop);
  process.on('SIGINT',stop);
}
