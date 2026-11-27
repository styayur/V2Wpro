import { writeFileSync } from "node:fs";
import { exportExchange } from "./export-exchange.js";

// Original finite architectural study. The WorldIR document contains all
// expanded placement rules, so preview and replay need no build-time script.
const [seedText, prefix] = process.argv.slice(2);
const seed = Number(seedText);
if (!prefix || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
  throw Error("Usage: node tools/build-flight-district.js uint32 output-prefix");
const evidence = "district";
const box = (position,size,material="stone",solid=true) => ({
  op:"transform",evidence,offset:position,child:{op:"emit",evidence,shape:"box",size,material,solid}
});
const group = children => ({op:"group",evidence,children});
const tower = box([0,52.5,-120],[55,105,240]);
const facade = [], helix = [], arcade = [], canyon = [];
for (let i=0;i<28;i++) {
  const wave = Math.sin(i*0.32 + (seed % 7)*0.2);
  facade.push(box([-100+8*wave,36,-12*i],[7,72,12]));
  const angle = i*Math.PI/9 + (seed%9)*0.08;
  helix.push(box([116+20*Math.cos(angle),15+i*5,-110+20*Math.sin(angle)],[16,6,16],"accent"));
}
for (let i=0;i<7;i++) {
  const z = -48*i;
  for (const side of [-1,1]) {
    arcade.push(box([180+side*18,26,z],[4,52,9]));
    canyon.push(box([-190+side*27,24+i%3*3,z],[14,48+i%3*6,38]));
  }
  arcade.push(box([180,54,z],[40,4,9],"accent"));
}
const nodes = [
  {id:"approach",position:[0,32,90],rule:"district"},
  {id:"crest",position:[0,132,22],rule:"signal"},
  {id:"exit",position:[0,132,-226],rule:"signal"},
  {id:"survey",position:[110,190,-110],rule:"signal"},
];
const origin = nodes[0].position;
const world = {version:"2.0",name:"Flyable Architecture · Relay District",seed,
  style:{sky:"#cab2a9",stone:"#738e8c",accent:"#bb6675",light:1.7},motion:{action:"flight",speed:42},
  physics:{radius:3.2},streaming:{cellSize:128,radius:3},budget:{instances:512,operations:4096},
  assets:[],unknowns:["Helical terraces and facade seams require independent contact qualification."],
  topology:{spawn:"approach",nodes,edges:[["approach","crest"],["crest","exit"],["exit","survey"]]},
  prototypes:{district:{op:"transform",evidence,offset:origin.map(v=>-v),
    child:group([tower,group(facade),group(helix),group(arcade),group(canyon)])},
    signal:box([8,0,0],[1,3,1],"accent",false)},
  evidence:[{id:evidence,kind:"decision",source:"docs/contact-study.md",confidence:1,
    claim:"A finite district isolates a convex transfer wall, serpentine facade, spiral tower terraces, aerial arcade and relay canyon."}],
  extensions:{flightEntry:{version:1,position:origin,toward:[0,32,0]}}
};
const glb = exportExchange(world);
writeFileSync(prefix+".json",JSON.stringify(world,null,2)+"\n",{flag:"wx"});
writeFileSync(prefix+".glb",glb,{flag:"wx"});
