// Программный растеризатор на чистом JS поверх Canvas 2D. Без WebGL и WebGPU.
// Вершинный этап: MVP + освещение по вершинам (Gouraud). Растеризация: построчные спаны,
// z-буфер по 1/w, отсечение по near-плоскости, backface culling.
const EPS = 1e-5;
let K0 = 0, K1 = 0;

// Сужает диапазон пикселей строки [K0..K1] условием l + a*k >= 0
function edge(l, a) {
  l += EPS;
  if (a > 1e-12) { const k = Math.ceil(-l / a); if (k > K0) K0 = k; }
  else if (a < -1e-12) { const k = Math.floor(-l / a); if (k < K1) K1 = k; }
  else if (l < 0) K1 = -1;
}

// Отсечение треугольника near-плоскостью (clip-space: z >= -w). Редкий путь.
function clipNear(V, o0, o1, o2) {
  const pts = [o0, o1, o2].map((o) => Array.from(V.subarray(o, o + 7)));
  const out = [];
  for (let i = 0; i < 3; i++) {
    const p = pts[i], q = pts[(i + 1) % 3];
    const dp = p[2] + p[3], dq = q[2] + q[3];
    if (dp >= 0) out.push(p);
    if ((dp >= 0) !== (dq >= 0)) {
      const t = dp / (dp - dq);
      out.push(p.map((v, k) => v + (q[k] - v) * t));
    }
  }
  return out;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    if (!this.ctx) throw new Error('Matel: Canvas 2D недоступен');
    this.w = 0; this.h = 0;
    this.V = new Float32Array(0); // clip x,y,z,w + цвет r,g,b (шаг 7)
    this.S = new Float32Array(0); // экран x,y,1/w (шаг 3)
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    this.img = this.ctx.createImageData(w, h);
    this.px = new Uint32Array(this.img.data.buffer);
    this.depth = new Float32Array(w * h);
  }

  clear(bg) {
    const c = (v) => Math.max(0, Math.min(255, (v * 255) | 0));
    this.px.fill((0xff000000 | (c(bg[2]) << 16) | (c(bg[1]) << 8) | c(bg[0])) >>> 0);
    this.depth.fill(0);
  }

  present() { this.ctx.putImageData(this.img, 0, 0); }

  _ensure(n) {
    if (this.V.length < n * 7) { this.V = new Float32Array(n * 7); this.S = new Float32Array(n * 3); }
  }

  // m = MVP, nm = матрица нормалей 3x3, amb = ambient*цвет (0..255), lt = [lx,ly,lz,r,g,b]*nl
  drawMesh(geo, m, nm, amb, lt, nl, cull) {
    const n = geo.vertexCount, P = geo.positions, N = geo.normals, I = geo.indices;
    this._ensure(n);
    const V = this.V, S = this.S, hw = this.w * 0.5, hh = this.h * 0.5, ln = nl * 6;
    const m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3], m4 = m[4], m5 = m[5], m6 = m[6], m7 = m[7];
    const m8 = m[8], m9 = m[9], m10 = m[10], m11 = m[11], m12 = m[12], m13 = m[13], m14 = m[14], m15 = m[15];
    const n0 = nm[0], n1 = nm[1], n2 = nm[2], n3 = nm[3], n4 = nm[4], n5 = nm[5], n6 = nm[6], n7 = nm[7], n8 = nm[8];
    const ar = amb[0], ag = amb[1], ab = amb[2];

    for (let i = 0, a = 0, o = 0, s = 0; i < n; i++, a += 3, o += 7, s += 3) {
      const x = P[a], y = P[a + 1], z = P[a + 2];
      const cx = m0 * x + m4 * y + m8 * z + m12;
      const cy = m1 * x + m5 * y + m9 * z + m13;
      const cz = m2 * x + m6 * y + m10 * z + m14;
      const cw = m3 * x + m7 * y + m11 * z + m15;
      V[o] = cx; V[o + 1] = cy; V[o + 2] = cz; V[o + 3] = cw;

      const ux = N[a], uy = N[a + 1], uz = N[a + 2];
      const nx = n0 * ux + n3 * uy + n6 * uz;
      const ny = n1 * ux + n4 * uy + n7 * uz;
      const nz = n2 * ux + n5 * uy + n8 * uz;
      let r = ar, g = ag, b = ab;
      for (let k = 0; k < ln; k += 6) {
        const d = nx * lt[k] + ny * lt[k + 1] + nz * lt[k + 2];
        if (d > 0) { r += d * lt[k + 3]; g += d * lt[k + 4]; b += d * lt[k + 5]; }
      }
      V[o + 4] = r; V[o + 5] = g; V[o + 6] = b;

      if (cz + cw >= 0) { // перед near-плоскостью
        const iw = 1 / cw;
        S[s] = (cx * iw + 1) * hw; S[s + 1] = (1 - cy * iw) * hh; S[s + 2] = iw;
      }
    }

    for (let t = 0; t < I.length; t += 3) {
      const i0 = I[t], i1 = I[t + 1], i2 = I[t + 2];
      const o0 = i0 * 7, o1 = i1 * 7, o2 = i2 * 7;
      const d0 = V[o0 + 2] + V[o0 + 3], d1 = V[o1 + 2] + V[o1 + 3], d2 = V[o2 + 2] + V[o2 + 3];
      if (d0 >= 0 && d1 >= 0 && d2 >= 0) {
        const s0 = i0 * 3, s1 = i1 * 3, s2 = i2 * 3;
        this._tri(S[s0], S[s0 + 1], S[s0 + 2], V[o0 + 4], V[o0 + 5], V[o0 + 6],
                  S[s1], S[s1 + 1], S[s1 + 2], V[o1 + 4], V[o1 + 5], V[o1 + 6],
                  S[s2], S[s2 + 1], S[s2 + 2], V[o2 + 4], V[o2 + 5], V[o2 + 6], cull);
      } else if (d0 < 0 && d1 < 0 && d2 < 0) {
        continue;
      } else {
        this._clipTri(o0, o1, o2, cull);
      }
    }
  }

  _clipTri(o0, o1, o2, cull) {
    const poly = clipNear(this.V, o0, o1, o2), n = poly.length;
    if (n < 3) return;
    const hw = this.w * 0.5, hh = this.h * 0.5;
    for (const v of poly) { const iw = 1 / v[3]; v[7] = (v[0] * iw + 1) * hw; v[8] = (1 - v[1] * iw) * hh; v[9] = iw; }
    const a = poly[0];
    for (let i = 1; i < n - 1; i++) {
      const b = poly[i], c = poly[i + 1];
      this._tri(a[7], a[8], a[9], a[4], a[5], a[6], b[7], b[8], b[9], b[4], b[5], b[6],
                c[7], c[8], c[9], c[4], c[5], c[6], cull);
    }
  }

  _tri(x0, y0, w0, r0, g0, b0, x1, y1, w1, r1, g1, b1, x2, y2, w2, r2, g2, b2, cull) {
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (area === 0 || (cull && area > 0)) return; // на экране лицевые грани имеют area < 0
    const W = this.w, H = this.h;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    if (minX > maxX || minY > maxY) return;

    // Барицентрические координаты и их градиенты (нормированы на area)
    const ia = 1 / area;
    const a0x = (y1 - y2) * ia, a0y = (x2 - x1) * ia;
    const a1x = (y2 - y0) * ia, a1y = (x0 - x2) * ia;
    const a2x = -(a0x + a1x),   a2y = -(a0y + a1y);
    const px = minX + 0.5, py = minY + 0.5;
    const B0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) * ia;
    const B1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) * ia;
    const B2 = 1 - B0 - B1;
    const iwx = w0 * a0x + w1 * a1x + w2 * a2x;
    const rx = r0 * a0x + r1 * a1x + r2 * a2x;
    const gx = g0 * a0x + g1 * a1x + g2 * a2x;
    const bx = b0 * a0x + b1 * a1x + b2 * a2x;
    const zb = this.depth, pix = this.px, span = maxX - minX;

    for (let y = minY, j = 0; y <= maxY; y++, j++) {
      let l0 = B0 + a0y * j, l1 = B1 + a1y * j, l2 = B2 + a2y * j;
      K0 = 0; K1 = span;
      edge(l0, a0x); edge(l1, a1x); edge(l2, a2x);
      if (K0 > K1) continue;
      l0 += a0x * K0; l1 += a1x * K0; l2 += a2x * K0;
      let iw = w0 * l0 + w1 * l1 + w2 * l2;
      let r = r0 * l0 + r1 * l1 + r2 * l2;
      let g = g0 * l0 + g1 * l1 + g2 * l2;
      let b = b0 * l0 + b1 * l1 + b2 * l2;
      let idx = y * W + minX + K0;
      for (let k = K0; k <= K1; k++, idx++) {
        if (iw > zb[idx]) {
          zb[idx] = iw;
          pix[idx] = 0xff000000 | ((b > 255 ? 255 : b | 0) << 16) | ((g > 255 ? 255 : g | 0) << 8) | (r > 255 ? 255 : r | 0);
        }
        iw += iwx; r += rx; g += gx; b += bx;
      }
    }
  }
}
