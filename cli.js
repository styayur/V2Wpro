#!/usr/bin/env node
import {existsSync,mkdirSync,copyFileSync,cpSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {read,write,ingest} from './src/media.js'
import {analyze} from './src/provider.js'
import {validate} from './src/validate.js'
import {generateChunk} from './src/world.js'
const examples=fileURLToPath(new URL('./examples/',import.meta.url))
const [cmd,arg]=process.argv.slice(2)
async function main(){
  const file=arg||'world.json'
  switch(cmd){
    case 'init':
      if(existsSync('world.json'))throw Error('world.json already exists')
      if(!['arcade','gate','island'].includes(arg||'arcade'))throw Error('Expected arcade, island or gate')
      const template=read(path.join(examples,(arg||'arcade')+'.json'))
      for(const {uri} of template.assets){
        if(existsSync(uri))throw Error('Asset already exists: '+uri)
        mkdirSync(path.dirname(uri),{recursive:true});copyFileSync(path.join(examples,uri),uri)
      }
      write('world.json',template);return
    case 'ingest':return ingest(arg)
    case 'analyze':return analyze()
    case 'validate':validate(read(file));return 'Valid WorldIR 1.0'
    case 'generate':{
      const w=validate(read(file));const chunks=Array.from({length:w.streaming.count},(_,i)=>generateChunk(w,i))
      mkdirSync('.v2w',{recursive:true});write('.v2w/chunks.json',chunks);return chunks.length+' chunks'
    }
    case 'preview':{
      const {buildSite}=await import('./tools/build.js'),{serve}=await import('./src/server.js')
      const custom=arg||(existsSync('world.json')?'world.json':undefined)
      await buildSite('.v2w/site',custom);const server=await serve('.v2w/site',Number(process.env.PORT||4173))
      return server.url+(custom?'/?world=custom':'/')
    }
    case 'evaluate':return (await import('./tools/evaluate.js')).evaluate(arg||(existsSync('world.json')?'world.json':undefined))
    case 'report':return read(arg||'playtest/report.json')
    default:if(cmd&&!['help','--help','-h'].includes(cmd))throw Error('Unknown command '+cmd)
      return 'v2w init [arcade|island|gate] | ingest FILE | analyze | validate [WORLD] | generate [WORLD] | preview [WORLD] | evaluate [WORLD] | report [REPORT]'
  }
}
try{const result=await main();if(result!==undefined)console.log(typeof result==='string'?result:JSON.stringify(result,null,2))}
catch(error){console.error(error.message);process.exitCode=1}
