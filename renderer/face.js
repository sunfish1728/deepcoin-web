// 臉部：情緒表情（平滑過渡、維持後淡出）、眨眼、依文字變化的嘴型。

const VISEMES = ['aa', 'ih', 'ou', 'ee', 'oh'];
const LATIN = { a: 'aa', i: 'ih', y: 'ih', u: 'ou', w: 'ou', e: 'ee', o: 'oh' };
const PAUSE = /[，。！？、；：,.!?;:\s…—\n]/;

export class Face {
  constructor(vrm, manifest) {
    this.em = vrm.expressionManager;
    this.m = manifest;
    this.has = new Set((this.em?.expressions || []).map((e) => e.expressionName));
    this.current = {}; // 表情 → 目前權重
    this.target = {};
    this.emotion = 'neutral';
    this.holdUntil = 0;
    this.time = 0;
    this.nextBlink = 1 + Math.random() * 2;
    this.blinkT = -1;
    this.blinkDouble = false;
    this.eyesClosed = 0; // 外部要求閉眼（被摸頭時）
    // 嘴型
    this.talking = false;
    this.queue = [];
    this.syl = null; // { v, until, amp }
    this.mouth = {}; // viseme → 權重
  }

  get expressionNames() { return [...this.has]; }

  /** holdMs <= 0 表示一直維持 */
  setEmotion(name, intensity = 1, holdMs = 4000) {
    const map = this.m.emotions[name] || {};
    this.emotion = name;
    this.target = {};
    for (const [expr, w] of Object.entries(map)) if (this.has.has(expr)) this.target[expr] = w * intensity;
    this.holdUntil = holdMs > 0 ? this.time + holdMs / 1000 : Infinity;
  }

  talk(on) {
    this.talking = on;
    // 串流結束時不立刻閉嘴：剩下的字加速念完（最多留 60 個字）
    if (!on && this.queue.length > 60) this.queue.splice(0, this.queue.length - 60);
  }

  speak(text) {
    for (const ch of text) this.queue.push(ch);
    if (this.queue.length > 400) this.queue.splice(0, this.queue.length - 400);
  }

  nextSyllable() {
    while (this.queue.length) {
      const ch = this.queue.shift();
      if (PAUSE.test(ch)) return { v: null, len: 0.12 };
      const low = ch.toLowerCase();
      if (/[a-z]/.test(low)) {
        if (LATIN[low]) return { v: LATIN[low], len: 0.07 };
        continue; // 子音不另外動嘴
      }
      if (/[0-9]/.test(ch)) return { v: 'aa', len: 0.08 };
      const code = ch.codePointAt(0);
      // 中日文：每個字一個音節，以字碼決定母音，偏向張嘴
      return { v: VISEMES[(code * 7) % 5 === 1 ? 1 : (code * 13) % 5], len: 0.11 };
    }
    return null;
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    if (t > this.holdUntil) { this.target = {}; this.emotion = 'neutral'; this.holdUntil = Infinity; }

    // 表情權重平滑
    const k = Math.min(1, dt * 7);
    const names = new Set([...Object.keys(this.current), ...Object.keys(this.target)]);
    for (const n of names) {
      const v = (this.current[n] || 0) + ((this.target[n] || 0) - (this.current[n] || 0)) * k;
      if (v < 0.001 && !this.target[n]) delete this.current[n]; else this.current[n] = v;
    }

    // 眨眼：150ms 閉合曲線，偶爾連眨兩下
    let blink = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const p = this.blinkT / 0.16;
      blink = p < 0.5 ? p * 2 : Math.max(0, 2 - p * 2);
      if (p >= 1) {
        this.blinkT = -1;
        if (this.blinkDouble) { this.blinkDouble = false; this.nextBlink = t + 0.12; }
        else {
          const [lo, hi] = this.m.idle.blink;
          this.nextBlink = t + lo + Math.random() * (hi - lo);
        }
      }
    } else if (t >= this.nextBlink) {
      this.blinkT = 0;
      this.blinkDouble = Math.random() < 0.2;
    }
    blink = Math.max(blink, this.eyesClosed);

    // 嘴型：佇列越長說越快，避免落後串流太多
    if (this.talking || this.queue.length) {
      if (!this.syl || t >= this.syl.until) {
        const s = this.nextSyllable();
        const speed = 1 + Math.min(2.5, this.queue.length / 60);
        this.syl = s ? { v: s.v, until: t + s.len / speed, amp: 0.55 + Math.random() * 0.4 } : null;
      }
    } else this.syl = null;
    const mk = Math.min(1, dt * 18);
    for (const v of VISEMES) {
      const goal = this.syl && this.syl.v === v ? this.syl.amp : 0;
      this.mouth[v] = (this.mouth[v] || 0) + (goal - (this.mouth[v] || 0)) * mk;
    }

    // 寫入（只寫存在的表情；被情緒覆寫的眨眼 / 嘴型由 three-vrm 依表情的 override 設定處理）
    if (!this.em) return;
    const out = { ...this.current };
    if (this.has.has('blink')) out.blink = Math.max(out.blink || 0, blink);
    for (const v of VISEMES) if (this.has.has(v)) out[v] = Math.max(out[v] || 0, this.mouth[v]);
    // 只寫自己管的表情（上一幀寫過的歸零），lookAt 為 expression 型時的 look* 交給 three-vrm
    for (const n of this.written || []) if (!(n in out)) this.em.setValue(n, 0);
    for (const [n, w] of Object.entries(out)) this.em.setValue(n, Math.min(1, w));
    this.written = Object.keys(out);
  }
}
