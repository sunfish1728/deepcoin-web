import test from 'node:test';
import assert from 'node:assert/strict';
import {savedConversations} from '../src/conversations.js';

test('開啟、新增與重新載入的空白草稿不算對話，舊空白紀錄也會移除', () => {
  const blank = {id:'blank', messages:[]};
  const whitespace = {id:'space', messages:[{role:'user',content:'  '}]};
  const real = {id:'real', messages:[{role:'user',content:'你好'}]};
  assert.deepEqual(savedConversations([blank, whitespace, real]), [real]);
  assert.deepEqual(savedConversations(savedConversations([blank, real])), [real]);
});

test('第一則訊息送出後立即算對話，API 失敗或停止也保留', () => {
  const chat = {messages:[]};
  assert.deepEqual(savedConversations([chat]), []);
  chat.messages.push({role:'user',content:'你好'});
  assert.deepEqual(savedConversations([chat]), [chat]);
  chat.messages.push({role:'assistant',content:'',status:'error'});
  assert.deepEqual(savedConversations([chat]), [chat]);
});
