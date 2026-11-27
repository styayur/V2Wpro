import { readFileSync, statSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { exportExchange as encode } from "../src/exchange.js";

export const exportExchange = world => Buffer.from(encode(world));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , input, output] = process.argv;
  if (!input || !output) throw Error("Usage: node tools/export-exchange.js world.json output.glb");
  if (statSync(input).size > 8 * 1024 * 1024) throw Error("World document exceeds limit");
  writeFileSync(output, exportExchange(JSON.parse(readFileSync(input, "utf8"))), {flag:"wx"});
}

