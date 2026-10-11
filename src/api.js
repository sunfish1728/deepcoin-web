import { httpUrl } from './card.js';
export function headers(card) {
  return card.proto === 'anthropic' ? {'x-api-key': card.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'} : card.proto === 'gemini' ? {'x-goog-api-key': card.key} : {Authorization: 'Bearer ' + card.key};
}
export async function request(card, path, options = {}) {
  const url = httpUrl(path).href;
  try {
    const response = await fetch(url, {...options, headers: {...headers(card), ...options.headers}, referrerPolicy: 'no-referrer'});
    if (!response.ok) {
      const raw = (await response.text()).slice(0, 500);
      let message; try { message = JSON.parse(raw).error?.message || JSON.parse(raw).message; } catch { /* HTTP text */ }
      const error = new Error(`HTTP ${response.status} · ${message || raw || '請求失敗'}`); error.status = response.status; throw error;
    }
    return response;
  } catch (e) {
    if (e.name === 'TypeError') throw new Error('瀏覽器無法連線。請檢查網路、API 地址與供應商是否允許 CORS；HTTPS 網頁也不能連線到 HTTP API。可改用允許瀏覽器連線的 API，或回 App 使用。');
    throw e;
  }
}
const root = c => c.base.replace(/\/$/, '');
export async function models(card) {
  const b = root(card);
  const paths = card.proto === 'gemini' ? [b.replace(/\/v1(beta)?$/, '') + '/v1beta/models?pageSize=1000'] : card.proto === 'anthropic' ? [(b.endsWith('/v1') ? b : b + '/v1') + '/models?limit=1000'] : [b + '/models', ...(b.endsWith('/v1') ? [] : [b + '/v1/models'])];
  let last;
  for (const url of paths) try {
    const o = await (await request(card, url)).json();
    return [...new Set((o.data || o.models || []).map(x => (x.id || x.name || '').replace(/^models\//, '')).filter(Boolean))].sort();
  } catch (e) { last = e; if ([401, 403].includes(e.status)) throw e; }
  throw last;
}
export async function balance(card) {
  const u = httpUrl(card.base), origin = u.origin, host = u.hostname;
  const get = async p => (await request(card, origin + p)).json();
  const is = domain => host === domain || host.endsWith('.' + domain);
  if (is('deepseek.com')) return (await get('/user/balance')).balance_infos.map(x => ({currency:x.currency, amount:x.total_balance}));
  if (is('openrouter.ai')) {
    const d = (await get('/api/v1/key')).data;
    if (d.limit_remaining != null) return [{currency:'USD', amount:Number(d.limit_remaining).toFixed(2)}];
    const c = (await get('/api/v1/credits')).data; return [{currency:'USD', amount:(c.total_credits - c.total_usage).toFixed(2)}];
  }
  if (is('siliconflow.cn') || is('siliconflow.com')) return [{currency:is('siliconflow.cn')?'CNY':'USD', amount:(await get('/v1/user/info')).data.totalBalance}];
  if (host.startsWith('api.moonshot.')) return [{currency:host.endsWith('.cn')?'CNY':'USD', amount:(await get('/v1/users/me/balance')).data.available_balance}];
  if (['api.openai.com','api.anthropic.com','generativelanguage.googleapis.com','dashscope.aliyuncs.com','open.bigmodel.cn','api.x.ai','api.mistral.ai'].some(is)) throw new Error('此供應商不提供以密鑰查詢餘額');
  let sub, prefix;
  for (const p of ['/v1', '']) try { sub = await get(p + '/dashboard/billing/subscription'); prefix = p; break; } catch(e) { if ([401,403].includes(e.status) || p === '') throw e; }
  const date = n => new Date(Date.now() + n * 86400000).toISOString().slice(0,10);
  const usage = await get(prefix + '/dashboard/billing/usage?start_date=' + date(-99) + '&end_date=' + date(1));
  return [{currency:'USD', amount:sub.hard_limit_usd >= 1e7 ? '∞' : (sub.hard_limit_usd - (usage.total_usage || 0)/100).toFixed(2), expiresAt:sub.access_until}];
}
export function history(messages) {
  const result = [];
  for (const m of messages.filter(m => !m.error && m.content)) {
    const previous = result.at(-1);
    if (previous?.role === m.role) previous.content += '\n\n' + m.content;
    else result.push({role:m.role, content:m.content});
  }
  return result;
}
export function chatRequest(card, conversation) {
  const b = root(card), s = conversation.settings || {}, h = history(conversation.messages);
  const optional = {...(s.temperature !== '' && s.temperature != null ? {temperature:Number(s.temperature)} : {})};
  const max = s.maxTokens ? Number(s.maxTokens) : undefined;
  const system = s.systemPrompt?.trim();
  const model = conversation.model || card.model;
  switch(card.proto) {
    case 'anthropic': return {url:(b.endsWith('/v1')?b:b+'/v1')+'/messages', body:{model, messages:h, stream:true, max_tokens:max || 4096, ...optional, ...(system?{system}:{})}};
    case 'gemini': return {url:b.replace(/\/v1(beta)?$/, '') + '/v1beta/models/' + encodeURIComponent(model.replace(/^models\//,'')) + ':streamGenerateContent?alt=sse', body:{contents:h.map(m => ({role:m.role==='assistant'?'model':'user', parts:[{text:m.content}]})), ...(system?{systemInstruction:{parts:[{text:system}]}}:{}), generationConfig:{...optional,...(max?{maxOutputTokens:max}:{})}}};
    case 'openai-responses': return {url:b+'/responses', body:{model, input:h, stream:true, ...optional, ...(system?{instructions:system}:{}), ...(max?{max_output_tokens:max}:{})}};
    default: return {url:b+'/chat/completions', body:{model, messages:[...(system?[{role:'system',content:system}]:[]),...h], stream:true, stream_options:{include_usage:true}, ...optional, ...(max?{max_tokens:max}:{})}};
  }
}
// Incremental SSE parser: handles CRLF, multi-line data and a final unterminated event.
export async function* events(stream) {
  const reader = stream.getReader(), decoder = new TextDecoder();
  let pending = '', data = [];
  try {
    while(true) {
      const {value, done} = await reader.read(); pending += decoder.decode(value, {stream:!done});
      let index;
      while((index = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0,index).replace(/\r$/, ''); pending = pending.slice(index+1);
        if (line === '') { if(data.length) { yield data.join('\n'); data=[]; } }
        else if(line.startsWith('data:')) data.push(line.slice(5).replace(/^ /,''));
      }
      if(done) { if(pending.startsWith('data:')) data.push(pending.slice(5).replace(/^ /,'')); if(data.length) yield data.join('\n'); break; }
    }
  } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
}
export function chunk(proto, o) {
  if(o.error || o.type === 'error' || o.type === 'response.failed') throw new Error(o.error?.message || o.response?.error?.message || 'API 回覆失敗');
  if(proto === 'anthropic') return {text:o.delta?.text || '', reasoning:o.delta?.thinking || '', usage:o.message?.usage || o.usage};
  if(proto === 'gemini') { const parts = o.candidates?.[0]?.content?.parts || []; if(o.promptFeedback?.blockReason) throw new Error('供應商阻擋回覆：' + o.promptFeedback.blockReason); return {text:parts.filter(p=>!p.thought).map(p=>p.text||'').join(''), reasoning:parts.filter(p=>p.thought).map(p=>p.text||'').join(''), usage:o.usageMetadata}; }
  if(proto === 'openai-responses') return {text:o.type==='response.output_text.delta'?o.delta:'', reasoning:o.type?.includes('reasoning') && o.type.endsWith('.delta')?o.delta:'', usage:o.response?.usage};
  const d = o.choices?.[0]?.delta || {}; return {text:d.content||'', reasoning:d.reasoning_content||d.reasoning||'', usage:o.usage};
}
export async function streamChat(card, conversation, signal, onChunk) {
  const {url,body} = chatRequest(card,conversation);
  const response = await request(card,url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
  if(!response.body) throw new Error('瀏覽器未提供串流');
  for await(const data of events(response.body)) { if(data.trim()==='[DONE]') break; if(!data.trim()) continue; onChunk(chunk(card.proto, JSON.parse(data))); }
}
