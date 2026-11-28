import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { readDiagnostic } from "../src/flight-diagnostic.js";

const [asset,report]=process.argv.slice(2);
if (!report || statSync(report).size>8*1024**2 || statSync(asset).size>128*1024**2)
  throw Error("Expected a bounded GLB and flight-diagnostic-1 or flight-diagnostic-2 JSON");
const bytes=readFileSync(asset);
const hash=createHash("sha256").update(bytes).digest("hex");
console.log(JSON.stringify(readDiagnostic(JSON.parse(readFileSync(report,"utf8")),hash,bytes.length),null,2));
