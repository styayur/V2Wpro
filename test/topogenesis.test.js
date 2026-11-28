import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BoxGeometry, Vector3 } from "three";
import { makeKineticWorld, planKineticRegion } from "../src/kinetic-world.js";
import { validate } from "../src/validate.js";
import { moduleLibrary, measureSurfaceError, sweepMesh } from "../src/parametric.js";
import { collisionIndex } from "../src/mesh-clearance.js";
import { inspectWorld, speedEnvelope } from "../src/motion-analysis.js";
import { exportExchange } from "../src/exchange.js";

test("six independent, error-bounded skins and colliders reproduce the shipped library",()=>{
  const lib=moduleLibrary();
  assert.equal(JSON.stringify(lib)+"\n",readFileSync("examples/kinetic-modules.json","utf8"));
  for (const module of lib.modules) {
    assert.deepEqual(module.stations[0].center,module.sockets.entry.center);
    assert.deepEqual(module.stations.at(-1).center,module.sockets.exit.center);
    for (const result of measureSurfaceError(module))
      assert.ok(result.withinTolerance,JSON.stringify(result));
    assert.ok(sweepMesh(module,true).index.count<sweepMesh(module,false).index.count,module.id);
  }
});

test("swept clearance includes triangle faces, parallel chords, containment and finite endpoints",()=>{
  const index=collisionIndex([{collision:new BoxGeometry(4,2,8)}]);
  assert.equal(index.distance([0,0,0],[0,0,1],8),0);
  assert.equal(index.distance([0,4,0],[0,-4,0],8),0);
  assert.equal(index.distance([-8,3,0],[8,3,0],8),2);
  assert.equal(index.clearChord([-8,3,0],[8,3,0],2),false);
  assert.equal(index.clearChord([0,3,0],[0,6,0],1.99),true);
  assert.ok(Math.abs(index.distance([3,2,4],[4,3,5],8)-Math.sqrt(2))<1e-6);
});

test("speed envelopes brake before a tight turn and accelerate within the longitudinal budget",()=>{
  const points=[[0,0,0],[0,0,30],[0,0,40],[0,0,45],[5,0,45],[15,0,45],[45,0,45]].map(p=>new Vector3(...p));
  const profile={speed:65,lateralAcceleration:40,forwardAcceleration:18,brakingDeceleration:22};
  const samples=speedEnvelope(points,profile);
  assert.ok(samples[1].speed<samples[1].cap && samples[1].speed>samples[3].speed);
  assert.ok(samples[5].speed>samples[3].speed && samples[5].speed<samples[5].cap);
  for (let i=1;i<samples.length;i++) {
    const delta=samples[i].speed**2-samples[i-1].speed**2, length=samples[i].s-samples[i-1].s;
    assert.ok(delta<=2*profile.forwardAcceleration*length+1e-6);
    assert.ok(-delta<=2*profile.brakingDeceleration*length+1e-6);
  }
});

test("finite study exports the shipped bytes, measures surface clearance and tests three release opportunities",()=>{
  const world=JSON.parse(readFileSync("examples/s-curve-study.json"));
  assert.deepEqual(Buffer.from(exportExchange(world)),readFileSync("examples/s-curve-study.glb"));
  const report=inspectWorld(world);
  const edge=report.edges.find(e=>e.id==="study");
  assert.equal(edge.level,"motion-verified");
  assert.ok(edge.minimumSpeed<report.profile.speed);
  assert.ok(edge.minimumClearance>report.profile.hullRadius);
  assert.equal(edge.launches.length,3);
  world.prototypes.beacon.offset=[0,-2,70];
  world.prototypes.beacon.child.size=[30,14,6];
  assert.ok(inspectWorld(world).edges.some(e=>e.reasons.includes("hull-clearance")));
  world.extensions.kineticRecipe.relief=900;
  assert.throws(()=>validate(world),/kinetic region recipe/);
});

test("region planning yields directed alternatives and order-independent neighbouring boundary ports",()=>{
  const w=makeKineticWorld("helix",74812,"boost",0,"district");
  const recipe=w.extensions.kineticRecipe;
  const a=planKineticRegion(recipe,w.seed);
  const b=planKineticRegion({...recipe,regionZ:1},w.seed);
  const exits=a.map(e=>e.to).filter(p=>p.point[2]===660);
  for (const exit of exits) assert.deepEqual(b.find(e=>e.from.id===exit.id).from,exit);
  assert.ok(a.some(e=>a.filter(f=>f.from.id===e.from.id).length>1));
  assert.deepEqual(planKineticRegion(recipe,w.seed),a);
  assert.notDeepEqual(planKineticRegion(recipe,w.seed+1),a);
});
