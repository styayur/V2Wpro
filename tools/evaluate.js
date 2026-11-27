import {chromium} from 'playwright'
import {mkdirSync} from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {buildSite,root} from './build.js'
import {serve} from '../src/server.js'
import {generateChunk,routeOpen} from '../src/world.js'
import {read,write} from '../src/media.js'

export async function evaluate(custom, remote, out='playtest'){
  mkdirSync(out,{recursive:true})
  let server,browser
  try{
    if(!remote){await buildSite(path.join(out,'site'),custom);server=await serve(path.join(out,'site'))}
    const url=remote||server.url
    browser=await chromium.launch({args:['--enable-unsafe-swiftshader']})
    const report={date:new Date().toISOString(),browser:browser.version(),platform:process.platform,renderer:null,viewport:[800,500],worlds:[]}
    for(const id of custom?['custom']:['arcade','island','gate']){
      const ctx=await browser.newContext({viewport:{width:800,height:500},recordVideo:{dir:path.join(out,'recordings'),size:{width:800,height:500}}})
      const page=await ctx.newPage(), errors=[]
      page.on('pageerror',e=>errors.push(e.message))
      page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
      await page.goto(url.replace(/\/$/,'')+'/?world='+id)
      await page.waitForFunction(()=>window.v2w?.stats.frames>4,null,{timeout:60000})
      const w=custom?read(custom):await page.evaluate(async id=>(await fetch('./examples/'+id+'.json')).json(),id)
      report.renderer=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)})
      await page.locator('canvas').screenshot({path:path.join(out,id+'.png')})
      await page.keyboard.down('Space')
      await page.waitForFunction(action=>{const s=window.v2w.stats;return action==='dash'?s.distance>0:action==='survey'?s.fov>64:s.altitude>2},w.motion.action)
      await page.keyboard.up('Space')
      await page.keyboard.down('KeyW')
      const travel=Math.min(w.rules.length*(w.streaming.radius+1)+1,w.rules.length*w.streaming.count-1)
      await page.waitForFunction(d=>window.v2w.stats.distance>=d,travel,{timeout:Math.max(60000,travel/w.motion.speed*8000)})
      await page.keyboard.up('KeyW')
      const stats=await page.evaluate(()=>({...structuredClone(window.v2w.stats),jsHeapBytes:performance.memory?.usedJSHeapSize??null}))
      const file=path.join(out,id+'.png')
      let colorSimilarity=null
      if(id==='arcade'){
        const {readFileSync}=await import('node:fs')
        colorSimilarity=await page.evaluate(async uri=>{
          async function histogram(src){
            const img=new Image();img.src=src;await img.decode()
            const c=document.createElement('canvas');c.width=64;c.height=36
            const g=c.getContext('2d');g.drawImage(img,0,0,64,36)
            const pixels=g.getImageData(0,0,64,36).data,h=new Array(64).fill(0)
            for(let i=0;i<pixels.length;i+=4)h[(pixels[i]>>6)*16+(pixels[i+1]>>6)*4+(pixels[i+2]>>6)]++
            return h
          }
          const a=await histogram('./examples/keyframe.png'),b=await histogram(uri)
          return a.reduce((n,v,i)=>n+Math.min(v,b[i]),0)/(64*36)
        },'data:image/png;base64,'+readFileSync(file).toString('base64'))
      }
      const fingerprint=()=>createHash('sha256').update(JSON.stringify(Array.from({length:w.streaming.count},(_,i)=>generateChunk(w,i)))).digest('hex')
      const hash=fingerprint();assert.equal(hash,fingerprint());assert.ok(routeOpen(w));assert.deepEqual(errors,[])
      if(w.streaming.count>w.streaming.radius+1)assert.ok(stats.unloaded>0)
      const {dt,...metrics}=stats,mean=dt.reduce((n,v)=>n+v,0)/dt.length
      report.worlds.push({id,seed:w.seed,hash,centreRouteOpen:true,errors,colorHistogramIntersection:colorSimilarity,...metrics,samples:dt.length,meanFrameMs:mean,fps:1000/mean,p95FrameMs:dt.sort((a,b)=>a-b)[Math.floor(dt.length*.95)]})
      const video=page.video()
      await ctx.close()
      await video.saveAs(path.join(out,'recordings',id+'.webm'))
      await video.delete()
    }
    write(path.join(out,'report.json'),report);return report
  }finally{await browser?.close();server?.close()}
}
