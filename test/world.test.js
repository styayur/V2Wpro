import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,rmSync,existsSync} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {read,ingest} from '../src/media.js'
import {validate} from '../src/validate.js'
import {generateChunk,routeOpen,visibleChunks,blocked} from '../src/world.js'
import {analyze,dispatch} from '../src/provider.js'
import {compileFlight} from '../tools/compile-flight.js'
for(const id of ['arcade','island','gate']){
  test(id+' validates and streams deterministically',()=>{
    const w=validate(read('examples/'+id+'.json'))
    const before=generateChunk(w,0)
    generateChunk(w,4)
    assert.deepEqual(generateChunk(w,0),before)
    assert.notDeepEqual(generateChunk({...w,seed:w.seed+1},0),before)
    assert.ok(routeOpen(w))
    assert.deepEqual(visibleChunks(w,0),[0,1])
    assert.deepEqual(visibleChunks(w,w.rules.length*3),[2,3,4])
    assert.ok(before.items.length<=w.budget.instances)
  })
}
test('invalid version, unsafe asset path, unknown fields, bad budget and bounds',()=>{
  const w=read('examples/arcade.json')
  for(const change of [{version:'2'},{typo:1},{assets:[{uri:'../x.glb',license:'MIT',source:'test'}]},{budget:{instances:1,pixelRatio:1}}])assert.throws(()=>validate({...w,...change}))
  assert.throws(()=>generateChunk(w,-1));assert.throws(()=>ingest('unknown.txt'))
  assert.ok(blocked([{center:[0,0,0],extent:[1,1,1]}],[1.1,0,0],.2))
})
test('adapter capability routing',async()=>{
  const adapter={id:'test-only',capabilities:['image'],run:async x=>x.brief}
  assert.equal((await dispatch(adapter,'image',[],'contract test')).result,'contract test')
  await assert.rejects(dispatch(adapter,'video',[],''))
})
test('decode, review, compile and generate from licensed source',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'v2w-'))
  try{
    assert.throws(()=>analyze(dir))
    const out=path.join(dir,'world.json'),review=read('examples/flight-analysis.json')
    const w=compileFlight('examples/reference.mp4',review,read('examples/flight-design.json'),out,dir)
    assert.deepEqual(w,read('examples/arcade.json'))
    ingest('examples/keyframe.png',dir)
    assert.equal(analyze(dir).inputs.length,2)
    assert.ok(existsSync(out)&&routeOpen(w))
  }finally{rmSync(dir,{recursive:true,force:true})}
})
