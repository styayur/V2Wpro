// The integer hash makes a chunk independent of visit order.
function random(seed, chunk, index) {
  let n = Math.imul(seed ^ Math.imul(chunk + 1, 2654435761) ^ index, 1597334677)
  n = Math.imul(n ^ (n >>> 16), 2246822507)
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296
}

export function generateChunk(w, index) {
  if (!Number.isInteger(index) || index < 0 || index >= w.streaming.count) throw Error('Chunk outside world')
  const items = [], solids = []
  const { length, rows, clearance, variation } = w.rules
  const add = (shape, position, size, material, solid = false, asset = null) => {
    items.push({ shape, position, size, material, asset })
    if (solid) solids.push({ center: position, extent: size.map(n => n / 2) })
  }
  for (let row = 0; row < rows; row++) {
    const z = -(index * length + (row + .5) * length / rows)
    for (const side of [-1, 1]) {
      const r = random(w.seed, index, 2 * row + (side + 1) / 2)
      const width = 2 + r * variation
      const h = 5 + r * variation
      const x = side * (clearance / 2 + width / 2 + 1)
      if (w.prototype === 'island') {
        add('rock', [x, -1 - h/2, z], [width*1.8,h,width], 'stone')
        add('mound', [x,-1,z], [width*1.8,2,width], 'accent')
      } else {
        add('box', [x, h / 2 - 2, z], [width,h,2], 'stone', true)
      }
    }
    if (w.prototype === 'arcade') {
      add('arch', [0,5,z], [clearance+3,7,1], 'accent')
      add('box', [0,8.8,z], [clearance+8,.65,2], 'stone', true)
    }
    if (w.prototype === 'gate') add('ring', [0,2,z], [clearance,clearance,.6], 'accent')
    if (w.assets.length) add('asset', [clearance,5,z], [1,1,1], 'stone', false, w.assets[0].uri)
  }
  if (items.length > w.budget.instances) throw Error('Chunk instance budget exceeded')
  return { index, items, solids }
}

export function visibleChunks(w, distance) {
  const center = Math.min(w.streaming.count-1, Math.max(0, Math.floor(distance / w.rules.length)))
  return Array.from({length:w.streaming.count}, (_, i) => i).filter(i => Math.abs(center-i)<=w.streaming.radius)
}

export function blocked(solids, point, radius) {
  return solids.some(({center,extent}) => center.reduce((sum,v,i) => sum + Math.max(0,Math.abs(v-point[i])-extent[i])**2,0) < radius**2)
}

export function routeOpen(w) {
  for(let i=0;i<w.streaming.count;i++){
    const {solids}=generateChunk(w,i)
    // Sweep the player sphere along the entire centre lane (negative Z).
    if(solids.some(s=>Math.abs(s.center[0]) < s.extent[0]+w.physics.radius &&
      Math.abs(s.center[1]-2) < s.extent[1]+w.physics.radius)) return false
  }
  return true
}
