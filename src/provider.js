import {readdirSync,existsSync} from 'node:fs'
import path from 'node:path'
import {read,write} from './media.js'
// An adapter implements {id, capabilities, run({capability, inputs, brief})}.
export async function dispatch(adapter, capability, inputs, brief) {
  if (!['video','image','understanding','model3d'].includes(capability) || !adapter.capabilities.includes(capability)) throw Error('Unsupported provider capability')
  return {provider:adapter.id,capability,result:await adapter.run({capability,inputs,brief})}
}
export function analyze(root='.v2w') {
  const dir=path.join(root,'references')
  const inputs=existsSync(dir)?readdirSync(dir).filter(id=>/^[0-9a-f]{64}$/.test(id)).sort().map(id=>({directory:'references/'+id,...read(path.join(dir,id,'manifest.json'))})):[]
  if(!inputs.length) throw Error('Ingest a reference first')
  const task={status:'awaiting-review',inputs,brief:'Inspect frames in time order. Attribute observations to digest and seconds. Compare agreement and conflicts across clips. Choose rules explicitly and validate world.json.',output:'world.json'}
  write(path.join(root,'analysis-task.json'),task)
  return task
}
