import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { exportExchange } from "../src/exchange.js";
import { readDiagnostic } from "../src/flight-diagnostic.js";
import { makeKineticWorld } from "../src/kinetic-world.js";

const [evidence,consumerEvidenceCommit,output]=process.argv.slice(2);
if (!output || !/^[a-f0-9]{40}$/.test(consumerEvidenceCommit))
  throw Error("Usage: reconcile-flights.js SKIMMER_EVIDENCE_DIRECTORY EVIDENCE_COMMIT NEW_REPORT");
const git=(...args)=>execFileSync("git",["-C",evidence,...args],{maxBuffer:16*1024*1024});
const prefix=git("rev-parse","--show-prefix").toString().trim();
const at=name=>consumerEvidenceCommit+":"+prefix+name;
const source=name=>git("show",at(name));
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const matrixBytes=source("matrix.json"),matrix=JSON.parse(matrixBytes);
const batches=["aligned-r0","aligned-r1","aligned-r2","development","holdout"];
const rows=[];
for (const batch of batches) {
  const files=git("ls-tree","--full-tree","--name-only",at(batch)).toString().split(/\r?\n/).filter(f=>f.endsWith(".json")).sort();
  if (!files.length) throw Error("Frozen run directory contains no reports: "+batch);
  for (const name of files) {
    const raw=source(batch+"/"+name), d=JSON.parse(raw);
    const {module,seed,profile,ruleRevision,inputId,disposition,approach,wingmates}=d.experiment;
    const bytes=exportExchange(makeKineticWorld(module,seed,profile,ruleRevision));
    const result=readDiagnostic(d,hash(bytes),bytes.length);
    if (result.consumer!==matrix.controller || result.dirty) throw Error("Unexpected engine identity: "+name);
    rows.push({batch,module,seed,profile,ruleRevision,inputId,disposition,approach,wingmates,
      consumer:result.consumer,binary:result.binarySha256,asset:result.sha256,reportSha256:hash(raw),
      releaseTick:d.releaseTick,
      report:"https://github.com/styayur/Skimmer-Scraper/blob/"+consumerEvidenceCommit+"/"+prefix+batch+"/"+name,
      outcome:result.outcome,impacts:result.impacts,glideMetres:result.longestContinuousMeters,
      minimumCentreClearance:result.minimumSampledSolidDistance,peakSampledAcceleration:result.peakSampledAcceleration,
      activeRelease:d.metrics.activeRelease,contactLosses:d.metrics.contactLossesBeforeRelease,
      sampledHullIntrusion:d.metrics.sampledHullIntrusion,meetsDisposition:d.metrics.meetsDisposition});
  }
}
if (new Set(rows.map(r=>r.binary)).size!==1) throw Error("Engine binary changed across generation rules");
for (const group of ["development","holdout"]) {
  const expected=matrix[group], actual=rows.filter(r=>r.batch===group);
  if (actual.length!==expected.length || expected.some(([module,seed,profile,releaseTick,disposition,approach,wingmates])=>
    !actual.some(r=>r.module===module && r.seed===seed && r.profile===profile && r.ruleRevision===2 &&
      r.releaseTick===releaseTick && r.disposition===disposition && r.approach===approach && r.wingmates===wingmates))) throw Error("Incomplete frozen "+group+" matrix");
}
writeFileSync(output,JSON.stringify({format:"topogenesis-engine-feedback-1",consumerEvidenceCommit,
  matrixSha256:hash(matrixBytes),rows},null,2)+"\n",{flag:"wx"});
