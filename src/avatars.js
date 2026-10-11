import { unzipSync, strFromU8 } from 'fflate';
import { httpUrl } from './card.js';
import {sha256} from './hash.js';
import { avatarStore } from './storage.js';
const LIMIT = 300 * 1024 * 1024;
export function repoUrl(value) {
  const u = httpUrl(value);
  if(u.hostname === 'github.com') {
    const p = u.pathname.split('/').filter(Boolean);
    if(p.length < 2) throw new Error('請填完整的 GitHub 倉庫網址');
    if(p.length > 2 && p[2] !== 'tree') throw new Error('請使用倉庫首頁或 tree 分支網址');
    return `https://raw.githubusercontent.com/${p[0]}/${p[1]}/${p[2]==='tree'?p.slice(3).join('/'):'HEAD'}/deepcoin-avatars.json`;
  }
  return u.href.split('#')[0];
}
export async function loadRepo(value) {
  const url = repoUrl(value), response = await fetch(url, {referrerPolicy:'no-referrer'});
  if(!response.ok) throw new Error('形象庫讀取失敗：HTTP ' + response.status);
  const o = JSON.parse(new TextDecoder().decode(await bounded(response, 2 * 1024 * 1024)));
  if(o.format !== 'deepcoin-avatars/1' || !Array.isArray(o.avatars)) throw new Error('不是鯨幣形象庫');
  const seen = new Set();
  const entries = o.avatars.filter(e => /^[A-Za-z0-9_.-]{1,64}$/.test(e.char_id || '') && e.name && e.file && !seen.has(e.char_id) && seen.add(e.char_id)).map(e => {
    if(e.file.split('/').includes('..')) throw new Error('角色網址不能含 ..');
    return {...e, file:httpUrl(new URL(e.file,url).href).href, source:value.split('#')[0] + '#' + e.char_id};
  });
  return {...o, entries};
}
export async function searchRepos(query) {
  const r = await fetch('https://api.github.com/search/repositories?q=' + encodeURIComponent('topic:deepcoin-avatar ' + query), {referrerPolicy:'no-referrer'});
  if(!r.ok) throw new Error('GitHub 搜尋失敗或超過查詢次數：HTTP ' + r.status);
  return (await r.json()).items || [];
}
async function bounded(response, limit = LIMIT, progress = () => {}) {
  if(Number(response.headers.get('content-length')) > limit) throw new Error('檔案超過大小限制');
  const reader = response.body.getReader(); let size = 0; const parts=[];
  try { while(true) { const {value,done} = await reader.read(); if(done) break; size += value.length; if(size > limit) throw new Error('檔案超過大小限制'); parts.push(value); progress(size,Number(response.headers.get('content-length'))); } }
  finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  const result = new Uint8Array(size); let offset=0; for(const p of parts) {result.set(p,offset);offset+=p.length;} return result;
}
export function inspect(bytes) {
  if(bytes.length < 20) throw new Error('模型檔案不完整');
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(view.getUint32(0,true)!==0x46546c67 || view.getUint32(4,true)!==2 || view.getUint32(8,true)!==bytes.length || view.getUint32(16,true)!==0x4e4f534a) throw new Error('不是有效的 VRM / GLB');
  const length = view.getUint32(12,true);
  if(length > 16*1024*1024 || length+20 > bytes.length) throw new Error('模型描述資料異常');
  const gltf = JSON.parse(strFromU8(bytes.subarray(20,20+length)));
  const vrm = gltf.extensions?.VRMC_vrm || gltf.extensions?.VRM;
  if(!vrm) throw new Error('模型不含 VRM 資料');
  // Browser local blobs must be self-contained; reject network resource references.
  if([...(gltf.buffers||[]), ...(gltf.images||[])].some(x => x.uri && !x.uri.startsWith('data:'))) throw new Error('請使用內嵌貼圖和材質的 VRM 模型');
  const m = vrm.meta || {};
  return {name:m.name || m.title || '未命名形象', authors:m.authors || [m.author].filter(Boolean), version:gltf.extensions.VRMC_vrm?1:0, license:m.licenseUrl || m.otherLicenseUrl || m.licenseName || '授權請見模型作者說明'};
}
export async function install(bytes, name, source='import', charId='', expected='') {
  if(bytes.length > LIMIT) throw new Error('模型超過 300 MB');
  if(expected && (!/^[0-9a-f]{64}$/i.test(expected) || await sha256(bytes)!==expected.toLowerCase())) throw new Error('形象 SHA-256 不符');
  let model=bytes, manifest={};
  if(bytes[0]===0x50 && bytes[1]===0x4b) {
    let expanded=0;
    const files=unzipSync(bytes,{filter:entry => {
      if(entry.name.split(/[\\/]/).includes('..') || /^(\/|[A-Za-z]:)/.test(entry.name)) throw new Error('角色包路徑錯誤');
      expanded += entry.originalSize;
      if(expanded > LIMIT) throw new Error('解壓後超過 300 MB');
      return /(?:\.vrm|\.glb|avatar\.json)$/i.test(entry.name);
    }});
    const manifests=Object.keys(files).filter(p => p.split('/').at(-1)==='avatar.json');
    if(manifests.length > 1) throw new Error('角色包有多份 avatar.json');
    const path=manifests[0], prefix=path?path.slice(0,-'avatar.json'.length):'';
    if(path) { if(files[path].length>2*1024*1024) throw new Error('avatar.json 過大'); manifest=JSON.parse(strFromU8(files[path])); if(manifest.v!=null && manifest.v!==1) throw new Error('不支援的角色包版本'); }
    const models=Object.keys(files).filter(p=>/\.(vrm|glb)$/i.test(p));
    const modelPath=manifest.model?prefix+manifest.model:models.length===1?models[0]:null;
    if(!modelPath || !files[modelPath]) throw new Error('找不到角色包模型');
    model=files[modelPath];
  }
  const meta=inspect(model), id=crypto.randomUUID();
  const avatar={id, ...meta, name:manifest.name || meta.name || name, charId:manifest.char_id || charId, source, manifest, installedAt:Date.now(), size:model.length, blob:new Blob([model],{type:'model/gltf-binary'})};
  await avatarStore('put',avatar); return avatar;
}
export async function download(url, source, charId, expected, progress) {
  httpUrl(url); const r=await fetch(url,{referrerPolicy:'no-referrer'});
  if(!r.ok) throw new Error('形象下載失敗：HTTP ' + r.status);
  if(/text\/html|image\//.test(r.headers.get('content-type')||'')) throw new Error('網址回傳網頁或圖片，請使用模型下載連結');
  return install(await bounded(r,LIMIT,progress), url.split('/').at(-1),source,charId,expected);
}
export function resolveAvatar(card, avatars, choices, selected) {
  const newest=[...avatars].sort((a,b)=>b.installedAt-a.installedAt);
  const cid=card?.char_id;
  const manual=cid && avatars.find(a=>a.id===choices[cid]); if(manual) return manual;
  const matching=cid && newest.find(a=>a.charId===cid); if(matching) return matching;
  const url=card?.avatar;
  if(url) { const source=/\.(vrm|glb|zip)(?:\?|$)/i.test(url)?url:url.split('#')[0]+'#'+(new URL(url).hash.slice(1)||cid||''); const cached=newest.find(a=>a.source===source); if(cached) return cached; }
  return newest.find(a=>a.id===selected) || newest[0] || null;
}
