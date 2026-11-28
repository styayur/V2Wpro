import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { exportExchange } from "../src/exchange.js";
import { readDiagnostic } from "../src/flight-diagnostic.js";
import { makeKineticWorld } from "../src/kinetic-world.js";

const [evidence,consumerEvidenceCommit,output]=process.argv.slice(2);
if (!output || !/^[a-f0-9]{40}$/.test(consumerEvidenceCommit))
  throw Error("Usage: reconcile-flights.js SKIMMER_EVIDENCE_DIRECTORY EVIDENCE_COMMIT NEW_REPORT");
const read=file=>JSON.parse(readFileSync(file,"utf8"));
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const matrix=read(path.join(evidence,"matrix.json"));
const batches=["aligned-r0","aligned-r1","aligned-r2","development","holdout"];
const rows=[];
for (const batch of batches) {
  const files=readdirSync(path.join(evidence,batch)).filter(f=>f.endsWith(".json")).sort();
  for (const name of files) {
    const raw=readFileSync(path.join(evidence,batch,name)), d=JSON.parse(raw);
    const {module,seed,profile,ruleRevision,inputId,disposition,approach,wingmates}=d.experiment;
    const bytes=exportExchange(makeKineticWorld(module,seed,profile,ruleRevision));
    const result=readDiagnostic(d,hash(bytes),bytes.length);
    if (result.consumer!==matrix.controller || result.dirty) throw Error("Unexpected engine identity: "+name);
    rows.push({batch,module,seed,profile,ruleRevision,inputId,disposition,approach,wingmates,
      consumer:result.consumer,binary:result.binarySha256,asset:result.sha256,reportSha256:hash(raw),
      report:"https://github.com/styayur/Skimmer-Scraper/blob/"+consumerEvidenceCommit+
        "/acceptance/joint-flight/topogenesis/"+batch+"/"+name,
      outcome:result.outcome,impacts:result.impacts,glideMetres:result.longestContinuousMeters,
      minimumCentreClearance:result.minimumSampledSolidDistance,peakSampledAcceleration:result.peakSampledAcceleration,
      activeRelease:d.metrics.activeRelease,contactLosses:d.metrics.contactLossesBeforeRelease,
      sampledHullIntrusion:d.metrics.sampledHullIntrusion,meetsDisposition:d.metrics.meetsDisposition});
  }
}
if (new Set(rows.map(r=>r.binary)).size!==1) throw Error("Engine binary changed across generation rules");
for (const group of ["development","holdout"]) {
  const expected=matrix[group], actual=rows.filter(r=>r.batch===group);
  if (actual.length!==expected.length || expected.some(([module,seed,profile,,disposition,approach,wingmates])=>
    !actual.some(r=>r.module===module && r.seed===seed && r.profile===profile && r.ruleRevision===2 &&
      r.disposition===disposition && r.approach===approach && r.wingmates===wingmates))) throw Error("Incomplete frozen "+group+" matrix");
}
writeFileSync(output,JSON.stringify({format:"topogenesis-engine-feedback-1",consumerEvidenceCommit,
  matrixSha256:hash(readFileSync(path.join(evidence,"matrix.json"))),rows},null,2)+"\n",{flag:"wx"});
