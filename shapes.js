// Все фигуры: лицевая сторона = против часовой стрелки (CCW) снаружи.
export function cube({ size = 1 } = {}) {
  const h = size / 2;
  const faces = [ // [нормаль, u, v], u × v = нормаль
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  ];
  const positions = [], normals = [], indices = [];
  faces.forEach(([n, u, v], f) => {
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      for (let i = 0; i < 3; i++) positions.push((n[i] + u[i] * a + v[i] * b) * h);
      normals.push(...n);
    }
    const o = f * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  return { positions, normals, indices };
}

export function plane({ size = 1 } = {}) {
  const h = size / 2;
  return {
    positions: [-h, 0, -h, h, 0, -h, h, 0, h, -h, 0, h],
    normals: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    indices: [0, 2, 1, 0, 3, 2],
  };
}

// segments=12 — мало треугольников, хорошо для мобильных
export function sphere({ radius = 0.5, segments = 12 } = {}) {
  const positions = [], normals = [], indices = [];
  for (let y = 0; y <= segments; y++) {
    const phi = (y / segments) * Math.PI;
    for (let x = 0; x <= segments; x++) {
      const th = (x / segments) * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
      positions.push(nx * radius, ny * radius, nz * radius);
      normals.push(nx, ny, nz);
    }
  }
  const row = segments + 1;
  for (let y = 0; y < segments; y++)
    for (let x = 0; x < segments; x++) {
      const a = y * row + x, b = a + row;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  return { positions, normals, indices };
}

export const shapes = { cube, plane, sphere };

// Сглаженные нормали для своих мешей без normals
export function computeNormals(pos, idx) {
  const n = new Float32Array(pos.length);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const i of [a, b, c]) { n[i] += nx; n[i + 1] += ny; n[i + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
  }
  return n;
}
