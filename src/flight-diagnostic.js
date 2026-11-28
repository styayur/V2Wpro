import Ajv from "ajv";
import replaySchema from "../schema/flight-diagnostic-2.json" with {type:"json"};

const checkReplay=new Ajv().compile(replaySchema);
const axes=["x","y","z"];
const samePoint=(a,b)=>axes.every(k=>Number.isFinite(a?.[k]) && a[k]===b?.[k]);
const distance=(a,b)=>Math.hypot(...axes.map(k=>a[k]-b[k]));
const digest=/^[0-9a-f]{64}$/;

function checkLayout(d) {
  const raw=d.world.layoutSeed.slice("glb-world:".length);
  let tuple;
  try {tuple=JSON.parse(atob(raw.replaceAll("-","+").replaceAll("_","/")));}
  catch {throw Error("Invalid saved-layout seed encoding");}
  const a=d.imported,b=d.replayed;
  if (!Array.isArray(tuple) || tuple[0]!==1 || tuple[1]!==d.sha256 || tuple[2]!==a.variant ||
      a.variant!==b.variant || !samePoint(a.spawn,b.spawn) || !samePoint(a.bounds,b.bounds) ||
      a.collisionTriangles!==b.collisionTriangles) throw Error("Saved layout or collision identity changed");
}

export function readDiagnostic(d,expectedDigest,bytes) {
  const v2=d?.format==="flight-diagnostic-2";
  if ((!v2 && d?.format!=="flight-diagnostic-1") || !digest.test(expectedDigest) ||
      d.sha256!==expectedDigest || d.imported?.id!==expectedDigest || d.replayed?.id!==expectedDigest)
    throw Error("Diagnostic format or GLB fingerprint mismatch");
  if (v2) {
    if (!checkReplay(d)) throw Error("Invalid v2 replay: "+checkReplay.errors[0].instancePath+" "+checkReplay.errors[0].message);
    if (d.world.sha256!==expectedDigest || (bytes!==undefined && d.world.bytes!==bytes))
      throw Error("World byte identity mismatch");
    checkLayout(d);
  }
  if (!d.returnedToBuiltin || d.errors?.length!==0 || !Array.isArray(d.trace) || d.trace.length<2 ||
      d.trace.length>65536 || !d.outcome) throw Error("Incomplete diagnostic");
  let glideMeters=0,glideSeconds=0,streakSeconds=0,longestSeconds=0,streakMeters=0,longestMeters=0;
  let minimum=Infinity,solidMinimum=Infinity,peakAcceleration=0,hasVelocity=false;
  const phases=new Set();
  for (let i=0;i<d.trace.length;i++) {
    const sample=d.trace[i],prev=d.trace[i-1];
    if (!Number.isFinite(sample.time) || !axes.every(k=>Number.isFinite(sample.position?.[k])) ||
        sample.mode!=="running" || (prev && sample.time<prev.time)) throw Error("Invalid flight trace");
    const dt=prev ? sample.time-prev.time : 0;
    phases.add(sample.phase);
    if (Number.isFinite(sample.solidDistance)) solidMinimum=Math.min(solidMinimum,sample.solidDistance);
    if (prev && dt>0 && axes.every(k=>Number.isFinite(sample.velocity?.[k]) && Number.isFinite(prev.velocity?.[k]))) {
      peakAcceleration=Math.max(peakAcceleration,distance(sample.velocity,prev.velocity)/dt);
      hasVelocity=true;
    }
    if (sample.phase!=="GLIDING") {streakSeconds=0;streakMeters=0;continue;}
    if (!Number.isFinite(sample.clearance)) throw Error("Missing contact clearance");
    minimum=Math.min(minimum,sample.clearance);
    if (prev?.phase!=="GLIDING") continue;
    const segment=distance(sample.position,prev.position);
    glideMeters+=segment;streakMeters+=segment;
    glideSeconds+=dt;streakSeconds+=dt;
    longestSeconds=Math.max(longestSeconds,streakSeconds);longestMeters=Math.max(longestMeters,streakMeters);
  }
  if (d.trace.at(-1).time<=d.trace[0].time) throw Error("Flight did not advance");
  const impacts=d.trace.at(-1).impacts;
  if (v2 && d.metrics && (d.metrics.shieldImpacts!==impacts ||
      Math.abs(d.metrics.sampledGlideM-glideMeters)>1e-4)) throw Error("Reported metrics disagree with flight trace");
  return {sha256:expectedDigest,consumer:d.build?.sourceCommit,outcome:d.outcome,
    sampledGlideMeters:glideMeters,sampledGlideSeconds:glideSeconds,longestContinuousSeconds:longestSeconds,
    longestContinuousMeters:longestMeters,minimumGlideClearance:Number.isFinite(minimum)?minimum:null,impacts,
    phases:[...phases],minimumSampledSolidDistance:Number.isFinite(solidMinimum)?solidMinimum:null,
    peakSampledAcceleration:hasVelocity?peakAcceleration:null,
    ...(v2 ? {level:"engine-replayed",dirty:d.build.dirty,binarySha256:d.binary.sha256,
      experiment:d.experiment} : {format:"flight-diagnostic-1"})};
}
