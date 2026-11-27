import { readFileSync, writeFileSync } from "node:fs";
import { movementEnvelope } from "../src/movement.js";
import { realize } from "../src/morph.js";
import { exportExchange } from "./export-exchange.js";

const [source, profilePath, seedText, output] = process.argv.slice(2);
if (!output || !/^\d+$/.test(seedText)) throw Error("Usage: source.json profile.json seed output-prefix");
const read = path => JSON.parse(readFileSync(path,"utf8"));
const world = read(source), profile = read(profilePath);
const { contactLength, brakingDistance, turnRadius } = movementEnvelope(profile);
world.seed = Number(seedText);
const scene = realize(world);
const launch = world.topology.nodes.find(node => node.id === world.topology.spawn);
const high = Math.max(...scene.solids.map(s => s.center[1] + s.extent[1]));
const length = Math.ceil(contactLength + 2 * brakingDistance);
const cycles = 2 + world.seed % 2;
const thickness = Math.min(6, 1 / (turnRadius * 0.45 * (2 * Math.PI * cycles / length) ** 2));
const evidence = "continuousRoof";
const deck = {op:"transform",evidence,offset:[0,high+thickness/2-launch.position[1],-length/2],
  child:{op:"emit",shape:"box",material:"stone",solid:true,evidence,size:[26,thickness,length]}};
world.evidence.push({id:evidence,kind:"decision",source:"docs/contact-study.md",
  claim:"Extend the roof through the acquisition, contact and braking intervals.",confidence:1});
world.prototypes.contactLaunch = {op:"group",evidence,children:[{op:"use",evidence,ref:launch.rule},deck]};
launch.rule = "contactLaunch";
world.extensions.contactDeck = {version:1,cycles,evidence};
world.extensions.movementProfile = profile;
world.name += " · Contact study";
const glb = exportExchange(world);
writeFileSync(output+".json",JSON.stringify(world,null,2)+"\n",{flag:"wx"});
writeFileSync(output+".glb",glb,{flag:"wx"});
