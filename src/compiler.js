import { validate } from "./validate.js";

import { boundDocument, inspectRoutes, realize } from "./morph.js";

export function checkedScene(world) {
  const scene = realize(world);
  const routes = inspectRoutes(world, scene);
  if (!routes.connected || routes.blockedEdges.length)
    throw Error(
      "Unreachable nodes or blocked route edges: " + JSON.stringify(routes),
    );
  return scene;
}

export function checkWorld(world) {
  if (world?.version !== "2.0") return validate(world);
  checkedScene(world);
  return world;
}

const idPattern = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const kinds = ["observation", "inference", "decision", "extension"];
function requireValue(ok, message) {
  if (!ok) throw Error(message);
}
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(value, allowed, label) {
  requireValue(
    object(value) && Object.keys(value).every((k) => allowed.includes(k)),
    "Unexpected fields in " + label,
  );
}
function string(value, limit) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= limit
  );
}
function index(records, limit, label) {
  requireValue(
    Array.isArray(records) && records.length > 0 && records.length <= limit,
    "Invalid " + label + " count",
  );
  const result = new Map();
  for (const record of records) {
    requireValue(
      typeof record?.id === "string" &&
        idPattern.test(record.id) &&
        !result.has(record.id),
      "Invalid or duplicate " + label + " ID",
    );
    result.set(record.id, record);
  }
  return result;
}

export function compile(review) {
  boundDocument(review);
  keys(review, ["format", "sources", "features", "design"], "review");
  requireValue(review.format === "v2w-review-1", "Expected v2w-review-1");
  const sources = index(review.sources, 128, "source");
  for (const source of sources.values()) {
    keys(source, ["id", "kind", "locator", "sha256"], "source");
    requireValue(
      ["video", "image", "brief"].includes(source.kind) &&
        string(source.locator, 2048),
      "Invalid source kind or locator",
    );
    if (Object.hasOwn(source, "sha256"))
      requireValue(
        typeof source.sha256 === "string" &&
          /^[a-f0-9]{64}$/i.test(source.sha256),
        "Invalid source SHA-256",
      );
  }
  const evidence = [];
  const bindings = {};
  for (const f of index(review.features, 512, "feature").values()) {
    keys(f, ["id", "kind", "source", "claim", "confidence", "time"], "feature");
    const src = sources.get(f.source);
    requireValue(
      src &&
        kinds.includes(f.kind) &&
        string(f.claim, 4096) &&
        Number.isFinite(f.confidence) &&
        f.confidence >= 0 &&
        f.confidence <= 1,
      "Invalid feature " + f.id,
    );
    let locator = src.locator;
    if (Object.hasOwn(f, "time")) {
      requireValue(
        src.kind === "video" &&
          Array.isArray(f.time) &&
          f.time.length === 2 &&
          f.time.every((t) => Number.isFinite(t) && t >= 0) &&
          f.time[0] <= f.time[1] &&
          !locator.includes("#"),
        "Invalid time range or fragmented video locator",
      );
      locator += "#t=" + f.time.join(",");
    }
    evidence.push({
      id: f.id,
      kind: f.kind,
      source: locator,
      claim: f.claim,
      confidence: f.confidence,
    });
    bindings[f.id] = f.source;
  }
  const design = structuredClone(review.design);
  requireValue(
    object(design) &&
      !Object.hasOwn(design, "version") &&
      !Object.hasOwn(design, "evidence"),
    "Design must omit version and evidence",
  );
  requireValue(
    object(design.extensions) && !Object.hasOwn(design.extensions, "v2wReview"),
    "Expected extensions with v2wReview available for provenance",
  );
  design.extensions.v2wReview = {
    sources: structuredClone(review.sources),
    bindings,
  };
  return checkWorld({ version: "2.0", ...design, evidence });
}

// Merge JSON objects without invoking inherited properties or setters.
function merge(value, patch) {
  if (!object(patch)) return structuredClone(patch);
  const target = Object.assign(Object.create(null), object(value) ? value : {});
  for (const [key, next] of Object.entries(patch)) {
    if (next === null) delete target[key];
    else target[key] = merge(target[key], next);
  }
  return target;
}

export function revise(review, patch) {
  compile(review);
  boundDocument(patch);
  const revised = merge(review, patch);
  compile(revised);
  return revised;
}

export function variant(world, seed) {
  requireValue(Number.isSafeInteger(seed), "Expected an integer seed");
  return checkWorld({ ...structuredClone(world), seed });
}

export function evidenceReport(world) {
  validate(world);
  return {
    world: world.name,
    version: world.version,
    seed: world.seed,
    ...world.extensions?.v2wReview,
    evidence: world.evidence,
    unknowns: world.unknowns ?? [],
  };
}
