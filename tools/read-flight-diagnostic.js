import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

const [asset, report] = process.argv.slice(2);
if (!report || statSync(report).size > 8 * 1024 ** 2 || statSync(asset).size > 128 * 1024 ** 2)
  throw Error("Expected a bounded GLB and flight-diagnostic-1 JSON");
const d = JSON.parse(readFileSync(report,"utf8"));
const digest = createHash("sha256").update(readFileSync(asset)).digest("hex");
if (d.format !== "flight-diagnostic-1" || digest !== d.sha256 || d.replayed?.id !== digest ||
    d.imported?.id !== digest || !d.returnedToBuiltin || d.errors?.length !== 0 ||
    !Array.isArray(d.trace) || d.trace.length < 2 || !d.outcome)
  throw Error("Incomplete diagnostic or GLB fingerprint mismatch");
let distance = 0, seconds = 0, longest = 0, current = 0, minimum = Infinity;
for (let i=0;i<d.trace.length;i++) {
  const sample = d.trace[i], previous = d.trace[i-1];
  if (!Number.isFinite(sample.time) || ![sample.position?.x,sample.position?.y,sample.position?.z].every(Number.isFinite) ||
      sample.mode !== "running" || (previous && sample.time < previous.time)) throw Error("Invalid flight trace");
  if (sample.phase === "GLIDING") {
    if (!Number.isFinite(sample.clearance)) throw Error("Missing contact clearance");
    minimum = Math.min(minimum,sample.clearance);
    if (previous?.phase === "GLIDING") {
      const dt = sample.time - previous.time;
      seconds += dt;
      current += dt;
      longest = Math.max(longest,current);
      distance += Math.hypot(...["x","y","z"].map(k => sample.position[k]-previous.position[k]));
    }
  } else current = 0;
}
if (d.trace.at(-1).time <= d.trace[0].time) throw Error("Flight did not advance");
console.log(JSON.stringify({sha256:digest,consumer:d.build?.sourceCommit,outcome:d.outcome,
  sampledGlideMeters:distance,sampledGlideSeconds:seconds,longestContinuousSeconds:longest,
  minimumGlideClearance:Number.isFinite(minimum)?minimum:null,impacts:d.trace.at(-1).impacts,
  phases:[...new Set(d.trace.map(r => r.phase))]},null,2));
