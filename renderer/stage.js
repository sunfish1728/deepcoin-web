// 舞台：WebGL、鏡頭、載入 VRM、視線、互動區域判斷、主迴圈。

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { resolveManifest } from './manifest.js';
import { Rig } from './rig.js';
import { Face } from './face.js';

const v3 = () => new THREE.Vector3();

export class Stage {
  constructor(canvas, emit) {
    this.emit = emit;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);
    this.camera.position.set(0, 1.2, 4);
    const sun = new THREE.DirectionalLight(0xffffff, Math.PI * 0.95);
    sun.position.set(0.6, 1.2, 1.4).normalize();
    this.scene.add(sun, new THREE.AmbientLight(0xffffff, 0.35));

    this.pivot = new THREE.Group(); // 拖曳轉向作用在這裡
    this.scene.add(this.pivot);
    this.lookTarget = new THREE.Object3D();
    this.scene.add(this.lookTarget);
    this.shadow = this.makeShadow();
    this.scene.add(this.shadow);

    this.vrm = null;
    this.rig = null;
    this.face = null;
    this.manifest = resolveManifest({});
    this.preset = 'full';
    this.zoom = 1;
    this.yaw = 0;
    this.yawVel = 0;
    this.lastTouch = -1e9;
    this.camPos = v3();
    this.camLook = v3();
    this.camGoalPos = v3();
    this.camGoalLook = v3();
    this.pointerWorld = null; // 觸控中的視線目標
    this.saccade = v3();
    this.nextSaccade = 0;
    this.paused = false;
    this.loading = false;
    this.appearOnLoad = false;
    this.popT = -1; // 跳出動畫進度（秒），-1 表示沒在播
    this.clock = new THREE.Clock();
    this.time = 0;
    this.loadSeq = 0;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  makeShadow() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const mat = new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, color: 0x0a4550, opacity: 0.22,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    return mesh;
  }

  setTheme({ shadow, shadowAlpha }) {
    if (shadow) this.shadow.material.color.set(shadow);
    if (typeof shadowAlpha === 'number') this.shadow.material.opacity = shadowAlpha;
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.vrm) this.frameCamera(false);
  }

  setPaused(p) {
    this.paused = p;
    this.renderer.setAnimationLoop(p ? null : () => this.frame());
    if (!p) this.clock.getDelta();
  }

  clear() {
    this.loadSeq++;
    if (this.vrm) {
      this.pivot.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
    }
    this.vrm = this.rig = this.face = null;
    this.shadow.visible = false;
  }

  async load(url, manifestRaw) {
    this.clear();
    const seq = this.loadSeq;
    this.loading = true;
    this.manifest = resolveManifest(manifestRaw);
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    let gltf;
    try {
      gltf = await loader.loadAsync(url, (e) => this.emit({ type: 'progress', loaded: e.loaded, total: e.total || 0 }));
    } catch (err) {
      if (seq === this.loadSeq) {
        this.loading = false;
        this.emit({ type: 'error', message: '模型載入失敗：' + (err?.message || err) });
      }
      return;
    }
    if (seq !== this.loadSeq) return; // 載入期間被換掉了
    const vrm = gltf.userData.vrm;
    if (!vrm) {
      this.loading = false;
      this.emit({ type: 'error', message: '檔案不含 VRM 資料' });
      return;
    }
    VRMUtils.removeUnnecessaryVertices(gltf.scene);
    VRMUtils.combineSkeletons(gltf.scene);
    VRMUtils.rotateVRM0(vrm);
    vrm.scene.traverse((o) => { o.frustumCulled = false; });
    this.vrm = vrm;
    this.pivot.add(vrm.scene);
    this.pivot.rotation.y = this.yaw = this.manifest.camera.yaw * Math.PI / 180;

    // 用骨架量身高（腳底到頭頂），之後所有尺寸都依身高比例
    // 先套上待機姿勢再量尺寸（T-pose 的寬度會讓全身鏡頭拉太遠）
    this.rig = new Rig(vrm, this.manifest, 1);
    this.face = new Face(vrm, this.manifest);
    this.rig.update(0, { yaw: 0, pitch: 0 });
    vrm.update(0);
    vrm.scene.updateMatrixWorld(true);
    vrm.scene.traverse((o) => { if (o.isSkinnedMesh) o.computeBoundingBox(); });
    const p = (name) => {
      const n = vrm.humanoid.getNormalizedBoneNode(name);
      return n ? n.getWorldPosition(v3()) : null;
    };
    // 身高用網格邊界框（Q 版大頭模型用骨架估會切到頭頂）
    const box = new THREE.Box3().setFromObject(vrm.scene);
    const head = p('head');
    const neck = p('neck') || head;
    const footY = box.min.y;
    const top = box.max.y;
    const headLen = Math.max(0.06, head.y - neck.y);
    // 頭部中心與半徑：頭骨到頭頂之間
    const headR = Math.max(headLen * 1.5, (top - head.y) / 2);
    this.metrics = {
      footY, top, height: top - footY, width: box.max.x - box.min.x, headLen, headR, headUp: (top - head.y) / 2,
      // 各鏡頭的下緣：以「頸部到頭頂」的長度為單位往下推，一般比例和 Q 版大頭都適用
      lows: {
        full: footY,
        bust: Math.max(footY, neck.y - Math.max((top - neck.y) * 0.35, (top - footY) * 0.12)),
        face: Math.max(footY, neck.y - (top - neck.y) * 0.1),
      },
    };

    this.rig.height = this.metrics.height;
    vrm.springBoneManager?.reset();
    this.shadow.visible = true;
    this.shadow.scale.setScalar(this.metrics.height * 0.42);
    this.zoom = 1;
    this.frameCamera(false);

    const meta = vrm.meta || {};
    this.emit({
      type: 'loaded',
      name: this.manifest.name || meta.name || meta.title || '',
      version: meta.metaVersion === '0' ? 0 : 1,
      expressions: this.face.expressionNames,
    });
    this.loading = false;
    if (this.appearOnLoad) {
      this.appearOnLoad = false;
      this.popT = 0;
    }
    const g = this.manifest.greeting;
    setTimeout(() => { if (seq === this.loadSeq) this.react(g, 'greeting'); }, 450);
  }

  /** 刷卡時「跳出來」：從舞台下緣彈上來並打招呼；模型還在載入時等載入完再跳 */
  appear() {
    if (this.loading || !this.vrm) { this.appearOnLoad = true; return; }
    this.popT = 0;
    this.react(this.manifest.greeting, 'greeting');
  }

  // ---- 鏡頭 ----

  setCamera(preset, animate = true) {
    if (!['full', 'bust', 'face'].includes(preset)) return;
    this.preset = preset;
    this.zoom = 1;
    this.frameCamera(animate);
  }

  frameCamera(animate) {
    if (!this.metrics) return;
    const { footY, top, height } = this.metrics;
    const factor = this.manifest.camera[this.preset] || 1;
    const lo = this.metrics.lows[this.preset];
    const hi = top;
    const pad = { full: 0.1, bust: 0.12, face: 0.25 }[this.preset];
    const visibleH = (hi - lo) * (1 + pad) / factor / this.zoom;
    const { width, headR } = this.metrics;
    const wide = { full: width * 1.05, bust: Math.min(width * 1.05, headR * 4), face: headR * 2.6 }[this.preset];
    const visibleW = wide / factor / this.zoom;
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const dist = Math.max(visibleH / 2 / tan, visibleW / 2 / (tan * this.camera.aspect));
    const cy = (lo + hi) / 2 + (hi - lo) * 0.02;
    this.camGoalLook.set(0, cy, 0);
    this.camGoalPos.set(0, cy + height * 0.02, dist);
    if (!animate) {
      this.camPos.copy(this.camGoalPos);
      this.camLook.copy(this.camGoalLook);
    }
  }

  setZoom(z) {
    this.zoom = THREE.MathUtils.clamp(z, 0.6, 2.2);
    this.frameCamera(true);
  }

  // ---- 互動 ----

  /** 螢幕座標 → 頭部深度平面上的世界座標（當視線目標） */
  screenToWorld(x, y) {
    const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const head = this.bone('head') || v3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -head.z - 0.3);
    return ray.ray.intersectPlane(plane, v3());
  }

  bone(name) {
    const n = this.vrm?.humanoid.getNormalizedBoneNode(name);
    return n ? n.getWorldPosition(v3()) : null;
  }

  project(p) {
    const q = p.clone().project(this.camera);
    return { x: (q.x + 1) / 2 * window.innerWidth, y: (1 - q.y) / 2 * window.innerHeight };
  }

  /** 世界長度 → 在 p 位置的螢幕像素長度 */
  pixels(p, len) {
    const a = this.project(p);
    const b = this.project(p.clone().add(new THREE.Vector3(len, 0, 0)));
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** 依骨骼投影判斷點到哪個部位：head / hand / body / leg / null */
  zoneAt(x, y) {
    if (!this.vrm) return null;
    const H = this.metrics.height;
    const head = this.bone('head');
    const neck = this.bone('neck') || head;
    const up = head.clone().sub(neck).normalize();
    const headC = head.clone().addScaledVector(up, this.metrics.headUp);
    const segDist = (a, b) => {
      const A = this.project(a), B = this.project(b);
      const dx = B.x - A.x, dy = B.y - A.y;
      const u = THREE.MathUtils.clamp(((x - A.x) * dx + (y - A.y) * dy) / Math.max(1, dx * dx + dy * dy), 0, 1);
      return Math.hypot(x - (A.x + dx * u), y - (A.y + dy * u));
    };
    const checks = [
      ['head', () => segDist(headC, headC), this.pixels(headC, this.metrics.headR * 1.05)],
      ['hand', () => Math.min(...['leftHand', 'rightHand'].map((b) => { const p = this.bone(b); return p ? segDist(p, p) : 1e9; })),
        this.pixels(head, H * 0.06)],
      ['body', () => segDist(neck, this.bone('hips') || neck), this.pixels(head, H * 0.11)],
      ['leg', () => Math.min(...['left', 'right'].map((s) => {
        const a = this.bone(s + 'UpperLeg'), b = this.bone(s + 'LowerLeg'), c = this.bone(s + 'Foot');
        return a && b && c ? Math.min(segDist(a, b), segDist(b, c)) : 1e9;
      })), this.pixels(head, H * 0.06)],
    ];
    for (const [zone, dist, radius] of checks) if (dist() <= radius) return zone;
    return null;
  }

  pointerAt(x, y) {
    this.pointerWorld = this.screenToWorld(x, y);
    this.lastTouch = this.time;
  }

  pointerEnd() {
    this.pointerWorld = null;
  }

  rotateBy(dx) {
    this.yawVel = dx * 0.012 / Math.max(0.016, this.lastDt || 0.016);
    this.yaw += dx * 0.012;
    this.lastTouch = this.time;
  }

  release() {
    this.lastTouch = this.time;
  }

  resetView() {
    this.yawVel = 0;
    this.yaw = this.manifest.camera.yaw * Math.PI / 180;
    this.zoom = 1;
    this.frameCamera(true);
  }

  /** 執行反應：{gesture, emotion, lines} */
  react(r, zone) {
    if (!r || !this.rig) return;
    if (r.gesture) this.rig.play(r.gesture);
    if (r.emotion) this.face.setEmotion(r.emotion, 1, 2600);
    const line = r.lines && r.lines.length ? r.lines[Math.floor(Math.random() * r.lines.length)] : '';
    this.emit({ type: 'react', zone, line });
  }

  reaction(zone) {
    this.react(this.manifest.reactions[zone], zone);
  }

  // ---- 主迴圈 ----

  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.lastDt = dt;
    this.time += dt;
    // 鏡頭平滑
    const ck = Math.min(1, dt * 6);
    this.camPos.lerp(this.camGoalPos, ck);
    this.camLook.lerp(this.camGoalLook, ck);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    if (this.vrm) {
      // 轉向：放手後有慣性；閒置 10 秒慢慢轉回正面
      if (!this.dragging) {
        this.yaw += this.yawVel * dt;
        this.yawVel *= Math.pow(0.04, dt);
        if (this.time - this.lastTouch > 10) {
          const home = this.manifest.camera.yaw * Math.PI / 180;
          this.yaw += (home - this.yaw) * Math.min(1, dt * 1.2);
        }
      }
      this.pivot.rotation.y = this.yaw;
      // 跳出動畫：easeOutBack，先衝過頭一點再落定
      if (this.popT >= 0) {
        this.popT += dt;
        const p = Math.min(1, this.popT / 0.6);
        const x = p - 1;
        const ease = 1 + 2.70158 * x * x * x + 1.70158 * x * x;
        this.pivot.position.y = (1 - ease) * -this.metrics.height * 0.5;
        if (p >= 1) { this.popT = -1; this.pivot.position.y = 0; }
      }

      // 視線目標：觸控點 > 思考時往上 > 看鏡頭（加上小幅跳視）
      if (this.time > this.nextSaccade) {
        this.nextSaccade = this.time + 0.6 + Math.random() * 2.2;
        const s = this.metrics.height * 0.03;
        this.saccade.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s * 0.6, 0);
      }
      const head = this.bone('head');
      const goal = v3();
      if (this.pointerWorld) goal.copy(this.pointerWorld);
      else if (this.rig.thinkingTarget > 0) goal.set(head.x - 0.6, head.y + 0.55, head.z + 1.2);
      else goal.copy(this.camera.position).add(this.saccade);
      this.lookTarget.position.lerp(goal, Math.min(1, dt * 8));
      this.vrm.lookAt.target = this.lookTarget;

      // 頭頸跟隨：目標相對模型正面的角度
      const local = this.pivot.worldToLocal(this.lookTarget.position.clone()).sub(this.pivot.worldToLocal(head.clone()));
      const look = { yaw: Math.atan2(local.x, local.z), pitch: Math.atan2(local.y, Math.hypot(local.x, local.z)) };
      this.rig.update(dt, look);
      this.face.update(dt);
      this.vrm.update(dt);

      const hips = this.bone('hips');
      this.shadow.position.set(hips.x, this.metrics.footY + 0.004, hips.z);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
