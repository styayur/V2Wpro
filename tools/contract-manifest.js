import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root=fileURLToPath(new URL("../",import.meta.url));
const resolve=name=>path.join(root,name);
const schemas=readdirSync(resolve("schema")).filter(name=>name.endsWith(".json")).sort();
const paths=[...schemas.map(name=>"schema/"+name),"examples/profiles/skimmer-cruise.json",
  "examples/profiles/skimmer-boost.json","examples/kinetic-flight-modules.json",
  "examples/switchyard.json","examples/switchyard.glb","examples/s-curve-study.json",
  "examples/s-curve-study.glb","examples/contact.glb","examples/district.glb"];
const files=paths.map(name=>{
  const data=readFileSync(resolve(name));
  return {path:name,bytes:data.length,sha256:createHash("sha256").update(data).digest("hex")};
});
const version=JSON.parse(readFileSync(resolve("package.json"),"utf8")).version;
const encoded=JSON.stringify({format:"v2w-contract-manifest-1",version,base:"../",files},null,2)+"\n";
const target=resolve("contracts/manifest.json");
if (process.argv[2]==="--write") {
  mkdirSync(path.dirname(target),{recursive:true});
  writeFileSync(target,encoded);
} else if (process.argv[2]==="--check") {
  if (readFileSync(target,"utf8")!==encoded) throw Error("Contract bytes differ from the checked-in manifest");
  console.log("Verified "+files.length+" protocol and world fingerprints for "+version);
} else throw Error("Use --check to verify or --write to record a protocol change");
