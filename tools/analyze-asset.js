import { writeFileSync } from "node:fs";
import { analyzeAsset } from "../src/assets.js";

const [, , input, output] = process.argv;
if (!input) throw Error("Usage: node tools/analyze-asset.js input.glb [report.json]");
const report = JSON.stringify(analyzeAsset(input), null, 2) + "\n";
if (output) writeFileSync(output, report, { flag: "wx" });
else process.stdout.write(report);
