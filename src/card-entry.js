import {decodePayload} from './card.js';

/** 初次開頁及既有分頁再次收到 NFC 網址，走同一個匯入入口。 */
export function cardLinkReceiver({target,location,history,accept,onError}) {
  async function consume() {
    const payload=new URLSearchParams(location.hash.slice(1)).get('card');
    if(!payload)return false;
    const raw=decodePayload(payload);
    history.replaceState(null,'',location.pathname+location.search);
    await accept(raw);
    return true;
  }
  const receive=()=>{void consume().catch(onError);};
  target.addEventListener('hashchange',receive);
  target.addEventListener('pageshow',receive);
  return {consume,dispose(){target.removeEventListener('hashchange',receive);target.removeEventListener('pageshow',receive);}};
}
