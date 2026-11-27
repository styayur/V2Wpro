import { Box3, MathUtils, Vector3 } from "three";

// Fit the flight envelope to authored nodes and geometry, including sparse worlds.
export function flightBounds(world, scene) {
  const bounds = new Box3();
  const p = new Vector3();
  for (const node of world.topology.nodes)
    bounds.expandByPoint(p.fromArray(node.position));
  for (const { position, size } of scene.items) {
    for (const sign of [-0.5, 0.5]) {
      p.set(...position).addScaledVector(new Vector3(...size), sign);
      bounds.expandByPoint(p);
    }
  }
  return bounds.expandByScalar(
    Math.max(
      world.physics.radius,
      world.streaming.cellSize * (world.streaming.radius + 1),
    ),
  );
}

export function aim(camera, direction) {
  const [x, y, z] = direction;
  camera.rotation.set(
    Math.atan2(y, Math.hypot(x, z)),
    Math.atan2(-x, -z),
    0,
    "YXZ",
  );
}

export function steer(camera, yaw, pitch) {
  camera.rotation.order = "YXZ";
  camera.rotation.y += yaw;
  camera.rotation.x = MathUtils.clamp(
    camera.rotation.x + pitch,
    -Math.PI / 2,
    Math.PI / 2,
  );
}

export function direction(camera, forward, side, up) {
  const vector = new Vector3(side, 0, -forward).applyQuaternion(
    camera.quaternion,
  );
  vector.y += up;
  return vector.divideScalar(Math.max(1, vector.length()));
}
