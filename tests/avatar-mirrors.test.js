import test from 'node:test';
import assert from 'node:assert/strict';
import {mirrorPlan,mirroredUrl} from '../src/avatar-mirrors.js';
const sha='a'.repeat(64),base='https://example.com/app/';
const entry={name:'第四個角色',file:'new.zip',size:10,sha256:sha,authors:['新作者'],license:'允許發布'};
test('新角色由索引自動產生部署映射，無固定角色或倉庫清單',()=>{
 const plan=mirrorPlan({format:'deepcoin-avatars/1',avatars:[entry]},'https://other.com/library/index.json','https://other.com/permission');
 assert.equal(plan[0].url,'https://other.com/library/new.zip');
 assert.equal(plan[0].path,`avatar-packages/${sha}.zip`);
 const catalog={format:'deepcoin-avatar-mirrors/1',files:{[plan[0].url]:plan[0].path}};
 assert.equal(mirroredUrl(plan[0].url,catalog,base),`${base}avatar-packages/${sha}.zip`);
 assert.equal(mirroredUrl('https://unknown.com/model.vrm',catalog,base),'https://unknown.com/model.vrm');
});
test('不同來源同名檔案依內容 SHA 分開，無有效許可或校驗資料不發布',()=>{
 const plan=mirrorPlan({format:'deepcoin-avatars/1',avatars:[entry,{...entry,file:'https://else.com/new.zip',sha256:'b'.repeat(64)}]},base,'https://example.com/permission');
 assert.notEqual(plan[0].path,plan[1].path);
 for(const invalid of [{size:0},{sha256:''},{authors:[]},{file:'http://example.com/a.zip'}])assert.throws(()=>mirrorPlan({format:'deepcoin-avatars/1',avatars:[{...entry,...invalid}]},base,'https://example.com/permission'));
 assert.throws(()=>mirrorPlan({format:'deepcoin-avatars/1',avatars:[entry]},base,''));
 assert.equal(mirroredUrl('https://example.com/a.zip',{format:'deepcoin-avatar-mirrors/1',files:{'https://example.com/a.zip':'../secret'}},base),'https://example.com/a.zip');
});
