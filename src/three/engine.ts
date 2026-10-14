import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Branch, Settings, Vec3 } from "@/lib/types";
import { branchPoints } from "@/lib/simulation";

const STATUS_COLOR: Record<string, number> = { stable: 0x9cff57, unstable: 0xf5a524, critical: 0xff3b3b, nexus: 0xff6a1a, pruned: 0x333333 };
const MAIN_LEN = 4000; // la Sagrada Línea se extiende mucho más allá de la niebla: sensación infinita

interface BranchObj {
  id: string; group: THREE.Group; curve: THREE.CatmullRomCurve3; tube: THREE.Mesh; glow: THREE.Mesh; node: THREE.Mesh; tip: THREE.Mesh;
  particles: THREE.Points; pOffsets: Float32Array; baseColor: THREE.Color; ring: THREE.Mesh; ringT: number; status: string;
}

export interface EngineCallbacks { onSelect: (id: string | null) => void; onPruneDone: () => void; onPulseDone: () => void }

export class TimelineEngine {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera: THREE.PerspectiveCamera; controls: OrbitControls;
  branches = new Map<string, BranchObj>(); mainParticles!: THREE.Points; mainOffsets!: Float32Array;
  raycaster = new THREE.Raycaster(); clock = new THREE.Clock(); raf = 0; disposed = false;
  settings: Settings; cb: EngineCallbacks; selected: string | null = null; dimOthers = false; crisis = false;
  focusTarget: THREE.Vector3 | null = null; focusDist = 40;
  // poda
  pruneState: null | { id: string; mode: "pulse" | "disintegrate"; t0: number; dur: number; segs: THREE.Mesh[]; debris: THREE.Points; dVel: Float32Array; dLife: Float32Array; pulse: THREE.Mesh; arcs: THREE.LineSegments; waves: THREE.Mesh[]; light: THREE.PointLight; done: boolean } = null;
  pointerDown = { x: 0, y: 0, t: 0 }; container: HTMLElement;
  opLight: THREE.PointLight; // luz de operación creada una sola vez (evita recompilar shaders durante la poda)

  constructor(container: HTMLElement, settings: Settings, cb: EngineCallbacks) {
    this.container = container; this.settings = settings; this.cb = cb;
    this.renderer = new THREE.WebGLRenderer({ antialias: !settings.lowPower, alpha: false, powerPreference: settings.lowPower ? "low-power" : "high-performance" });
    this.renderer.setPixelRatio(Math.min(settings.lowPower ? 1 : 2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x07080a, 1);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    this.camera.position.set(-20, 22, 58);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.dampingFactor = 0.08; this.controls.minDistance = 6; this.controls.maxDistance = 220;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    this.scene.fog = new THREE.FogExp2(0x07080a, 0.0075);
    this.buildAmbient();
    this.opLight = new THREE.PointLight(0xf5a524, 0, 30, 1.5); this.scene.add(this.opLight);
    this.buildMain();
    this.resize();
    window.addEventListener("resize", this.resize);
    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", (e) => { this.pointerDown = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener("pointerup", (e) => {
      const d = Math.hypot(e.clientX - this.pointerDown.x, e.clientY - this.pointerDown.y);
      if (d < 8 && performance.now() - this.pointerDown.t < 500) this.pick(e.clientX, e.clientY);
    });
    this.loop();
  }

  resize = () => {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  };

  buildAmbient() {
    this.scene.add(new THREE.AmbientLight(0x404838, 1.2));
    const key = new THREE.DirectionalLight(0xfff1cc, 1.1); key.position.set(30, 60, 40); this.scene.add(key);
    const grid = new THREE.GridHelper(800, 80, 0x2f3722, 0x1a1e14); grid.position.y = -18; (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.5; this.scene.add(grid);
    // polvo estelar
    const n = Math.floor(600 * (0.3 + this.settings.particles)); const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 600; pos[i * 3 + 1] = (Math.random() - 0.5) * 160; pos[i * 3 + 2] = (Math.random() - 0.5) * 300; }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x5c6b3a, size: 0.35, transparent: true, opacity: 0.6, depthWrite: false })));
  }

  buildMain() {
    // Línea blanca principal — tubo + halo aditivo
    const geo = new THREE.CylinderGeometry(0.28, 0.28, MAIN_LEN, 12, 1).rotateZ(Math.PI / 2);
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff })); core.userData.branchId = "SACRED-TIMELINE"; this.scene.add(core);
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, MAIN_LEN, 12, 1).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false })); this.scene.add(halo);
    const halo2 = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, MAIN_LEN, 12, 1).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe9e2c8, transparent: true, opacity: 0.04, blending: THREE.AdditiveBlending, depthWrite: false })); this.scene.add(halo2);
    // marcas de coordenadas temporales
    for (let x = -400; x <= 400; x += 20) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.1, x % 100 === 0 ? 2.4 : 1, 0.1), new THREE.MeshBasicMaterial({ color: x % 100 === 0 ? 0xf5a524 : 0x8a8f85, transparent: true, opacity: 0.7 }));
      m.position.set(x, -1.6, 0); this.scene.add(m);
    }
    // partículas que recorren la línea principal
    const n = Math.floor(400 * (0.3 + this.settings.particles)); const pos = new Float32Array(n * 3); this.mainOffsets = new Float32Array(n);
    for (let i = 0; i < n; i++) this.mainOffsets[i] = Math.random() * 300 - 150;
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.mainParticles = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.mainParticles);
  }

  // ── Ramas: cada una se construye desde su modelo de datos ──
  syncBranches(all: Branch[]) {
    const active = all.filter((b) => b.kind !== "main" && b.status !== "pruned");
    const ids = new Set(active.map((b) => b.id));
    for (const [id, obj] of this.branches) if (!ids.has(id)) { this.scene.remove(obj.group); this.branches.delete(id); }
    for (const b of active) {
      const ex = this.branches.get(b.id);
      if (ex && ex.status === b.status) continue;
      if (ex) { this.scene.remove(ex.group); this.branches.delete(b.id); }
      this.branches.set(b.id, this.makeBranch(b, all));
    }
  }

  curveFor(b: Branch, all: Branch[]) {
    const pts = branchPoints(b, all, 24).map((p: Vec3) => new THREE.Vector3(p.x, p.y, p.z));
    return new THREE.CatmullRomCurve3(pts);
  }

  makeBranch(b: Branch, all: Branch[]): BranchObj {
    const group = new THREE.Group(); group.userData.branchId = b.id;
    const curve = this.curveFor(b, all);
    const color = new THREE.Color(STATUS_COLOR[b.status] ?? 0x9cff57);
    const radius = b.kind === "nexus" ? 0.22 : 0.16;
    const segs = this.settings.lowPower ? 24 : 48;
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, radius, 8, false), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.3 }));
    tube.userData.branchId = b.id; group.add(tube);
    const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, radius * 3.2, 8, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    group.add(glow);
    const start = curve.getPoint(0), end = curve.getPoint(1);
    const node = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff })); node.position.copy(start); node.userData.branchId = b.id; group.add(node);
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })); tip.position.copy(end); tip.userData.branchId = b.id; group.add(tip);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.copy(start); ring.lookAt(start.clone().add(new THREE.Vector3(1, 0, 0))); group.add(ring);
    const n = Math.floor((b.kind === "nexus" ? 90 : 50) * (0.2 + this.settings.particles));
    const pos = new Float32Array(n * 3); const pOffsets = new Float32Array(n);
    for (let i = 0; i < n; i++) pOffsets[i] = Math.random();
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const particles = new THREE.Points(g, new THREE.PointsMaterial({ color, size: 0.42, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false }));
    group.add(particles);
    this.scene.add(group);
    return { id: b.id, group, curve, tube, glow, node, tip, particles, pOffsets, baseColor: color, ring, ringT: Math.random(), status: b.status };
  }

  setSelected(id: string | null, dim = false) { this.selected = id; this.dimOthers = dim; }
  setCrisis(c: boolean) { this.crisis = c; }

  focusOn(id: string | null) {
    if (!id) { this.focusTarget = null; return; }
    const o = this.branches.get(id);
    if (o) { this.focusTarget = o.curve.getPoint(0.35); this.focusDist = Math.max(18, o.curve.getLength() * 1.4); }
    else if (id === "SACRED-TIMELINE") { this.focusTarget = new THREE.Vector3(0, 0, 0); this.focusDist = 60; }
  }
  overview() { this.focusTarget = new THREE.Vector3(0, 4, 0); this.focusDist = 95; }

  pick(cx: number, cy: number) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const m = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(m, this.camera);
    this.raycaster.params.Line = { threshold: 1 };
    const targets: THREE.Object3D[] = [];
    for (const o of this.branches.values()) targets.push(o.tube, o.node, o.tip, o.glow);
    this.scene.children.forEach((c) => { if (c.userData.branchId === "SACRED-TIMELINE") targets.push(c); });
    const hits = this.raycaster.intersectObjects(targets, false);
    this.cb.onSelect(hits[0]?.object.userData.branchId ?? null);
  }

  // ── PODA ──────────────────────────────────────────────────────────────
  startPulse(id: string, tempBranch?: Branch, all?: Branch[]) {
    let o = this.branches.get(id);
    if (!o && tempBranch && all) { o = this.makeBranch(tempBranch, all); this.branches.set(id, o); }
    if (!o) return;
    const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.9, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }));
    const light = this.opLight; light.intensity = 40;
    this.scene.add(pulse);
    this.pruneState = { id, mode: "pulse", t0: performance.now(), dur: 1400 / this.settings.animSpeed, segs: [], debris: new THREE.Points(), dVel: new Float32Array(0), dLife: new Float32Array(0), pulse, arcs: new THREE.LineSegments(), waves: [], light, done: false };
  }

  startDisintegrate(id: string, durationMs: number) {
    const o = this.branches.get(id); if (!o) return;
    const ps = this.pruneState; if (!ps) return;
    ps.mode = "disintegrate"; ps.t0 = performance.now(); ps.dur = durationMs; ps.done = false;
    // Fragmentar la geometría real en N segmentos independientes
    const N = this.settings.lowPower ? 18 : 36;
    o.tube.visible = false; o.glow.visible = false; o.particles.visible = false;
    for (let i = 0; i < N; i++) {
      const sub = new THREE.CatmullRomCurve3([o.curve.getPoint(i / N), o.curve.getPoint((i + 0.5) / N), o.curve.getPoint((i + 1) / N)]);
      const m = new THREE.Mesh(new THREE.TubeGeometry(sub, 4, 0.2, 8, false), new THREE.MeshBasicMaterial({ color: 0xf5a524, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.userData.i = i; m.userData.c = sub.getPoint(0.5); o.group.add(m); ps.segs.push(m);
    }
    // escombros
    const D = Math.floor((this.settings.lowPower ? 400 : 1400) * (0.3 + this.settings.particles));
    const pos = new Float32Array(D * 3); ps.dVel = new Float32Array(D * 3); ps.dLife = new Float32Array(D).fill(-1);
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    ps.debris = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffb347, size: 0.35, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(ps.debris);
    const ag = new THREE.BufferGeometry(); ag.setAttribute("position", new THREE.BufferAttribute(new Float32Array(16 * 6), 3));
    ps.arcs = new THREE.LineSegments(ag, new THREE.LineBasicMaterial({ color: 0xfff1cc, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending }));
    this.scene.add(ps.arcs);
  }

  cleanupPrune(removeBranch: boolean) {
    const ps = this.pruneState; if (!ps) return;
    this.scene.remove(ps.pulse, ps.debris, ps.arcs, ...ps.waves); ps.light.intensity = 0;
    const o = this.branches.get(ps.id);
    if (o) {
      ps.segs.forEach((s) => o.group.remove(s));
      if (removeBranch) { this.scene.remove(o.group); this.branches.delete(ps.id); }
      else { o.tube.visible = true; o.glow.visible = true; o.particles.visible = true; }
    }
    this.pruneState = null;
  }

  abortPrune() { this.cleanupPrune(false); }

  updatePrune(now: number, dt: number) {
    const ps = this.pruneState; if (!ps) return;
    const o = this.branches.get(ps.id); if (!o) { this.pruneState = null; return; }
    const t = Math.min(1, (now - ps.t0) / ps.dur);
    if (ps.mode === "pulse") {
      const p = o.curve.getPoint(t); ps.pulse.position.copy(p); ps.light.position.copy(p);
      ps.pulse.scale.setScalar(1 + Math.sin(t * Math.PI) * 1.2);
      (o.tube.material as THREE.MeshStandardMaterial).emissive.setHex(0xf5a524); (o.tube.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.2 + t * 2;
      this.followCamera(p, 16, dt);
      if (t >= 1 && !ps.done) { ps.done = true; this.cb.onPulseDone(); }
      return;
    }
    // ── desintegración progresiva origen → extremo ──
    const front = t * 1.15; // frente de desintegración (0..1.15 para que termine el último)
    const posAttr = ps.debris.geometry.getAttribute("position") as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const N = ps.segs.length; const D = ps.dLife.length; let spawnBudget = Math.floor(D * dt * 2.5);
    const col = new THREE.Color();
    for (const s of ps.segs) {
      const i = s.userData.i as number; const local = front - i / N; // >0 cuando el frente ha pasado
      const mat = s.material as THREE.MeshBasicMaterial;
      if (local < -0.15) { mat.color.setHex(0xf5a524); continue; }
      const k = Math.min(1, Math.max(0, (local + 0.15) / 0.35)); // 0..1 progreso local
      col.setHSL(0.09 - k * 0.06, 1, 0.5 + k * 0.45); mat.color.copy(col);
      const jitter = (1 - k) * 0.25 * this.settings.effects;
      s.position.set((Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter);
      s.scale.setScalar(1 + k * 0.8);
      mat.opacity = Math.max(0, 1 - k * 1.1);
      if (k > 0.98) s.visible = false;
      // escombros desde este segmento
      if (k > 0.05 && k < 0.95 && spawnBudget > 0) {
        const c = s.userData.c as THREE.Vector3;
        for (let j = 0; j < D && spawnBudget > 0; j++) if (ps.dLife[j] < 0) {
          ps.dLife[j] = 0.6 + Math.random() * 1.2; posArr[j * 3] = c.x; posArr[j * 3 + 1] = c.y; posArr[j * 3 + 2] = c.z;
          ps.dVel[j * 3] = (Math.random() - 0.5) * 6; ps.dVel[j * 3 + 1] = (Math.random() - 0.3) * 6; ps.dVel[j * 3 + 2] = (Math.random() - 0.5) * 6; spawnBudget--;
          if (Math.random() < 0.3) break;
        }
      }
    }
    for (let j = 0; j < D; j++) if (ps.dLife[j] >= 0) {
      ps.dLife[j] -= dt; posArr[j * 3] += ps.dVel[j * 3] * dt; posArr[j * 3 + 1] += ps.dVel[j * 3 + 1] * dt; posArr[j * 3 + 2] += ps.dVel[j * 3 + 2] * dt;
      ps.dVel[j * 3 + 1] -= 2 * dt;
      if (ps.dLife[j] < 0) { posArr[j * 3 + 1] = -9999; }
    }
    posAttr.needsUpdate = true;
    // arcos eléctricos cerca del frente
    const fp = o.curve.getPoint(Math.min(1, front)); const arcArr = (ps.arcs.geometry.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    for (let a = 0; a < 16; a++) { const r = () => (Math.random() - 0.5) * 3; arcArr[a * 6] = fp.x + r(); arcArr[a * 6 + 1] = fp.y + r(); arcArr[a * 6 + 2] = fp.z + r(); arcArr[a * 6 + 3] = fp.x + r(); arcArr[a * 6 + 4] = fp.y + r(); arcArr[a * 6 + 5] = fp.z + r(); }
    (ps.arcs.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (ps.arcs.material as THREE.LineBasicMaterial).opacity = Math.random() * 0.9 * this.settings.effects * (t < 0.95 ? 1 : 0);
    ps.light.position.copy(fp); ps.light.intensity = 30 + Math.random() * 30; ps.pulse.position.copy(fp); ps.pulse.scale.setScalar(0.6 + Math.random() * 0.5);
    // ondas de energía
    if (Math.random() < dt * 3 * this.settings.effects && t < 0.95) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      w.position.copy(fp); w.lookAt(this.camera.position); w.userData.age = 0; this.scene.add(w); ps.waves.push(w);
    }
    for (const w of [...ps.waves]) { w.userData.age += dt; w.scale.setScalar(1 + w.userData.age * 10); (w.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.8 - w.userData.age * 0.9); if (w.userData.age > 1) { this.scene.remove(w); ps.waves.splice(ps.waves.indexOf(w), 1); } }
    // nodo y punta
    (o.node.material as THREE.MeshBasicMaterial).opacity = 1 - t; (o.node.material as THREE.MeshBasicMaterial).transparent = true;
    (o.tip.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - Math.max(0, front - 0.9) * 8);
    (o.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.6 - t);
    // cámara: sigue el frente con suavidad (sin mareo)
    this.followCamera(o.curve.getPoint(Math.min(1, Math.max(0.15, front - 0.1))), 20, dt * 0.6);
    if (t >= 1 && !ps.done) { ps.done = true; setTimeout(() => { this.cleanupPrune(true); this.cb.onPruneDone(); }, 500); }
  }

  followCamera(target: THREE.Vector3, dist: number, dt: number) {
    if (this.settings.reducedMotion) { this.controls.target.lerp(target, 0.2); return; }
    const k = 1 - Math.pow(0.001, dt);
    this.controls.target.lerp(target, k);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    const want = this.controls.target.clone().add(dir.multiplyScalar(dist));
    this.camera.position.lerp(want, k * 0.5);
  }

  loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta()) * this.settings.animSpeed; const now = performance.now(); const time = now / 1000;
    // foco de cámara
    if (this.focusTarget && !this.pruneState) {
      this.followCamera(this.focusTarget, this.focusDist, dt);
      if (this.controls.target.distanceTo(this.focusTarget) < 0.3) this.focusTarget = null;
    }
    // partículas línea principal (se recentran alrededor de la cámara: infinita)
    const cx = this.controls.target.x; const mp = this.mainParticles.geometry.getAttribute("position") as THREE.BufferAttribute; const ma = mp.array as Float32Array;
    for (let i = 0; i < this.mainOffsets.length; i++) {
      this.mainOffsets[i] += dt * 9; if (this.mainOffsets[i] > 150) this.mainOffsets[i] = -150;
      const a = i * 0.7 + time * 2; ma[i * 3] = cx + this.mainOffsets[i]; ma[i * 3 + 1] = Math.sin(a) * 0.5; ma[i * 3 + 2] = Math.cos(a) * 0.5;
    }
    mp.needsUpdate = true;
    // ramas
    for (const o of this.branches.values()) {
      const isSel = this.selected === o.id; const inPrune = this.pruneState?.id === o.id;
      const mat = o.tube.material as THREE.MeshStandardMaterial;
      if (!inPrune) {
        if (isSel) { mat.emissive.setHex(0xf5a524); mat.emissiveIntensity = 1.6 + Math.sin(time * 6) * 0.4; (o.glow.material as THREE.MeshBasicMaterial).color.setHex(0xf5a524); (o.glow.material as THREE.MeshBasicMaterial).opacity = 0.25; }
        else { mat.emissive.copy(o.baseColor); mat.emissiveIntensity = this.dimOthers ? 0.35 : (o.status === "critical" || o.status === "nexus" ? 0.9 + Math.sin(time * 8) * 0.4 : 0.9); (o.glow.material as THREE.MeshBasicMaterial).color.copy(o.baseColor); (o.glow.material as THREE.MeshBasicMaterial).opacity = this.dimOthers ? 0.04 : 0.1; }
        if (this.crisis && (o.status === "critical" || o.status === "unstable")) o.group.position.set((Math.random() - 0.5) * 0.08, (Math.random() - 0.5) * 0.08, 0); else o.group.position.set(0, 0, 0);
      }
      const pa = o.particles.geometry.getAttribute("position") as THREE.BufferAttribute; const arr = pa.array as Float32Array;
      const speed = o.status === "stable" ? 0.12 : 0.25;
      for (let i = 0; i < o.pOffsets.length; i++) { o.pOffsets[i] += dt * speed; if (o.pOffsets[i] > 1) o.pOffsets[i] -= 1; const p = o.curve.getPoint(o.pOffsets[i]); arr[i * 3] = p.x + (Math.random() - 0.5) * 0.3; arr[i * 3 + 1] = p.y + (Math.random() - 0.5) * 0.3; arr[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.3; }
      pa.needsUpdate = true;
      o.ringT += dt * 0.6; if (o.ringT > 1) o.ringT = 0; o.ring.scale.setScalar(0.5 + o.ringT * 3.5); (o.ring.material as THREE.MeshBasicMaterial).opacity = (1 - o.ringT) * 0.6;
      o.tip.rotation.y += dt * 2; o.tip.rotation.x += dt;
    }
    if (this.pruneState) this.updatePrune(now, dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true; cancelAnimationFrame(this.raf); window.removeEventListener("resize", this.resize);
    this.controls.dispose();
    this.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = m.material as THREE.Material | THREE.Material[] | undefined; if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose(); });
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}

export function webglSupported() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}
