import retired from './retired-cards.json' with {type:'json'};
import {canonical,decodeCard,httpUrl} from './card.js';
export async function migrateCard(raw,{cache=globalThis.localStorage,onMigrated=()=>{}}={}){
 const card=JSON.parse(raw);if(card?.v!==2)return decodeCard(raw);
 if(!/^[0-9a-f]{8}$/i.test(card.id||'')||typeof card.key!=='string'||!card.key.trim()||typeof card.ref!=='string')throw Error('舊託管卡格式錯誤');
 const url=httpUrl(card.ref);if(url.protocol!=='https:'||url.hash)throw Error('舊卡設定網址格式錯誤');
 const merge=async data=>{if(!data||data.v!==1||data.id!==card.id||Object.hasOwn(data,'key')||Object.hasOwn(data,'ref'))throw Error('舊卡備份與卡片不符');return decodeCard(canonical({...data,key:card.key}));};
 let cached;try{cached=cache?.getItem('deepcoin.hosted.'+card.ref);}catch{}
 if(cached){try{const full=await merge(JSON.parse(cached));onMigrated();return full;}catch{}}
 if(!Object.hasOwn(retired,card.ref))throw Error('這張舊託管卡沒有可用備份，請以完整設定重新寫卡');
 const full=await merge(retired[card.ref]);onMigrated();return full;
}
