import { Renderer } from './renderer.js';
import { mat4 } from './math.js';
import { shapes, computeNormals } from './shapes.js';
import { OrbitControls } from './controls.js';

const NEAR = 0.1, FAR = 1000, MAX_LIGHTS = 4;
const OBJ_KEYS = ['color', 'position', 'rotation', 'scale', 'visible', 'doubleSided'];
const vec3 = (v) => (typeof v === 'number' ? [v, v, v] : v);

export default class Matel {
  constructor(opts = {}) {
    const o = {
      background: [0.05, 0.05, 0.1], fov: 60,
      resolutionScale: 0.5, minScale: 0.25, maxScale: 1, maxPixels: 250000,
      adaptive: true, targetFps: 60, cull: true, autoStyle: true, smooth: true, ...opts,
    };
    const el = typeof o.canvas === 'string' ? document.querySelector(o.canvas) : o.canvas;
    if (!el) throw new Error('Matel: canvas не найден');
    this.canvas = el;
    if (o.autoStyle) {
      const s = el.style;
      s.display = 'block'; s.touchAction = 'none';
      if (!s.width) s.width = '100%';
      if (!s.height) s.height = '100%';
    }
    if (!o.smooth) el.style.imageRendering = 'pixelated';

    this.renderer = new Renderer(el);
    this.background = o.background;
    this.fov = (o.fov * Math.PI) / 180;
    this.scale = o.resolutionScale;
    Object.assign(this, { minScale: o.minScale, maxScale: o.maxScale, maxPixels: o.maxPixels,
                          adaptive: o.adaptive, targetFps: o.targetFps, cull: o.cull });
    this.objects = [];
    this.updaters = [];
    this.camera = { position: [0, 0, 5], target: [0, 0, 0], up: [0, 1, 0] };
    // Свет по умолчанию; отключается при первом вызове addLighting
    this._defaultLights = true;
    this.ambient = { color: [1, 1, 1], intensity: 0.35 };
    this.lights = [{ direction: [-0.5, -1, -0.6], color: [1, 1, 1], intensity: 0.8 }];
    this.stats = { fps: 0, width: 0, height: 0, scale: this.scale, triangles: 0 };
    this.aspect = 1;
    this.running = false;

    this._view = mat4.create(); this._proj = mat4.create(); this._vp = mat4.create();
    this._model = mat4.create(); this._mvp = mat4.create(); this._nrm = new Float32Array(9);
    this._amb = new Float32Array(3); this._lt = new Float32Array(6 * MAX_LIGHTS);
    this._f = 0; this._w = 0; this._n = 0;

    this._resize();
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(el);
    } else {
      this._onResize = () => this._resize();
      window.addEventListener('resize', this._onResize);
    }
  }

  // ---- Объекты ----

  addMesh({ positions, normals, indices, color = [1, 1, 1], position = [0, 0, 0],
            rotation = [0, 0, 0], scale = [1, 1, 1], visible = true, doubleSided = false }) {
    const pos = new Float32Array(positions), idx = new Uint32Array(indices);
    const nrm = normals ? new Float32Array(normals) : computeNormals(pos, idx);
    let radius = 0;
    for (let i = 0; i < pos.length; i += 3) radius = Math.max(radius, Math.hypot(pos[i], pos[i + 1], pos[i + 2]));
    const obj = {
      geometry: { positions: pos, normals: nrm, indices: idx, vertexCount: pos.length / 3, radius },
      color, position, rotation, scale: vec3(scale), visible, doubleSided,
    };
    this.objects.push(obj);
    return obj;
  }

  addShape(type, opts = {}) {
    const make = shapes[type];
    if (!make) throw new Error(`Matel: неизвестная фигура "${type}". Доступно: ${Object.keys(shapes).join(', ')}`);
    const geo = {}, obj = {};
    for (const k in opts) (OBJ_KEYS.includes(k) ? obj : geo)[k] = opts[k];
    return this.addMesh({ ...make(geo), ...obj });
  }

  addCube(opts) { return this.addShape('cube', opts); }
  addSphere(opts) { return this.addShape('sphere', opts); }
  addPlane(opts) { return this.addShape('plane', opts); }

  remove(obj) {
    const i = this.objects.indexOf(obj);
    if (i >= 0) this.objects.splice(i, 1);
  }

  clear() { this.objects.length = 0; }

  // ---- Свет ----

  addLighting({ type = 'directional', direction = [-0.5, -1, -0.6], color = [1, 1, 1], intensity = 1 } = {}) {
    if (this._defaultLights) { this._defaultLights = false; this.lights.length = 0; this.ambient.intensity = 0; }
    if (type === 'ambient') return Object.assign(this.ambient, { color, intensity });
    if (type !== 'directional') throw new Error(`Matel: неизвестный тип света "${type}" (ambient | directional)`);
    if (this.lights.length >= MAX_LIGHTS) throw new Error(`Matel: максимум ${MAX_LIGHTS} направленных источника`);
    const l = { direction, color, intensity };
    this.lights.push(l);
    return l;
  }

  // ---- Камера ----

  setCamera({ position, target, up, fov } = {}) {
    if (position) this.camera.position = position;
    if (target) this.camera.target = target;
    if (up) this.camera.up = up;
    if (fov) this.fov = (fov * Math.PI) / 180;
  }

  enableOrbitControls(opts) {
    if (this.controls) this.controls.dispose();
    return (this.controls = new OrbitControls(this, opts));
  }

  // ---- Разрешение (главная мобильная оптимизация) ----

  setResolutionScale(s) {
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, s));
    this._resize();
  }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    let w = Math.max(16, Math.round((r.width || 300) * this.scale));
    let h = Math.max(16, Math.round((r.height || 150) * this.scale));
    if (w * h > this.maxPixels) {
      const k = Math.sqrt(this.maxPixels / (w * h));
      w = Math.round(w * k); h = Math.round(h * k);
    }
    if (w === this.renderer.w && h === this.renderer.h) return;
    this.renderer.resize(w, h);
    this.aspect = w / h;
    Object.assign(this.stats, { width: w, height: h, scale: this.scale });
  }

  // ---- Цикл ----

  onUpdate(fn) { this.updaters.push(fn); }

  start() {
    if (this.running) return this;
    this.running = true;
    let last = performance.now();
    const minGap = 1000 / this.targetFps - 2;
    this._onVis = () => { last = performance.now(); };
    document.addEventListener('visibilitychange', this._onVis);
    const loop = (now) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      const gap = now - last;
      if (gap < minGap) return; // лимит FPS: экономит батарею на 90/120 Гц экранах
      last = now;
      const t0 = performance.now(), dt = Math.min(gap / 1000, 0.1);
      for (const fn of this.updaters) fn(dt);
      this.render();
      this._tick(gap, performance.now() - t0);
    };
    this._raf = requestAnimationFrame(loop);
    return this;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    document.removeEventListener('visibilitychange', this._onVis);
  }

  destroy() {
    this.stop();
    if (this.controls) this.controls.dispose();
    if (this._ro) this._ro.disconnect();
    if (this._onResize) window.removeEventListener('resize', this._onResize);
  }

  // Динамическое разрешение: тормозит — снижаем, запас по времени — повышаем
  _tick(gap, work) {
    this._f = this._f ? this._f * 0.9 + gap * 0.1 : gap;
    this._w = this._w ? this._w * 0.9 + work * 0.1 : work;
    this.stats.fps = Math.round(1000 / this._f);
    if (!this.adaptive || ++this._n < 30) return;
    this._n = 0;
    const budget = 1000 / this.targetFps;
    let s = this.scale;
    if (this._f > budget * 1.25 && this._w > budget * 0.5) s *= 0.85;
    else if (this._w < budget * 0.4) s *= 1.08;
    s = Math.min(this.maxScale, Math.max(this.minScale, s));
    if (s !== this.scale) { this.scale = s; this._resize(); }
  }

  // ---- Рендер ----

  _inView(o) {
    const v = this._view, p = o.position, s = o.scale;
    const vx = v[0] * p[0] + v[4] * p[1] + v[8] * p[2] + v[12];
    const vy = v[1] * p[0] + v[5] * p[1] + v[9] * p[2] + v[13];
    const vz = v[2] * p[0] + v[6] * p[1] + v[10] * p[2] + v[14];
    const rad = o.geometry.radius * Math.max(Math.abs(s[0]), Math.abs(s[1]), Math.abs(s[2]));
    if (vz > rad - NEAR) return false;
    const ty = Math.tan(this.fov / 2), tx = ty * this.aspect;
    const nx = Math.sqrt(1 + tx * tx), ny = Math.sqrt(1 + ty * ty);
    return !((vx + vz * tx) / nx > rad || (-vx + vz * tx) / nx > rad ||
             (vy + vz * ty) / ny > rad || (-vy + vz * ty) / ny > rad);
  }

  render() {
    const r = this.renderer, cam = this.camera, A = this.ambient, amb = this._amb, lt = this._lt;
    r.clear(this.background);
    mat4.lookAt(this._view, cam.position, cam.target, cam.up);
    mat4.perspective(this._proj, this.fov, this.aspect, NEAR, FAR);
    mat4.multiply(this._vp, this._proj, this._view);
    const nl = this.lights.length;
    let tris = 0;
    for (const o of this.objects) {
      if (!o.visible || !this._inView(o)) continue;
      mat4.compose(this._model, this._nrm, o.position, o.rotation, o.scale);
      mat4.multiply(this._mvp, this._vp, this._model);
      const c = o.color, k = 255 * A.intensity;
      amb[0] = c[0] * A.color[0] * k; amb[1] = c[1] * A.color[1] * k; amb[2] = c[2] * A.color[2] * k;
      for (let i = 0; i < nl; i++) {
        const L = this.lights[i], d = L.direction, e = i * 6, ki = 255 * L.intensity;
        const inv = 1 / (Math.hypot(d[0], d[1], d[2]) || 1);
        lt[e] = -d[0] * inv; lt[e + 1] = -d[1] * inv; lt[e + 2] = -d[2] * inv;
        lt[e + 3] = c[0] * L.color[0] * ki; lt[e + 4] = c[1] * L.color[1] * ki; lt[e + 5] = c[2] * L.color[2] * ki;
      }
      r.drawMesh(o.geometry, this._mvp, this._nrm, amb, lt, nl, this.cull && !o.doubleSided);
      tris += o.geometry.indices.length / 3;
    }
    r.present();
    this.stats.triangles = tris;
  }
}
