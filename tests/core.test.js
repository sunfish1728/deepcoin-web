import test from 'node:test';
import assert from 'node:assert/strict';
import {canonical,decodeCard,encodePayload,decodePayload,modelCacheKey} from '../src/card.js';
import {sha256} from '../src/hash.js';
import {chatRequest,history,events,chunk,streamChat} from '../src/api.js';
import {inspect,resolveAvatar,repoUrl} from '../src/avatars.js';
const c={v:1,id:'a1b2c3d4',title:'鯨幣😀',vendor:'deepseek',model:'deepseek-chat',provider:'測試',proto:'openai',base:'https://example.com/v1',key:'sk-test',iat:1760000000,x_future:{z:1,a:'保留'}};
test('canonical JSON keeps Unicode, controls and nested unknown fields',()=>{
  assert.equal(canonical({z:['鯨😀','\b\f\n\r\t\u0001/'],a:{z:2,a:1}}),'{"a":{"a":1,"z":2},"z":["鯨😀","\\b\\f\\n\\r\\t\\u0001/"]}');
  assert.throws(()=>canonical({float:1.2}));assert.throws(()=>canonical({tooBig:Number.MAX_SAFE_INTEGER+1}));
});
test('unsigned card and web link preserve unknown fields',async()=>{
  const payload=encodePayload(c);assert.match(payload,/^[A-Za-z0-9_-]+$/);
  assert.deepEqual(await decodeCard(decodePayload(payload)),c);
  assert.throws(()=>decodePayload('!!!'));
  await assert.rejects(decodeCard(canonical({...c,key:''})),/key/);
  await assert.rejects(decodeCard(JSON.stringify({...c,x_float:1.2})),/整數/);
});
test('legacy sha is ignored and removed from JSON and links',async()=>{
  for(const sha of ['a'.repeat(64),'invalid',null]) {
    const old={...c,sha};
    assert.deepEqual(await decodeCard(canonical(old)),c);
    assert.deepEqual(await decodeCard(decodePayload(encodePayload(old))),c);
  }
  assert.equal(new TextEncoder().encode(canonical({...c,sha:'a'.repeat(64)})).length-new TextEncoder().encode(canonical(c)).length,73);
});
test('model caches remain distinct without card sha',()=>{
  assert.equal(modelCacheKey({...c,title:'改名'}),modelCacheKey(c));
  for(const changes of [{id:'eeeeeeee'},{base:'https://other.example/v1'},{key:'other-key'},{proto:'gemini'}])assert.notEqual(modelCacheKey({...c,...changes}),modelCacheKey(c));
});
test('history excludes errors and merges consecutive roles',()=>{
  assert.deepEqual(history([{role:'user',content:'a'},{role:'user',content:'b'},{role:'assistant',content:'bad',error:'fail'},{role:'assistant',content:''},{role:'assistant',content:'ok'}]),[{role:'user',content:'a\n\nb'},{role:'assistant',content:'ok'}]);
});
test('all four request formats keep protocol-specific roles and settings',()=>{
  const conversation={model:'test-model',settings:{systemPrompt:'繁體中文',temperature:'0.5',maxTokens:'100'},messages:[{role:'user',content:'hi'},{role:'assistant',content:'hello'}]};
  const openai=chatRequest(c,conversation);assert.equal(openai.url,'https://example.com/v1/chat/completions');assert.equal(openai.body.messages[0].role,'system');assert.equal(openai.body.max_tokens,100);
  const responses=chatRequest({...c,proto:'openai-responses'},conversation);assert.equal(responses.body.instructions,'繁體中文');assert.equal(responses.body.input.length,2);
  const anthropic=chatRequest({...c,proto:'anthropic'},conversation);assert.equal(anthropic.url,'https://example.com/v1/messages');assert.equal(anthropic.body.system,'繁體中文');assert.equal(anthropic.body.messages[1].role,'assistant');
  const gemini=chatRequest({...c,proto:'gemini'},conversation);assert.equal(gemini.url,'https://example.com/v1beta/models/test-model:streamGenerateContent?alt=sse');assert.equal(gemini.body.contents[1].role,'model');assert.equal(gemini.body.generationConfig.maxOutputTokens,100);
});
test('SSE parses UTF-8 split at every byte, CRLF, empty data and final event',async()=>{
  const input=':ping\r\ndata: {"text":"鯨😀"}\r\n\r\ndata:\r\n\r\ndata: line1\r\ndata: line2\r\n\r\ndata: [DONE]';
  const bytes=new TextEncoder().encode(input);const stream=new ReadableStream({start(controller){for(const byte of bytes)controller.enqueue(Uint8Array.of(byte));controller.close();}});
  const found=[];for await(const event of events(stream))found.push(event);assert.deepEqual(found,['{"text":"鯨😀"}','','line1\nline2','[DONE]']);
});
test('stream chunks separate thinking, text, usage and provider failures',()=>{
  assert.equal(chunk('openai',{choices:[{delta:{reasoning_content:'想',content:'說'}}]}).reasoning,'想');
  assert.equal(chunk('anthropic',{delta:{thinking:'想'}}).reasoning,'想');
  assert.equal(chunk('openai-responses',{type:'response.output_text.delta',delta:'說'}).text,'說');
  assert.deepEqual(chunk('gemini',{candidates:[{content:{parts:[{thought:true,text:'想'},{text:'說'}]}}]}),{text:'說',reasoning:'想',usage:undefined});
  assert.throws(()=>chunk('openai',{error:{message:'bad key'}}),/bad key/);
  assert.throws(()=>chunk('openai-responses',{type:'response.failed',response:{error:{message:'failed'}}}),/failed/);
});
test('streamChat sends key only to API and parses mocked response',async()=>{
  const fetchOriginal=globalThis.fetch;let call;
  globalThis.fetch=async(url,options)=>{call={url,options};return new Response('data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});};
  try{const output=[];await streamChat(c,{settings:{},messages:[{role:'user',content:'hi'}]},new AbortController().signal,x=>output.push(x.text));assert.equal(call.options.headers.Authorization,'Bearer sk-test');assert.equal(call.options.referrerPolicy,'no-referrer');assert.deepEqual(output,['你好']);assert.ok(!call.url.includes(c.key));}finally{globalThis.fetch=fetchOriginal;}
});
test('repository branches and automatic avatar priorities match app',()=>{
  assert.equal(repoUrl('https://github.com/owner/repo'),'https://raw.githubusercontent.com/owner/repo/HEAD/deepcoin-avatars.json');
  assert.equal(repoUrl('https://github.com/owner/repo/tree/main'),'https://raw.githubusercontent.com/owner/repo/main/deepcoin-avatars.json');
  const a=[{id:'old',charId:'whale',source:'import',installedAt:1},{id:'new',charId:'whale',installedAt:2}];
  assert.equal(resolveAvatar({char_id:'whale'},a,{},null).id,'new');assert.equal(resolveAvatar({char_id:'whale'},a,{whale:'old'},null).id,'old');
});
test('VRM inspector rejects malformed containers and external dependencies',()=>{
  function glb(json){const body=new TextEncoder().encode(JSON.stringify(json));const padded=Math.ceil(body.length/4)*4;const bytes=new Uint8Array(20+padded);bytes.fill(32,20);bytes.set(body,20);const d=new DataView(bytes.buffer);d.setUint32(0,0x46546c67,true);d.setUint32(4,2,true);d.setUint32(8,bytes.length,true);d.setUint32(12,padded,true);d.setUint32(16,0x4e4f534a,true);return bytes;}
  assert.equal(inspect(glb({extensions:{VRMC_vrm:{meta:{name:'鯨娘',authors:['作者']}}}})).name,'鯨娘');
  assert.throws(()=>inspect(new Uint8Array(20)),/VRM/);assert.throws(()=>inspect(glb({extensions:{}})),/VRM/);
  assert.throws(()=>inspect(glb({extensions:{VRM:{meta:{}}},images:[{uri:'https://external.example/image.png'}]})),/內嵌/);
});
