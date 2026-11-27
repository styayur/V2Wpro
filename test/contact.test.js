import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { exportExchange } from "../src/exchange.js";
import { movementEnvelope } from "../src/movement.js";

test("original Lattice exchange and shipped contact geometry are reproducible", () => {
  const read = name => JSON.parse(readFileSync("examples/" + name + ".json"));
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  assert.equal(hash(exportExchange(read("lattice"))),"ccd5cfe69e084c7921f52399bb738539a455ed2e38959d66cf471e108252941f");
  for (const id of ["contact","district","arcade-span"])
    assert.equal(hash(exportExchange(read(id))),hash(readFileSync("examples/"+id+".glb")));
  const world = read("contact");
  const p = world.extensions.movementProfile;
  assert.equal(movementEnvelope(p).turnRadius,99);
  assert.throws(() => movementEnvelope({...p,hullRadius:p.clearance}));
  world.extensions.contactDeck.cycles = 256;
  assert.throws(() => exportExchange(world),/cycles/);
});
