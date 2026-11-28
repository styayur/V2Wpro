import test from "node:test";
import assert from "node:assert/strict";
import { readDiagnostic } from "../src/flight-diagnostic.js";

const hash="a".repeat(64);
const layout={id:hash,spawn:{x:1,y:2,z:3},variant:0,bounds:{x:32,y:8,z:220},collisionTriangles:100};
const sample=(time,z,phase)=>({time,position:{x:0,y:7,z},speed:60,phase,impacts:0,mode:"running",clearance:7,
  velocity:{x:0,y:0,z:60},solidDistance:7});
const report={format:"flight-diagnostic-2",sha256:hash,fixedHz:120,returnedToBuiltin:true,errors:[],
  outcome:"glide-and-release",imported:layout,replayed:structuredClone(layout),build:{sourceCommit:"c".repeat(40),dirty:false},
  world:{sha256:hash,bytes:128,layoutSeed:"glb-world:"+Buffer.from(JSON.stringify([1,hash,0,{}])).toString("base64url")},
  binary:{sha256:"b".repeat(64),bytes:700},experiment:{seed:1,profile:"cruise",module:"s-curve",ruleRevision:0,
    inputId:"synthetic-reader-test",disposition:"may-reject"},trace:[sample(0,0,"GLIDING"),sample(0.1,6,"GLIDING"),sample(0.2,12,"FLIGHT")]};
test("diagnostic v2 binds asset, run and saved layout identities and recomputes sampled contact",()=>{
  assert.equal(readDiagnostic(report,hash,128).sampledGlideMeters,6);
  assert.throws(()=>readDiagnostic(report,hash,126),/byte identity/);
  assert.throws(()=>readDiagnostic({...report,replayed:{...layout,variant:1}},hash,128),/layout/);
  assert.throws(()=>readDiagnostic({...report,metrics:{sampledGlideM:800,shieldImpacts:0}},hash,128),/metrics/);
  assert.throws(()=>readDiagnostic({...report,errors:["cancelled"]},hash),/Incomplete/);
  assert.throws(()=>readDiagnostic({...report,trace:[sample(0,0,"GLIDING"),sample(0,1,"GLIDING")]},hash),/advance/);
});
test("historical v1 records retain the sampled distance and clearance fields",()=>{
  const old={...report,format:"flight-diagnostic-1"};
  delete old.world;delete old.experiment;delete old.binary;
  const result=readDiagnostic(old,hash);
  assert.equal(result.minimumGlideClearance,7);
  assert.equal(result.sampledGlideSeconds,0.1);
});
test("a bounded player recording can be inspected before or after its layout is reopened",()=>{
  const observed={...report,recording:{kind:"player",truncated:true},experiment:null,replayed:null,
    binary:null,build:{version:"0.11.0",sourceCommit:null},outcome:"player-observation",returnedToBuiltin:false};
  const result=readDiagnostic(observed,hash,128);
  assert.equal(result.level,"player-observation");
  assert.equal(result.sampledGlideMeters,6);
  assert.equal(result.truncated,true);
  assert.equal(result.layoutReopened,false);
  assert.equal(readDiagnostic({...observed,replayed:layout},hash,128).layoutReopened,true);
  assert.throws(()=>readDiagnostic({...observed,experiment:report.experiment},hash),/Invalid v2/);
});
