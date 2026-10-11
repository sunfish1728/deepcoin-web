import test from 'node:test';
import assert from 'node:assert/strict';
import {encodePayload} from '../src/card.js';
import {cardLinkReceiver} from '../src/card-entry.js';

const turn=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
  const target=new EventTarget(),location={hash:'',pathname:'/deepcoin-web/',search:''},cards=[],errors=[];
  const history={replaceState(){location.hash='';}};
  const receiver=cardLinkReceiver({target,location,history,accept:async raw=>cards.push(JSON.parse(raw)),onError:e=>errors.push(e.message)});
  return {target,location,cards,errors,receiver};
}
test('cold open, second NFC in same tab, and browser restore import new cards',async()=>{
  const f=fixture();
  f.location.hash='#card='+encodePayload({v:1,id:'aaaaaaaa'});
  assert.equal(await f.receiver.consume(),true);
  f.location.hash='#card='+encodePayload({v:1,id:'bbbbbbbb'});
  f.target.dispatchEvent(new Event('hashchange'));await turn();
  assert.deepEqual(f.cards.map(c=>c.id),['aaaaaaaa','bbbbbbbb']);
  f.location.hash='#card='+encodePayload({v:1,id:'cccccccc'});
  f.target.dispatchEvent(new Event('pageshow'));await turn();
  assert.equal(f.cards.at(-1).id,'cccccccc');assert.equal(f.location.hash,'');
  f.receiver.dispose();
});
test('bad link reports failure without replacing current card; dispose stops handling',async()=>{
  const f=fixture();f.location.hash='#card=!!!';f.target.dispatchEvent(new Event('hashchange'));await turn();
  assert.equal(f.errors.length,1);assert.equal(f.cards.length,0);
  f.receiver.dispose();f.location.hash='#card='+encodePayload({v:1,id:'aaaaaaaa'});f.target.dispatchEvent(new Event('hashchange'));await turn();assert.equal(f.cards.length,0);
});
