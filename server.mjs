// Hosting gateway only: no model calls, local runner, shell or workspace APIs.
import { createServer } from 'node:http';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const digest = value => createHash('sha256').update(value).digest();
const loginStyle = 'body{margin:0;background:#f4f1eb;color:#242320;font:18px/1.6 system-ui}main{max-width:480px;margin:12vh auto;padding:36px;border-top:3px solid #ac431c}h1{font:42px/1.15 Georgia,serif}label{display:block;font-weight:600}input{display:block;box-sizing:border-box;width:100%;padding:14px;margin:10px 0 20px;font:inherit;border:1px solid #777;background:#fff}button{padding:14px 22px;background:#242320;color:#fff;border:0;font:inherit;cursor:pointer}p{color:#55534e}input:focus,button:focus{outline:3px solid #ac431c;outline-offset:3px}@media(max-width:600px){main{margin:8vh 16px;padding:24px}}';
const ttl = 8 * 60 * 60 * 1000;
export function gateway({ root, password = () => process.env.DEMO_PASSWORD, hosts = () => (process.env.DEMO_HOSTS || '').split(','), now = Date.now } = {}) {
 const base = realpathSync(root), sessions = new Map();
 let prior, failures = 0, windowEnd = 0;
 return createServer(async (req,res) => {
  const headers = {'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Strict-Transport-Security':'max-age=31536000'};
  const send = (code,body='',extra={}) => {res.writeHead(code,{...headers,...extra});res.end(req.method==='HEAD'?'':body);};
  const clear = '__Host-loom=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
  try {
   const secret = password();
   if (!secret || Buffer.byteLength(secret)<8) return send(503,'Private demo is not configured.');
   const fingerprint = digest(secret).toString('hex');
   if(prior!==fingerprint){sessions.clear();prior=fingerprint;}
   const host = req.headers.host;
   if (!host || !hosts().includes(host)) return send(403,'Unknown demo host.');
   const url = new URL(req.url,'https://'+host);
   if (url.pathname==='/login' && ['GET','HEAD'].includes(req.method)) return send(200,'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,nofollow"><title>Private Loom demonstration</title><style>'+loginStyle+'</style><main><h1>Private Loom demonstration</h1><p>For invited presentations. Enter the shared demo password.</p><form method="post" action="/login"><label>Password <input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><button>Open demonstration</button></form><p>Access expires after eight hours. No customer data belongs in this demonstration.</p></main></html>',{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':headers['Content-Security-Policy'].replace("style-src 'self'","style-src 'sha256-"+digest(loginStyle).toString('base64')+"'")});
   if(req.method==='POST') {
    if(req.headers.origin!=='https://'+host) return send(403,'Invalid request origin.');
    if(url.pathname!=='/login'&&url.pathname!=='/logout')return send(404);
    if(url.pathname==='/logout'){
     const token=req.headers.cookie?.match(/(?:^|;\s*)__Host-loom=([a-f0-9]{64})(?:;|$)/)?.[1];
     if(token)sessions.delete(token);
     return send(303,'',{'Location':'/login','Set-Cookie':clear});
    }
    if(now()>windowEnd){failures=0;windowEnd=now()+60000;}
    if(failures>=30)return send(429,'Too many attempts. Try again in one minute.',{'Retry-After':'60'});
    if(req.headers['content-type']?.split(';')[0]!=='application/x-www-form-urlencoded')return send(415);
    let body='';for await(const chunk of req){body+=chunk;if(body.length>1024)return send(413);}
    const attempt=new URLSearchParams(body).get('password')||'';
    if(!timingSafeEqual(digest(attempt),digest(secret))){failures++;return send(401,'Password not accepted. Return to /login and try again.');}
    for(const [token,until] of sessions)if(until<=now())sessions.delete(token);
    if(sessions.size>=2000)return send(503,'Session capacity reached. Try later.');
    const token=randomBytes(32).toString('hex');sessions.set(token,now()+ttl);
    return send(303,'',{'Location':'/','Set-Cookie':`__Host-loom=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${ttl/1000}`});
   }
   if(!['GET','HEAD'].includes(req.method))return send(405);
   const token=req.headers.cookie?.match(/(?:^|;\s*)__Host-loom=([a-f0-9]{64})(?:;|$)/)?.[1];
   if(!token||!(sessions.get(token)>now()))return send(303,'',{'Location':'/login','Set-Cookie':clear});
   let path;try{path=decodeURIComponent(url.pathname);}catch{return send(400);}
   if(path.includes('\\')||path.includes('\0'))return send(400);
   const candidate=resolve(base,'.'+(path==='/'?'/index.html':path));
   if(!candidate.startsWith(base+sep))return send(404);
   let file;try{file=realpathSync(candidate);if(file!==candidate||!statSync(file).isFile())return send(404);}catch{return send(404);}
   const types={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2','.txt':'text/plain','.log':'text/plain','.patch':'text/plain','.md':'text/plain'};
   return send(200,readFileSync(file),{'Content-Type':(types[extname(file)]||'application/octet-stream')+'; charset=utf-8'});
  }catch{return send(500,'Demo request failed.');}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const server=gateway({root:process.env.DEMO_ROOT||resolve('dist')});
 server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('Private demo gateway listening'));
}
