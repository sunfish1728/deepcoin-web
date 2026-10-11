// 進入點：建立舞台、觸控手勢、與 Android 的指令橋接。
//
// Android → JS：呼叫 window.tc.*（見下方 api）。
// JS → Android：window.TcBridge.post(JSON 字串)，事件型別：
//   ready / progress{loaded,total} / loaded{name,version,expressions} / error{message}
//   react{zone,line}（zone：head / body / hand / leg / pet / annoyed / greeting）

import { Stage } from './stage.js';

function emit(ev) {
  const s = JSON.stringify(ev);
  if (window.TcBridge && window.TcBridge.post) window.TcBridge.post(s);
  else console.log('[tc]', s);
  if (typeof window.onTcEvent === 'function') window.onTcEvent(ev);
}

window.addEventListener('error', (e) => emit({ type: 'log', message: 'JS 錯誤：' + e.message }));
window.addEventListener('unhandledrejection', (e) => emit({ type: 'log', message: 'JS 錯誤：' + (e.reason?.message || e.reason) }));

const canvas = document.getElementById('stage');
const stage = new Stage(canvas, emit);

// ---- 觸控 ----
// 單指：點擊 → 部位反應；在頭上來回摸 → pet；其他地方水平拖曳 → 轉身。雙擊空白 → 重置視角。
// 雙指：縮放。
let interactive = true;
let rotatable = true; // 聊天面板內關閉，避免和抽屜手勢衝突
const pointers = new Map();
let gesture = null; // { x0, y0, t0, zone, moved, petDist, lastX, lastY }
let pinch = null;
let lastTapAt = 0;
let pokes = [];

function onDown(e) {
  if (!interactive) return;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), z0: stage.zoom };
    gesture = null;
    return;
  }
  gesture = {
    x0: e.clientX, y0: e.clientY, t0: performance.now(), zone: stage.zoneAt(e.clientX, e.clientY),
    moved: false, petDist: 0, lastX: e.clientX, lastY: e.clientY, petted: false,
  };
  stage.pointerAt(e.clientX, e.clientY);
}

function onMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    stage.setZoom(pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, pinch.d0));
    return;
  }
  if (!gesture) return;
  const dx = e.clientX - gesture.lastX;
  const dy = e.clientY - gesture.lastY;
  gesture.lastX = e.clientX;
  gesture.lastY = e.clientY;
  if (Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0) > 10) gesture.moved = true;
  if (gesture.zone === 'head') {
    // 摸頭：累積移動距離，摸夠了觸發 pet，並在摸的期間閉眼
    gesture.petDist += Math.hypot(dx, dy);
    stage.face.eyesClosed = Math.min(0.85, gesture.petDist / 300);
    if (!gesture.petted && gesture.petDist > 260) {
      gesture.petted = true;
      stage.reaction('pet');
    }
  } else if (gesture.moved && rotatable) {
    stage.dragging = true;
    stage.rotateBy(dx);
  }
  stage.pointerAt(e.clientX, e.clientY);
}

function onUp(e) {
  pointers.delete(e.pointerId);
  if (pinch) {
    if (pointers.size < 2) pinch = null;
    return;
  }
  stage.pointerEnd();
  stage.dragging = false;
  stage.release();
  if (stage.face) stage.face.eyesClosed = 0;
  const g = gesture;
  gesture = null;
  if (!g || g.moved || performance.now() - g.t0 > 450) return;
  const now = performance.now();
  if (!g.zone) {
    if (now - lastTapAt < 320) stage.resetView();
    lastTapAt = now;
    return;
  }
  // 短時間內戳太多次 → annoyed
  pokes = pokes.filter((t) => now - t < 4000);
  pokes.push(now);
  if (pokes.length >= 5) {
    pokes = [];
    stage.reaction('annoyed');
  } else stage.reaction(g.zone);
}

canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', onUp);
canvas.addEventListener('pointercancel', onUp);

// ---- 給 Android 呼叫的 API ----
const api = {
  load(url, manifest) {
    let m = manifest;
    if (typeof m === 'string') { try { m = JSON.parse(m); } catch { m = {}; } }
    return stage.load(url, m || {});
  },
  clear() { stage.clear(); },
  /** 情緒：neutral / joy / angry / sad / surprised / relaxed / thinking */
  emote(name, intensity = 1, holdMs = 4000) {
    if (!stage.face) return;
    stage.face.setEmotion(name, intensity, holdMs);
  },
  gesture(name) { stage.rig?.play(name); },
  think(on) {
    if (!stage.rig) return;
    stage.rig.thinkingTarget = on ? 1 : 0;
    if (on) stage.face.setEmotion('thinking', 1, 0);
    else if (stage.face.emotion === 'thinking') stage.face.setEmotion('neutral', 1, 0);
  },
  talk(on) { stage.face?.talk(!!on); },
  speak(text) { stage.face?.speak(String(text || '')); },
  camera(preset, animate = true) { stage.setCamera(preset, animate); },
  react(zone) { stage.reaction(zone); },
  appear() { stage.appear(); },
  interactive(on) { interactive = !!on; },
  rotatable(on) { rotatable = !!on; },
  pause(on) { stage.setPaused(!!on); },
  theme(t) { stage.setTheme(t || {}); },
};
window.tc = api;
window.__stage = stage; // 除錯用

// 瀏覽器測試：index.html?model=<url>&camera=bust
const q = new URLSearchParams(location.search);
if (q.get('camera')) stage.preset = q.get('camera');
if (q.get('model')) api.load(q.get('model'), {});

emit({ type: 'ready' });
