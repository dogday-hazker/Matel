// Матрицы 4x4 в column-major (как в GL). Без аллокаций в горячих путях.
const T = new Float32Array(16);

export const mat4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },

  multiply(out, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      T[c * 4]     = a[0] * b0 + a[4] * b1 + a[8]  * b2 + a[12] * b3;
      T[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9]  * b2 + a[13] * b3;
      T[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      T[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    out.set(T);
    return out;
  },

  perspective(o, fovy, aspect, n, f) {
    const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f);
    o.fill(0);
    o[0] = t / aspect; o[5] = t; o[10] = (f + n) * nf; o[11] = -1; o[14] = 2 * f * n * nf;
    return o;
  },

  lookAt(o, e, t, u) {
    let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
    o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
    o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
    o[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
    o[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
    o[15] = 1;
    return o;
  },

  // m = модельная матрица (T * Ry * Rx * Rz * S), n = матрица нормалей 3x3 (только поворот)
  compose(m, n, p, r, s) {
    const cx = Math.cos(r[0]), sx = Math.sin(r[0]);
    const cy = Math.cos(r[1]), sy = Math.sin(r[1]);
    const cz = Math.cos(r[2]), sz = Math.sin(r[2]);
    const r00 = cy * cz + sy * sx * sz, r01 = -cy * sz + sy * sx * cz, r02 = sy * cx;
    const r10 = cx * sz,                r11 = cx * cz,                 r12 = -sx;
    const r20 = -sy * cz + cy * sx * sz, r21 = sy * sz + cy * sx * cz, r22 = cy * cx;
    n[0] = r00; n[1] = r10; n[2] = r20; n[3] = r01; n[4] = r11; n[5] = r21; n[6] = r02; n[7] = r12; n[8] = r22;
    m[0] = r00 * s[0]; m[1] = r10 * s[0]; m[2] = r20 * s[0]; m[3] = 0;
    m[4] = r01 * s[1]; m[5] = r11 * s[1]; m[6] = r21 * s[1]; m[7] = 0;
    m[8] = r02 * s[2]; m[9] = r12 * s[2]; m[10] = r22 * s[2]; m[11] = 0;
    m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; m[15] = 1;
    return m;
  },
};
