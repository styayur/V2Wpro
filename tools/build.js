import {build} from 'esbuild'
import {cpSync,mkdirSync,existsSync,readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import {validate} from '../src/validate.js'
export const root=fileURLToPath(new URL('../',import.meta.url))
export async function buildSite(out='dist',custom){
  mkdirSync(out,{recursive:true})
  cpSync(path.join(root,'web'),out,{recursive:true,filter:f=>!f.endsWith('.js')})
  cpSync(path.join(root,'examples'),path.join(out,'examples'),{recursive:true})
  if(custom){
    const w=validate(JSON.parse(readFileSync(custom,'utf8')))
    for(const {uri} of w.assets){
      const target=path.join(out,'examples',uri)
      mkdirSync(path.dirname(target),{recursive:true})
      cpSync(path.resolve(path.dirname(custom),uri),target)
    }
    cpSync(custom,path.join(out,'examples/custom.json'))
  }
  await build({entryPoints:[path.join(root,'web/app.js')],bundle:true,minify:true,legalComments:'eof',format:'esm',outfile:path.join(out,'app.js')})
  const notices=['three','ajv','fast-deep-equal','fast-uri','json-schema-traverse','require-from-string'].map(id=>{
    const dir=path.join(root,'node_modules',id)
    const f=['LICENSE','LICENSE.md','LICENSE.txt'].find(f=>existsSync(path.join(dir,f)))
    return id+'\n'+readFileSync(path.join(dir,f),'utf8')
  })
  writeFileSync(path.join(out,'THIRD-PARTY.txt'),notices.join('\n\n'))
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await buildSite()
