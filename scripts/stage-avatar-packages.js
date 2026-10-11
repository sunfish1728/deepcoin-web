// 僅部署設定中已確認可發布的形象庫；模型不進 Git。
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {mirrorPlan} from '../src/avatar-mirrors.js';
const config=JSON.parse(await readFile('avatar-mirrors.json','utf8'));
const catalog={format:'deepcoin-avatar-mirrors/1',files:{}};
const credits=[];
const written=new Set();
await mkdir('dist/avatar-packages',{recursive:true});
for(const source of config.sources){
  if(new URL(source.index).protocol!=='https:')throw Error('索引需要 HTTPS');
  const response=await fetch(source.index);if(!response.ok)throw Error('形象索引下載失敗 '+response.status);
  for(const entry of mirrorPlan(await response.json(),source.index,source.permission)){
    if(!written.has(entry.path)){
      const r=await fetch(entry.url);if(!r.ok)throw Error('角色包下載失敗 '+r.status);
      if(Number(r.headers.get('content-length'))>entry.size)throw Error('角色包過大');
      const chunks=[];let size=0;
      for await(const chunk of r.body){size+=chunk.length;if(size>entry.size)throw Error('角色包過大');chunks.push(chunk);}
      const bytes=Buffer.concat(chunks);
      if(size!==entry.size||createHash('sha256').update(bytes).digest('hex')!==entry.sha256.toLowerCase())throw Error('角色包大小或 SHA 不符 '+entry.name);
      await writeFile('dist/'+entry.path,bytes);written.add(entry.path);
      console.log('已核對角色包',entry.name,size);
    }
    catalog.files[entry.url]=entry.path;
    credits.push(`${entry.name}\n作者：${entry.authors.join(' / ')}\n許可：${entry.license}\n來源：${entry.url}\n發布許可：${entry.permission}\n`);
  }
}
await writeFile('dist/avatar-mirrors.json',JSON.stringify(catalog,null,2));
await writeFile('dist/avatar-packages/CREDITS.txt',credits.join('\n'));
