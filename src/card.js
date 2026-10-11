export const MIME = 'application/vnd.tokencoin+json';
const encoder = new TextEncoder();
export function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error('卡片數字必須是安全範圍內的整數');
    return String(value);
  }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  throw new Error('卡片資料型別錯誤');
}
export async function decodeCard(raw) {
  if (raw.length > 65536) throw new Error('卡片資料過大');
  const card = JSON.parse(raw);
  if (!card || Array.isArray(card) || card.v !== 1) throw new Error('不支援的卡片版本');
  if (!/^[0-9a-f]{8}$/i.test(card.id || '')) throw new Error('卡片 ID 格式錯誤');
  for (const k of ['vendor', 'model', 'provider', 'proto', 'base', 'key']) {
    if (typeof card[k] !== 'string' || !card[k].trim()) throw new Error('卡片缺少 ' + k);
  }
  if (!['openai', 'openai-responses', 'anthropic', 'gemini'].includes(card.proto)) throw new Error('不支援的 API 協議');
  httpUrl(card.base);
  if (!Number.isSafeInteger(card.iat)) throw new Error('寫入時間格式錯誤');
  if (card.models !== undefined && (!Array.isArray(card.models) || card.models.some(x => typeof x !== 'string'))) throw new Error('模型清單格式錯誤');
  const { sha, ...fields } = card;
  canonical(fields);
  return fields;
}
export function httpUrl(value) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('網址需為 http 或 https，且不能含帳號密碼');
  return url;
}
export function modelCacheKey(card) {
  return JSON.stringify([card.id, card.proto, card.base, card.key]);
}
export function encodePayload(card) {
  const { sha, ...fields } = card;
  return btoa(Array.from(encoder.encode(canonical(fields)), b => String.fromCharCode(b)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function decodePayload(payload) {
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || payload.length > 90000) throw new Error('卡片連結格式錯誤');
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(payload.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0)));
}
