// Орбитальная камера: 1 палец — вращение, 2 пальца — зум щипком, колесо мыши — зум.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export class OrbitControls {
  constructor(engine, { target = [0, 0, 0], distance = 6, yaw = 0, pitch = 0.3,
                        minDistance = 1.5, maxDistance = 40, rotateSpeed = 0.006 } = {}) {
    Object.assign(this, { engine, target, distance, yaw, pitch, minDistance, maxDistance, rotateSpeed });
    const el = engine.canvas, pts = new Map();
    let pinch = 0;
    const span = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    const up = (e) => { pts.delete(e.pointerId); pinch = pts.size === 2 ? span() : 0; };
    this._on = {
      pointerdown: (e) => {
        if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        pinch = pts.size === 2 ? span() : 0;
      },
      pointermove: (e) => {
        const p = pts.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x, dy = e.clientY - p.y;
        p.x = e.clientX; p.y = e.clientY;
        if (pts.size === 1) {
          this.yaw -= dx * this.rotateSpeed;
          this.pitch = clamp(this.pitch + dy * this.rotateSpeed, -1.5, 1.5);
        } else if (pts.size === 2) {
          const s = span();
          if (pinch && s) this.distance = clamp(this.distance * pinch / s, this.minDistance, this.maxDistance);
          pinch = s;
        }
        this.apply();
      },
      pointerup: up,
      pointercancel: up,
      wheel: (e) => {
        e.preventDefault();
        this.distance = clamp(this.distance * (1 + e.deltaY * 0.001), this.minDistance, this.maxDistance);
        this.apply();
      },
    };
    for (const [k, f] of Object.entries(this._on)) el.addEventListener(k, f, { passive: k !== 'wheel' });
    this.apply();
  }

  apply() {
    const { target: t, distance: d, yaw, pitch } = this, cp = Math.cos(pitch);
    this.engine.setCamera({
      position: [t[0] + d * cp * Math.sin(yaw), t[1] + d * Math.sin(pitch), t[2] + d * cp * Math.cos(yaw)],
      target: t,
    });
  }

  dispose() {
    for (const [k, f] of Object.entries(this._on)) this.engine.canvas.removeEventListener(k, f);
  }
}
