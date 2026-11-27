import { BufferGeometry, Float32BufferAttribute } from "three";

// A WorldIR solid box encloses this optional exchange/preview surface.
// The normalized top varies inside the box. Both ends have the same
// elevation and tangent, so neighbouring modules can share a socket.
export function contactDeck(segments, cycles) {
  const vertices = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const y = 0.45 * Math.cos(2 * Math.PI * cycles * t);
    vertices.push(-0.5, y, 0.5-t, 0.5, y, 0.5-t,
                  -0.5, -0.5, 0.5-t, 0.5, -0.5, 0.5-t);
    if (!i) continue;
    const a = (i-1)*4, b = i*4;
    indices.push(a,a+1,b, b,a+1,b+1, a+2,b+2,a+3, a+3,b+2,b+3,
      a,b,a+2, a+2,b,b+2, a+1,a+3,b+1, b+1,a+3,b+3);
  }
  const end = segments*4;
  indices.push(0,2,1, 1,2,3, end,end+1,end+2, end+1,end+3,end+2);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(vertices,3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function deckCycles(world, item) {
  const spec = world.extensions?.contactDeck;
  if (!item.solid || spec?.version !== 1 || item.shape !== "box" || item.evidence !== spec.evidence) return 0;
  if (!Number.isInteger(spec.cycles) || spec.cycles < 1 || spec.cycles > 8)
    throw Error("Contact deck cycles must be an integer from 1 to 8");
  return spec.cycles;
}
