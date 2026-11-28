import { segmentClear } from "./morph.js";

export function movementEnvelope(profile) {
  if (![1,2].includes(profile?.version) || !["hullRadius","speed","lateralAcceleration","brakingDeceleration","clearance","contactSeconds"]
    .every(k => Number.isFinite(profile[k]) && profile[k] > 0 && profile[k] <= 1000) || profile.hullRadius >= profile.clearance)
    throw Error("Invalid movement profile");
  if (profile.version===2 && (!["minimumSpeed","forwardAcceleration","departureSeconds","departurePitchRadians"]
    .every(k=>Number.isFinite(profile[k]) && profile[k]>0) || profile.minimumSpeed>profile.speed ||
    profile.forwardAcceleration>1000 || profile.departureSeconds>4 || profile.departurePitchRadians>Math.PI/3))
    throw Error("Invalid movement profile v2");
  return {
    turnRadius: profile.speed ** 2 / profile.lateralAcceleration,
    brakingDistance: profile.speed ** 2 / (2 * profile.brakingDeceleration),
    contactLength: profile.speed * profile.contactSeconds,
  };
}

export function inspectMovement(world, scene, profile) {
  const envelope = movementEnvelope(profile);
  const nodes = new Map(world.topology.nodes.map(n => [n.id,n.position]));
  const edges = world.topology.edges.map(([from,to]) => ({
    from,to,clear:segmentClear(nodes.get(from),nodes.get(to),profile.clearance,scene.solids)
  }));
  return {profile:profile.id, ...envelope, edges};
}
