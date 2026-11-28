import { chunkSize, designModule, moduleIds, sweepMesh } from "./parametric.js";
import { BoxGeometry } from "three";
import { contactDeck, deckCycles } from "./contact-deck.js";
import { realize } from "./morph.js";
import { validateKineticRecipe } from "./kinetic-contract.js";
import { movementEnvelope } from "./movement.js";
import cruise from "../examples/profiles/skimmer-cruise.json" with {type:"json"};
import boost from "../examples/profiles/skimmer-boost.json" with {type:"json"};

const identityFrame = {right:[1,0,0], up:[0,1,0]};
const flatten = t => t*t*(3-2*t);
export function deriveSeed(seed, ...keys) {
  let n = (2166136261 ^ seed) >>> 0;
  for (const c of keys.join("/")) n = Math.imul(n^c.charCodeAt(0),16777619) >>> 0;
  n = Math.imul(n^(n>>>16),0x85ebca6b) >>> 0;
  return (n^(n>>>13)) >>> 0;
}
function uint32(n) { return Number.isInteger(n) && n >= 0 && n <= 0xffffffff; }
export function kineticProfile(name) {
  if (name !== "cruise" && name !== "boost") throw Error("Expected cruise or boost profile");
  return {...(name === "boost" ? boost : cruise), version:2, minimumSpeed:34,
    forwardAcceleration:26, departureSeconds:1, departurePitchRadians:0.065};
}

// Neutral LB release carries the incoming tangent. Reserve half a second
// of travel and a half-metre measurement margin before the hull can meet
// a rising deck. For y = H sin²(pi z/L), |y''| <= 2 pi² H/L².
export function departureRelief(id,scale,profile,revision) {
  if (!revision || !["sky-arch","bowl"].includes(id)) return 1;
  const margin=profile.clearance-profile.hullRadius-0.5;
  const travel=0.55*profile.speed;
  const curvature=2*Math.max(0.01,margin)/travel**2;
  const heightLimit=curvature*chunkSize**2/(2*Math.PI**2);
  return Math.min(1,heightLimit/((id==="sky-arch" ? 38 : 18)*scale));
}

export function helicalReturn(id,profile,revision) {
  if (revision<2 || id!=="helix") return 0;
  // The descending strand formerly intercepted a pilot who left the first
  // quarter-turn along its incoming tangent. Bend the return out to the side
  // of that corridor, preserving both sockets and the complete climbing loop.
  return 2*(16+profile.clearance+profile.hullRadius);
}

function validateRecipe(recipe, seed) {
  if (!uint32(seed)) throw Error("Invalid uint32 kinetic seed");
  validateKineticRecipe(recipe);
}

function slab(z0,z1) {
  const rows=[{t:0,center:[0,0,z0],...identityFrame},{t:1,center:[0,0,z1],...identityFrame}];
  return {id:"apron",section:[[-16,0],[16,0],[16,-1.6],[-16,-1.6]],closedSection:true,
    stations:rows,collisionStations:rows,shells:[]};
}

// Boundary identity is a function of the world and the shared coordinates.
// A neighbouring region does not need the previous region's state.
function boundary(seed, col, row) {
  const key = "port-" + col + "-" + row;
  const unit = deriveSeed(seed,"boundary",col,row)/0xffffffff;
  return {id:key,point:[col*154 + 18*(unit-0.5), 38 + 18*unit, row*chunkSize]};
}

export function planKineticRegion(recipe,seed) {
  validateRecipe(recipe,seed);
  if (recipe.mode === "fixture") {
    return [{id:"approach",from:{id:"start",point:[0,0,-90]},to:{id:"entry",point:[0,0,0]},module:"apron"},
      {id:"study",from:{id:"entry",point:[0,0,0]},to:{id:"exit",point:[0,0,220]},module:recipe.module},
      {id:"runout",from:{id:"exit",point:[0,0,220]},to:{id:"end",point:[0,0,360]},module:"apron"}];
  }
  const edges=[];
  const col=2*recipe.regionX, row=3*recipe.regionZ;
  function connect(x,z,dx,module) {
    const from=boundary(seed,x,z), to=boundary(seed,x+dx,z+1);
    edges.push({id:from.id+"-to-"+to.id,from,to,module});
  }
  // Fix the directed connections first; module selection cannot remove a port.
  for (let j=0; j<3; j++) {
    for (let i=0; i<2; i++) {
      const n=deriveSeed(seed,"module",col+i,row+j);
      connect(col+i,row+j,0,moduleIds[n%moduleIds.length]);
    }
    connect(col+(j%2),row+j,j%2 ? -1 : 1,"ribbon-bridge");
  }
  return edges;
}

export function makeKineticWorld(module,seed,profile="cruise",ruleRevision=0,mode="fixture") {
  const recipe={version:1,mode,module,profile,ruleRevision,relief:1,regionX:0,regionZ:0};
  const plan=planKineticRegion(recipe,seed), first=plan[0].from.point, last=plan.at(-1).to.point;
  const entry=[first[0], first[1]+10,first[2]+8];
  const end=[last[0],last[1]+90,last[2]];
  return {version:"2.0",name:mode === "fixture" ? "Topogenesis · "+module : "Topogenesis · Switchyard",
    seed, style:{sky:"#c6c2bb",stone:"#6c8f89",accent:"#c96d53",light:1.65},
    motion:{action:"flight",speed:46},physics:{radius:3.2},streaming:{cellSize:128,radius:3},
    budget:{instances:128,operations:1024},assets:[],unknowns:["Engine traversal requires a digest-bound downstream replay."],
    topology:{spawn:"approach",nodes:[{id:"approach",position:entry,rule:"beacon"},
      {id:"survey",position:end,rule:"beacon"}],edges:[["approach","survey"]]},
    prototypes:{beacon:{op:"transform",evidence:"sweep",offset:[-45,-24,0],
      child:{op:"emit",shape:"box",material:"accent",solid:true,evidence:"sweep",size:[3,8,3]}}},
    evidence:[{id:"sweep",kind:"decision",source:"docs/topogenesis.md",confidence:1,
      claim:"Lay out common boundary sockets before sweeping original deck and vault sections."}],
    extensions:{kineticRecipe:recipe,flightEntry:{version:1,position:entry,toward:[entry[0],entry[1],entry[2]+20]}}};
}

export function compileKineticWorld(world, realization) {
  const recipe=world.extensions?.kineticRecipe;
  if (!recipe) return null;
  const plan=planKineticRegion(recipe,world.seed);
  const preset=kineticProfile(recipe.profile), override=world.extensions.movementProfile;
  if (override) movementEnvelope(override);
  const profile={...preset,...override,version:2};
  movementEnvelope(profile);
  const surfaces=[], edges=[], sockets=new Map(), modules=new Map();
  for (const link of plan) {
    const start=link.from.point, end=link.to.point;
    const delta=end.map((n,i)=>n-start[i]);
    let module;
    if (link.module === "apron") module=slab(0,delta[2]);
    else {
      const scale=recipe.relief*(0.91+0.12*deriveSeed(world.seed,link.id,"shape")/0xffffffff);
      const key=link.module+"/"+scale;
      if (!modules.has(key)) modules.set(key,designModule(link.module,scale,
        departureRelief(link.module,scale,profile,recipe.ruleRevision),
        helicalReturn(link.module,profile,recipe.ruleRevision)));
      module=modules.get(key);
    }
    function place(p,t) {
      // Blend the port offset with zero endpoint slope. All stored ring
      // coordinates are metres in a common, right-handed frame.
      const f=flatten(t);
      return [start[0]+p[0]+delta[0]*f,start[1]+p[1]+delta[1]*f,start[2]+p[2]];
    }
    for (const [i,part] of [module,...module.shells].entries()) {
      surfaces.push({id:link.id+(i ? "-"+part.id : "-deck"),module:link.module,
        material:i || link.module === "ribbon-bridge" ? "accent":"stone",
        render:sweepMesh(part,false,place),collision:sweepMesh(part,true,place)});
    }
    const points=module.collisionStations.map(row=>place(row.center.map((v,i)=>v+profile.clearance*row.up[i]),row.t));
    edges.push({id:link.id,from:link.from.id,to:link.to.id,module:link.module,points,
      zones:[{kind:"capture",from:0,to:0.18},{kind:"glide",from:0.12,to:0.86},
        {kind:"release",from:0.45,to:0.93},{kind:"escape",from:0.87,to:1}]});
    sockets.set(link.from.id,link.from.point);
    sockets.set(link.to.id,link.to.point);
  }
  const items=(realization ?? realize(world,{includeSolidity:true})).items;
  const legacyColliders=items.filter(item=>item.solid).map(item=>{
    const cycles=deckCycles(world,item);
    const collision=cycles ? contactDeck(24*cycles,cycles) : new BoxGeometry();
    collision.scale(...item.size).translate(...item.position);
    return {collision};
  });
  return {format:"motion-topology-1",seed:world.seed, profile, surfaces,edges,legacyColliders,
    sockets:[...sockets].map(([id,center])=>({id,center,forward:[0,0,1],up:[0,1,0],width:32}))};
}
