import Ajv from "ajv";
import schema from "../schema/worldir-1.0.json" with { type: "json" };
const check = new Ajv({ allErrors: true }).compile(schema);
export function validate(w) {
  if (!check(w)) throw Error(new Ajv().errorsText(check.errors));
  if (w.rules.clearance / 2 + w.physics.radius > w.topology.halfWidth)
    throw Error("Lane exceeds bounds");
  const pieces =
    { arcade: 4, island: 4, gate: 3 }[w.prototype] +
    Number(w.assets.length > 0);
  if (w.rules.rows * pieces > w.budget.instances)
    throw Error("World exceeds chunk budget");
  return w;
}
