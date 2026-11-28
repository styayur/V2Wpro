import { Vector3 } from "three";
import { compileKineticWorld } from "./kinetic-world.js";
import { collisionIndex } from "./mesh-clearance.js";

const vec = p=>new Vector3(...p);
export const createKineticIndex = compiled=>collisionIndex([...compiled.surfaces,...compiled.legacyColliders]);
const round = n=>Math.round(n*100000)/100000;

export function speedEnvelope(points,profile) {
  if (points.length < 2) throw Error("Directed edge requires two distinct stations");
  const steps=points.map((p,i)=>i ? p.distanceTo(points[i-1]) : 0);
  let length=0;
  const samples=points.map((p,i)=>{
    const j=Math.max(1,Math.min(i,points.length-2));
    let curvature=0;
    if (points.length>2) {
      const a=points[j].clone().sub(points[j-1]), b=points[j+1].clone().sub(points[j]);
      const chord=points[j+1].distanceTo(points[j-1]);
      if (a.lengthSq()*b.lengthSq()*chord > 0) curvature=2*a.clone().cross(b).length()/(a.length()*b.length()*chord);
      else if (a.dot(b)<0) curvature=Infinity;
    }
    const cap=curvature ? Math.min(profile.speed,Math.sqrt(profile.lateralAcceleration/curvature)) : profile.speed;
    length+=steps[i];
    return {s:length,position:p.toArray(),curvature,cap,speed:cap};
  });
  for (let i=1;i<samples.length;i++) {
    const reachable=Math.sqrt(samples[i-1].speed**2+2*profile.forwardAcceleration*steps[i]);
    samples[i].speed=Math.min(samples[i].speed,reachable);
  }
  for (let i=samples.length-2;i>=0;i--) {
    const stoppable=Math.sqrt(samples[i+1].speed**2+2*profile.brakingDeceleration*steps[i+1]);
    samples[i].speed=Math.min(samples[i].speed,stoppable);
  }
  return samples;
}

function releaseCheck(samples,fraction,index,profile) {
  const distance=fraction*samples.at(-1).s;
  const i=Math.max(1,samples.findIndex(s=>s.s>=distance));
  const a=vec(samples[i-1].position), b=vec(samples[i].position);
  const f=(distance-samples[i-1].s)/(samples[i].s-samples[i-1].s);
  let p=a.clone().lerp(b,f);
  const direction=b.clone().sub(a).normalize(), speed=samples[i-1].speed*(1-f)+samples[i].speed*f;
  const up=new Vector3(0,1,0).addScaledVector(direction,-direction.y).normalize();
  const dt=profile.departureSeconds/16;
  let minimum=Infinity;
  for (let step=0;step<16;step++) {
    const angle=Math.min(profile.departurePitchRadians,(step+0.5)*dt*profile.lateralAcceleration/Math.max(1,speed));
    const q=p.clone().addScaledVector(direction,dt*speed*Math.cos(angle)).addScaledVector(up,dt*speed*Math.sin(angle));
    const clearance=index.distance(p.toArray(),q.toArray(),40)-profile.lateralAcceleration*dt*dt/8;
    minimum=Math.min(minimum,clearance);
    p=q;
  }
  const end=p.toArray(), final=index.distance(end,end,40);
  return {fraction,distance:round(distance),speed:round(speed),minimumClearance:round(minimum),
    endsClear:final>profile.clearance,feasible:minimum>profile.hullRadius && final>profile.clearance,
    model:"bounded-pitch-departure",end:end.map(round)};
}

export function inspectKineticWorld(compiled) {
  const index=createKineticIndex(compiled), profile=compiled.profile;
  const edges=compiled.edges.map(edge=>{
    const points=edge.points.map(vec).filter((p,i,arr)=>!i || p.distanceToSquared(arr[i-1])>1e-12);
    const samples=speedEnvelope(points,profile);
    const reasons=[];
    let minimum=Infinity, minSpeed=Infinity;
    for (let i=0;i<samples.length;i++) {
      const previous=samples[Math.max(0,i-1)];
      samples[i].clearance=index.distance(previous.position,samples[i].position,40);
      minimum=Math.min(minimum,samples[i].clearance);
      minSpeed=Math.min(minSpeed,samples[i].speed);
    }
    if (minimum<=profile.hullRadius+0.16) reasons.push("hull-clearance");
    if (minSpeed<profile.minimumSpeed) reasons.push("curvature-below-minimum-speed");
    if (samples[0].speed<profile.speed-1e-4) reasons.push("entry-needs-prior-braking");
    const launches=[0.45,0.65,0.85].map(f=>releaseCheck(samples,f,index,profile));
    if (!launches.some(l=>l.feasible)) reasons.push("no-clear-sampled-departure");
    return {id:edge.id,from:edge.from,to:edge.to,module:edge.module,level:minimum<=profile.hullRadius+0.16 ? "authored" :
      reasons.length ? "geometry-verified" : "motion-verified",reasons,minimumClearance:round(minimum),
      minimumSpeed:round(minSpeed),length:round(samples.at(-1).s),zones:edge.zones,launches,
      samples:samples.map(s=>({...s,position:s.position.map(round),s:round(s.s),speed:round(s.speed),
        curvature:Number.isFinite(s.curvature)?round(s.curvature):null,cap:round(s.cap),clearance:round(s.clearance)}))};
  });
  return {format:"motion-analysis-1",seed:compiled.seed,profile,clearanceSearchMetres:40,
    collisionTriangles:[...compiled.surfaces,...compiled.legacyColliders].reduce((s,p)=>s+p.collision.index.count/3,0),
    renderTriangles:compiled.surfaces.reduce((s,p)=>s+p.render.index.count/3,0),edges};
}

export function inspectWorld(world) {
  const compiled=compileKineticWorld(world);
  if (!compiled) throw Error("Expected a WorldIR 2.0 kinetic recipe");
  return inspectKineticWorld(compiled);
}
