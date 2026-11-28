import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Triangle, Vector2, Vector3 } from "three";

export const moduleIds = ["s-curve", "helix", "sky-arch", "bowl", "ribbon-bridge", "tunnel"];
export const chunkSize = 220;
const pi = Math.PI;
const smooth = t => t * t * (3 - 2 * t);
const round = x => Math.round(x * 1e6) / 1e6 || 0;
const vec = a => new Vector3(...a);
const rise = t => Math.sin(pi * t) ** 2;
const width = 32;
const thickness = 1.6;

// The loop has level lead-ins and a common horizontal tangent on both sides
// of each join. The increasing elevation keeps the entry and exit disjoint.
function spine(id, t, scale, heightGain, returnOffset) {
  if (id === "helix") {
    const a = 0.22, b = 0.73, base = 58, lift = 48 * scale, radius = 39 * scale;
    if (t < a) return [0, 0, base * t / a];
    if (t <= b) {
      const u = (t - a) / (b - a), theta = 2 * pi * u;
      return [radius * (1 - Math.cos(theta)), lift * smooth(u), base + radius * Math.sin(theta)];
    }
    const u = (t - b) / (1 - b);
    return [returnOffset*rise(u), lift * (1 - smooth(u)), base + (chunkSize - base) * u];
  }
  const hill = rise(t) * scale;
  switch (id) {
    case "s-curve": return [21 * hill * Math.sin(2*pi*t), 2.5*hill, chunkSize*t];
    case "sky-arch": return [0, 38*hill*heightGain, chunkSize*t];
    case "bowl": return [0, -18*hill*heightGain, chunkSize*t];
    case "ribbon-bridge": return [12*hill, 5*hill*Math.sin(2*pi*t), chunkSize*t];
    case "tunnel": return [-5*hill, 0, chunkSize*t];
    default: throw Error("Unknown kinetic module: " + id);
  }
}

function ribbonSection(segments, lift) {
  const top = Array.from({ length: segments + 1 }, (_, i) => {
    const u = 2 * i / segments - 1;
    return [width*u/2, lift*u*u];
  });
  return [...top, ...top.toReversed().map(([x,y]) => [x, y-thickness])];
}

function vaultSection() {
  const inner = 21, outer = inner + thickness, tolerance = 0.045;
  const count = Math.ceil(pi / (2 * Math.acos(1-tolerance/outer)));
  const arc = r => Array.from({length:count+1}, (_,i) => {
    const angle = pi*i/count;
    return [-r*Math.cos(angle), r*Math.sin(angle)];
  });
  return [...arc(inner).reverse(), ...arc(outer)];
}

function frameAt(id, t, scale, heightGain=1, returnOffset=0) {
  const center = spine(id,t,scale,heightGain,returnOffset);
  const step = 1e-5;
  const tangent = t === 0 || t === 1 ? new Vector3(0,0,1) :
    vec(spine(id,Math.min(1,t+step),scale,heightGain,returnOffset)).sub(vec(spine(id,Math.max(0,t-step),scale,heightGain,returnOffset))).normalize();
  const right = new Vector3(tangent.z,0,-tangent.x).normalize();
  if (id === "ribbon-bridge") right.applyAxisAngle(tangent, 0.35*rise(t)*Math.sin(2*pi*t));
  return {t, center, right:right.toArray(), up:tangent.clone().cross(right).normalize().toArray()};
}

export function sectionPoint(station, point) {
  return station.center.map((n,i) => n + station.right[i]*point[0] + station.up[i]*point[1]);
}

export function ringAt(station, section) {
  return (station.section ?? section).map(p => sectionPoint(station,p));
}

// Conservative refinement checks all profile vertices and the difference
// between a twisted bilinear cell and its triangulation. Independent probes
// on the final mesh are recorded by the geometry study.
function sampleSweep(evaluate, section, knots, tolerance, angleLimit) {
  const stations = [], cache = new Map();
  function at(t) {
    if (!cache.has(t)) {
      const frame = evaluate(t);
      cache.set(t, { frame, ring:ringAt(frame,section).map(vec) });
    }
    return cache.get(t);
  }
  function split(lo, hi, depth) {
    const a = at(lo), b = at(hi), mid = (lo+hi)/2;
    let error = 0, rotation = 0;
    for (const axis of ["right","up"]) {
      const m = vec(at(mid).frame[axis]);
      rotation = Math.max(rotation, vec(a.frame[axis]).angleTo(m) + m.angleTo(vec(b.frame[axis])));
    }
    for (const f of [0.25,0.5,0.75]) {
      const actual = at(lo+(hi-lo)*f);
      for (let i=0; i<a.ring.length; i++) {
        const chord = a.ring[i].clone().lerp(b.ring[i],f);
        error = Math.max(error, chord.distanceTo(actual.ring[i]));
      }
    }
    for (let i=0; i<a.ring.length; i++) {
      const j = (i+1)%a.ring.length;
      const across = a.ring[j].clone().sub(a.ring[i]);
      const along = b.ring[i].clone().sub(a.ring[i]);
      const diagonalError = b.ring[j].clone().sub(b.ring[i]).sub(across);
      const normalA = along.clone().cross(across).normalize();
      const normalB = b.ring[j].clone().sub(a.ring[j]).cross(b.ring[j].clone().sub(b.ring[i])).normalize();
      error = Math.max(error,Math.abs(normalA.dot(diagonalError))/4,Math.abs(normalB.dot(diagonalError))/4);
    }
    if (error > tolerance*0.65 || rotation > angleLimit ||
        vec(a.frame.center).distanceTo(vec(b.frame.center)) > 18) {
      if (depth >= 14) throw Error("Adaptive sweep exceeded subdivision budget");
      split(lo,mid,depth+1);
      split(mid,hi,depth+1);
    } else stations.push(a.frame);
  }
  for (let i=1;i<knots.length;i++) split(knots[i-1],knots[i],0);
  stations.push(at(knots.at(-1)).frame);
  return stations.map(s => ({
    t:round(s.t), center:s.center.map(round), right:s.right.map(round), up:s.up.map(round),
    ...(s.section ? {section:s.section.map(p=>p.map(round))} : {}),
  }));
}

export function designModule(id, scale = 1, heightGain=1, returnOffset=0) {
  if (!moduleIds.includes(id) || !Number.isFinite(scale) || scale < 0.25 || scale > 1.45)
    throw Error("Invalid module or shaping scale");
  if (!Number.isFinite(heightGain) || heightGain<=0 || heightGain>1) throw Error("Invalid vertical relief gain");
  if (!Number.isFinite(returnOffset) || returnOffset<0 || returnOffset>96) throw Error("Invalid helical return displacement");
  const collisionTolerance = 0.16, renderTolerance = 0.055;
  const section = ribbonSection(id === "bowl" ? 12 : 1,0);
  const at = t => {
    const frame = frameAt(id,t,scale,heightGain,returnOffset);
    if (id === "bowl") frame.section = ribbonSection(12,6*rise(t)*scale);
    return frame;
  };
  const knots = id === "helix" ? [0,0.22,0.3475,0.475,0.6025,0.73,1] : [0,0.25,0.5,0.75,1];
  function surface(name, evaluate, profile, breaks) {
    return {id:name, section:profile.map(p=>p.map(round)), closedSection:true,
      stations:sampleSweep(evaluate,profile,breaks,renderTolerance,pi/50),
      collisionStations:sampleSweep(evaluate,profile,breaks,collisionTolerance,pi/24)};
  }
  const deck = surface(id,at,section,knots);
  const shells = id === "tunnel" ? [surface("vault",at,vaultSection(),[0.1,0.25,0.5,0.75,0.9])] : [];
  return {...deck, width, collisionTolerance, renderTolerance, shells,
    sockets:{entry:{center:[0,0,0],forward:[0,0,1],up:[0,1,0],width},
      exit:{center:[0,0,chunkSize],forward:[0,0,1],up:[0,1,0],width}},
    source:"V2Wpro/src/parametric.js", license:"MIT"};
}

export function moduleLibrary() {
  return {format:"kinetic-module-library-1", units:"metres", axes:"right-handed-y-up",
    chunkSize, modules:moduleIds.map(id=>designModule(id))};
}

// Independent off-grid point-to-triangle measurements on the built cells.
// The cross-section is the declared polygon; both longitudinal tessellations
// are compared to the same analytic spine, frame and loft.
export function measureSurfaceError(module, scale=1, heightGain=1, returnOffset=0) {
  const results=[];
  for (const part of [module,...module.shells]) {
    for (const role of ["render","collision"]) {
      const rows=role==="render" ? part.stations : part.collisionStations;
      let maxError=0, count=0;
      for (let i=1;i<rows.length;i++) {
        const a=rows[i-1], b=rows[i];
        const low=ringAt(a,part.section).map(vec), high=ringAt(b,part.section).map(vec);
        for (const f of [0.173,0.437,0.793]) {
          const t=a.t+(b.t-a.t)*f;
          const target=frameAt(module.id,t,scale,heightGain,returnOffset);
          if (module.id==="bowl") target.section=ribbonSection(12,6*rise(t)*scale);
          const ring=ringAt(target,part.section).map(vec);
          for (let k=0;k<ring.length;k++) {
            const next=(k+1)%ring.length;
            const left=new Triangle(low[k],high[k],low[next]);
            const right=new Triangle(low[next],high[k],high[next]);
            for (const u of [0,0.371,0.817]) {
              const p=ring[k].clone().lerp(ring[next],u);
              maxError=Math.max(maxError, Math.min(...[left,right].map(tri=>
                tri.closestPointToPoint(p,new Vector3()).distanceTo(p))));
              count++;
            }
          }
        }
      }
      const tolerance=role==="render" ? module.renderTolerance : module.collisionTolerance;
      results.push({part:part.id,role,probes:count,maxError,tolerance,withinTolerance:maxError<=tolerance});
    }
  }
  return results;
}

export function sweepMesh(surface, collision = false, placement = p=>p) {
  const rows = collision ? surface.collisionStations : surface.stations;
  const positions = [], indices = [], n = surface.section.length;
  for (const row of rows) {
    for (const p of ringAt(row,surface.section)) positions.push(...placement(p,row.t));
  }
  for (let j=1; j<rows.length; j++) {
    for (let i=0; i<(surface.closedSection ? n : n-1); i++) {
      const next = (i+1)%n, a=(j-1)*n+i, b=(j-1)*n+next;
      indices.push(a,a+n,b, b,a+n,b+n);
    }
  }
  if (surface.closedSection) {
    for (const index of [0,rows.length-1]) {
      const contour = (rows[index].section ?? surface.section).map(([x,y])=>new Vector2(x,y));
      const start = index*n;
      for (const [a,b,c] of ShapeUtils.triangulateShape(contour,[])) {
        indices.push(...(index ? [a,b,c] : [c,b,a]).map(i=>start+i));
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position",new Float32BufferAttribute(positions,3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}
