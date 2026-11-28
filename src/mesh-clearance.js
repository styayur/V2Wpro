import { Box3, Ray, Triangle, Vector3 } from "three";

const vector = p => new Vector3(...p);
const clamp = x => Math.max(0,Math.min(1,x));
const insideDirection = new Vector3(1,0.31783,0.15071).normalize();

// Minimise distance between two finite segments, including parallel segments
// and clipped endpoints. Distances, projections and returned values are squared.
function edgeDistance(p,q,a,b) {
  const u=q.clone().sub(p), v=b.clone().sub(a), w=p.clone().sub(a);
  const uu=u.lengthSq(), vv=v.lengthSq(), uv=u.dot(v), uw=u.dot(w), vw=v.dot(w);
  if (uu <= 1e-20) return w.addScaledVector(v, -clamp(vw/(vv || 1))).lengthSq();
  if (vv <= 1e-20) return w.addScaledVector(u,clamp(-uw/uu)).lengthSq();
  const det=uu*vv-uv*uv;
  let s=det > 1e-12*uu*vv ? clamp((uv*vw-vv*uw)/det) : 0;
  let t=(uv*s+vw)/vv;
  if (t < 0) { t=0; s=clamp(-uw/uu); }
  if (t > 1) { t=1; s=clamp((uv-uw)/uu); }
  return w.addScaledVector(u,s).addScaledVector(v,-t).lengthSq();
}

function chordDistance(a,b,ray,lengthSq,tri) {
  const p=new Vector3();
  if (lengthSq && ray.intersectTriangle(tri.a,tri.b,tri.c,false,p) && p.distanceToSquared(a) <= lengthSq) return 0;
  const da=tri.closestPointToPoint(a,p).distanceToSquared(a);
  if (!lengthSq) return da;
  return Math.min(da,tri.closestPointToPoint(b,p).distanceToSquared(b),
    edgeDistance(a,b,tri.a,tri.b),edgeDistance(a,b,tri.b,tri.c),edgeDistance(a,b,tri.c,tri.a));
}

function tree(triangles) {
  const box=new Box3();
  for (const t of triangles) box.union(t.box);
  if (triangles.length <= 12) return {box,triangles};
  const size=box.getSize(new Vector3());
  const axis=size.x >= size.y && size.x >= size.z ? "x" : size.y >= size.z ? "y":"z";
  triangles.sort((a,b)=>a.mid[axis]-b.mid[axis]);
  const mid=Math.floor(triangles.length/2);
  return {box,children:[tree(triangles.slice(0,mid)),tree(triangles.slice(mid))]};
}

function contains(root,p) {
  if (!root.box.containsPoint(p)) return false;
  const ray=new Ray(p,insideDirection), hits=[], intersection=new Vector3();
  function visit(node) {
    if (!ray.intersectsBox(node.box)) return;
    if (node.children) {node.children.forEach(visit); return;}
    for (const {tri} of node.triangles) {
      if (ray.intersectTriangle(tri.a,tri.b,tri.c,false,intersection))
        hits.push(intersection.distanceTo(p));
    }
  }
  visit(root);
  hits.sort((a,b)=>a-b);
  return hits.filter((n,i)=>!i || n-hits[i-1]>1e-7).length % 2 === 1;
}

export function collisionIndex(surfaces) {
  const roots=surfaces.map(({collision:g})=>{
    const p=g.getAttribute("position"), triangles=[];
    for (let i=0;i<g.index.count;i+=3) {
      const vertices=[0,1,2].map(k=>new Vector3().fromBufferAttribute(p,g.index.getX(i+k)));
      const tri=new Triangle(...vertices);
      if (!tri.getArea()) continue;
      triangles.push({tri,box:new Box3().setFromPoints(vertices),mid:tri.getMidpoint(new Vector3())});
    }
    return tree(triangles);
  });
  function distance(start,end,limit) {
    const a=vector(start), b=vector(end), line=b.clone().sub(a), lengthSq=line.lengthSq();
    const ray=new Ray(a,line.normalize());
    const window=new Box3().setFromPoints([a,b]).expandByScalar(limit);
    let best=limit*limit;
    function visit(node) {
      if (!best || !window.intersectsBox(node.box)) return;
      if (node.children) {node.children.forEach(visit);return;}
      for (const {tri,box} of node.triangles) {
        if (window.intersectsBox(box)) best=Math.min(best,chordDistance(a,b,ray,lengthSq,tri));
        if (!best) return;
      }
    }
    for (const root of roots) {
      if (!window.intersectsBox(root.box)) continue;
      if (contains(root,a)) return 0;
      visit(root);
    }
    return Math.sqrt(best);
  }
  return {distance,clearChord:(a,b,r)=>distance(a,b,r+1e-4)>r};
}
