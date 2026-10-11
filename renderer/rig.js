// 身體：待機姿勢 + 呼吸搖擺 + 頭部跟隨視線 + 動作疊加。
// 每一幀從零組合各骨骼的旋轉（角度相加），再寫入 three-vrm 的正規化骨骼。

import * as THREE from 'three';
import { GESTURES } from './gestures.js';

const D = Math.PI / 180;
const smooth = (t) => t * t * (3 - 2 * t);

function sample(keys, t, n) {
  if (t <= keys[0][0]) return keys[0].slice(1, 1 + n);
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t <= b[0]) {
      const a = keys[i - 1];
      const u = smooth((t - a[0]) / Math.max(1e-6, b[0] - a[0]));
      const out = [];
      for (let k = 1; k <= n; k++) out.push(a[k] + (b[k] - a[k]) * u);
      return out;
    }
  }
  return keys[keys.length - 1].slice(1, 1 + n);
}

/** 簡單的連續雜訊：數個不同頻率正弦相加，夠用且便宜。 */
function wobble(t, seed) {
  return Math.sin(t * 0.73 + seed) * 0.5 + Math.sin(t * 1.37 + seed * 2.1) * 0.3 + Math.sin(t * 2.11 + seed * 3.7) * 0.2;
}

const FINGERS = ['Index', 'Middle', 'Ring', 'Little'];
const FINGER_SEGS = ['Proximal', 'Intermediate', 'Distal'];

export class Rig {
  constructor(vrm, manifest, height) {
    this.vrm = vrm;
    this.m = manifest;
    this.height = height;
    // VRM 0.x 在 rotateVRM0 後，x / z 軸方向相反
    this.flip = vrm.meta?.metaVersion === '0';
    this.nodes = {};
    this.time = 0;
    this.gesture = null; // { def, t }
    this.prevGesture = null; // 淡出中的上一個動作
    this.headYaw = 0;
    this.headPitch = 0;
    this.thinking = 0; // 0..1，平滑過渡
    this.thinkingTarget = 0;
    const hips = this.node('hips');
    this.hipsRest = hips ? hips.position.clone() : new THREE.Vector3();
  }

  node(name) {
    if (!(name in this.nodes)) this.nodes[name] = this.vrm.humanoid.getNormalizedBoneNode(name) || null;
    return this.nodes[name];
  }

  play(name) {
    const def = GESTURES[name];
    if (!def) return false;
    if (this.gesture) this.prevGesture = { ...this.gesture, fade: 1 };
    this.gesture = { def, t: 0 };
    return true;
  }

  get busy() { return !!this.gesture; }

  /**
   * @param dt 秒
   * @param look {yaw, pitch}：視線目標相對於模型正面的角度（弧度），頭頸跟隨一部分
   */
  update(dt, look) {
    this.time += dt;
    const t = this.time;
    const acc = {}; // bone -> [x,y,z] 度
    const add = (bone, x, y, z) => {
      const a = acc[bone] || (acc[bone] = [0, 0, 0]);
      a[0] += x; a[1] += y; a[2] += z;
    };

    // 待機姿勢
    const { arm, elbow } = this.m.pose;
    add('leftUpperArm', 0, 0, -arm);
    add('rightUpperArm', 0, 0, arm);
    add('leftLowerArm', 0, -elbow, 0);
    add('rightLowerArm', 0, elbow, 0);
    add('leftHand', 0, 0, -6);
    add('rightHand', 0, 0, 6);
    for (const f of FINGERS) {
      FINGER_SEGS.forEach((s, i) => {
        const c = 8 + i * 4;
        add(`left${f}${s}`, 0, 0, -c);
        add(`right${f}${s}`, 0, 0, c);
      });
    }

    // 呼吸與搖擺
    const br = this.m.idle.breath;
    const breath = Math.sin(t * Math.PI * 2 / 4.2);
    add('chest', -1.2 * br * breath, 0, 0);
    add('spine', -0.6 * br * breath, 0, 0);
    add('leftShoulder', 0, 0, 0.8 * br * breath);
    add('rightShoulder', 0, 0, -0.8 * br * breath);
    add('leftUpperArm', 0, 0, -1.2 * br * breath);
    add('rightUpperArm', 0, 0, 1.2 * br * breath);
    const sw = this.m.idle.sway;
    add('hips', 0, 1.5 * sw * wobble(t * 0.35, 1), 1.4 * sw * Math.sin(t * 0.55));
    add('spine', 0, -0.8 * sw * wobble(t * 0.35, 1), -1.6 * sw * Math.sin(t * 0.55));
    add('neck', 1.2 * sw * wobble(t * 0.5, 4), 1.5 * sw * wobble(t * 0.4, 7), 1.0 * sw * wobble(t * 0.45, 9));

    // 思考：歪頭、微微抬頭
    this.thinking += (this.thinkingTarget - this.thinking) * Math.min(1, dt * 4);
    add('head', -6 * this.thinking, 0, 8 * this.thinking);
    add('neck', -3 * this.thinking, 0, 0);

    // 頭頸跟隨視線（只跟一部分，眼睛處理剩下的）
    const k = Math.min(1, dt * 5);
    this.headYaw += (THREE.MathUtils.clamp(look.yaw, -0.7, 0.7) * 0.55 - this.headYaw) * k;
    this.headPitch += (THREE.MathUtils.clamp(look.pitch, -0.45, 0.45) * 0.45 - this.headPitch) * k;
    add('neck', -this.headPitch / D * 0.4, this.headYaw / D * 0.45, 0);
    add('head', -this.headPitch / D * 0.6, this.headYaw / D * 0.55, 0);

    // 動作
    let hipsY = 0;
    const applyGesture = (g, weight) => {
      const u = Math.min(1, g.t / g.def.duration);
      for (const [bone, keys] of Object.entries(g.def.bones || {})) {
        const [x, y, z] = sample(keys, u, 3);
        add(bone, x * weight, y * weight, z * weight);
      }
      if (g.def.hips) hipsY += sample(g.def.hips, u, 1)[0] * weight;
      return u >= 1;
    };
    if (this.prevGesture) {
      this.prevGesture.fade -= dt * 5;
      this.prevGesture.t += dt;
      if (this.prevGesture.fade <= 0) this.prevGesture = null;
      else applyGesture(this.prevGesture, this.prevGesture.fade);
    }
    if (this.gesture) {
      this.gesture.t += dt;
      if (applyGesture(this.gesture, 1)) this.gesture = null;
    }

    // 寫入骨骼
    for (const [bone, [x, y, z]] of Object.entries(acc)) {
      const n = this.node(bone);
      if (!n) continue;
      if (this.flip) n.rotation.set(-x * D, y * D, -z * D);
      else n.rotation.set(x * D, y * D, z * D);
    }
    const hips = this.node('hips');
    if (hips) hips.position.set(this.hipsRest.x, this.hipsRest.y + hipsY * this.height, this.hipsRest.z);
  }
}
