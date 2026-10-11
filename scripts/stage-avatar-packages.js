// 發布時才下載角色包到 dist；模型不進 Git，原作者與包內署名維持。
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const response=await fetch('https://raw.githubusercontent.com/sunfish1728/deepcoin-avatars/main/deepcoin-avatars.json');
if(!response.ok)throw Error('形象索引下載失敗 '+response.status);
const index=await response.json();
if(index.format!=='deepcoin-avatars/1')throw Error('形象索引格式錯誤');
const files=['deepseek-whale-v1.0.0.zip','white-purple-dragon-v1.0.0.zip','claude-whale-v1.0.0.zip'];
await mkdir('dist/avatar-packages',{recursive:true});
for(const file of files){
  const entry=index.avatars.find(a=>new URL(a.file).pathname.endsWith('/'+file));
  if(!entry || !/^[a-f0-9]{64}$/i.test(entry.sha256))throw Error('缺少角色包或 SHA '+file);
  const url=new URL(entry.file);
  if(url.origin!=='https://github.com'||!url.pathname.startsWith('/sunfish1728/deepcoin-avatars/releases/download/'))throw Error('角色包來源錯誤');
  const r=await fetch(url);if(!r.ok)throw Error('角色包下載失敗 '+r.status);
  const bytes=new Uint8Array(await r.arrayBuffer());
  if(bytes.length!==entry.size||createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('角色包大小或 SHA 不符 '+file);
  await writeFile('dist/avatar-packages/'+file,bytes);console.log('已核對並準備角色包',file,bytes.length);
}
await writeFile('dist/avatar-packages/CREDITS.txt','三個角色模型作者：木子惡魔（木子恶魔）。使用模型製作內容發布請署名作者。\n原始來源、署名及發布許可：https://github.com/sunfish1728/deepcoin-avatars\n各 ZIP 包內保留原有 credit 與授權說明。\n');
