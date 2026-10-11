// avatar.json 的預設值與合併規則（格式見 讀卡工具/AVATAR.md §3）。
// 單一 .vrm 沒有 manifest 時，全部用這裡的預設值，行為只依賴 VRM 標準表情與骨骼。

export const EMOTIONS = ['neutral', 'joy', 'angry', 'sad', 'surprised', 'relaxed', 'thinking'];

const DEFAULTS = {
  emotions: {
    neutral: {},
    joy: { happy: 1 },
    angry: { angry: 1 },
    sad: { sad: 1 },
    surprised: { surprised: 1 },
    relaxed: { relaxed: 1 },
    // 思考：視線往上由 lookAt 處理，表情只放一點放鬆
    thinking: { relaxed: 0.25 },
  },
  pose: { arm: 72, elbow: 12 },
  idle: { breath: 1, sway: 1, blink: [2.5, 6] },
  camera: { full: 1, bust: 1, face: 1, yaw: 0 },
  greeting: { gesture: 'wave', emotion: 'joy', lines: [] },
  reactions: {
    head: { gesture: 'tilt', emotion: 'joy', lines: ['嘿嘿', '嗯？'] },
    body: { gesture: 'flinch', emotion: 'surprised', lines: ['呀！', '怎麼了？'] },
    hand: { gesture: 'wave', emotion: 'joy', lines: ['嗨～'] },
    leg: { gesture: 'shake', emotion: 'angry', lines: ['別鬧啦'] },
    pet: { gesture: 'nod', emotion: 'relaxed', lines: ['好舒服～'] },
    annoyed: { gesture: 'shake', emotion: 'angry', lines: ['夠了喔！'] },
  },
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** 情緒值可為表情名稱字串、{表情: 權重} 物件或 null，一律轉成物件。 */
function normEmotion(v) {
  if (v === null) return {};
  if (typeof v === 'string') return { [v]: 1 };
  if (isObj(v)) {
    const out = {};
    for (const [k, w] of Object.entries(v)) if (typeof w === 'number') out[k] = w;
    return out;
  }
  return undefined;
}

function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

export function resolveManifest(raw) {
  const m = isObj(raw) ? raw : {};
  const emotions = { ...DEFAULTS.emotions };
  if (isObj(m.emotions)) {
    for (const [k, v] of Object.entries(m.emotions)) {
      const e = normEmotion(v);
      if (e) emotions[k] = e;
    }
  }
  const pose = isObj(m.pose) ? m.pose : {};
  const idle = isObj(m.idle) ? m.idle : {};
  const cam = isObj(m.camera) ? m.camera : {};
  const blink = Array.isArray(idle.blink) && idle.blink.length === 2 ? idle.blink.map(Number) : DEFAULTS.idle.blink;

  const reaction = (src, def) => {
    const r = isObj(src) ? src : {};
    return {
      gesture: typeof r.gesture === 'string' || r.gesture === null ? r.gesture : def.gesture,
      emotion: typeof r.emotion === 'string' || r.emotion === null ? r.emotion : def.emotion,
      lines: Array.isArray(r.lines) ? r.lines.filter((s) => typeof s === 'string') : def.lines,
    };
  };
  const reactions = {};
  const srcReactions = isObj(m.reactions) ? m.reactions : {};
  for (const k of new Set([...Object.keys(DEFAULTS.reactions), ...Object.keys(srcReactions)])) {
    reactions[k] = reaction(srcReactions[k], DEFAULTS.reactions[k] || { gesture: null, emotion: null, lines: [] });
  }

  return {
    name: typeof m.name === 'string' ? m.name : '',
    emotions,
    pose: { arm: num(pose.arm, DEFAULTS.pose.arm), elbow: num(pose.elbow, DEFAULTS.pose.elbow) },
    idle: { breath: num(idle.breath, 1), sway: num(idle.sway, 1), blink },
    camera: {
      full: num(cam.full, 1), bust: num(cam.bust, 1), face: num(cam.face, 1), yaw: num(cam.yaw, 0),
    },
    greeting: reaction(m.greeting, DEFAULTS.greeting),
    reactions,
  };
}
