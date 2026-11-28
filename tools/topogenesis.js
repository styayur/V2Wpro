import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { moduleLibrary } from "../src/parametric.js";
import { flightModuleLibrary, makeKineticWorld } from "../src/kinetic-world.js";
import { exportExchange } from "../src/exchange.js";

const [command,...args]=process.argv.slice(2);
if (command === "library" && args.length === 1) {
  writeFileSync(args[0],JSON.stringify(moduleLibrary())+"\n",{flag:"wx"});
} else if (command==="flight-library" && args.length===3) {
  writeFileSync(args[2],JSON.stringify(flightModuleLibrary(args[0],Number(args[1])))+"\n",{flag:"wx"});
} else if (["fixture","district"].includes(command) && args.length === 5) {
  const [module,seed,profile,revision,prefix]=args;
  if (!/^\d{1,10}$/.test(seed) || !/^\d+$/.test(revision) || existsSync(prefix+".json") || existsSync(prefix+".glb"))
    throw Error("Expected a uint32 seed, rule revision and unused output prefix");
  const world=makeKineticWorld(module,Number(seed),profile,Number(revision),command);
  const bytes=exportExchange(world);
  writeFileSync(prefix+".json",JSON.stringify(world,null,2)+"\n",{flag:"wx"});
  writeFileSync(prefix+".glb",bytes,{flag:"wx"});
} else if (command === "inspect" && args.length === 2) {
  const { inspectWorld }=await import("../src/motion-analysis.js");
  const report=inspectWorld(JSON.parse(readFileSync(args[0],"utf8")));
  writeFileSync(args[1],JSON.stringify(report,null,2)+"\n",{flag:"wx"});
} else {
  throw Error("Usage: topogenesis.js library FILE | flight-library cruise|boost REVISION FILE | fixture|district MODULE UINT32 cruise|boost REVISION NEW_PREFIX | inspect WORLD REPORT");
}
