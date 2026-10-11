import {canonical, decodeCard, httpUrl} from './card.js';

const LIMIT = 65536;
export function hostedReference(card) {
  if (!card || card.v !== 2 || !/^[0-9a-f]{8}$/i.test(card.id || '') || typeof card.key !== 'string' || !card.key.trim() || typeof card.ref !== 'string') throw new Error('託管卡片格式錯誤');
  const url = httpUrl(card.ref);
  if (url.protocol !== 'https:' || url.hash) throw new Error('託管設定需為 HTTPS 直連網址');
  return {v:2,id:card.id,key:card.key,ref:card.ref};
}
export async function mergeHosted(reference, raw) {
  const ref = hostedReference(reference);
  if (new TextEncoder().encode(raw).length > LIMIT) throw new Error('託管設定過大');
  const data = JSON.parse(raw);
  if (!data || Array.isArray(data) || Object.hasOwn(data,'key') || Object.hasOwn(data,'ref') || data.v !== 1 || data.id !== ref.id) throw new Error('託管設定與卡片不符，或包含密鑰');
  return decodeCard(canonical({...data,key:ref.key}));
}
export async function resolveHosted(raw, {fetcher=fetch,cache=localStorage,onCached=()=>{}}={}) {
  const parsed = JSON.parse(raw);
  if (parsed?.v !== 2) return decodeCard(raw);
  const ref = hostedReference(parsed), cacheKey = 'deepcoin.hosted.'+ref.ref;
  let body;
  try {
    const response = await fetcher(ref.ref,{credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('託管設定讀取失敗（HTTP '+response.status+'）');
    if (Number(response.headers.get('content-length')) > LIMIT) throw new Error('託管設定過大');
    const reader=response.body.getReader(), chunks=[];let total=0;
    try { while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>LIMIT)throw new Error('託管設定過大');chunks.push(value);} }
    finally {await reader.cancel();}
    const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    body=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  } catch(error) {
    const cached=cache.getItem(cacheKey);
    if(cached===null)throw error;
    const full=await mergeHosted(ref,cached);onCached();return full;
  }
  // 網路成功但資料不合法時，不用快取掩蓋問題。
  const full=await mergeHosted(ref,body);
  try {cache.setItem(cacheKey,body);}catch{}
  return full;
}
