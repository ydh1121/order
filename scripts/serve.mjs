import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, resolve, sep } from "node:path";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const publicRoot=join(root,"app");
const port=Number(process.env.PORT||4173);
const type={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8"};
createServer(async(req,res)=>{
  const u=new URL(req.url,"http://localhost");
  let f = u.pathname.startsWith("/src/")||u.pathname.startsWith("/data/")?
    join(root,u.pathname):join(publicRoot,u.pathname);
  const safe= f.startsWith(root+sep);
  if(!safe){res.writeHead(403).end();return;}
  try{const st=await stat(f);if(st.isDirectory())f=join(f,"index.html");}
  catch{if(!extname(u.pathname))f=join(publicRoot,"index.html");}
  try{const bytes=await readFile(f);res.writeHead(200,{"Content-Type":type[extname(f)]||"application/octet-stream","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}).end(bytes);}
  catch{res.writeHead(404).end("Not Found")}
}).listen(port,"127.0.0.1",()=>console.log("order.ooo local UI: http://127.0.0.1:"+port+" (NOT a production endpoint)"));
