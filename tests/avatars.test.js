import 'fake-indexeddb/auto';
import {zipSync,strToU8} from 'fflate';
import test from 'node:test';
import assert from 'node:assert/strict';
import {install,loadRepo} from '../src/avatars.js';
import {avatarStore} from '../src/storage.js';
import {sha256} from '../src/hash.js';
function model(){const json={asset:{version:'2.0'},extensions:{VRMC_vrm:{meta:{name:'合成測試角色',authors:['測試']}}}};const body=strToU8(JSON.stringify(json));const padded=Math.ceil(body.length/4)*4;const bytes=new Uint8Array(20+padded);bytes.fill(32,20);bytes.set(body,20);const d=new DataView(bytes.buffer);d.setUint32(0,0x46546c67,true);d.setUint32(4,2,true);d.setUint32(8,bytes.length,true);d.setUint32(12,padded,true);d.setUint32(16,0x4e4f534a,true);return bytes;}
test('VRM import survives IndexedDB roundtrip without a remote model',async()=>{
  const a=await install(model(),'test.vrm','https://example.com/test.vrm','whale');const saved=(await avatarStore('getAll')).find(x=>x.id===a.id);assert.equal(saved.name,'合成測試角色');assert.equal(saved.charId,'whale');assert.equal(saved.blob.size,model().length);await avatarStore('delete',a.id);assert.ok(!(await avatarStore('getAll')).some(x=>x.id===a.id));
});
test('nested ZIP manifest selects correct model and keeps customization',async()=>{
  const bytes=zipSync({'character/avatar.json':strToU8(JSON.stringify({v:1,name:'客製角色',char_id:'zip-whale',model:'model.vrm',greeting:{lines:['你好']}})),'character/model.vrm':model()});
  const a=await install(bytes,'character.zip','https://example.com/repo#zip-whale','',await sha256(bytes));assert.equal(a.name,'客製角色');assert.equal(a.charId,'zip-whale');assert.equal(a.manifest.greeting.lines[0],'你好');await avatarStore('delete',a.id);
});
test('ZIP paths, expansion bombs, wrong hashes and ambiguous models are rejected',async()=>{
  await assert.rejects(install(zipSync({'../model.vrm':model()}),'bad.zip'),/路徑/);
  await assert.rejects(install(zipSync({'a.vrm':model(),'b.vrm':model()}),'bad.zip'),/找不到/);
  await assert.rejects(install(model(),'bad.vrm','import','', '0'.repeat(64)),/SHA/);
  const bytes=zipSync({'model.vrm':model()});const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<bytes.length-4;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,301*1024*1024,true);break;}
  await assert.rejects(install(bytes,'bomb.zip'),/300 MB/);
});
test('repo resolves relative downloads, deduplicates IDs and rejects unsupported format',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({format:'deepcoin-avatars/1',avatars:[{char_id:'whale',name:'鯨',file:'files/whale.zip'},{char_id:'whale',name:'重複',file:'other.zip'}]}));
  try{const repo=await loadRepo('https://example.com/avatars/deepcoin-avatars.json');assert.equal(repo.entries.length,1);assert.equal(repo.entries[0].file,'https://example.com/avatars/files/whale.zip');globalThis.fetch=async()=>new Response('{"format":"wrong","avatars":[]}');await assert.rejects(loadRepo('https://example.com/deepcoin-avatars.json'),/不是鯨幣/);}finally{globalThis.fetch=original;}
});
