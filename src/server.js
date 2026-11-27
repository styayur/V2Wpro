import http from 'node:http'
import {readFile} from 'node:fs/promises'
import path from 'node:path'
export async function serve(dir,port=0){
  const base=path.resolve(dir),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp4':'video/mp4','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.glb':'model/gltf-binary'}
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost')
      const f=path.resolve(base,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname))
      if(!f.startsWith(base+path.sep)) throw Error()
      const data=await readFile(f)
      res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});res.end(data)
    }catch{res.writeHead(404);res.end()}
  })
  await new Promise((resolve,reject)=>server.once('error',reject).listen(port,'127.0.0.1',resolve))
  return {url:'http://127.0.0.1:'+server.address().port,close:()=>server.close()}
}
