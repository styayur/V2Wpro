import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileKineticWorld, departureRelief, flightModuleLibrary, helicalReturn, makeKineticWorld } from "../src/kinetic-world.js";
import { measureSurfaceError } from "../src/parametric.js";
import { inspectKineticWorld } from "../src/motion-analysis.js";
import { exportExchange } from "../src/exchange.js";

const [baseline,output]=process.argv.slice(2);
if (!output) throw Error("Usage: measure-topogenesis.js V0.3.0_CHECKOUT NEW_REPORT");
const old=await import(pathToFileURL(path.resolve(baseline,"src/exchange.js")));
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const read=file=>JSON.parse(readFileSync(file,"utf8"));
const round=n=>Math.round(n*1000)/1000;
const legacy=[];
function time(fn) {
  const cpu=process.cpuUsage(), start=performance.now();
  const result=fn(), delta=process.cpuUsage(cpu);
  return {result,wallMs:round(performance.now()-start),cpuMs:round((delta.user+delta.system)/1000)};
}
for (const id of ["canopy","caldera","lattice","contact","district"]) {
  const w=read(path.join(baseline,"examples",id+".json"));
  const oldBytes=old.exportExchange(w), newBytes=exportExchange(w);
  if (sha(oldBytes)!==sha(newBytes)) throw Error("Historical GLB changed: "+id);
  const timings={baseline:[],candidate:[]};
  for (let i=0;i<8;i++) {
    for (const name of i%2 ? ["candidate","baseline"]:["baseline","candidate"]) {
      const {wallMs,cpuMs}=time(()=> (name==="baseline" ? old.exportExchange : exportExchange)(w));
      timings[name].push({wallMs,cpuMs});
    }
  }
  legacy.push({id,sha256:sha(newBytes),bytes:newBytes.length,timings});
}
const library=flightModuleLibrary(), probes=library.modules.flatMap(module=>
  measureSurfaceError(module,1,departureRelief(module.id,1,library.profile,2),helicalReturn(module.id,library.profile,2))
    .map(row=>({module:module.id,...row})));
if (!probes.every(p=>p.withinTolerance)) throw Error("Corrected library exceeds geometry tolerance");
const samples=[];
for (const seed of [8131,8132,10243,18731,25057,31607,40751,48947,55001,62819,71023,79757,87337,95603,
  104729,112909,120011,131071,140053,150001]) {
  for (const profile of ["cruise","boost"]) {
    for (const {id} of library.modules) {
      const world=makeKineticWorld(id,seed,profile,2);
      const built=time(()=>compileKineticWorld(world));
      const inspected=time(()=>inspectKineticWorld(built.result));
      const glb=time(()=>exportExchange(world));
      const digest=sha(glb.result);
      if (digest!==sha(exportExchange(world))) throw Error("Nondeterministic geometry");
      const report=inspected.result,e=report.edges.find(edge=>edge.id==="study");
      samples.push({seed,profile,module:id,sha256:digest,glbBytes:glb.result.length,
        buildMs:built.wallMs,buildCpuMs:built.cpuMs,inspectMs:inspected.wallMs,inspectCpuMs:inspected.cpuMs,
        exportMs:glb.wallMs,renderTriangles:report.renderTriangles,collisionTriangles:report.collisionTriangles,
        heapUsed:process.memoryUsage().heapUsed,level:e.level,reasons:e.reasons,minimumClearance:e.minimumClearance,
        minimumSpeed:e.minimumSpeed,length:e.length,departures:e.launches.map(l=>l.feasible)});
    }
  }
}
writeFileSync(output,JSON.stringify({format:"topogenesis-measurement-1",node:process.version,platform:process.platform,
  cpu:cpus()[0]?.model,rssPeakKiB:process.resourceUsage().maxRSS,legacy,probes,samples},null,2)+"\n",{flag:"wx"});
