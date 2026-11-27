import Ajv from "ajv";
import schema from "../schema/worldir-2.0.json" with { type: "json" };

const validator = new Ajv().compile(schema);
const forbidden = new Set(["constructor", "prototype", "__proto__"]);
const MAX_DEPTH = 24;
const WORLD_LIMIT = 65536;

// Bound JSON traversal before giving recursive rule objects to the schema checker.
export function boundDocument(root) {
  const stack = [[root, 0]];
  let entries = 0,
    characters = 0;
  while (stack.length) {
    const [value, depth] = stack.pop();
    if (++entries > 90000 || depth > 62)
      throw Error("Document exceeds structural limit");
    if (typeof value === "number" && !Number.isFinite(value))
      throw Error("Non-finite value");
    if (typeof value === "string") characters += value.length;
    if (value && typeof value === "object") {
      for (const key of Object.keys(value)) {
        const legacySelector = depth === 0 && key === "prototype" && root.version === "1.0";
        if (forbidden.has(key) && !legacySelector) throw Error("Reserved document key");
        if (stack.length + entries >= 90000)
          throw Error("Document exceeds structural limit");
        characters += key.length;
        stack.push([value[key], depth + 1]);
      }
    }
    if (characters > 2_000_000) throw Error("Document exceeds text limit");
  }
}

function unique(values, label) {
  const set = new Set(values);
  if (set.size !== values.length) throw Error("Duplicate " + label);
  return set;
}

// Memoized subtree costs also check dormant productions. Count before allocating.
function checkProgram(w) {
  const evidence = unique(
    w.evidence.map((e) => e.id),
    "evidence ID",
  );
  const assets = unique(
    w.assets.map((a) => a.uri),
    "asset URI",
  );
  const ids = unique(
    w.topology.nodes.map((n) => n.id),
    "node ID",
  );
  if (!ids.has(w.topology.spawn)) throw Error("Unknown spawn");
  const edges = new Set();
  for (const [a, b] of w.topology.edges) {
    const key = [a, b].sort().join("/");
    if (a === b || !ids.has(a) || !ids.has(b) || edges.has(key))
      throw Error("Invalid graph edge");
    edges.add(key);
  }
  const memo = new Map(),
    visiting = new Set();
  function production(id, depth) {
    if (!Object.hasOwn(w.prototypes, id))
      throw Error("Unknown prototype " + id);
    if (visiting.has(id)) throw Error("Recursive prototype " + id);
    if (!memo.has(id)) {
      visiting.add(id);
      memo.set(id, cost(w.prototypes[id], depth));
      visiting.delete(id);
    }
    return memo.get(id);
  }
  function bounded(c) {
    if (c.calls > w.budget.operations || c.items > w.budget.instances)
      throw Error("Expansion exceeds world budget");
    return c;
  }
  function cost(rule, depth) {
    if (depth > MAX_DEPTH) throw Error("Rule depth exceeds limit");
    if (!evidence.has(rule.evidence))
      throw Error("Unknown rule evidence " + rule.evidence);
    const out = { items: 0, calls: 1, height: 1 };
    function include(sub, times = 1) {
      out.items += sub.items * times;
      out.calls += sub.calls * times;
      out.height = Math.max(out.height, sub.height + 1);
      if (depth + out.height - 1 > MAX_DEPTH)
        throw Error("Rule depth exceeds limit");
      bounded(out);
    }
    switch (rule.op) {
      case "emit":
        if (
          rule.shape === "asset"
            ? !assets.has(rule.asset)
            : rule.asset !== undefined
        )
          throw Error("Invalid emitted asset reference");
        out.items = 1;
        break;
      case "use":
        include(production(rule.ref, depth + 1));
        break;
      case "group":
        for (const child of rule.children) include(cost(child, depth + 1));
        break;
      default:
        include(cost(rule.child, depth + 1), rule.count ?? 1);
    }
    return bounded(out);
  }
  for (const id of Object.keys(w.prototypes)) production(id, 1);
  const total = { calls: 0, items: 0 };
  for (const node of w.topology.nodes) {
    const c = production(node.rule, 1);
    total.calls += c.calls;
    total.items += c.items;
    bounded(total);
  }
  if (!total.items) throw Error("World produces no visual geometry");
}

function hash(key, seed) {
  let h = seed ^ 2166136261;
  for (let i = 0; i < key.length; i++)
    h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}
const unit = [1, 1, 1],
  zero = [0, 0, 0];
function translated(p, delta, scale) {
  return p.map((v, i) => v + delta[i] * scale[i]);
}
function cell(w, point) {
  return point.map((v) => Math.floor(v / w.streaming.cellSize));
}

export function cellKeys(w, position) {
  if (!Number.isInteger(w.streaming.radius) || w.streaming.radius < 0 || w.streaming.radius > 3 ||
      !Number.isFinite(w.streaming.cellSize) || w.streaming.cellSize < 2 ||
      !Array.isArray(position) || position.length !== 3 ||
      position.some(v => !Number.isFinite(v) || Math.abs(v) > 2 * WORLD_LIMIT)) {
    throw Error("Invalid streaming neighborhood");
  }
  const [x, y, z] = cell(w, position),
    r = w.streaming.radius,
    keys = [];
  for (let a = x - r; a <= x + r; a++)
    for (let b = y - r; b <= y + r; b++)
      for (let c = z - r; c <= z + r; c++) keys.push([a, b, c].join(","));
  return keys;
}

export function realize(w) {
  boundDocument(w);
  if (!validator(w))
    throw Error(
      "Invalid WorldIR 2.0: " +
        validator.errors
          .map((e) => e.instancePath + " " + e.message)
          .join(", "),
    );
  checkProgram(w);
  const items = [],
    solids = [],
    cells = Object.create(null);
  function expand(rule, p, scale, key, trace) {
    const lineage = trace.includes(rule.evidence)
      ? trace
      : [...trace, rule.evidence];
    switch (rule.op) {
      case "group":
        rule.children.forEach((child, i) =>
          expand(child, p, scale, key + "/" + i, lineage),
        );
        return;
      case "use":
        expand(w.prototypes[rule.ref], p, scale, key + "/" + rule.ref, lineage);
        return;
      case "transform": {
        const offset = (rule.offset ?? zero).map(
          (v, i) =>
            v +
            (rule.jitter?.[i] ?? 0) *
              ((2 * hash(key + ":" + i, w.seed)) / 4294967296 - 1),
        );
        expand(
          rule.child,
          translated(p, offset, scale),
          scale.map((v, i) => v * (rule.scale ?? unit)[i]),
          key + "/t",
          lineage,
        );
        return;
      }
      case "repeat":
      case "radial":
        for (let i = 0; i < rule.count; i++) {
          const angle = (2 * Math.PI * i) / rule.count;
          const offset =
            rule.op === "repeat"
              ? rule.step.map((v) => v * i)
              : [
                  rule.radius * Math.cos(angle),
                  0,
                  rule.radius * Math.sin(angle),
                ];
          expand(
            rule.child,
            translated(p, offset, scale),
            scale,
            key + "/" + i,
            lineage,
          );
        }
        return;
      case "emit": {
        const size = scale.map((v, i) => v * rule.size[i]);
        if (
          size.some(
            (v, i) =>
              v < 0.0001 || v > 8192 || Math.abs(p[i]) + v / 2 > WORLD_LIMIT,
          )
        )
          throw Error("Expanded geometry outside metric limits");
        const idx = items.length;
        items.push({
          shape: rule.shape,
          position: p,
          size,
          material: rule.material,
          asset: rule.asset ?? null,
          evidence: rule.evidence,
          trace: lineage,
        });
        if (rule.solid)
          solids.push({ center: p, extent: size.map((v) => v / 2) });
        (cells[cell(w, p).join(",")] ??= []).push(idx);
        return;
      }
    }
  }
  for (const node of w.topology.nodes)
    expand(w.prototypes[node.rule], node.position, unit, node.id, []);
  return { items, solids, cells };
}

// Squared distance to a box along a segment is piecewise quadratic. Minimize
// on each interval separated by crossings of the six face planes.
export function segmentClear(a, b, radius, solids) {
  const d = b.map((v, i) => v - a[i]);
  for (const { center, extent } of solids) {
    if (
      center.some(
        (c, i) =>
          Math.max(a[i], b[i]) + radius < c - extent[i] ||
          Math.min(a[i], b[i]) - radius > c + extent[i],
      )
    )
      continue;
    const cuts = [0, 1];
    for (let i = 0; i < 3; i++)
      if (d[i] !== 0)
        for (const sign of [-1, 1]) {
          const t = (center[i] + sign * extent[i] - a[i]) / d[i];
          if (t > 0 && t < 1) cuts.push(t);
        }
    cuts.sort((x, y) => x - y);
    for (let j = 1; j < cuts.length; j++) {
      const lo = cuts[j - 1],
        hi = cuts[j],
        mid = (lo + hi) / 2;
      let linear = 0,
        quadratic = 0;
      for (let i = 0; i < 3; i++) {
        const q = a[i] + d[i] * mid - center[i];
        if (Math.abs(q) <= extent[i]) continue;
        linear += d[i] * (a[i] - center[i] - Math.sign(q) * extent[i]);
        quadratic += d[i] * d[i];
      }
      const t = quadratic
        ? Math.max(lo, Math.min(hi, -linear / quadratic))
        : mid;
      const dist = center.reduce(
        (s, c, i) =>
          s + Math.max(0, Math.abs(a[i] + t * d[i] - c) - extent[i]) ** 2,
        0,
      );
      if (dist <= radius ** 2) return false;
    }
  }
  return true;
}

export function inspectRoutes(w, scene = realize(w)) {
  const { nodes, edges, spawn } = w.topology;
  const positions = new Map(nodes.map((n) => [n.id, n.position]));
  const neighbors = new Map(nodes.map((n) => [n.id, []]));
  const blockedEdges = [];
  for (const [a, b] of edges) {
    if (
      segmentClear(
        positions.get(a),
        positions.get(b),
        w.physics.radius,
        scene.solids,
      )
    ) {
      neighbors.get(a).push(b);
      neighbors.get(b).push(a);
    } else blockedEdges.push([a, b]);
  }
  const start = positions.get(spawn);
  const reachable = segmentClear(start, start, w.physics.radius, scene.solids)
    ? [spawn]
    : [];
  const seen = new Set(reachable);
  for (let i = 0; i < reachable.length; i++)
    for (const id of neighbors.get(reachable[i]))
      if (!seen.has(id)) {
        seen.add(id);
        reachable.push(id);
      }
  return {
    reachable,
    blockedEdges,
    connected: reachable.length === nodes.length,
  };
}
